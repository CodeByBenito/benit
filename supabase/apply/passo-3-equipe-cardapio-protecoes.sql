-- BENIT · PASSO 3 de 3 · migrations 0009 a 0012
-- Rode SOMENTE depois dos passos 1 e 2. Cole TUDO no SQL Editor do Supabase e clique em Run.
-- Pode ser repetido: todas as instruções são idempotentes.
-- Arquivo gerado por scripts/build-apply-bundle.mjs. Não edite à mão: mude a migration e gere de novo.
DO $guard$
BEGIN
    IF to_regclass('public.coupons') IS NULL THEN
        RAISE EXCEPTION 'BENIT: rode antes os passos 1 e 2 (a tabela coupons ainda não existe).';
    END IF;
END
$guard$;

-- >>>>>>>>>> 0009_team_management.sql
-- =============================================================================
-- BENIT SaaS — Migration 0009: Team management (members, roles, invitations)
--
-- `memberships` only had SELECT and INSERT policies, and `profiles` is readable
-- by its own user only, so the team screen needs controlled entry points:
--   list_team_members        read model (name, e-mail, role, scope, pending invite)
--   add_team_member          OWNER links an existing auth user to the org / a store
--   update_team_member_role  OWNER changes MANAGER / ATTENDANT / KITCHEN
--   remove_team_member       OWNER removes a member (never the last owner)
--
-- Inviting a brand-new e-mail is done by the app with the service role
-- (auth.admin.inviteUserByEmail); the membership itself is always created
-- here, as the calling OWNER, so the rules below cannot be skipped.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. READ MODEL
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_team_members(p_org_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_is_owner BOOLEAN;
    v_result JSONB;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Sessão expirada.';
    END IF;

    v_is_owner := public.is_org_owner(p_org_id);

    -- Owners see everyone. Managers see the team of the stores they manage
    -- (plus organization-wide members). Attendants and kitchen see nothing.
    IF NOT v_is_owner AND NOT EXISTS (
        SELECT 1 FROM public.memberships m
        WHERE m.organization_id = p_org_id AND m.user_id = auth.uid() AND m.role = 'MANAGER'
    ) THEN
        RAISE EXCEPTION 'FORBIDDEN: Apenas proprietário ou gerente podem ver a equipe.';
    END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'membership_id', m.id,
        'user_id', m.user_id,
        'full_name', p.full_name,
        'email', p.email,
        'role', m.role,
        'store_id', m.store_id,
        'store_name', s.name,
        'pending', (u.invited_at IS NOT NULL AND u.last_sign_in_at IS NULL),
        'is_self', (m.user_id = auth.uid()),
        'created_at', m.created_at
    ) ORDER BY (m.role = 'OWNER') DESC, m.created_at, m.id), '[]'::jsonb)
    INTO v_result
    FROM public.memberships m
    JOIN public.profiles p ON p.id = m.user_id
    LEFT JOIN public.stores s ON s.id = m.store_id
    LEFT JOIN auth.users u ON u.id = m.user_id
    WHERE m.organization_id = p_org_id
      AND (v_is_owner OR m.store_id IS NULL OR public.can_manage_store(m.store_id));

    RETURN v_result;
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. ADD A MEMBER (existing auth user, found by e-mail)
--    Returns {"status":"USER_NOT_FOUND"} when the e-mail has no account yet, so
--    the app can send the invitation and call again.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_team_member(
    p_org_id UUID,
    p_email TEXT,
    p_role public.membership_role,
    p_store_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_email TEXT := lower(trim(COALESCE(p_email, '')));
    v_user_id UUID;
    v_pending BOOLEAN;
    v_membership_id UUID;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Sessão expirada.';
    END IF;
    IF NOT public.is_org_owner(p_org_id) THEN
        RAISE EXCEPTION 'FORBIDDEN: Apenas o proprietário pode convidar pessoas para a equipe.';
    END IF;
    IF p_role IS NULL OR p_role = 'OWNER' THEN
        RAISE EXCEPTION 'INVALID_ROLE: Escolha Gerente, Atendente ou Cozinha.';
    END IF;
    IF v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
        RAISE EXCEPTION 'INVALID_EMAIL: Informe um e-mail válido.';
    END IF;
    IF p_store_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.stores s WHERE s.id = p_store_id AND s.organization_id = p_org_id
    ) THEN
        RAISE EXCEPTION 'INVALID_STORE: Esta loja não pertence à sua organização.';
    END IF;

    SELECT u.id, (u.invited_at IS NOT NULL AND u.last_sign_in_at IS NULL)
    INTO v_user_id, v_pending
    FROM auth.users u
    WHERE lower(u.email) = v_email
    LIMIT 1;

    IF v_user_id IS NULL THEN
        RETURN jsonb_build_object('status', 'USER_NOT_FOUND');
    END IF;
    IF v_user_id = auth.uid() THEN
        RAISE EXCEPTION 'ALREADY_MEMBER: Você já faz parte da equipe.';
    END IF;

    -- Serialize concurrent invitations of the same person.
    PERFORM pg_advisory_xact_lock(hashtextextended(v_user_id::text, 0));

    -- The panel shows one organization per account: refuse an account that
    -- already works for (or owns) another organization.
    IF EXISTS (
        SELECT 1 FROM public.memberships m WHERE m.user_id = v_user_id AND m.organization_id <> p_org_id
    ) THEN
        RAISE EXCEPTION 'OTHER_ORGANIZATION: Este e-mail já está ligado a outro negócio no BENIT. Peça para a pessoa usar outro e-mail.';
    END IF;

    -- One organization-wide membership, or one per store: never both.
    IF EXISTS (
        SELECT 1 FROM public.memberships m
        WHERE m.user_id = v_user_id
          AND m.organization_id = p_org_id
          AND (m.store_id IS NULL OR p_store_id IS NULL OR m.store_id = p_store_id)
    ) THEN
        RAISE EXCEPTION 'ALREADY_MEMBER: Esta pessoa já faz parte da equipe. Altere o papel dela na lista.';
    END IF;

    INSERT INTO public.memberships (organization_id, store_id, user_id, role)
    VALUES (p_org_id, p_store_id, v_user_id, p_role)
    RETURNING id INTO v_membership_id;

    RETURN jsonb_build_object(
        'status', 'ADDED',
        'membership_id', v_membership_id,
        'user_id', v_user_id,
        'pending', COALESCE(v_pending, false)
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. CHANGE A ROLE
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_team_member_role(
    p_membership_id UUID,
    p_role public.membership_role
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_member public.memberships%ROWTYPE;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Sessão expirada.';
    END IF;

    SELECT * INTO v_member FROM public.memberships WHERE id = p_membership_id FOR UPDATE;
    -- Same answer for "does not exist" and "not yours": no probing across tenants.
    IF NOT FOUND OR NOT public.is_org_owner(v_member.organization_id) THEN
        RAISE EXCEPTION 'FORBIDDEN: Apenas o proprietário pode alterar papéis da equipe.';
    END IF;
    IF p_role IS NULL OR p_role = 'OWNER' THEN
        RAISE EXCEPTION 'INVALID_ROLE: Escolha Gerente, Atendente ou Cozinha.';
    END IF;
    IF v_member.role = 'OWNER' THEN
        RAISE EXCEPTION 'OWNER_ROLE_LOCKED: O papel de proprietário não pode ser alterado.';
    END IF;

    UPDATE public.memberships SET role = p_role WHERE id = p_membership_id;

    RETURN jsonb_build_object('membership_id', p_membership_id, 'role', p_role);
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. REMOVE A MEMBER
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.remove_team_member(p_membership_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_member public.memberships%ROWTYPE;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'UNAUTHENTICATED: Sessão expirada.';
    END IF;

    SELECT * INTO v_member FROM public.memberships WHERE id = p_membership_id FOR UPDATE;
    IF NOT FOUND OR NOT public.is_org_owner(v_member.organization_id) THEN
        RAISE EXCEPTION 'FORBIDDEN: Apenas o proprietário pode remover pessoas da equipe.';
    END IF;

    IF v_member.role = 'OWNER' AND v_member.store_id IS NULL THEN
        -- Lock every owner row of the organization so two owners cannot
        -- remove each other at the same time and leave it without one.
        PERFORM 1 FROM public.memberships m
        WHERE m.organization_id = v_member.organization_id AND m.role = 'OWNER' AND m.store_id IS NULL
        FOR UPDATE;

        IF NOT EXISTS (
            SELECT 1 FROM public.memberships m
            WHERE m.organization_id = v_member.organization_id
              AND m.role = 'OWNER'
              AND m.store_id IS NULL
              AND m.id <> v_member.id
        ) THEN
            RAISE EXCEPTION 'LAST_OWNER: O negócio precisa de pelo menos um proprietário. Você não pode remover o último.';
        END IF;
    END IF;

    DELETE FROM public.memberships WHERE id = p_membership_id;

    RETURN jsonb_build_object('membership_id', p_membership_id, 'user_id', v_member.user_id, 'removed', true);
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. PRIVILEGES — signed-in users only; each function checks the role itself.
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.list_team_members(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.add_team_member(UUID, TEXT, public.membership_role, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_team_member_role(UUID, public.membership_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_team_member(UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.list_team_members(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_team_member(UUID, TEXT, public.membership_role, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_team_member_role(UUID, public.membership_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_team_member(UUID) TO authenticated;

-- >>>>>>>>>> 0010_catalog_reorder_and_asset_limits.sql
-- =============================================================================
-- BENIT SaaS — Migration 0010: Catalog ordering and storage limits
--
-- 1. reorder_catalog: saves a drag-and-drop order (categories or products) in
--    one statement instead of one request per row.
-- 2. benit-assets bucket: images only, with a size cap enforced by Storage
--    itself (the app also resizes before uploading).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. DRAG-AND-DROP ORDER
--    SECURITY INVOKER on purpose: the caller's RLS policies on `categories`
--    and `products` decide what can be updated, exactly as a direct update
--    would. `p_ids` is the complete new order of one list; rows of another
--    store are ignored.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reorder_catalog(
    p_store_id UUID,
    p_kind TEXT,
    p_ids UUID[]
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_count INTEGER := 0;
BEGIN
    IF auth.uid() IS NULL OR NOT public.has_store_access(p_store_id) THEN
        RAISE EXCEPTION 'FORBIDDEN: Sem permissão para organizar o cardápio desta loja.';
    END IF;
    IF p_ids IS NULL OR cardinality(p_ids) = 0 THEN
        RETURN 0;
    END IF;
    IF cardinality(p_ids) > 500 THEN
        RAISE EXCEPTION 'TOO_MANY_ITEMS: Reordene no máximo 500 itens por vez.';
    END IF;

    IF p_kind = 'category' THEN
        UPDATE public.categories c
        SET sort_order = (x.ord - 1) * 10
        FROM unnest(p_ids) WITH ORDINALITY AS x(id, ord)
        WHERE c.id = x.id AND c.store_id = p_store_id;
    ELSIF p_kind = 'product' THEN
        UPDATE public.products p
        SET sort_order = (x.ord - 1) * 10
        FROM unnest(p_ids) WITH ORDINALITY AS x(id, ord)
        WHERE p.id = x.id AND p.store_id = p_store_id;
    ELSE
        RAISE EXCEPTION 'INVALID_KIND: Use category ou product.';
    END IF;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.reorder_catalog(UUID, TEXT, UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reorder_catalog(UUID, TEXT, UUID[]) TO authenticated;

-- -----------------------------------------------------------------------------
-- 2. STORAGE: the public bucket only takes images, up to 5 MB each.
--    (Logos and covers are capped at 2 MB by the app; product photos are
--    resized in the browser. 5 MB leaves room for older app versions.)
-- -----------------------------------------------------------------------------
UPDATE storage.buckets
SET file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/webp', 'image/jpeg', 'image/png']
WHERE id = 'benit-assets';

-- >>>>>>>>>> 0011_public_order_rate_limit.sql
-- =============================================================================
-- BENIT SaaS — Migration 0011: Anti-spam for the public checkout
--
-- Two independent layers:
--
-- 1. Per phone, inside the order transaction. A trigger on `orders` refuses a
--    digital-menu order when the same phone already placed too many orders in
--    the same store in the last 10 minutes. It runs inside create_order_atomic
--    (which locks the store row first, so concurrent requests are counted
--    correctly) and it cannot be bypassed by calling the RPC directly with the
--    anon key. Manual orders typed by staff are never limited.
--
-- 2. Per visitor, for the app server. `consume_rate_limit` is a fixed-window
--    counter keyed by an opaque string. The app calls it with a hash of the
--    visitor's IP before quote_checkout and create_order_atomic. Only the
--    service role can call it; raw IPs are never stored.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. PER-PHONE LIMIT ON DIGITAL-MENU ORDERS
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_orders_store_phone_created
    ON public.orders (store_id, customer_phone_snapshot, created_at DESC)
    WHERE source = 'DIGITAL_MENU';

-- Limits live in one place so they can be tuned without touching the trigger.
CREATE OR REPLACE FUNCTION public.public_order_limit()
RETURNS TABLE (max_orders INTEGER, window_minutes INTEGER)
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
    SELECT 5, 10;
$$;

CREATE OR REPLACE FUNCTION public.enforce_public_order_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_limit RECORD;
    v_phone TEXT;
    v_recent INTEGER;
BEGIN
    IF NEW.source <> 'DIGITAL_MENU' THEN
        RETURN NEW;
    END IF;

    SELECT * INTO v_limit FROM public.public_order_limit();
    v_phone := regexp_replace(COALESCE(NEW.customer_phone_snapshot, ''), '[^0-9]', '', 'g');
    IF v_phone = '' THEN
        RETURN NEW;
    END IF;

    SELECT count(*) INTO v_recent
    FROM public.orders o
    WHERE o.store_id = NEW.store_id
      AND o.source = 'DIGITAL_MENU'
      AND o.customer_phone_snapshot = v_phone
      AND o.created_at > now() - make_interval(mins => v_limit.window_minutes);

    IF v_recent >= v_limit.max_orders THEN
        RAISE EXCEPTION 'RATE_LIMITED: Você fez muitos pedidos em pouco tempo. Aguarde alguns minutos ou fale com a loja pelo WhatsApp.';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_public_rate_limit ON public.orders;
CREATE TRIGGER trg_orders_public_rate_limit
    BEFORE INSERT ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.enforce_public_order_rate_limit();

REVOKE ALL ON FUNCTION public.public_order_limit() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_public_order_rate_limit() FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. GENERIC FIXED-WINDOW COUNTER (service role only)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rate_limit_buckets (
    bucket_key TEXT PRIMARY KEY CHECK (char_length(bucket_key) BETWEEN 8 AND 200),
    window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
    hits INTEGER NOT NULL DEFAULT 0 CHECK (hits >= 0)
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_buckets_window ON public.rate_limit_buckets (window_start);

-- No policies on purpose: with RLS on, only the service role (which bypasses
-- RLS) can read or write it.
ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.rate_limit_buckets FROM PUBLIC, anon, authenticated;

-- Counts one hit and answers whether the caller is still within the limit.
CREATE OR REPLACE FUNCTION public.consume_rate_limit(
    p_key TEXT,
    p_limit INTEGER,
    p_window_seconds INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_hits INTEGER;
BEGIN
    IF p_key IS NULL OR char_length(p_key) < 8 OR p_limit < 1 OR p_window_seconds < 1 THEN
        RAISE EXCEPTION 'INVALID_RATE_LIMIT: Parâmetros inválidos.';
    END IF;

    INSERT INTO public.rate_limit_buckets AS b (bucket_key, window_start, hits)
    VALUES (p_key, now(), 1)
    ON CONFLICT (bucket_key) DO UPDATE
    SET hits = CASE WHEN b.window_start < now() - make_interval(secs => p_window_seconds) THEN 1 ELSE b.hits + 1 END,
        window_start = CASE WHEN b.window_start < now() - make_interval(secs => p_window_seconds) THEN now() ELSE b.window_start END
    RETURNING hits INTO v_hits;

    -- Housekeeping: now and then, drop buckets nobody touched for a day.
    IF random() < 0.02 THEN
        DELETE FROM public.rate_limit_buckets WHERE window_start < now() - interval '1 day';
    END IF;

    RETURN v_hits <= p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_rate_limit(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(TEXT, INTEGER, INTEGER) TO service_role;

-- >>>>>>>>>> 0012_privileges_and_policy_performance.sql
-- =============================================================================
-- BENIT SaaS — Migration 0012: Least privilege and policy performance
--
-- Findings of a pre-launch audit (catalog queries + Supabase advisors).
-- Nothing here changes what a signed-in member can do.
--
-- 1. `anon` still held Supabase's default table privileges. RLS already
--    returned nothing to it, but a table created without RLS by mistake would
--    have been public. Anonymous visitors only use SECURITY DEFINER RPCs, so
--    the privileges go away, for existing and future tables.
-- 2. TRUNCATE / REFERENCES / TRIGGER on tables are not something an API role
--    needs, and TRUNCATE ignores RLS.
-- 3. Trigger functions and the text helper were executable by anyone.
-- 4. Six policies called auth.uid() once per row; wrapped in a sub-select the
--    planner evaluates it once per statement. This also fixes a real defect:
--    the profile update policy queried its own table and always failed.
-- 5. Three tables had two permissive SELECT policies for the same role (the
--    manager policy was FOR ALL). The manager policy becomes INSERT / UPDATE /
--    DELETE, which is all it was meant to cover.
-- 6. Indexes for three foreign keys that had none on the referencing side.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. ANONYMOUS VISITORS: NO TABLE ACCESS AT ALL
-- -----------------------------------------------------------------------------
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;

-- -----------------------------------------------------------------------------
-- 2. SIGNED-IN USERS: ROW OPERATIONS ONLY (RLS decides which rows)
-- -----------------------------------------------------------------------------
REVOKE TRUNCATE, REFERENCES, TRIGGER ON ALL TABLES IN SCHEMA public FROM authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLES FROM authenticated;

-- -----------------------------------------------------------------------------
-- 3. INTERNAL FUNCTIONS ARE NOT AN API
--    Trigger functions run when their trigger fires, whoever the caller is;
--    nobody needs EXECUTE on them. normalize_text is used by a trigger that
--    runs as the signed-in manager, so `authenticated` keeps it.
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.handle_updated_at() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.handle_delivery_zone_normalize() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.guard_order_protected_columns() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.guard_store_money_settings() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.normalize_text(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.normalize_text(TEXT) TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 4. auth.uid() ONCE PER STATEMENT, NOT ONCE PER ROW
-- -----------------------------------------------------------------------------
ALTER POLICY "profiles_select_own" ON public.profiles
    USING (id = (SELECT auth.uid()));

-- The old WITH CHECK protected `is_platform_admin` with a sub-select on
-- `profiles` itself, which Postgres rejects at run time ("infinite recursion
-- detected in policy"): no user could update their own profile at all.
-- Column privileges do the same job without touching the row: a user may
-- change only their name and phone. E-mail follows auth.users (trigger) and
-- the admin flag is not writable through the API.
ALTER POLICY "profiles_update_own" ON public.profiles
    USING (id = (SELECT auth.uid()))
    WITH CHECK (id = (SELECT auth.uid()));

REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM authenticated;
GRANT UPDATE (full_name, phone) ON public.profiles TO authenticated;

ALTER POLICY "organizations_select_member" ON public.organizations
    USING (public.is_org_member(id) OR created_by = (SELECT auth.uid()));

ALTER POLICY "organizations_insert_authenticated" ON public.organizations
    WITH CHECK (created_by = (SELECT auth.uid()));

ALTER POLICY "memberships_select_org" ON public.memberships
    USING (user_id = (SELECT auth.uid()) OR public.is_org_member(organization_id));

ALTER POLICY "memberships_insert_owner" ON public.memberships
    WITH CHECK (
        public.is_org_owner(organization_id)
        OR (
            user_id = (SELECT auth.uid())
            AND role = 'OWNER'
            AND store_id IS NULL
            AND EXISTS (
                SELECT 1 FROM public.organizations o
                WHERE o.id = organization_id AND o.created_by = (SELECT auth.uid())
            )
        )
    );

-- -----------------------------------------------------------------------------
-- 5. ONE SELECT POLICY PER TABLE
--    Members read through `<table>_member_select`; managers are members, so
--    they keep reading. Writes stay with OWNER / MANAGER.
-- -----------------------------------------------------------------------------
DO $$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['store_business_hours', 'delivery_zones', 'coupons'] LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_manager_write', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_manager_insert', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_manager_update', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_manager_delete', t);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (public.can_manage_store(store_id))', t || '_manager_insert', t);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (public.can_manage_store(store_id)) WITH CHECK (public.can_manage_store(store_id))', t || '_manager_update', t);
        EXECUTE format('CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (public.can_manage_store(store_id))', t || '_manager_delete', t);
    END LOOP;
END $$;

-- -----------------------------------------------------------------------------
-- 6. FOREIGN KEYS WITHOUT AN INDEX ON THE REFERENCING SIDE
--    Deleting a delivery zone, a coupon or a store had to scan these tables.
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_orders_delivery_zone ON public.orders (delivery_zone_id) WHERE delivery_zone_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_orders_coupon ON public.orders (coupon_id) WHERE coupon_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_memberships_store ON public.memberships (store_id) WHERE store_id IS NOT NULL;
