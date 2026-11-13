import type { Customer } from "@/types/domain.types";

/** Search, ordering and labels of the customers screen (pure, unit-tested). */

export type CustomerSort = "recent" | "spent" | "orders";

const digits = (value: string) => value.replace(/\D/g, "");
const fold = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Matches by name (accent-insensitive) or by any run of phone digits. */
export function filterCustomers<T extends Pick<Customer, "name" | "phone" | "email">>(customers: T[], query: string): T[] {
  const q = query.trim();
  if (!q) return customers;
  const text = fold(q);
  const number = digits(q);
  return customers.filter(
    (c) => fold(c.name).includes(text) || (number.length >= 3 && digits(c.phone).includes(number)) || (c.email ?? "").toLowerCase().includes(text)
  );
}

export function sortCustomers<T extends Pick<Customer, "name" | "total_orders" | "total_spent_cents" | "last_order_at">>(customers: T[], sort: CustomerSort): T[] {
  const byName = (a: T, b: T) => a.name.localeCompare(b.name, "pt-BR");
  const time = (c: T) => (c.last_order_at ? new Date(c.last_order_at).getTime() : -Infinity);
  const compare: Record<CustomerSort, (a: T, b: T) => number> = {
    recent: (a, b) => time(b) - time(a) || byName(a, b),
    spent: (a, b) => b.total_spent_cents - a.total_spent_cents || byName(a, b),
    orders: (a, b) => b.total_orders - a.total_orders || b.total_spent_cents - a.total_spent_cents || byName(a, b),
  };
  return [...customers].sort(compare[sort]);
}

/** "hoje", "ontem", "há 5 dias", "há 3 meses" — calendar days, not 24h windows. */
export function daysAgoLabel(iso: string | null, now: Date = new Date()): string {
  if (!iso) return "nunca pediu";
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.max(0, Math.round((start(now) - start(new Date(iso))) / 86_400_000));
  if (days === 0) return "hoje";
  if (days === 1) return "ontem";
  if (days < 31) return `há ${days} dias`;
  const months = Math.floor(days / 30);
  if (months < 12) return months === 1 ? "há 1 mês" : `há ${months} meses`;
  const years = Math.floor(days / 365);
  return years <= 1 ? "há 1 ano" : `há ${years} anos`;
}

export function averageTicketCents(c: Pick<Customer, "total_orders" | "total_spent_cents">): number {
  return c.total_orders > 0 ? Math.round(c.total_spent_cents / c.total_orders) : 0;
}

export function customerSummary(customers: Pick<Customer, "total_orders" | "total_spent_cents">[]) {
  const withOrders = customers.filter((c) => c.total_orders > 0);
  return {
    total: customers.length,
    returning: customers.filter((c) => c.total_orders >= 2).length,
    spentCents: withOrders.reduce((sum, c) => sum + c.total_spent_cents, 0),
  };
}

export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}
