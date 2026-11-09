-- BENIT · PASSO 1 de 2 · migrations 0001 a 0004
-- Cole TUDO no SQL Editor do Supabase e clique em Run. Depois rode o passo 2.
-- Rode UMA vez: se o banco já tiver o passo 2, este script para sem alterar nada
-- (rodar de novo recriaria a versão antiga e insegura de create_order_atomic).
DO $guard$
BEGIN
    IF to_regclass('public.coupons') IS NOT NULL THEN
        RAISE EXCEPTION 'BENIT: o banco já está atualizado (passo 2 aplicado). Não rode o passo 1 de novo.';
    END IF;
END
$guard$;

-- >>>>>>>>>> 0001_initial_schema.sql
-- =============================================================================
-- BENIT SaaS — Migration 0001: Core Multi-Tenant Relational Schema (Hardened)
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1. ENUM TYPES
-- -----------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE public.membership_role AS ENUM ('OWNER', 'MANAGER', 'ATTENDANT', 'KITCHEN');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.order_source AS ENUM ('DIGITAL_MENU', 'MANUAL');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.fulfillment_type AS ENUM ('DINE_IN', 'PICKUP', 'DELIVERY');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.order_status AS ENUM ('NEW', 'CONFIRMED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE public.stock_movement_type AS ENUM ('INITIAL', 'ENTRY', 'EXIT', 'ADJUSTMENT', 'ORDER_DEDUCTION', 'ORDER_REVERSAL');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- -----------------------------------------------------------------------------
-- 2. UTILITY TRIGGER FOR updated_at
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. PROFILES (1:1 with auth.users)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL DEFAULT '',
    email TEXT NOT NULL DEFAULT '',
    phone TEXT,
    is_platform_admin BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, email, phone)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1), 'Usuário'),
        COALESCE(NEW.email, ''),
        NEW.raw_user_meta_data->>'phone'
    )
    ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email,
        full_name = COALESCE(NULLIF(EXCLUDED.full_name, ''), public.profiles.full_name);
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- -----------------------------------------------------------------------------
-- 4. ORGANIZATIONS, STORES & MEMBERSHIPS (Multi-Store & SaaS Plan Ready)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL CHECK (char_length(trim(name)) >= 2),
    slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
    document_number TEXT,
    plan_tier TEXT NOT NULL DEFAULT 'FREE_PILOT',
    subscription_status TEXT NOT NULL DEFAULT 'ACTIVE',
    max_stores INTEGER NOT NULL DEFAULT 1 CHECK (max_stores >= 1),
    created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_organizations_created_by ON public.organizations(created_by);

DROP TRIGGER IF EXISTS trg_organizations_updated_at ON public.organizations;
CREATE TRIGGER trg_organizations_updated_at
    BEFORE UPDATE ON public.organizations
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TABLE IF NOT EXISTS public.stores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (char_length(trim(name)) >= 2),
    slug TEXT NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
    description TEXT,
    logo_url TEXT,
    banner_url TEXT,
    phone TEXT,
    whatsapp TEXT,
    address TEXT,
    currency TEXT NOT NULL DEFAULT 'BRL',
    is_open BOOLEAN NOT NULL DEFAULT true,
    is_published BOOLEAN NOT NULL DEFAULT true,
    last_order_number INTEGER NOT NULL DEFAULT 0 CHECK (last_order_number >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (id, organization_id)
);

CREATE INDEX IF NOT EXISTS idx_stores_organization_id ON public.stores(organization_id);
CREATE INDEX IF NOT EXISTS idx_stores_slug ON public.stores(slug);

DROP TRIGGER IF EXISTS trg_stores_updated_at ON public.stores;
CREATE TRIGGER trg_stores_updated_at
    BEFORE UPDATE ON public.stores
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Memberships support either Organization-wide access (store_id IS NULL, e.g. OWNER)
-- or Store-specific access (store_id IS NOT NULL, e.g. branch MANAGER / ATTENDANT)
CREATE TABLE IF NOT EXISTS public.memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
    store_id UUID,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role public.membership_role NOT NULL DEFAULT 'OWNER',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_memberships_store_org
        FOREIGN KEY (store_id, organization_id)
        REFERENCES public.stores(id, organization_id)
        ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_memberships_org_user_all_stores
    ON public.memberships (organization_id, user_id)
    WHERE store_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_memberships_org_store_user
    ON public.memberships (organization_id, store_id, user_id)
    WHERE store_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_memberships_user_id ON public.memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_organization_id ON public.memberships(organization_id);

DROP TRIGGER IF EXISTS trg_memberships_updated_at ON public.memberships;
CREATE TRIGGER trg_memberships_updated_at
    BEFORE UPDATE ON public.memberships
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- -----------------------------------------------------------------------------
-- 5. CATEGORIES, PRODUCTS & OPTIONS (With Composite Tenant Foreign Keys)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (char_length(trim(name)) >= 1),
    description TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (id, store_id)
);

CREATE INDEX IF NOT EXISTS idx_categories_store_id_sort ON public.categories(store_id, sort_order);

DROP TRIGGER IF EXISTS trg_categories_updated_at ON public.categories;
CREATE TRIGGER trg_categories_updated_at
    BEFORE UPDATE ON public.categories
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    category_id UUID,
    sku TEXT,
    name TEXT NOT NULL CHECK (char_length(trim(name)) >= 1),
    description TEXT,
    price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
    image_url TEXT,
    is_available BOOLEAN NOT NULL DEFAULT true,
    is_archived BOOLEAN NOT NULL DEFAULT false,
    track_stock BOOLEAN NOT NULL DEFAULT true,
    stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0),
    low_stock_threshold INTEGER NOT NULL DEFAULT 5 CHECK (low_stock_threshold >= 0),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (id, store_id),
    CONSTRAINT fk_products_category_store
        FOREIGN KEY (category_id, store_id)
        REFERENCES public.categories(id, store_id)
        ON DELETE SET NULL (category_id)
);

CREATE INDEX IF NOT EXISTS idx_products_store_id ON public.products(store_id);
CREATE INDEX IF NOT EXISTS idx_products_category_id ON public.products(category_id);

DROP TRIGGER IF EXISTS trg_products_updated_at ON public.products;
CREATE TRIGGER trg_products_updated_at
    BEFORE UPDATE ON public.products
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TABLE IF NOT EXISTS public.product_option_groups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    product_id UUID NOT NULL,
    name TEXT NOT NULL CHECK (char_length(trim(name)) >= 1),
    min_select INTEGER NOT NULL DEFAULT 0 CHECK (min_select >= 0),
    max_select INTEGER NOT NULL DEFAULT 1 CHECK (max_select >= 1 AND max_select >= min_select),
    is_required BOOLEAN NOT NULL DEFAULT false,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (id, store_id),
    CONSTRAINT fk_option_groups_product_store
        FOREIGN KEY (product_id, store_id)
        REFERENCES public.products(id, store_id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_product_option_groups_product_id ON public.product_option_groups(product_id);
CREATE INDEX IF NOT EXISTS idx_product_option_groups_store_id ON public.product_option_groups(store_id);

DROP TRIGGER IF EXISTS trg_product_option_groups_updated_at ON public.product_option_groups;
CREATE TRIGGER trg_product_option_groups_updated_at
    BEFORE UPDATE ON public.product_option_groups
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TABLE IF NOT EXISTS public.product_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    group_id UUID NOT NULL,
    name TEXT NOT NULL CHECK (char_length(trim(name)) >= 1),
    price_cents INTEGER NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
    is_available BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (id, store_id),
    CONSTRAINT fk_options_group_store
        FOREIGN KEY (group_id, store_id)
        REFERENCES public.product_option_groups(id, store_id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_product_options_group_id ON public.product_options(group_id);
CREATE INDEX IF NOT EXISTS idx_product_options_store_id ON public.product_options(store_id);

DROP TRIGGER IF EXISTS trg_product_options_updated_at ON public.product_options;
CREATE TRIGGER trg_product_options_updated_at
    BEFORE UPDATE ON public.product_options
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- -----------------------------------------------------------------------------
-- 6. CUSTOMERS
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    name TEXT NOT NULL CHECK (char_length(trim(name)) >= 1),
    phone TEXT NOT NULL CHECK (char_length(trim(phone)) >= 8),
    email TEXT,
    notes TEXT,
    total_orders INTEGER NOT NULL DEFAULT 0 CHECK (total_orders >= 0),
    total_spent_cents INTEGER NOT NULL DEFAULT 0 CHECK (total_spent_cents >= 0),
    last_order_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (store_id, phone),
    UNIQUE (id, store_id)
);

CREATE INDEX IF NOT EXISTS idx_customers_store_id ON public.customers(store_id);
CREATE INDEX IF NOT EXISTS idx_customers_store_phone ON public.customers(store_id, phone);

DROP TRIGGER IF EXISTS trg_customers_updated_at ON public.customers;
CREATE TRIGGER trg_customers_updated_at
    BEFORE UPDATE ON public.customers
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- -----------------------------------------------------------------------------
-- 7. ORDERS, ORDER ITEMS, OPTIONS & STATUS HISTORY (Composite Tenant Keys)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    customer_id UUID,
    order_number INTEGER NOT NULL CHECK (order_number > 0),
    source public.order_source NOT NULL DEFAULT 'DIGITAL_MENU',
    fulfillment_type public.fulfillment_type NOT NULL DEFAULT 'PICKUP',
    table_or_reference TEXT,
    status public.order_status NOT NULL DEFAULT 'NEW',
    customer_name_snapshot TEXT NOT NULL,
    customer_phone_snapshot TEXT NOT NULL,
    subtotal_cents INTEGER NOT NULL CHECK (subtotal_cents >= 0),
    discount_cents INTEGER NOT NULL DEFAULT 0 CHECK (discount_cents >= 0),
    fee_cents INTEGER NOT NULL DEFAULT 0 CHECK (fee_cents >= 0),
    total_cents INTEGER NOT NULL CHECK (total_cents >= 0),
    notes TEXT,
    stock_deducted BOOLEAN NOT NULL DEFAULT false,
    idempotency_key TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (store_id, order_number),
    UNIQUE (store_id, idempotency_key),
    UNIQUE (id, store_id),
    CONSTRAINT fk_orders_customer_store
        FOREIGN KEY (customer_id, store_id)
        REFERENCES public.customers(id, store_id)
        ON DELETE SET NULL (customer_id)
);

CREATE INDEX IF NOT EXISTS idx_orders_store_id_status ON public.orders(store_id, status);
CREATE INDEX IF NOT EXISTS idx_orders_store_id_created_at ON public.orders(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_customer_id ON public.orders(customer_id);

DROP TRIGGER IF EXISTS trg_orders_updated_at ON public.orders;
CREATE TRIGGER trg_orders_updated_at
    BEFORE UPDATE ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

CREATE TABLE IF NOT EXISTS public.order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    order_id UUID NOT NULL,
    product_id UUID,
    product_name_snapshot TEXT NOT NULL,
    unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
    options_unit_price_cents INTEGER NOT NULL DEFAULT 0 CHECK (options_unit_price_cents >= 0),
    quantity INTEGER NOT NULL CHECK (quantity > 0),
    total_item_cents INTEGER NOT NULL CHECK (total_item_cents >= 0),
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (id, store_id),
    CONSTRAINT fk_order_items_order_store
        FOREIGN KEY (order_id, store_id)
        REFERENCES public.orders(id, store_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_order_items_product_store
        FOREIGN KEY (product_id, store_id)
        REFERENCES public.products(id, store_id)
        ON DELETE SET NULL (product_id)
);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON public.order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_store_id ON public.order_items(store_id);

CREATE TABLE IF NOT EXISTS public.order_item_options (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    order_item_id UUID NOT NULL,
    option_id UUID,
    group_name_snapshot TEXT NOT NULL,
    option_name_snapshot TEXT NOT NULL,
    price_cents INTEGER NOT NULL DEFAULT 0 CHECK (price_cents >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_order_item_options_item_store
        FOREIGN KEY (order_item_id, store_id)
        REFERENCES public.order_items(id, store_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_order_item_options_option_store
        FOREIGN KEY (option_id, store_id)
        REFERENCES public.product_options(id, store_id)
        ON DELETE SET NULL (option_id)
);

CREATE INDEX IF NOT EXISTS idx_order_item_options_order_item_id ON public.order_item_options(order_item_id);

CREATE TABLE IF NOT EXISTS public.order_status_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    order_id UUID NOT NULL,
    from_status public.order_status,
    to_status public.order_status NOT NULL,
    reason TEXT,
    changed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_order_status_history_order_store
        FOREIGN KEY (order_id, store_id)
        REFERENCES public.orders(id, store_id)
        ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_order_status_history_order_id ON public.order_status_history(order_id, created_at DESC);

-- -----------------------------------------------------------------------------
-- 8. STOCK MOVEMENTS LEDGER
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    product_id UUID NOT NULL,
    order_id UUID,
    movement_type public.stock_movement_type NOT NULL,
    quantity_delta INTEGER NOT NULL CHECK (quantity_delta <> 0),
    previous_quantity INTEGER NOT NULL CHECK (previous_quantity >= 0),
    new_quantity INTEGER NOT NULL CHECK (new_quantity >= 0),
    reference_key TEXT UNIQUE,
    reason TEXT,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT fk_stock_movements_product_store
        FOREIGN KEY (product_id, store_id)
        REFERENCES public.products(id, store_id)
        ON DELETE CASCADE,
    CONSTRAINT fk_stock_movements_order_store
        FOREIGN KEY (order_id, store_id)
        REFERENCES public.orders(id, store_id)
        ON DELETE SET NULL (order_id)
);

CREATE INDEX IF NOT EXISTS idx_stock_movements_store_id_created ON public.stock_movements(store_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_product_id ON public.stock_movements(product_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_stock_movements_order_id ON public.stock_movements(order_id);

-- >>>>>>>>>> 0002_rls_policies.sql
-- =============================================================================
-- BENIT SaaS — Migration 0002: Strict Row Level Security (RLS) & Realtime Isolation
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. TENANT MEMBERSHIP HELPER FUNCTIONS (Supports Org-wide & Store-scoped roles)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_org_member(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.memberships m
        WHERE m.organization_id = p_org_id
          AND m.user_id = auth.uid()
    );
$$;

CREATE OR REPLACE FUNCTION public.is_org_owner(p_org_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.memberships m
        WHERE m.organization_id = p_org_id
          AND m.user_id = auth.uid()
          AND m.role = 'OWNER'
          AND m.store_id IS NULL
    );
$$;

CREATE OR REPLACE FUNCTION public.has_store_access(p_store_id UUID)
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
    );
$$;

-- -----------------------------------------------------------------------------
-- 2. ENABLE RLS ON ALL TABLES
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_option_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_item_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_status_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 3. PROFILES POLICIES
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own" ON public.profiles
    FOR SELECT
    TO authenticated
    USING (id = auth.uid());

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own" ON public.profiles
    FOR UPDATE
    TO authenticated
    USING (id = auth.uid())
    WITH CHECK (
        id = auth.uid()
        AND is_platform_admin = (SELECT p.is_platform_admin FROM public.profiles p WHERE p.id = auth.uid())
    );

-- -----------------------------------------------------------------------------
-- 4. ORGANIZATIONS & MEMBERSHIPS POLICIES
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "organizations_select_member" ON public.organizations;
CREATE POLICY "organizations_select_member" ON public.organizations
    FOR SELECT
    TO authenticated
    USING (public.is_org_member(id) OR created_by = auth.uid());

DROP POLICY IF EXISTS "organizations_insert_authenticated" ON public.organizations;
CREATE POLICY "organizations_insert_authenticated" ON public.organizations
    FOR INSERT
    TO authenticated
    WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "organizations_update_owner" ON public.organizations;
CREATE POLICY "organizations_update_owner" ON public.organizations
    FOR UPDATE
    TO authenticated
    USING (public.is_org_owner(id))
    WITH CHECK (public.is_org_owner(id));

DROP POLICY IF EXISTS "memberships_select_org" ON public.memberships;
CREATE POLICY "memberships_select_org" ON public.memberships
    FOR SELECT
    TO authenticated
    USING (user_id = auth.uid() OR public.is_org_member(organization_id));

DROP POLICY IF EXISTS "memberships_insert_owner" ON public.memberships;
CREATE POLICY "memberships_insert_owner" ON public.memberships
    FOR INSERT
    TO authenticated
    WITH CHECK (
        public.is_org_owner(organization_id)
        OR (
            user_id = auth.uid()
            AND role = 'OWNER'
            AND store_id IS NULL
            AND EXISTS (
                SELECT 1 FROM public.organizations o
                WHERE o.id = organization_id AND o.created_by = auth.uid()
            )
        )
    );

-- -----------------------------------------------------------------------------
-- 5. STORES & CATALOG POLICIES (STRICT TENANT ISOLATION — NO DIRECT ANON TABLE READS)
-- Public visitors NEVER query base tables directly; they access /menu/[slug]
-- exclusively via `public.get_public_menu_by_slug(p_slug)`, preventing any leak
-- of internal `stock_quantity`, `low_stock_threshold`, `sku`, or `last_order_number`.
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "stores_public_select_published" ON public.stores;
DROP POLICY IF EXISTS "stores_tenant_all" ON public.stores;
CREATE POLICY "stores_tenant_all" ON public.stores
    FOR ALL
    TO authenticated
    USING (public.has_store_access(id))
    WITH CHECK (public.is_org_owner(organization_id) OR public.has_store_access(id));

DROP POLICY IF EXISTS "categories_public_select" ON public.categories;
DROP POLICY IF EXISTS "categories_tenant_all" ON public.categories;
CREATE POLICY "categories_tenant_all" ON public.categories
    FOR ALL
    TO authenticated
    USING (public.has_store_access(store_id))
    WITH CHECK (public.has_store_access(store_id));

DROP POLICY IF EXISTS "products_public_select" ON public.products;
DROP POLICY IF EXISTS "products_tenant_all" ON public.products;
CREATE POLICY "products_tenant_all" ON public.products
    FOR ALL
    TO authenticated
    USING (public.has_store_access(store_id))
    WITH CHECK (public.has_store_access(store_id));

DROP POLICY IF EXISTS "product_option_groups_public_select" ON public.product_option_groups;
DROP POLICY IF EXISTS "product_option_groups_tenant_all" ON public.product_option_groups;
CREATE POLICY "product_option_groups_tenant_all" ON public.product_option_groups
    FOR ALL
    TO authenticated
    USING (public.has_store_access(store_id))
    WITH CHECK (public.has_store_access(store_id));

DROP POLICY IF EXISTS "product_options_public_select" ON public.product_options;
DROP POLICY IF EXISTS "product_options_tenant_all" ON public.product_options;
CREATE POLICY "product_options_tenant_all" ON public.product_options
    FOR ALL
    TO authenticated
    USING (public.has_store_access(store_id))
    WITH CHECK (public.has_store_access(store_id));

-- -----------------------------------------------------------------------------
-- 6. CUSTOMERS, ORDERS & INVENTORY POLICIES (Strict Tenant Isolation)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "customers_tenant_all" ON public.customers;
CREATE POLICY "customers_tenant_all" ON public.customers
    FOR ALL
    TO authenticated
    USING (public.has_store_access(store_id))
    WITH CHECK (public.has_store_access(store_id));

DROP POLICY IF EXISTS "orders_tenant_all" ON public.orders;
CREATE POLICY "orders_tenant_all" ON public.orders
    FOR ALL
    TO authenticated
    USING (public.has_store_access(store_id))
    WITH CHECK (public.has_store_access(store_id));

DROP POLICY IF EXISTS "order_items_tenant_all" ON public.order_items;
CREATE POLICY "order_items_tenant_all" ON public.order_items
    FOR ALL
    TO authenticated
    USING (public.has_store_access(store_id))
    WITH CHECK (public.has_store_access(store_id));

DROP POLICY IF EXISTS "order_item_options_tenant_all" ON public.order_item_options;
CREATE POLICY "order_item_options_tenant_all" ON public.order_item_options
    FOR ALL
    TO authenticated
    USING (public.has_store_access(store_id))
    WITH CHECK (public.has_store_access(store_id));

DROP POLICY IF EXISTS "order_status_history_tenant_all" ON public.order_status_history;
CREATE POLICY "order_status_history_tenant_all" ON public.order_status_history
    FOR ALL
    TO authenticated
    USING (public.has_store_access(store_id))
    WITH CHECK (public.has_store_access(store_id));

DROP POLICY IF EXISTS "stock_movements_tenant_select" ON public.stock_movements;
CREATE POLICY "stock_movements_tenant_select" ON public.stock_movements
    FOR SELECT
    TO authenticated
    USING (public.has_store_access(store_id));

-- -----------------------------------------------------------------------------
-- 7. REALTIME PUBLICATION & REPLICA IDENTITY
-- Because base tables only allow `authenticated` with `has_store_access(store_id)`,
-- Supabase Realtime enforces JWT-based tenant isolation automatically.
-- -----------------------------------------------------------------------------
ALTER TABLE public.orders REPLICA IDENTITY FULL;
ALTER TABLE public.products REPLICA IDENTITY FULL;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.orders;
        ALTER PUBLICATION supabase_realtime ADD TABLE public.products;
        ALTER PUBLICATION supabase_realtime ADD TABLE public.stock_movements;
    END IF;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- >>>>>>>>>> 0003_atomic_rpcs.sql
-- =============================================================================
-- BENIT SaaS — Migration 0003: Hardened Atomic RPCs, Public Menu Projection & Storage RLS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. CONTROLLED PUBLIC DIGITAL MENU PROJECTION (Zero Private Column Leakage)
-- Returns ONLY sanitized store profile, active categories, and non-archived
-- products with a boolean `in_stock` flag (never exposing stock_quantity or sku).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_public_menu_by_slug(p_slug TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_store RECORD;
    v_categories JSONB;
    v_products JSONB;
BEGIN
    SELECT
        id,
        name,
        slug,
        description,
        logo_url,
        banner_url,
        phone,
        whatsapp,
        address,
        currency,
        is_open
    INTO v_store
    FROM public.stores
    WHERE slug = lower(trim(p_slug))
      AND is_published = true;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', c.id,
                'name', c.name,
                'description', c.description
            )
            ORDER BY c.sort_order ASC, c.created_at ASC
        ),
        '[]'::jsonb
    )
    INTO v_categories
    FROM public.categories c
    WHERE c.store_id = v_store.id
      AND c.is_active = true;

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', p.id,
                'category_id', p.category_id,
                'name', p.name,
                'description', p.description,
                'price_cents', p.price_cents,
                'image_url', p.image_url,
                'is_available', p.is_available,
                'in_stock', (NOT p.track_stock OR p.stock_quantity > 0),
                'option_groups', COALESCE(
                    (
                        SELECT jsonb_agg(
                            jsonb_build_object(
                                'id', g.id,
                                'name', g.name,
                                'min_select', g.min_select,
                                'max_select', g.max_select,
                                'is_required', g.is_required,
                                'options', COALESCE(
                                    (
                                        SELECT jsonb_agg(
                                            jsonb_build_object(
                                                'id', o.id,
                                                'name', o.name,
                                                'price_cents', o.price_cents
                                            )
                                            ORDER BY o.sort_order ASC, o.created_at ASC
                                        )
                                        FROM public.product_options o
                                        WHERE o.group_id = g.id
                                          AND o.store_id = v_store.id
                                          AND o.is_available = true
                                    ),
                                    '[]'::jsonb
                                )
                            )
                            ORDER BY g.sort_order ASC, g.created_at ASC
                        )
                        FROM public.product_option_groups g
                        WHERE g.product_id = p.id
                          AND g.store_id = v_store.id
                    ),
                    '[]'::jsonb
                )
            )
            ORDER BY p.sort_order ASC, p.created_at DESC
        ),
        '[]'::jsonb
    )
    INTO v_products
    FROM public.products p
    WHERE p.store_id = v_store.id
      AND p.is_archived = false;

    RETURN jsonb_build_object(
        'store', jsonb_build_object(
            'id', v_store.id,
            'name', v_store.name,
            'slug', v_store.slug,
            'description', v_store.description,
            'logo_url', v_store.logo_url,
            'banner_url', v_store.banner_url,
            'phone', v_store.phone,
            'whatsapp', v_store.whatsapp,
            'address', v_store.address,
            'currency', v_store.currency,
            'is_open', v_store.is_open
        ),
        'categories', v_categories,
        'products', v_products
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. ATOMIC TENANT ONBOARDING (Organization + Membership + Initial Store)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.onboard_organization_and_store(
    p_org_name TEXT,
    p_org_slug TEXT,
    p_store_name TEXT,
    p_store_slug TEXT,
    p_phone TEXT DEFAULT NULL,
    p_whatsapp TEXT DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_address TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_org_id UUID;
    v_store_id UUID;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHENTICATED: Usuário não autenticado.';
    END IF;

    INSERT INTO public.profiles (id, full_name, email)
    SELECT u.id, COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)), COALESCE(u.email, '')
    FROM auth.users u
    WHERE u.id = v_user_id
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.organizations (name, slug, created_by)
    VALUES (trim(p_org_name), lower(trim(p_org_slug)), v_user_id)
    RETURNING id INTO v_org_id;

    INSERT INTO public.memberships (organization_id, store_id, user_id, role)
    VALUES (v_org_id, NULL, v_user_id, 'OWNER');

    INSERT INTO public.stores (
        organization_id,
        name,
        slug,
        phone,
        whatsapp,
        description,
        address,
        is_open,
        is_published
    )
    VALUES (
        v_org_id,
        trim(p_store_name),
        lower(trim(p_store_slug)),
        NULLIF(trim(p_phone), ''),
        NULLIF(trim(COALESCE(p_whatsapp, p_phone)), ''),
        NULLIF(trim(p_description), ''),
        NULLIF(trim(p_address), ''),
        true,
        true
    )
    RETURNING id INTO v_store_id;

    RETURN jsonb_build_object(
        'organization_id', v_org_id,
        'store_id', v_store_id,
        'store_slug', lower(trim(p_store_slug))
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. ATOMIC STOCK ADJUSTMENT (Manual Entry, Exit, Adjustment)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.adjust_product_stock_atomic(
    p_store_id UUID,
    p_product_id UUID,
    p_movement_type public.stock_movement_type,
    p_quantity INTEGER,
    p_reason TEXT DEFAULT NULL,
    p_reference_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_product RECORD;
    v_delta INTEGER;
    v_new_qty INTEGER;
    v_movement_id UUID;
BEGIN
    IF v_user_id IS NULL OR NOT public.has_store_access(p_store_id) THEN
        RAISE EXCEPTION 'FORBIDDEN: Sem permissão para gerenciar o estoque desta loja.';
    END IF;

    IF p_movement_type NOT IN ('INITIAL', 'ENTRY', 'EXIT', 'ADJUSTMENT') THEN
        RAISE EXCEPTION 'INVALID_MOVEMENT_TYPE: Tipo de movimentação manual inválido.';
    END IF;

    SELECT * INTO v_product
    FROM public.products
    WHERE id = p_product_id AND store_id = p_store_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'PRODUCT_NOT_FOUND: Produto não encontrado nesta loja.';
    END IF;

    IF p_movement_type IN ('INITIAL', 'ADJUSTMENT') THEN
        IF p_quantity < 0 THEN
            RAISE EXCEPTION 'INVALID_QUANTITY: O saldo de estoque não pode ser negativo.';
        END IF;
        v_new_qty := p_quantity;
        v_delta := v_new_qty - v_product.stock_quantity;
        IF v_delta = 0 THEN
            RETURN jsonb_build_object(
                'product_id', v_product.id,
                'previous_quantity', v_product.stock_quantity,
                'new_quantity', v_product.stock_quantity,
                'unchanged', true
            );
        END IF;
    ELSIF p_movement_type = 'ENTRY' THEN
        IF p_quantity <= 0 THEN
            RAISE EXCEPTION 'INVALID_QUANTITY: A quantidade de entrada deve ser maior que zero.';
        END IF;
        v_delta := p_quantity;
        v_new_qty := v_product.stock_quantity + p_quantity;
    ELSIF p_movement_type = 'EXIT' THEN
        IF p_quantity <= 0 THEN
            RAISE EXCEPTION 'INVALID_QUANTITY: A quantidade de saída deve ser maior que zero.';
        END IF;
        IF v_product.stock_quantity < p_quantity THEN
            RAISE EXCEPTION 'INSUFFICIENT_STOCK: Saldo insuficiente para saída (Disponível: %, Solicitado: %).',
                v_product.stock_quantity, p_quantity;
        END IF;
        v_delta := -p_quantity;
        v_new_qty := v_product.stock_quantity - p_quantity;
    END IF;

    UPDATE public.products
    SET stock_quantity = v_new_qty,
        track_stock = true
    WHERE id = v_product.id;

    INSERT INTO public.stock_movements (
        store_id,
        product_id,
        movement_type,
        quantity_delta,
        previous_quantity,
        new_quantity,
        reference_key,
        reason,
        created_by
    )
    VALUES (
        p_store_id,
        v_product.id,
        p_movement_type,
        v_delta,
        v_product.stock_quantity,
        v_new_qty,
        p_reference_key,
        COALESCE(NULLIF(trim(p_reason), ''), 'Ajuste manual no painel'),
        v_user_id
    )
    RETURNING id INTO v_movement_id;

    RETURN jsonb_build_object(
        'movement_id', v_movement_id,
        'product_id', v_product.id,
        'previous_quantity', v_product.stock_quantity,
        'new_quantity', v_new_qty,
        'quantity_delta', v_delta
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. ATOMIC ORDER CREATION (With Option Group min/max/is_required Validation)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_order_atomic(
    p_store_id UUID,
    p_source public.order_source,
    p_fulfillment_type public.fulfillment_type,
    p_customer_name TEXT,
    p_customer_phone TEXT,
    p_items JSONB,
    p_table_or_reference TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_discount_cents INTEGER DEFAULT 0,
    p_fee_cents INTEGER DEFAULT 0,
    p_initial_status public.order_status DEFAULT 'NEW',
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_store RECORD;
    v_existing_order RECORD;
    v_order_number INTEGER;
    v_customer_id UUID;
    v_normalized_phone TEXT;
    v_order_id UUID;
    v_subtotal_cents INTEGER := 0;
    v_total_cents INTEGER := 0;
    v_discount INTEGER := COALESCE(p_discount_cents, 0);
    v_fee INTEGER := COALESCE(p_fee_cents, 0);
    v_should_deduct_stock BOOLEAN := false;
    v_item JSONB;
    v_product RECORD;
    v_item_qty INTEGER;
    v_options_unit_cents INTEGER;
    v_total_item_cents INTEGER;
    v_order_item_id UUID;
    v_opt_id UUID;
    v_opt RECORD;
    v_group_check RECORD;
    v_selected_opt_ids UUID[];
    v_req_Row RECORD;
BEGIN
    SELECT * INTO v_store
    FROM public.stores
    WHERE id = p_store_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'STORE_NOT_FOUND: Loja não encontrada.';
    END IF;

    IF p_source = 'MANUAL' THEN
        IF v_user_id IS NULL OR NOT public.has_store_access(p_store_id) THEN
            RAISE EXCEPTION 'FORBIDDEN: Apenas usuários autorizados podem registrar pedidos manuais.';
        END IF;
        IF p_initial_status NOT IN ('NEW', 'CONFIRMED') THEN
            RAISE EXCEPTION 'INVALID_INITIAL_STATUS: Pedido manual deve iniciar como NEW ou CONFIRMED.';
        END IF;
    ELSE
        IF NOT v_store.is_published THEN
            RAISE EXCEPTION 'STORE_UNPUBLISHED: O cardápio digital desta loja não está publicado.';
        END IF;
        IF NOT v_store.is_open THEN
            RAISE EXCEPTION 'STORE_CLOSED: A loja está fechada para novos pedidos no momento.';
        END IF;
        p_initial_status := 'NEW';
        v_discount := 0;
        v_fee := 0;
    END IF;

    -- Idempotency check
    IF p_idempotency_key IS NOT NULL AND trim(p_idempotency_key) <> '' THEN
        SELECT id, order_number, status, total_cents
        INTO v_existing_order
        FROM public.orders
        WHERE store_id = p_store_id AND idempotency_key = trim(p_idempotency_key);

        IF FOUND THEN
            RETURN jsonb_build_object(
                'order_id', v_existing_order.id,
                'order_number', v_existing_order.order_number,
                'status', v_existing_order.status,
                'total_cents', v_existing_order.total_cents,
                'idempotent_replay', true
            );
        END IF;
    END IF;

    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'EMPTY_ORDER: O pedido deve conter pelo menos um item.';
    END IF;

    -- Lock and validate aggregated product quantities (ordered by product_id to prevent deadlocks)
    FOR v_req_Row IN
        SELECT
            (elem->>'product_id')::UUID AS product_id,
            SUM(COALESCE((elem->>'quantity')::INTEGER, 0)) AS total_requested
        FROM jsonb_array_elements(p_items) AS elem
        GROUP BY (elem->>'product_id')::UUID
        ORDER BY (elem->>'product_id')::UUID
    LOOP
        IF v_req_Row.total_requested <= 0 THEN
            RAISE EXCEPTION 'INVALID_QUANTITY: A quantidade de cada item deve ser maior que zero.';
        END IF;

        SELECT * INTO v_product
        FROM public.products
        WHERE id = v_req_Row.product_id AND store_id = p_store_id AND is_archived = false
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'PRODUCT_NOT_FOUND: Um dos produtos selecionados não existe mais.';
        END IF;

        IF NOT v_product.is_available THEN
            RAISE EXCEPTION 'PRODUCT_UNAVAILABLE: O produto "%" está indisponível no momento.', v_product.name;
        END IF;

        IF v_product.track_stock AND v_product.stock_quantity < v_req_Row.total_requested THEN
            RAISE EXCEPTION 'INSUFFICIENT_STOCK: Estoque insuficiente para "%" (Disponível: %, Solicitado: %).',
                v_product.name, v_product.stock_quantity, v_req_Row.total_requested;
        END IF;
    END LOOP;

    -- Upsert store-scoped customer
    v_normalized_phone := regexp_replace(COALESCE(p_customer_phone, ''), '[^0-9]', '', 'g');
    IF char_length(v_normalized_phone) < 8 THEN
        v_normalized_phone := trim(p_customer_phone);
    END IF;

    INSERT INTO public.customers (store_id, name, phone, last_order_at)
    VALUES (p_store_id, trim(p_customer_name), v_normalized_phone, now())
    ON CONFLICT (store_id, phone) DO UPDATE
    SET name = EXCLUDED.name,
        last_order_at = now()
    RETURNING id INTO v_customer_id;

    -- Increment sequential order_number atomically
    UPDATE public.stores
    SET last_order_number = last_order_number + 1
    WHERE id = p_store_id
    RETURNING last_order_number INTO v_order_number;

    v_should_deduct_stock := (p_initial_status = 'CONFIRMED');

    INSERT INTO public.orders (
        store_id,
        customer_id,
        order_number,
        source,
        fulfillment_type,
        table_or_reference,
        status,
        customer_name_snapshot,
        customer_phone_snapshot,
        subtotal_cents,
        discount_cents,
        fee_cents,
        total_cents,
        notes,
        stock_deducted,
        idempotency_key,
        created_by
    )
    VALUES (
        p_store_id,
        v_customer_id,
        v_order_number,
        p_source,
        COALESCE(p_fulfillment_type, 'PICKUP'),
        NULLIF(trim(p_table_or_reference), ''),
        p_initial_status,
        trim(p_customer_name),
        v_normalized_phone,
        0,
        GREATEST(0, v_discount),
        GREATEST(0, v_fee),
        0,
        NULLIF(trim(p_notes), ''),
        v_should_deduct_stock,
        NULLIF(trim(p_idempotency_key), ''),
        v_user_id
    )
    RETURNING id INTO v_order_id;

    -- Process each item and validate option group rules on the server
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        SELECT * INTO v_product
        FROM public.products
        WHERE id = (v_item->>'product_id')::UUID AND store_id = p_store_id;

        v_item_qty := (v_item->>'quantity')::INTEGER;
        v_options_unit_cents := 0;
        v_selected_opt_ids := ARRAY[]::UUID[];

        IF v_item ? 'option_ids' AND jsonb_typeof(v_item->'option_ids') = 'array' THEN
            SELECT COALESCE(array_agg((val #>> '{}')::UUID), ARRAY[]::UUID[])
            INTO v_selected_opt_ids
            FROM jsonb_array_elements(v_item->'option_ids') AS val;
        END IF;

        -- Prevent duplicate option_ids in the same order item
        IF COALESCE(array_length(v_selected_opt_ids, 1), 0) <> (
            SELECT COUNT(DISTINCT u) FROM unnest(v_selected_opt_ids) AS u
        ) THEN
            RAISE EXCEPTION 'DUPLICATE_OPTION: O mesmo item opcional não pode ser enviado duplicado em "%".', v_product.name;
        END IF;

        -- Enforce min_select, max_select, and is_required for every option group of this product
        FOR v_group_check IN
            SELECT
                pog.id,
                pog.name,
                pog.min_select,
                pog.max_select,
                pog.is_required,
                COUNT(po.id)::INTEGER AS chosen_count
            FROM public.product_option_groups pog
            LEFT JOIN public.product_options po
                ON po.group_id = pog.id
               AND po.store_id = p_store_id
               AND po.id = ANY(v_selected_opt_ids)
            WHERE pog.product_id = v_product.id
              AND pog.store_id = p_store_id
            GROUP BY pog.id, pog.name, pog.min_select, pog.max_select, pog.is_required
        LOOP
            IF (v_group_check.is_required AND v_group_check.chosen_count < GREATEST(1, v_group_check.min_select))
               OR (v_group_check.chosen_count < v_group_check.min_select) THEN
                RAISE EXCEPTION 'OPTION_MIN_REQUIRED: Selecione pelo menos % opção(ões) em "%" para o produto "%".',
                    GREATEST(CASE WHEN v_group_check.is_required THEN 1 ELSE 0 END, v_group_check.min_select),
                    v_group_check.name,
                    v_product.name;
            END IF;

            IF v_group_check.chosen_count > v_group_check.max_select THEN
                RAISE EXCEPTION 'OPTION_MAX_EXCEEDED: O grupo "%" permite no máximo % opção(ões) em "%".',
                    v_group_check.name,
                    v_group_check.max_select,
                    v_product.name;
            END IF;
        END LOOP;

        INSERT INTO public.order_items (
            store_id,
            order_id,
            product_id,
            product_name_snapshot,
            unit_price_cents,
            options_unit_price_cents,
            quantity,
            total_item_cents,
            notes
        )
        VALUES (
            p_store_id,
            v_order_id,
            v_product.id,
            v_product.name,
            v_product.price_cents,
            0,
            v_item_qty,
            0,
            NULLIF(trim(v_item->>'notes'), '')
        )
        RETURNING id INTO v_order_item_id;

        FOREACH v_opt_id IN ARRAY v_selected_opt_ids
        LOOP
            SELECT po.*, pog.name AS group_name
            INTO v_opt
            FROM public.product_options po
            JOIN public.product_option_groups pog ON pog.id = po.group_id AND pog.store_id = po.store_id
            WHERE po.id = v_opt_id
              AND po.store_id = p_store_id
              AND pog.product_id = v_product.id
              AND po.is_available = true;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'INVALID_OPTION: Uma das opções selecionadas para "%" é inválida ou está indisponível.', v_product.name;
            END IF;

            v_options_unit_cents := v_options_unit_cents + v_opt.price_cents;

            INSERT INTO public.order_item_options (
                store_id,
                order_item_id,
                option_id,
                group_name_snapshot,
                option_name_snapshot,
                price_cents
            )
            VALUES (
                p_store_id,
                v_order_item_id,
                v_opt.id,
                v_opt.group_name,
                v_opt.name,
                v_opt.price_cents
            );
        END LOOP;

        v_total_item_cents := (v_product.price_cents + v_options_unit_cents) * v_item_qty;
        v_subtotal_cents := v_subtotal_cents + v_total_item_cents;

        UPDATE public.order_items
        SET options_unit_price_cents = v_options_unit_cents,
            total_item_cents = v_total_item_cents
        WHERE id = v_order_item_id;

        IF v_should_deduct_stock AND v_product.track_stock THEN
            UPDATE public.products
            SET stock_quantity = stock_quantity - v_item_qty
            WHERE id = v_product.id;

            INSERT INTO public.stock_movements (
                store_id,
                product_id,
                order_id,
                movement_type,
                quantity_delta,
                previous_quantity,
                new_quantity,
                reference_key,
                reason,
                created_by
            )
            VALUES (
                p_store_id,
                v_product.id,
                v_order_id,
                'ORDER_DEDUCTION',
                -v_item_qty,
                v_product.stock_quantity,
                v_product.stock_quantity - v_item_qty,
                'order:' || v_order_id || ':item:' || v_order_item_id || ':deduct',
                'Baixa automática na confirmação do pedido #' || v_order_number,
                v_user_id
            );

            -- Refresh v_product.stock_quantity if another line in the same order references the same product
            v_product.stock_quantity := v_product.stock_quantity - v_item_qty;
        END IF;
    END LOOP;

    v_total_cents := GREATEST(0, v_subtotal_cents - GREATEST(0, v_discount) + GREATEST(0, v_fee));

    UPDATE public.orders
    SET subtotal_cents = v_subtotal_cents,
        total_cents = v_total_cents
    WHERE id = v_order_id;

    UPDATE public.customers
    SET total_orders = total_orders + 1,
        total_spent_cents = total_spent_cents + v_total_cents,
        last_order_at = now()
    WHERE id = v_customer_id;

    INSERT INTO public.order_status_history (
        store_id,
        order_id,
        from_status,
        to_status,
        reason,
        changed_by
    )
    VALUES (
        p_store_id,
        v_order_id,
        NULL,
        p_initial_status,
        CASE WHEN p_source = 'MANUAL' THEN 'Pedido registrado manualmente no painel' ELSE 'Pedido recebido pelo cardápio digital' END,
        v_user_id
    );

    RETURN jsonb_build_object(
        'order_id', v_order_id,
        'order_number', v_order_number,
        'status', p_initial_status,
        'subtotal_cents', v_subtotal_cents,
        'total_cents', v_total_cents,
        'stock_deducted', v_should_deduct_stock
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. ATOMIC ORDER STATUS TRANSITION (With Stock Deduction & Reversal)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.transition_order_status_atomic(
    p_store_id UUID,
    p_order_id UUID,
    p_new_status public.order_status,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_order RECORD;
    v_item RECORD;
    v_product RECORD;
    v_stock_deducted BOOLEAN;
BEGIN
    IF v_user_id IS NULL OR NOT public.has_store_access(p_store_id) THEN
        RAISE EXCEPTION 'FORBIDDEN: Sem permissão para atualizar pedidos desta loja.';
    END IF;

    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id AND store_id = p_store_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ORDER_NOT_FOUND: Pedido não encontrado.';
    END IF;

    IF v_order.status = p_new_status THEN
        RETURN jsonb_build_object(
            'order_id', v_order.id,
            'order_number', v_order.order_number,
            'status', v_order.status,
            'stock_deducted', v_order.stock_deducted,
            'unchanged', true
        );
    END IF;

    IF v_order.status = 'CANCELLED' THEN
        RAISE EXCEPTION 'INVALID_TRANSITION: Não é possível alterar o status de um pedido cancelado.';
    END IF;

    IF v_order.status = 'COMPLETED' AND p_new_status <> 'COMPLETED' THEN
        RAISE EXCEPTION 'INVALID_TRANSITION: Um pedido concluído já foi finalizado.';
    END IF;

    v_stock_deducted := v_order.stock_deducted;

    IF NOT v_order.stock_deducted AND p_new_status IN ('CONFIRMED', 'PREPARING', 'READY', 'COMPLETED') THEN
        FOR v_item IN
            SELECT
                oi.product_id,
                SUM(oi.quantity)::INTEGER AS total_qty
            FROM public.order_items oi
            WHERE oi.order_id = v_order.id AND oi.product_id IS NOT NULL
            GROUP BY oi.product_id
            ORDER BY oi.product_id
        LOOP
            SELECT * INTO v_product
            FROM public.products
            WHERE id = v_item.product_id AND store_id = p_store_id
            FOR UPDATE;

            IF FOUND AND v_product.track_stock THEN
                IF v_product.stock_quantity < v_item.total_qty THEN
                    RAISE EXCEPTION 'INSUFFICIENT_STOCK: Estoque insuficiente para confirmar "%" (Disponível: %, Necessário: %).',
                        v_product.name, v_product.stock_quantity, v_item.total_qty;
                END IF;
            END IF;
        END LOOP;

        FOR v_item IN
            SELECT oi.id AS order_item_id, oi.product_id, oi.quantity
            FROM public.order_items oi
            WHERE oi.order_id = v_order.id AND oi.product_id IS NOT NULL
            ORDER BY oi.id
        LOOP
            SELECT * INTO v_product
            FROM public.products
            WHERE id = v_item.product_id AND store_id = p_store_id;

            IF FOUND AND v_product.track_stock THEN
                UPDATE public.products
                SET stock_quantity = stock_quantity - v_item.quantity
                WHERE id = v_product.id;

                INSERT INTO public.stock_movements (
                    store_id,
                    product_id,
                    order_id,
                    movement_type,
                    quantity_delta,
                    previous_quantity,
                    new_quantity,
                    reference_key,
                    reason,
                    created_by
                )
                VALUES (
                    p_store_id,
                    v_product.id,
                    v_order.id,
                    'ORDER_DEDUCTION',
                    -v_item.quantity,
                    v_product.stock_quantity,
                    v_product.stock_quantity - v_item.quantity,
                    'order:' || v_order.id || ':item:' || v_item.order_item_id || ':deduct',
                    'Baixa de estoque na confirmação do pedido #' || v_order.order_number,
                    v_user_id
                );
            END IF;
        END LOOP;

        v_stock_deducted := true;
    END IF;

    IF p_new_status = 'CANCELLED' AND v_order.stock_deducted THEN
        FOR v_item IN
            SELECT oi.id AS order_item_id, oi.product_id, oi.quantity
            FROM public.order_items oi
            WHERE oi.order_id = v_order.id AND oi.product_id IS NOT NULL
            ORDER BY oi.product_id, oi.id
        LOOP
            SELECT * INTO v_product
            FROM public.products
            WHERE id = v_item.product_id AND store_id = p_store_id
            FOR UPDATE;

            IF FOUND AND v_product.track_stock THEN
                UPDATE public.products
                SET stock_quantity = stock_quantity + v_item.quantity
                WHERE id = v_product.id;

                INSERT INTO public.stock_movements (
                    store_id,
                    product_id,
                    order_id,
                    movement_type,
                    quantity_delta,
                    previous_quantity,
                    new_quantity,
                    reference_key,
                    reason,
                    created_by
                )
                VALUES (
                    p_store_id,
                    v_product.id,
                    v_order.id,
                    'ORDER_REVERSAL',
                    v_item.quantity,
                    v_product.stock_quantity,
                    v_product.stock_quantity + v_item.quantity,
                    'order:' || v_order.id || ':item:' || v_item.order_item_id || ':reverse',
                    COALESCE(NULLIF(trim(p_reason), ''), 'Estorno automático por cancelamento do pedido #' || v_order.order_number),
                    v_user_id
                );
            END IF;
        END LOOP;

        v_stock_deducted := false;
    END IF;

    IF p_new_status = 'CANCELLED' AND v_order.customer_id IS NOT NULL THEN
        UPDATE public.customers
        SET total_orders = GREATEST(0, total_orders - 1),
            total_spent_cents = GREATEST(0, total_spent_cents - v_order.total_cents)
        WHERE id = v_order.customer_id;
    END IF;

    UPDATE public.orders
    SET status = p_new_status,
        stock_deducted = v_stock_deducted
    WHERE id = v_order.id;

    INSERT INTO public.order_status_history (
        store_id,
        order_id,
        from_status,
        to_status,
        reason,
        changed_by
    )
    VALUES (
        p_store_id,
        v_order.id,
        v_order.status,
        p_new_status,
        NULLIF(trim(p_reason), ''),
        v_user_id
    );

    RETURN jsonb_build_object(
        'order_id', v_order.id,
        'order_number', v_order.order_number,
        'from_status', v_order.status,
        'status', p_new_status,
        'stock_deducted', v_stock_deducted
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. EXPLICIT FUNCTION PRIVILEGE HARDENING (REVOKE PUBLIC/ANON -> GRANT SCOPED)
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.get_public_menu_by_slug(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_menu_by_slug(TEXT) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.onboard_organization_and_store FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.onboard_organization_and_store TO authenticated;

REVOKE ALL ON FUNCTION public.adjust_product_stock_atomic FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_product_stock_atomic TO authenticated;

REVOKE ALL ON FUNCTION public.create_order_atomic FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_order_atomic TO anon, authenticated;

REVOKE ALL ON FUNCTION public.transition_order_status_atomic FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_order_status_atomic TO authenticated;

-- -----------------------------------------------------------------------------
-- 7. TENANT-ISOLATED SUPABASE STORAGE POLICIES (Path: <store_id>/...)
-- Helper safely parses UUID folder prefix so invalid paths return false instead of throwing.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_manage_store_asset(p_object_name TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_folder TEXT;
    v_store_uuid UUID;
BEGIN
    v_folder := split_part(COALESCE(p_object_name, ''), '/', 1);
    IF v_folder !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RETURN false;
    END IF;
    v_store_uuid := v_folder::UUID;
    RETURN public.has_store_access(v_store_uuid);
END;
$$;

INSERT INTO storage.buckets (id, name, public)
VALUES ('benit-assets', 'benit-assets', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "benit_assets_public_read" ON storage.objects;
CREATE POLICY "benit_assets_public_read" ON storage.objects
    FOR SELECT
    TO public
    USING (bucket_id = 'benit-assets');

DROP POLICY IF EXISTS "benit_assets_auth_insert" ON storage.objects;
CREATE POLICY "benit_assets_auth_insert" ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'benit-assets'
        AND public.can_manage_store_asset(name)
    );

DROP POLICY IF EXISTS "benit_assets_auth_update" ON storage.objects;
CREATE POLICY "benit_assets_auth_update" ON storage.objects
    FOR UPDATE
    TO authenticated
    USING (
        bucket_id = 'benit-assets'
        AND public.can_manage_store_asset(name)
    )
    WITH CHECK (
        bucket_id = 'benit-assets'
        AND public.can_manage_store_asset(name)
    );

DROP POLICY IF EXISTS "benit_assets_auth_delete" ON storage.objects;
CREATE POLICY "benit_assets_auth_delete" ON storage.objects
    FOR DELETE
    TO authenticated
    USING (
        bucket_id = 'benit-assets'
        AND public.can_manage_store_asset(name)
    );

-- >>>>>>>>>> 0004_order_status_awaiting_payment.sql
-- =============================================================================
-- BENIT SaaS — Migration 0004: AWAITING_PAYMENT order status
-- Must run in its own transaction: Postgres does not allow a newly added enum
-- value to be used in the same transaction that adds it.
-- =============================================================================
ALTER TYPE public.order_status ADD VALUE IF NOT EXISTS 'AWAITING_PAYMENT' BEFORE 'NEW';
