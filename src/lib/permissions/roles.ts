import type { Membership, MembershipRole } from "@/types/domain.types";

/**
 * What each role sees in the panel. This is presentation only: the database
 * (RLS, guard triggers and the RPCs) is what actually protects the data.
 */

export type DashboardArea = "overview" | "orders" | "menu" | "inventory" | "customers" | "settings";

export const AREA_PATH: Record<DashboardArea, string> = {
  overview: "/dashboard",
  orders: "/orders",
  menu: "/menu-manager",
  inventory: "/inventory",
  customers: "/customers",
  settings: "/settings",
};

const ALL_AREAS: DashboardArea[] = ["overview", "orders", "menu", "inventory", "customers", "settings"];

export const ROLE_AREAS: Record<MembershipRole, DashboardArea[]> = {
  OWNER: ALL_AREAS,
  MANAGER: ALL_AREAS,
  ATTENDANT: ["orders", "customers"],
  KITCHEN: ["orders"],
};

export const ROLE_LABEL: Record<MembershipRole, string> = {
  OWNER: "Proprietário",
  MANAGER: "Gerente",
  ATTENDANT: "Atendente",
  KITCHEN: "Cozinha",
};

export const ROLE_DESCRIPTION: Record<MembershipRole, string> = {
  OWNER: "Acesso total, inclusive equipe.",
  MANAGER: "Tudo, menos convidar e remover pessoas.",
  ATTENDANT: "Pedidos e clientes.",
  KITCHEN: "Só o quadro de pedidos, em modo cozinha.",
};

/** Roles an owner can hand out. Ownership is not transferable from the panel. */
export const INVITABLE_ROLES = ["MANAGER", "ATTENDANT", "KITCHEN"] as const satisfies readonly MembershipRole[];
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

export function canAccessArea(role: MembershipRole, area: DashboardArea): boolean {
  return ROLE_AREAS[role].includes(area);
}

/** First screen after sign-in: the overview for managers, the board for the floor. */
export function homePath(role: MembershipRole): string {
  return canAccessArea(role, "overview") ? AREA_PATH.overview : AREA_PATH.orders;
}

export function canManageStore(role: MembershipRole): boolean {
  return role === "OWNER" || role === "MANAGER";
}

export function ordersBoardMode(role: MembershipRole): "full" | "kitchen" {
  return role === "KITCHEN" ? "kitchen" : "full";
}

const RANK: Record<MembershipRole, number> = { OWNER: 3, MANAGER: 2, ATTENDANT: 1, KITCHEN: 0 };

/**
 * Role that applies in one store: an organization-wide membership covers
 * every store, a store membership only its own. With both (legacy data), the
 * broader one wins, which is what the database helpers do as well.
 */
export function effectiveRole(memberships: Pick<Membership, "organization_id" | "store_id" | "role">[], organizationId: string, storeId: string): MembershipRole | null {
  const applicable = memberships.filter((m) => m.organization_id === organizationId && (m.store_id === null || m.store_id === storeId));
  if (!applicable.length) return null;
  return applicable.reduce((best, m) => (RANK[m.role] > RANK[best.role] ? m : best)).role;
}
