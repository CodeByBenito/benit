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
