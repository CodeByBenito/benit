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
