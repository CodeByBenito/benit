-- =============================================================================
-- BENIT SaaS — Migration 0005: Checkout, delivery, coupons & payments SCHEMA
-- Tables, columns, enums, RLS and guard triggers. Business logic (RPCs) is in 0006.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;

-- -----------------------------------------------------------------------------
-- 1. ENUMS
-- -----------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE public.payment_method AS ENUM ('ONLINE_PIX', 'ONLINE_CARD', 'CASH', 'CARD_ON_DELIVERY', 'PIX_MANUAL');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE public.payment_status AS ENUM ('PAY_ON_DELIVERY', 'PENDING', 'APPROVED', 'REJECTED', 'EXPIRED', 'REFUND_PENDING', 'REFUNDED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE public.coupon_kind AS ENUM ('PERCENT', 'FIXED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- -----------------------------------------------------------------------------
-- 2. HELPERS
-- -----------------------------------------------------------------------------
-- Accent/case-insensitive text key used to match neighborhoods ("São João" = "sao joao").
CREATE OR REPLACE FUNCTION public.normalize_text(p_text TEXT)
RETURNS TEXT
LANGUAGE sql
STABLE
SET search_path = public, extensions
AS $$
    SELECT NULLIF(regexp_replace(lower(trim(extensions.unaccent(COALESCE(p_text, '')))), '\s+', ' ', 'g'), '');
$$;

-- OWNER (org-wide) or MANAGER of the store: may change money/delivery settings.
CREATE OR REPLACE FUNCTION public.can_manage_store(p_store_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.stores s
        JOIN public.memberships m ON m.organization_id = s.organization_id
        WHERE s.id = p_store_id
          AND m.user_id = auth.uid()
          AND (m.store_id IS NULL OR m.store_id = p_store_id)
          AND m.role IN ('OWNER', 'MANAGER')
    );
$$;

REVOKE ALL ON FUNCTION public.can_manage_store(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_manage_store(UUID) TO authenticated;

-- -----------------------------------------------------------------------------
-- 3. STORE CHECKOUT SETTINGS
-- -----------------------------------------------------------------------------
ALTER TABLE public.stores
    ADD COLUMN IF NOT EXISTS timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    ADD COLUMN IF NOT EXISTS min_order_cents INTEGER NOT NULL DEFAULT 0 CHECK (min_order_cents >= 0),
    ADD COLUMN IF NOT EXISTS accepts_delivery BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS accepts_pickup BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS accepts_dine_in BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS offline_methods public.payment_method[] NOT NULL DEFAULT ARRAY['CASH', 'CARD_ON_DELIVERY']::public.payment_method[],
    ADD COLUMN IF NOT EXISTS pix_key TEXT,
    ADD COLUMN IF NOT EXISTS online_payment_enabled BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS payment_window_minutes INTEGER NOT NULL DEFAULT 15 CHECK (payment_window_minutes BETWEEN 5 AND 120),
    ADD COLUMN IF NOT EXISTS notify_owner_email BOOLEAN NOT NULL DEFAULT true,
    ADD COLUMN IF NOT EXISTS default_eta_minutes INTEGER NOT NULL DEFAULT 40 CHECK (default_eta_minutes BETWEEN 0 AND 600),
    -- Reserved for radius-based zones (not used yet: neighborhoods only).
    ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
    ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

DO $$ BEGIN
    ALTER TABLE public.stores ADD CONSTRAINT chk_stores_offline_methods
        CHECK (NOT ('ONLINE_PIX' = ANY(offline_methods)) AND NOT ('ONLINE_CARD' = ANY(offline_methods)));
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Business hours. closes_at <= opens_at means the slot crosses midnight (e.g. 18:00 → 02:00).
CREATE TABLE IF NOT EXISTS public.store_business_hours (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    weekday SMALLINT NOT NULL CHECK (weekday BETWEEN 0 AND 6), -- 0 = Sunday
    opens_at TIME NOT NULL,
    closes_at TIME NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_store_business_hours UNIQUE (store_id, weekday, opens_at),
    CONSTRAINT chk_business_hours_not_empty CHECK (opens_at <> closes_at)
);
CREATE INDEX IF NOT EXISTS idx_store_business_hours_store ON public.store_business_hours(store_id, weekday);

-- Delivery zones by neighborhood.
CREATE TABLE IF NOT EXISTS public.delivery_zones (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (char_length(trim(name)) >= 1),
    neighborhoods TEXT[] NOT NULL DEFAULT '{}',
    neighborhoods_normalized TEXT[] NOT NULL DEFAULT '{}',
    fee_cents INTEGER NOT NULL DEFAULT 0 CHECK (fee_cents >= 0),
    min_order_cents INTEGER CHECK (min_order_cents IS NULL OR min_order_cents >= 0),
    eta_minutes INTEGER CHECK (eta_minutes IS NULL OR eta_minutes BETWEEN 0 AND 600),
    radius_km NUMERIC(6, 2), -- reserved
    is_active BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_delivery_zones_id_store UNIQUE (id, store_id)
);
CREATE INDEX IF NOT EXISTS idx_delivery_zones_store ON public.delivery_zones(store_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_delivery_zones_neighborhoods ON public.delivery_zones USING GIN (neighborhoods_normalized);

CREATE OR REPLACE FUNCTION public.handle_delivery_zone_normalize()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    NEW.neighborhoods := COALESCE(
        (SELECT array_agg(DISTINCT trim(n)) FROM unnest(NEW.neighborhoods) AS n WHERE public.normalize_text(n) IS NOT NULL),
        '{}'
    );
    NEW.neighborhoods_normalized := COALESCE(
        (SELECT array_agg(DISTINCT public.normalize_text(n)) FROM unnest(NEW.neighborhoods) AS n WHERE public.normalize_text(n) IS NOT NULL),
        '{}'
    );
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_delivery_zones_normalize ON public.delivery_zones;
CREATE TRIGGER trg_delivery_zones_normalize
    BEFORE INSERT OR UPDATE OF neighborhoods ON public.delivery_zones
    FOR EACH ROW EXECUTE FUNCTION public.handle_delivery_zone_normalize();

DROP TRIGGER IF EXISTS trg_delivery_zones_updated_at ON public.delivery_zones;
CREATE TRIGGER trg_delivery_zones_updated_at
    BEFORE UPDATE ON public.delivery_zones
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Coupons.
CREATE TABLE IF NOT EXISTS public.coupons (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    code TEXT NOT NULL CHECK (code ~ '^[A-Z0-9_-]{3,24}$'),
    description TEXT,
    kind public.coupon_kind NOT NULL,
    value INTEGER NOT NULL CHECK (value > 0), -- PERCENT: 1..100 ; FIXED: cents
    max_discount_cents INTEGER CHECK (max_discount_cents IS NULL OR max_discount_cents > 0),
    min_order_cents INTEGER NOT NULL DEFAULT 0 CHECK (min_order_cents >= 0),
    starts_at TIMESTAMPTZ,
    ends_at TIMESTAMPTZ,
    usage_limit INTEGER CHECK (usage_limit IS NULL OR usage_limit > 0),
    per_customer_limit INTEGER CHECK (per_customer_limit IS NULL OR per_customer_limit > 0),
    used_count INTEGER NOT NULL DEFAULT 0 CHECK (used_count >= 0),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_coupons_store_code UNIQUE (store_id, code),
    CONSTRAINT uq_coupons_id_store UNIQUE (id, store_id),
    CONSTRAINT chk_coupon_percent CHECK (kind <> 'PERCENT' OR value <= 100),
    CONSTRAINT chk_coupon_window CHECK (starts_at IS NULL OR ends_at IS NULL OR ends_at > starts_at)
);
CREATE INDEX IF NOT EXISTS idx_coupons_store ON public.coupons(store_id);

DROP TRIGGER IF EXISTS trg_coupons_updated_at ON public.coupons;
CREATE TRIGGER trg_coupons_updated_at
    BEFORE UPDATE ON public.coupons
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- -----------------------------------------------------------------------------
-- 4. ORDER PAYMENT / DELIVERY COLUMNS
-- -----------------------------------------------------------------------------
ALTER TABLE public.orders
    ADD COLUMN IF NOT EXISTS payment_method public.payment_method,
    ADD COLUMN IF NOT EXISTS payment_status public.payment_status NOT NULL DEFAULT 'PAY_ON_DELIVERY',
    ADD COLUMN IF NOT EXISTS payment_expires_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS change_for_cents INTEGER CHECK (change_for_cents IS NULL OR change_for_cents >= 0),
    ADD COLUMN IF NOT EXISTS public_token TEXT NOT NULL
        DEFAULT (replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '')),
    ADD COLUMN IF NOT EXISTS delivery_zone_id UUID,
    ADD COLUMN IF NOT EXISTS delivery_address JSONB,
    ADD COLUMN IF NOT EXISTS eta_minutes INTEGER,
    ADD COLUMN IF NOT EXISTS coupon_id UUID,
    ADD COLUMN IF NOT EXISTS coupon_code_snapshot TEXT,
    ADD COLUMN IF NOT EXISTS counted_in_stats BOOLEAN NOT NULL DEFAULT false;

-- Existing orders were already counted in customer stats at creation time.
UPDATE public.orders SET counted_in_stats = true WHERE status <> 'CANCELLED' AND counted_in_stats = false;

CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_public_token ON public.orders(public_token);
CREATE INDEX IF NOT EXISTS idx_orders_awaiting_payment ON public.orders(payment_expires_at) WHERE status = 'AWAITING_PAYMENT';

DO $$ BEGIN
    ALTER TABLE public.orders ADD CONSTRAINT fk_orders_delivery_zone_store
        FOREIGN KEY (delivery_zone_id, store_id) REFERENCES public.delivery_zones(id, store_id) ON DELETE SET NULL (delivery_zone_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE public.orders ADD CONSTRAINT fk_orders_coupon_store
        FOREIGN KEY (coupon_id, store_id) REFERENCES public.coupons(id, store_id) ON DELETE SET NULL (coupon_id);
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS public.coupon_redemptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    coupon_id UUID NOT NULL,
    order_id UUID NOT NULL UNIQUE,
    customer_id UUID,
    discount_cents INTEGER NOT NULL CHECK (discount_cents >= 0),
    voided_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_coupon_redemptions_coupon FOREIGN KEY (coupon_id, store_id) REFERENCES public.coupons(id, store_id) ON DELETE CASCADE,
    CONSTRAINT fk_coupon_redemptions_order FOREIGN KEY (order_id, store_id) REFERENCES public.orders(id, store_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_coupon_redemptions_coupon_customer ON public.coupon_redemptions(coupon_id, customer_id) WHERE voided_at IS NULL;

-- -----------------------------------------------------------------------------
-- 5. PAYMENT PROVIDER TABLES (service role only for secrets)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.store_payment_accounts (
    store_id UUID PRIMARY KEY REFERENCES public.stores(id) ON DELETE CASCADE,
    provider TEXT NOT NULL DEFAULT 'MERCADO_PAGO',
    provider_user_id TEXT NOT NULL,
    public_key TEXT,
    access_token_enc TEXT NOT NULL,
    refresh_token_enc TEXT,
    expires_at TIMESTAMPTZ,
    scope TEXT,
    live_mode BOOLEAN NOT NULL DEFAULT true,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REFRESH_FAILED', 'DISCONNECTED')),
    connected_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_store_payment_accounts_provider_user
    ON public.store_payment_accounts(provider, provider_user_id) WHERE status <> 'DISCONNECTED';

DROP TRIGGER IF EXISTS trg_store_payment_accounts_updated_at ON public.store_payment_accounts;
CREATE TRIGGER trg_store_payment_accounts_updated_at
    BEFORE UPDATE ON public.store_payment_accounts
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Short-lived OAuth state (CSRF + PKCE verifier).
CREATE TABLE IF NOT EXISTS public.oauth_states (
    state TEXT PRIMARY KEY,
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    code_verifier TEXT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '10 minutes'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    order_id UUID NOT NULL,
    provider TEXT NOT NULL DEFAULT 'MERCADO_PAGO',
    provider_payment_id TEXT NOT NULL,
    method public.payment_method NOT NULL,
    status public.payment_status NOT NULL,
    status_detail TEXT,
    amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
    refunded_cents INTEGER NOT NULL DEFAULT 0 CHECK (refunded_cents >= 0),
    qr_code TEXT,
    qr_code_base64 TEXT,
    ticket_url TEXT,
    expires_at TIMESTAMPTZ,
    raw JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_payments_provider_id UNIQUE (provider, provider_payment_id),
    CONSTRAINT fk_payments_order_store FOREIGN KEY (order_id, store_id) REFERENCES public.orders(id, store_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_payments_order ON public.payments(order_id, created_at DESC);

DROP TRIGGER IF EXISTS trg_payments_updated_at ON public.payments;
CREATE TRIGGER trg_payments_updated_at
    BEFORE UPDATE ON public.payments
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TABLE IF NOT EXISTS public.webhook_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    provider TEXT NOT NULL,
    event_key TEXT NOT NULL,
    payload JSONB NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at TIMESTAMPTZ,
    error TEXT,
    CONSTRAINT uq_webhook_events_key UNIQUE (provider, event_key)
);

-- -----------------------------------------------------------------------------
-- 6. RLS
-- -----------------------------------------------------------------------------
ALTER TABLE public.store_business_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.delivery_zones ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_payment_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oauth_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

-- Settings tables: every member reads, only OWNER/MANAGER writes.
DO $$
DECLARE t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['store_business_hours', 'delivery_zones', 'coupons'] LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_member_select', t);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.has_store_access(store_id))', t || '_member_select', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_manager_write', t);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.can_manage_store(store_id)) WITH CHECK (public.can_manage_store(store_id))', t || '_manager_write', t);
    END LOOP;
END $$;

-- Redemptions & payments: read-only for members; writes happen only inside SECURITY DEFINER RPCs.
DROP POLICY IF EXISTS "coupon_redemptions_member_select" ON public.coupon_redemptions;
CREATE POLICY "coupon_redemptions_member_select" ON public.coupon_redemptions
    FOR SELECT TO authenticated USING (public.has_store_access(store_id));

DROP POLICY IF EXISTS "payments_member_select" ON public.payments;
CREATE POLICY "payments_member_select" ON public.payments
    FOR SELECT TO authenticated USING (public.has_store_access(store_id));

-- store_payment_accounts, oauth_states, webhook_events: NO policies + revoke = service role only.
REVOKE ALL ON public.store_payment_accounts FROM anon, authenticated;
REVOKE ALL ON public.oauth_states FROM anon, authenticated;
REVOKE ALL ON public.webhook_events FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.payments FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.coupon_redemptions FROM anon, authenticated;

-- -----------------------------------------------------------------------------
-- 7. GUARD TRIGGERS
-- Direct API writes run as role `authenticated`; SECURITY DEFINER RPCs run as
-- the function owner. So `current_user = 'authenticated'` means "came straight
-- from PostgREST", which must never touch money/state columns.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_order_protected_columns()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF current_user IN ('authenticated', 'anon') THEN
        IF NEW.status IS DISTINCT FROM OLD.status
           OR NEW.payment_status IS DISTINCT FROM OLD.payment_status
           OR NEW.payment_method IS DISTINCT FROM OLD.payment_method
           OR NEW.paid_at IS DISTINCT FROM OLD.paid_at
           OR NEW.subtotal_cents IS DISTINCT FROM OLD.subtotal_cents
           OR NEW.discount_cents IS DISTINCT FROM OLD.discount_cents
           OR NEW.fee_cents IS DISTINCT FROM OLD.fee_cents
           OR NEW.total_cents IS DISTINCT FROM OLD.total_cents
           OR NEW.stock_deducted IS DISTINCT FROM OLD.stock_deducted
           OR NEW.counted_in_stats IS DISTINCT FROM OLD.counted_in_stats
           OR NEW.public_token IS DISTINCT FROM OLD.public_token
           OR NEW.coupon_id IS DISTINCT FROM OLD.coupon_id THEN
            RAISE EXCEPTION 'FORBIDDEN: Status, valores e pagamento do pedido só mudam pelas operações oficiais.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_guard_protected ON public.orders;
CREATE TRIGGER trg_orders_guard_protected
    BEFORE UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.guard_order_protected_columns();

-- Orders are only created through create_order_atomic.
REVOKE INSERT ON public.orders FROM anon, authenticated;

-- Definer helper: the guard trigger itself must NOT be SECURITY DEFINER (it relies on
-- current_user to detect direct API writes), but it needs to peek at the secrets table.
CREATE OR REPLACE FUNCTION public.store_has_active_payment_account(p_store_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (SELECT 1 FROM public.store_payment_accounts a WHERE a.store_id = p_store_id AND a.status = 'ACTIVE');
$$;
REVOKE ALL ON FUNCTION public.store_has_active_payment_account(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.store_has_active_payment_account(UUID) TO authenticated;

CREATE OR REPLACE FUNCTION public.guard_store_money_settings()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF current_user = 'authenticated' AND NOT public.can_manage_store(NEW.id) THEN
        IF NEW.pix_key IS DISTINCT FROM OLD.pix_key
           OR NEW.online_payment_enabled IS DISTINCT FROM OLD.online_payment_enabled
           OR NEW.offline_methods IS DISTINCT FROM OLD.offline_methods
           OR NEW.min_order_cents IS DISTINCT FROM OLD.min_order_cents
           OR NEW.payment_window_minutes IS DISTINCT FROM OLD.payment_window_minutes
           OR NEW.slug IS DISTINCT FROM OLD.slug
           OR NEW.is_published IS DISTINCT FROM OLD.is_published THEN
            RAISE EXCEPTION 'FORBIDDEN: Apenas proprietário ou gerente podem alterar pagamentos e publicação da loja.';
        END IF;
    END IF;
    IF current_user = 'authenticated'
       AND NEW.online_payment_enabled
       AND NOT OLD.online_payment_enabled
       AND NOT public.store_has_active_payment_account(NEW.id) THEN
        RAISE EXCEPTION 'PAYMENT_ACCOUNT_REQUIRED: Conecte o Mercado Pago antes de ativar o pagamento online.';
    END IF;
    IF NEW.last_order_number IS DISTINCT FROM OLD.last_order_number AND current_user = 'authenticated' THEN
        RAISE EXCEPTION 'FORBIDDEN: Numeração de pedidos é controlada pelo sistema.';
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stores_guard_money ON public.stores;
CREATE TRIGGER trg_stores_guard_money
    BEFORE UPDATE ON public.stores
    FOR EACH ROW EXECUTE FUNCTION public.guard_store_money_settings();

-- Realtime for the dashboard (authenticated, RLS-enforced).
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.payments;
    END IF;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
