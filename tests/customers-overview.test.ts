import { describe, expect, it } from "vitest";
import { averageTicketCents, customerSummary, daysAgoLabel, filterCustomers, sortCustomers } from "@/lib/customers/list";
import { buildOverview, compactCurrency, dayKey, type OverviewOrder } from "@/lib/dashboard/overview";

const c = (name: string, phone: string, total_orders: number, total_spent_cents: number, last_order_at: string | null) => ({ name, phone, email: null, total_orders, total_spent_cents, last_order_at });

const customers = [
  c("Marina Lopes", "11988887777", 14, 61240, "2026-11-12T15:00:00Z"),
  c("Júlia Prado", "11966665555", 22, 104300, "2026-11-11T15:00:00Z"),
  c("Rafael Souza", "11977776666", 3, 9870, "2026-11-12T09:00:00Z"),
  c("Bruno Lima", "11922221111", 0, 0, null),
];

describe("customers: search", () => {
  it("finds by name ignoring accents and case", () => {
    expect(filterCustomers(customers, "julia").map((x) => x.name)).toEqual(["Júlia Prado"]);
    expect(filterCustomers(customers, "  LOPES ").map((x) => x.name)).toEqual(["Marina Lopes"]);
  });

  it("finds by phone digits, however the number is typed", () => {
    expect(filterCustomers(customers, "(11) 96666-5555").map((x) => x.name)).toEqual(["Júlia Prado"]);
    expect(filterCustomers(customers, "7777").map((x) => x.name)).toEqual(["Marina Lopes", "Rafael Souza"]);
  });

  it("returns everyone for an empty search and no one for a miss", () => {
    expect(filterCustomers(customers, "")).toHaveLength(4);
    expect(filterCustomers(customers, "zzz")).toHaveLength(0);
  });
});

describe("customers: ordering", () => {
  it("by last order, people who never ordered last", () => {
    expect(sortCustomers(customers, "recent").map((x) => x.name)).toEqual(["Marina Lopes", "Rafael Souza", "Júlia Prado", "Bruno Lima"]);
  });
  it("by amount spent", () => {
    expect(sortCustomers(customers, "spent").map((x) => x.name)).toEqual(["Júlia Prado", "Marina Lopes", "Rafael Souza", "Bruno Lima"]);
  });
  it("by number of orders, and does not mutate the input", () => {
    const before = customers.map((x) => x.name);
    expect(sortCustomers(customers, "orders").map((x) => x.name)).toEqual(["Júlia Prado", "Marina Lopes", "Rafael Souza", "Bruno Lima"]);
    expect(customers.map((x) => x.name)).toEqual(before);
  });
});

describe("customers: labels and totals", () => {
  const now = new Date(2026, 10, 12, 20, 0, 0);
  const at = (y: number, m: number, d: number, h = 12) => new Date(y, m, d, h).toISOString();

  it("describes the last order in calendar days", () => {
    expect(daysAgoLabel(at(2026, 10, 12, 1), now)).toBe("hoje");
    expect(daysAgoLabel(at(2026, 10, 11, 23), now)).toBe("ontem");
    expect(daysAgoLabel(at(2026, 10, 3), now)).toBe("há 9 dias");
    expect(daysAgoLabel(at(2026, 9, 2), now)).toBe("há 1 mês");
    expect(daysAgoLabel(at(2026, 5, 12), now)).toBe("há 5 meses");
    expect(daysAgoLabel(at(2024, 10, 12), now)).toBe("há 2 anos");
    expect(daysAgoLabel(null, now)).toBe("nunca pediu");
  });

  it("computes the average ticket in whole cents and the summary", () => {
    expect(averageTicketCents({ total_orders: 3, total_spent_cents: 10000 })).toBe(3333);
    expect(averageTicketCents({ total_orders: 0, total_spent_cents: 0 })).toBe(0);
    expect(customerSummary(customers)).toEqual({ total: 4, returning: 3, spentCents: 175410 });
  });
});

describe("overview: numbers from real rows", () => {
  // 2026-11-13 01:30 UTC is still 22:30 of the 12th in São Paulo.
  const now = new Date("2026-11-13T01:30:00Z");
  const order = (n: number, status: OverviewOrder["status"], total: number, created_at: string): OverviewOrder => ({
    id: `o${n}`,
    order_number: n,
    status,
    total_cents: total,
    created_at,
    customer_name_snapshot: "Cliente",
    fulfillment_type: "DELIVERY",
    payment_status: "PAY_ON_DELIVERY",
  });
  const base = {
    timezone: "America/Sao_Paulo",
    now,
    store: { slug: "loja", accepts_delivery: true, logo_url: null },
    zonesCount: 0,
    hoursCount: 0,
    paymentConnected: false,
    products: [],
  };

  it("groups by the store's local day, not by UTC", () => {
    expect(dayKey(now, "America/Sao_Paulo")).toBe("2026-11-12");
    const overview = buildOverview({
      ...base,
      orders: [
        order(1, "COMPLETED", 5000, "2026-11-13T01:00:00Z"), // 22:00 local, today
        order(2, "NEW", 3000, "2026-11-12T03:30:00Z"), // 00:30 local, today
        order(3, "COMPLETED", 9000, "2026-11-12T02:30:00Z"), // 23:30 local, yesterday
      ],
    });
    expect(overview.revenueCents).toBe(8000);
    expect(overview.salesCount).toBe(2);
    expect(overview.ticketCents).toBe(4000);
    expect(overview.days.at(-1)).toMatchObject({ key: "2026-11-12", label: "Qui", cents: 8000, today: true });
    expect(overview.days.at(-2)).toMatchObject({ key: "2026-11-11", label: "Qua", cents: 9000 });
    expect(overview.weekCents).toBe(17000);
    expect(overview.greeting).toBe("Boa noite");
  });

  it("cancelled and unpaid online orders are never revenue", () => {
    const overview = buildOverview({
      ...base,
      orders: [order(1, "CANCELLED", 5000, "2026-11-12T15:00:00Z"), order(2, "AWAITING_PAYMENT", 7000, "2026-11-12T15:00:00Z"), order(3, "PREPARING", 2500, "2026-11-12T15:00:00Z")],
    });
    expect(overview.revenueCents).toBe(2500);
    expect(overview.salesCount).toBe(1);
    expect(overview.otherCount).toBe(2);
    expect(overview.queue).toEqual({ NEW: 0, CONFIRMED: 0, PREPARING: 1, READY: 0 });
  });

  it("an empty store shows zeros and the whole setup list pending", () => {
    const overview = buildOverview({ ...base, orders: [] });
    expect(overview).toMatchObject({ revenueCents: 0, salesCount: 0, ticketCents: 0, weekCents: 0, recent: [], lowStock: [] });
    expect(overview.days).toHaveLength(7);
    expect(overview.setup.every((s) => !s.done)).toBe(true);
  });

  it("the setup list follows what is configured; pickup-only stores need no zones", () => {
    const overview = buildOverview({
      ...base,
      orders: [],
      products: [{ id: "p", name: "Smash", track_stock: true, stock_quantity: 2, low_stock_threshold: 5, is_available: true }],
      store: { slug: "loja", accepts_delivery: false, logo_url: "https://x/logo.webp" },
      hoursCount: 7,
      paymentConnected: true,
    });
    expect(overview.setup.every((s) => s.done)).toBe(true);
    expect(overview.lowStock.map((p) => p.name)).toEqual(["Smash"]);
  });

  it("writes short chart labels", () => {
    expect(compactCurrency(85000)).toBe("850");
    expect(compactCurrency(123456)).toBe("1,2 mil");
    expect(compactCurrency(2500000)).toBe("25 mil");
    expect(compactCurrency(0)).toBe("0");
  });
});
