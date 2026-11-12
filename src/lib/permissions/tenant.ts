import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { canAccessArea, effectiveRole, homePath, type DashboardArea } from "@/lib/permissions/roles";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import type {
  Membership,
  Organization,
  Store,
  TenantContext,
} from "@/types/domain.types";

export const ACTIVE_STORE_COOKIE = "benit_active_store_id";

/**
 * Fetches the authenticated user's TenantContext (Organization, Membership, Active Store).
 * Returns null if the user has not completed onboarding yet.
 */
export const getTenantContext = cache(async function getTenantContext(): Promise<TenantContext | null> {
  if (!isSupabaseConfigured()) {
    return null;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: memberships } = await supabase
    .from("memberships")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (!memberships || memberships.length === 0) {
    return null;
  }

  const typedMemberships = memberships as Membership[];
  // Prefer org-wide membership (store_id === null, e.g. OWNER), otherwise first store-scoped membership
  const primaryMembership =
    typedMemberships.find((m) => m.store_id === null) ?? typedMemberships[0];

  const { data: organization } = await supabase
    .from("organizations")
    .select("*")
    .eq("id", primaryMembership.organization_id)
    .single();

  if (!organization) {
    return null;
  }

  let storesQuery = supabase
    .from("stores")
    .select("*")
    .eq("organization_id", organization.id)
    .order("created_at", { ascending: true });

  // If user does not hold an org-wide membership, restrict to explicitly assigned store_ids
  const hasOrgWideAccess = typedMemberships.some(
    (m) =>
      m.organization_id === organization.id && m.store_id === null
  );
  if (!hasOrgWideAccess) {
    const allowedStoreIds = typedMemberships
      .filter((m) => m.organization_id === organization.id && m.store_id)
      .map((m) => m.store_id as string);
    storesQuery = storesQuery.in("id", allowedStoreIds);
  }

  const { data: stores } = await storesQuery;

  if (!stores || stores.length === 0) {
    return null;
  }

  const cookieStore = await cookies();
  const preferredStoreId = cookieStore.get(ACTIVE_STORE_COOKIE)?.value;
  const activeStore =
    (stores as Store[]).find((s) => s.id === preferredStoreId) ??
    (stores[0] as Store);

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  return {
    user: {
      id: user.id,
      email: user.email ?? "",
      full_name:
        profile?.full_name ||
        (user.user_metadata?.full_name as string) ||
        user.email?.split("@")[0] ||
        "Operador",
    },
    organization: organization as Organization,
    membership: primaryMembership,
    role: effectiveRole(typedMemberships, organization.id, activeStore.id) ?? primaryMembership.role,
    store: activeStore,
    stores: stores as Store[],
  };
});

/**
 * Requires an active TenantContext or redirects to /onboarding
 */
export async function requireTenantContext(): Promise<TenantContext> {
  const ctx = await getTenantContext();
  if (!ctx) {
    redirect("/onboarding");
  }
  return ctx;
}

/**
 * Tenant context for one panel area. A role that does not see the area is
 * sent to its own first screen (kitchen staff opening /settings land on the
 * board). The database enforces the real permissions; this keeps the UI honest.
 */
export async function requireArea(area: DashboardArea): Promise<TenantContext> {
  const ctx = await requireTenantContext();
  if (!canAccessArea(ctx.role, area)) {
    redirect(homePath(ctx.role));
  }
  return ctx;
}

