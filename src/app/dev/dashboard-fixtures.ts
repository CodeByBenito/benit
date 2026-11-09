import type { Coupon, DeliveryZone, Order, Store, TenantContext } from "@/types/domain.types";
import { fixtureStore, fixtureZones } from "./fixtures";

/** Dashboard design-review fixtures (development only). */
const iso = (minAgo: number) => new Date(Date.now() - minAgo * 60_000).toISOString();

export const fixtureStoreRow: Store = {
  id: fixtureStore.id,
  organization_id: "org",
  name: fixtureStore.name,
  slug: fixtureStore.slug,
  description: fixtureStore.description,
  logo_url: null,
  banner_url: null,
  phone: fixtureStore.phone,
  whatsapp: fixtureStore.whatsapp,
  address: fixtureStore.address,
  currency: "BRL",
  is_open: true,
  is_published: true,
  last_order_number: 420,
  timezone: "America/Sao_Paulo",
  min_order_cents: 2500,
  accepts_delivery: true,
  accepts_pickup: true,
  accepts_dine_in: false,
  offline_methods: ["CASH", "CARD_ON_DELIVERY"],
  pix_key: null,
  online_payment_enabled: false,
  payment_window_minutes: 15,
  notify_owner_email: true,
  default_eta_minutes: 40,
  created_at: iso(10000),
  updated_at: iso(10),
};

export const fixtureTenant: TenantContext = {
  user: { id: "u", email: "dona@smashdavila.com", full_name: "Carla Mendes" },
  organization: { id: "org", name: "Smash Group", slug: "smash", document_number: null, plan_tier: "FREE_PILOT", subscription_status: "ACTIVE", max_stores: 1, created_by: "u", created_at: iso(1), updated_at: iso(1) },
  membership: { id: "m", organization_id: "org", store_id: null, user_id: "u", role: "OWNER", created_at: iso(1), updated_at: iso(1) },
  store: fixtureStoreRow,
  stores: [fixtureStoreRow],
};

function order(n: number, status: Order["status"], minAgo: number, name: string, items: [number, string, number][], extra: Partial<Order> = {}): Order {
  const subtotal = items.reduce((s, [q, , p]) => s + q * p, 0);
  return {
    id: `o${n}`,
    store_id: fixtureStore.id,
    customer_id: null,
    order_number: n,
    source: "DIGITAL_MENU",
    fulfillment_type: "DELIVERY",
    table_or_reference: null,
    status,
    customer_name_snapshot: name,
    customer_phone_snapshot: "11988887777",
    subtotal_cents: subtotal,
    discount_cents: 0,
    fee_cents: 500,
    total_cents: subtotal + 500,
    notes: null,
    stock_deducted: status !== "NEW",
    idempotency_key: null,
    created_by: null,
    payment_method: "ONLINE_PIX",
    payment_status: "APPROVED",
    payment_expires_at: null,
    paid_at: iso(minAgo),
    change_for_cents: null,
    public_token: "a".repeat(64),
    delivery_address: { street: "Rua Augusta", number: "1200", neighborhood: "Centro", complement: "ap 31" },
    eta_minutes: 35,
    coupon_code_snapshot: null,
    created_at: iso(minAgo),
    updated_at: iso(minAgo),
    items: items.map(([q, nm, p], i) => ({
      id: `o${n}i${i}`,
      store_id: fixtureStore.id,
      order_id: `o${n}`,
      product_id: null,
      product_name_snapshot: nm,
      unit_price_cents: p,
      options_unit_price_cents: 0,
      quantity: q,
      total_item_cents: q * p,
      notes: null,
      created_at: iso(minAgo),
      options: [],
    })),
    status_history: [],
    ...extra,
  };
}

export const fixtureOrders: Order[] = [
  order(420, "NEW", 1, "Marina Lopes", [[2, "Smash duplo", 3490], [1, "Batata rústica", 1490]]),
  order(419, "NEW", 4, "Rafael Souza", [[1, "Smash simples", 2490]], { payment_method: "CASH", payment_status: "PAY_ON_DELIVERY", notes: "Sem cebola, por favor" }),
  order(418, "CONFIRMED", 9, "Júlia Prado", [[1, "Veggie de grão-de-bico", 2990], [2, "Limonada da casa", 990]], { fulfillment_type: "PICKUP", delivery_address: null }),
  order(417, "PREPARING", 17, "Pedro Alves", [[3, "Smash duplo", 3490], [2, "Onion rings", 1890]]),
  order(416, "PREPARING", 6, "Ana Costa", [[1, "Smash duplo", 3490]], { fulfillment_type: "DINE_IN", table_or_reference: "7", delivery_address: null, payment_method: "CARD_ON_DELIVERY", payment_status: "PAY_ON_DELIVERY" }),
  order(415, "READY", 22, "Lucas Reis", [[2, "Smash simples", 2490]]),
  order(421, "AWAITING_PAYMENT", 2, "Bruno Lima", [[1, "Smash duplo", 3490]], { payment_status: "PENDING" }),
];

export const fixtureZonesRows: DeliveryZone[] = fixtureZones.map((z, i) => ({ ...z, store_id: fixtureStore.id, is_active: true, sort_order: i }));

export const fixtureCoupons: Coupon[] = [
  { id: "cp1", store_id: fixtureStore.id, code: "BEMVINDO10", description: null, kind: "PERCENT", value: 10, max_discount_cents: 1500, min_order_cents: 3000, starts_at: null, ends_at: null, usage_limit: 200, per_customer_limit: 1, used_count: 37, is_active: true, created_at: iso(5000) },
  { id: "cp2", store_id: fixtureStore.id, code: "FRETEOFF", description: null, kind: "FIXED", value: 500, max_discount_cents: null, min_order_cents: 0, starts_at: null, ends_at: iso(60), usage_limit: null, per_customer_limit: null, used_count: 12, is_active: false, created_at: iso(9000) },
];
