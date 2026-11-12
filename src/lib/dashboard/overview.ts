import type { Order, Product } from "@/types/domain.types";

/** Numbers of the overview screen, computed from real rows (pure, unit-tested). */

export type OverviewOrder = Pick<Order, "id" | "order_number" | "status" | "total_cents" | "created_at" | "customer_name_snapshot" | "fulfillment_type" | "payment_status">;
export type OverviewProduct = Pick<Product, "id" | "name" | "track_stock" | "stock_quantity" | "low_stock_threshold" | "is_available">;

export interface OverviewInput {
  orders: OverviewOrder[];
  products: OverviewProduct[];
  timezone: string;
  now?: Date;
  store: { slug: string; accepts_delivery: boolean; logo_url: string | null };
  zonesCount: number;
  hoursCount: number;
  paymentConnected: boolean;
}

export interface Overview {
  revenueCents: number;
  salesCount: number;
  /** Orders created today that do not count as a sale (cancelled or waiting for payment). */
  otherCount: number;
  ticketCents: number;
  weekCents: number;
  queue: Record<"NEW" | "CONFIRMED" | "PREPARING" | "READY", number>;
  days: { key: string; label: string; cents: number; count: number; today: boolean }[];
  recent: OverviewOrder[];
  lowStock: OverviewProduct[];
  setup: { done: boolean; label: string; href: string }[];
  greeting: "Bom dia" | "Boa tarde" | "Boa noite";
}

const WEEKDAY = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const DAY_MS = 24 * 60 * 60 * 1000;

/** A sale is an order that was neither cancelled nor is still waiting for online payment. */
export const countsAsSale = (o: Pick<Order, "status">) => o.status !== "CANCELLED" && o.status !== "AWAITING_PAYMENT";

/** YYYY-MM-DD of an instant in the store's timezone (a 23:30 order belongs to that local day). */
export function dayKey(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function buildOverview(input: OverviewInput): Overview {
  const now = input.now ?? new Date();
  const tz = input.timezone || "America/Sao_Paulo";
  const today = dayKey(now, tz);
  const keyOf = (o: OverviewOrder) => dayKey(new Date(o.created_at), tz);

  const todayOrders = input.orders.filter((o) => keyOf(o) === today);
  const todaySales = todayOrders.filter(countsAsSale);
  const revenueCents = todaySales.reduce((sum, o) => sum + o.total_cents, 0);

  const days = Array.from({ length: 7 }, (_, i) => {
    const key = dayKey(new Date(now.getTime() - (6 - i) * DAY_MS), tz);
    const sales = input.orders.filter((o) => countsAsSale(o) && keyOf(o) === key);
    return { key, label: WEEKDAY[new Date(`${key}T12:00:00Z`).getUTCDay()], cents: sales.reduce((sum, o) => sum + o.total_cents, 0), count: sales.length, today: key === today };
  });

  const count = (status: Order["status"]) => input.orders.filter((o) => o.status === status).length;
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "numeric", hour12: false }).format(now));

  return {
    revenueCents,
    salesCount: todaySales.length,
    otherCount: todayOrders.length - todaySales.length,
    ticketCents: todaySales.length ? Math.round(revenueCents / todaySales.length) : 0,
    weekCents: days.reduce((sum, d) => sum + d.cents, 0),
    queue: { NEW: count("NEW"), CONFIRMED: count("CONFIRMED"), PREPARING: count("PREPARING"), READY: count("READY") },
    days,
    recent: [...input.orders].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 6),
    lowStock: input.products.filter((p) => p.track_stock && p.stock_quantity <= p.low_stock_threshold).sort((a, b) => a.stock_quantity - b.stock_quantity),
    setup: [
      { done: input.products.length > 0, label: "Cadastrar o cardápio", href: "/menu-manager" },
      { done: input.zonesCount > 0 || !input.store.accepts_delivery, label: "Definir bairros de entrega", href: "/settings?tab=delivery" },
      { done: input.hoursCount > 0, label: "Configurar horários", href: "/settings?tab=hours" },
      { done: input.paymentConnected, label: "Conectar o Mercado Pago", href: "/settings?tab=payments" },
      { done: Boolean(input.store.logo_url), label: "Enviar o logo da loja", href: "/settings" },
    ],
    greeting: hour < 12 ? "Bom dia" : hour < 18 ? "Boa tarde" : "Boa noite",
  };
}

/** Short money (in reais) for chart labels: 85000 cents -> "850", 123456 -> "1,2 mil". */
export function compactCurrency(cents: number): string {
  const reais = cents / 100;
  if (reais < 1000) return String(Math.round(reais));
  const thousands = reais / 1000;
  return `${thousands >= 10 ? Math.round(thousands) : thousands.toFixed(1).replace(".", ",")} mil`;
}
