import type { TrackedOrder } from "@/features/checkout/actions";
import type { PublicCategory, PublicDeliveryZone, PublicProduct, PublicStoreInfo } from "@/components/menu/public-menu-client";

/** Design-review fixtures (development only). Fictional store, never shown in production. */
export const fixtureStore: PublicStoreInfo = {
  id: "00000000-0000-4000-8000-000000000001",
  name: "Smash da Vila",
  slug: "smash-da-vila",
  description: "Smash burgers na chapa de ferro, batata rústica e limonada da casa.",
  logo_url: null,
  banner_url: null,
  phone: "11988887777",
  whatsapp: "11988887777",
  address: "Rua das Flores, 120 · Centro",
  is_open: true,
  accepting_now: true,
  min_order_cents: 2500,
  default_eta_minutes: 40,
  fulfillment: { delivery: true, pickup: true, dine_in: false },
  offline_methods: ["CASH", "CARD_ON_DELIVERY", "PIX_MANUAL"],
  pix_key: "pix@smashdavila.com",
  online_payment: { enabled: true, public_key: "TEST-fixture" },
  hours: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, opens_at: "18:00", closes_at: "23:30" })),
};

export const fixtureCategories: PublicCategory[] = [
  { id: "c1", name: "Burgers", description: "Pão brioche selado na manteiga" },
  { id: "c2", name: "Porções", description: null },
  { id: "c3", name: "Bebidas", description: null },
];

const g = (id: string, name: string, min: number, max: number, req: boolean, opts: [string, number][]) => ({
  id,
  name,
  min_select: min,
  max_select: max,
  is_required: req,
  options: opts.map(([n, p], i) => ({ id: `${id}-${i}`, name: n, price_cents: p })),
});

export const fixtureProducts: PublicProduct[] = [
  {
    id: "p1",
    category_id: "c1",
    name: "Smash duplo",
    description: "Dois blends de 90g, cheddar inglês, picles da casa e molho especial.",
    price_cents: 3490,
    image_url: null,
    is_available: true,
    in_stock: true,
    option_groups: [
      g("g1", "Ponto da carne", 1, 1, true, [["Ao ponto", 0], ["Bem passado", 0]]),
      g("g2", "Adicionais", 0, 3, false, [["Bacon crocante", 600], ["Cheddar extra", 400], ["Cebola caramelizada", 300]]),
    ],
  },
  { id: "p2", category_id: "c1", name: "Smash simples", description: "Um blend de 90g, cheddar e picles.", price_cents: 2490, image_url: null, is_available: true, in_stock: true, option_groups: [] },
  { id: "p3", category_id: "c1", name: "Veggie de grão-de-bico", description: "Hambúrguer de grão-de-bico, rúcula e maionese de ervas.", price_cents: 2990, image_url: null, is_available: true, in_stock: false, option_groups: [] },
  { id: "p4", category_id: "c2", name: "Batata rústica", description: "Alecrim e flor de sal.", price_cents: 1490, image_url: null, is_available: true, in_stock: true, option_groups: [] },
  { id: "p5", category_id: "c2", name: "Onion rings", description: "Empanados na cerveja.", price_cents: 1890, image_url: null, is_available: true, in_stock: true, option_groups: [] },
  { id: "p6", category_id: "c3", name: "Limonada da casa", description: "Hortelã fresca.", price_cents: 990, image_url: null, is_available: true, in_stock: true, option_groups: [] },
];

export const fixtureZones: PublicDeliveryZone[] = [
  { id: "z1", name: "Perto", neighborhoods: ["Centro", "Vila Nova"], fee_cents: 500, min_order_cents: null, eta_minutes: 30 },
  { id: "z2", name: "Médio", neighborhoods: ["Jardim América", "São João"], fee_cents: 900, min_order_cents: 3000, eta_minutes: 45 },
];

export const fixtureTracked = (status: string): TrackedOrder => ({
  order_number: 412,
  status,
  payment_status: status === "AWAITING_PAYMENT" ? "PENDING" : "APPROVED",
  payment_method: "ONLINE_PIX",
  payment_expires_at: new Date(Date.now() + 12 * 60_000).toISOString(),
  fulfillment_type: "DELIVERY",
  eta_minutes: 35,
  subtotal_cents: 8470,
  discount_cents: 847,
  fee_cents: 500,
  total_cents: 8123,
  created_at: new Date(Date.now() - 18 * 60_000).toISOString(),
  items: [
    { name: "Smash duplo", quantity: 2, total_cents: 6980, options: ["Ao ponto", "Bacon crocante"] },
    { name: "Batata rústica", quantity: 1, total_cents: 1490, options: [] },
  ],
  timeline: [
    { status: "NEW", at: new Date(Date.now() - 18 * 60_000).toISOString() },
    { status: "CONFIRMED", at: new Date(Date.now() - 15 * 60_000).toISOString() },
    { status: "PREPARING", at: new Date(Date.now() - 9 * 60_000).toISOString() },
  ].filter((t) => ["NEW", "CONFIRMED", "PREPARING", "READY", "COMPLETED"].indexOf(t.status) <= ["NEW", "CONFIRMED", "PREPARING", "READY", "COMPLETED"].indexOf(status)),
  pix: status === "AWAITING_PAYMENT" ? { qr_code: "00020126580014br.gov.bcb.pix0136fixture", qr_code_base64: null, expires_at: null } : null,
  mp_public_key: null,
  store: { name: "Smash da Vila", slug: "smash-da-vila", whatsapp: "11988887777", logo_url: null },
});
