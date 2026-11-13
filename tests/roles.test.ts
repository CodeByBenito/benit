import { describe, expect, it } from "vitest";
import { toKitchenOrders } from "@/lib/orders/kitchen";
import { ROLE_AREAS, canAccessArea, canManageStore, effectiveRole, homePath, ordersBoardMode } from "@/lib/permissions/roles";
import { inviteTeamMemberSchema, updateTeamMemberRoleSchema } from "@/lib/validations";
import type { Order } from "@/types/domain.types";

const ORG = "11111111-1111-4111-8111-111111111111";
const STORE_A = "22222222-2222-4222-8222-222222222222";
const STORE_B = "33333333-3333-4333-8333-333333333333";

describe("roles: what each one sees", () => {
  it("kitchen sees only the orders board", () => {
    expect(ROLE_AREAS.KITCHEN).toEqual(["orders"]);
    expect(homePath("KITCHEN")).toBe("/orders");
    expect(ordersBoardMode("KITCHEN")).toBe("kitchen");
  });

  it("attendant sees orders and customers, with the full board", () => {
    expect(ROLE_AREAS.ATTENDANT).toEqual(["orders", "customers"]);
    expect(homePath("ATTENDANT")).toBe("/orders");
    expect(ordersBoardMode("ATTENDANT")).toBe("full");
    for (const area of ["overview", "menu", "inventory", "settings"] as const) expect(canAccessArea("ATTENDANT", area)).toBe(false);
  });

  it("owner and manager see everything and start at the overview", () => {
    for (const role of ["OWNER", "MANAGER"] as const) {
      expect(ROLE_AREAS[role]).toHaveLength(6);
      expect(homePath(role)).toBe("/dashboard");
      expect(canManageStore(role)).toBe(true);
    }
    expect(canManageStore("ATTENDANT")).toBe(false);
    expect(canManageStore("KITCHEN")).toBe(false);
  });
});

describe("roles: role that applies in the active store", () => {
  const m = (role: "OWNER" | "MANAGER" | "ATTENDANT" | "KITCHEN", store_id: string | null, organization_id = ORG) => ({ role, store_id, organization_id });

  it("an organization-wide membership covers every store", () => {
    expect(effectiveRole([m("OWNER", null)], ORG, STORE_A)).toBe("OWNER");
    expect(effectiveRole([m("MANAGER", null)], ORG, STORE_B)).toBe("MANAGER");
  });

  it("a store membership only counts in its own store", () => {
    const memberships = [m("MANAGER", STORE_A), m("KITCHEN", STORE_B)];
    expect(effectiveRole(memberships, ORG, STORE_A)).toBe("MANAGER");
    expect(effectiveRole(memberships, ORG, STORE_B)).toBe("KITCHEN");
  });

  it("ignores other organizations and returns null without a membership", () => {
    expect(effectiveRole([m("OWNER", null, "99999999-9999-4999-8999-999999999999")], ORG, STORE_A)).toBeNull();
    expect(effectiveRole([m("ATTENDANT", STORE_B)], ORG, STORE_A)).toBeNull();
  });
});

describe("team: invitation payload", () => {
  const base = { organizationId: ORG, email: " Pessoa@Exemplo.com.br ", fullName: "", storeId: null };

  it("normalizes the e-mail and accepts the three invitable roles", () => {
    for (const role of ["MANAGER", "ATTENDANT", "KITCHEN"]) {
      const parsed = inviteTeamMemberSchema.parse({ ...base, role });
      expect(parsed.email).toBe("pessoa@exemplo.com.br");
    }
  });

  it("never accepts OWNER, on invite or on role change", () => {
    expect(inviteTeamMemberSchema.safeParse({ ...base, role: "OWNER" }).success).toBe(false);
    expect(updateTeamMemberRoleSchema.safeParse({ membershipId: ORG, role: "OWNER" }).success).toBe(false);
    expect(updateTeamMemberRoleSchema.safeParse({ membershipId: ORG, role: "KITCHEN" }).success).toBe(true);
  });

  it("rejects malformed e-mails and store ids", () => {
    expect(inviteTeamMemberSchema.safeParse({ ...base, role: "KITCHEN", email: "sem-arroba" }).success).toBe(false);
    expect(inviteTeamMemberSchema.safeParse({ ...base, role: "KITCHEN", storeId: "abc" }).success).toBe(false);
  });
});

describe("kitchen tickets", () => {
  const order = (status: Order["status"], extra: Partial<Order> = {}): Order =>
    ({
      id: `o-${status}`,
      store_id: STORE_A,
      order_number: 12,
      status,
      fulfillment_type: "DINE_IN",
      table_or_reference: "7",
      customer_name_snapshot: "Marina Lopes Andrade",
      customer_phone_snapshot: "11988887777",
      delivery_address: { street: "Rua X", number: "1", neighborhood: "Centro" },
      total_cents: 4990,
      notes: "Sem cebola",
      created_at: "2026-11-12T12:00:00.000Z",
      items: [
        {
          id: "i1",
          quantity: 2,
          product_name_snapshot: "Smash duplo",
          unit_price_cents: 3490,
          notes: "Bem passado",
          options: [{ option_name_snapshot: "Cheddar", price_cents: 500 }, { option_name_snapshot: "Bacon", price_cents: 600 }],
        },
      ],
      ...extra,
    }) as unknown as Order;

  it("keeps only confirmed, preparing and ready orders", () => {
    const tickets = toKitchenOrders([order("NEW"), order("AWAITING_PAYMENT"), order("CONFIRMED"), order("PREPARING"), order("READY"), order("COMPLETED"), order("CANCELLED")]);
    expect(tickets.map((t) => t.status)).toEqual(["CONFIRMED", "PREPARING", "READY"]);
  });

  it("carries what the cook needs and no phone, address or price", () => {
    const [ticket] = toKitchenOrders([order("CONFIRMED")]);
    expect(ticket).toEqual({
      id: "o-CONFIRMED",
      order_number: 12,
      status: "CONFIRMED",
      fulfillment_type: "DINE_IN",
      table_or_reference: "7",
      customer_first_name: "Marina",
      notes: "Sem cebola",
      created_at: "2026-11-12T12:00:00.000Z",
      items: [{ id: "i1", quantity: 2, name: "Smash duplo", notes: "Bem passado", options: ["Cheddar", "Bacon"] }],
    });
    const serialized = JSON.stringify(ticket);
    for (const secret of ["11988887777", "Rua X", "4990", "3490", "Lopes", "price"]) expect(serialized).not.toContain(secret);
  });
});
