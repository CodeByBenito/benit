-- =============================================================================
-- BENIT SaaS — Migration 0008: Security advisor hardening
-- Closes the remaining "exposed SECURITY DEFINER" surface that the public
-- API does not need. Public RPCs (menu, quote, create order, tracking) stay.
-- =============================================================================

-- Fixed search_path (advisor: function_search_path_mutable)
ALTER FUNCTION public.handle_updated_at() SET search_path = public;

-- Trigger functions are never meant to be called through /rest/v1/rpc
REVOKE ALL ON FUNCTION public.handle_new_auth_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.broadcast_order_tracking() FROM PUBLIC, anon, authenticated;

-- Tenant helpers: needed by RLS policies for signed-in users only.
-- (RLS expressions run as the calling role, so `authenticated` keeps EXECUTE.)
REVOKE ALL ON FUNCTION public.is_org_member(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_org_owner(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_store_access(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_store_asset(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_org_member(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_org_owner(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_store_access(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_manage_store_asset(TEXT) TO authenticated;

-- Only used inside other SECURITY DEFINER functions (menu projection, order creation).
REVOKE ALL ON FUNCTION public.is_store_accepting(UUID, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
