import type { Category, Customer, Order, Product, StockMovement } from "@/types/domain.types";
import { fixtureStore } from "./fixtures";

/** Catalog, stock and customer fixtures for the /dev panel previews (development only). */
const STORE = fixtureStore.id;
const iso = (minAgo: number) => new Date(Date.now() - minAgo * 60_000).toISOString();
const DAY = 24 * 60;

const cat = (n: number, name: string, description: string | null, extra: Partial<Category> = {}): Category => ({
  id: `cat-${n}`,
  store_id: STORE,
  name,
  description,
  sort_order: n * 10,
  is_active: true,
  created_at: iso(90 * DAY),
  updated_at: iso(DAY),
  ...extra,
});

export const fixtureCatalogCategories: Category[] = [
  cat(1, "Burgers", "Pão brioche selado na manteiga"),
  cat(2, "Porções", null),
  cat(3, "Bebidas", null),
  cat(4, "Sobremesas", "Só no fim de semana", { is_active: false }),
];

const group = (productId: string, n: number, name: string, min: number, max: number, required: boolean, options: [string, number][]) => ({
  id: `${productId}-g${n}`,
  store_id: STORE,
  product_id: productId,
  name,
  min_select: min,
  max_select: max,
  is_required: required,
  sort_order: n,
  created_at: iso(60 * DAY),
  updated_at: iso(DAY),
  options: options.map(([optionName, price], i) => ({
    id: `${productId}-g${n}-o${i}`,
    store_id: STORE,
    group_id: `${productId}-g${n}`,
    name: optionName,
    price_cents: price,
    is_available: true,
    sort_order: i,
    created_at: iso(60 * DAY),
    updated_at: iso(DAY),
  })),
});

const product = (n: number, categoryId: string | null, name: string, description: string, price: number, stock: [number, number] | null, extra: Partial<Product> = {}): Product => ({
  id: `prod-${n}`,
  store_id: STORE,
  category_id: categoryId,
  sku: `SV-${String(n).padStart(3, "0")}`,
  name,
  description,
  price_cents: price,
  image_url: null,
  is_available: true,
  is_archived: false,
  track_stock: stock !== null,
  stock_quantity: stock?.[0] ?? 0,
  low_stock_threshold: stock?.[1] ?? 5,
  sort_order: n * 10,
  created_at: iso(60 * DAY),
  updated_at: iso(DAY),
  ...extra,
});

export const fixtureCatalogProducts: Product[] = [
  product(1, "cat-1", "Smash duplo", "Dois blends de 90g, cheddar inglês, picles da casa e molho especial.", 3490, [42, 10], {
    option_groups: [
      group("prod-1", 0, "Ponto da carne", 1, 1, true, [["Ao ponto", 0], ["Bem passado", 0]]),
      group("prod-1", 1, "Adicionais", 0, 3, false, [["Bacon crocante", 600], ["Cheddar extra", 400], ["Cebola caramelizada", 300]]),
    ],
  }),
  product(2, "cat-1", "Smash simples", "Um blend de 90g, cheddar e picles.", 2490, [18, 10]),
  product(3, "cat-1", "Veggie de grão-de-bico", "Hambúrguer de grão-de-bico, rúcula e maionese de ervas.", 2990, [0, 4]),
  product(4, "cat-2", "Batata rústica", "Alecrim e flor de sal.", 1490, [6, 8]),
  product(5, "cat-2", "Onion rings", "Empanados na cerveja.", 1890, [25, 6], { is_available: false }),
  product(6, "cat-3", "Limonada da casa", "Hortelã fresca.", 990, null),
  product(7, "cat-3", "Refrigerante lata", "350 ml.", 700, [3, 12]),
  product(8, "cat-4", "Brownie com sorvete", "Chocolate meio amargo e sorvete de creme.", 1690, [12, 4]),
  product(9, null, "Molho da casa (pote)", "Para levar.", 1200, null),
];

const move = (n: number, productId: string, type: StockMovement["movement_type"], delta: number, after: number, minAgo: number, reason: string | null): StockMovement => {
  const p = fixtureCatalogProducts.find((x) => x.id === productId)!;
  return {
    id: `mov-${n}`,
    store_id: STORE,
    product_id: productId,
    order_id: type.startsWith("ORDER") ? `o${400 + n}` : null,
    movement_type: type,
    quantity_delta: delta,
    previous_quantity: after - delta,
    new_quantity: after,
    reference_key: null,
    reason,
    created_by: null,
    created_at: iso(minAgo),
    product: { id: p.id, name: p.name, sku: p.sku },
  };
};

export const fixtureStockMovements: StockMovement[] = [
  move(1, "prod-1", "ORDER_DEDUCTION", -2, 42, 12, "Pedido #420"),
  move(2, "prod-4", "ORDER_DEDUCTION", -1, 6, 12, "Pedido #420"),
  move(3, "prod-7", "ORDER_DEDUCTION", -3, 3, 48, "Pedido #414"),
  move(4, "prod-3", "ORDER_DEDUCTION", -1, 0, 95, "Pedido #411"),
  move(5, "prod-1", "ENTRY", 30, 44, 6 * 60, "Compra da semana"),
  move(6, "prod-2", "ORDER_REVERSAL", 1, 18, 7 * 60, "Pedido #402 cancelado"),
  move(7, "prod-5", "ADJUSTMENT", -2, 25, DAY, "Contagem do fechamento"),
  move(8, "prod-4", "EXIT", -4, 7, DAY + 120, "Quebra"),
  move(9, "prod-1", "INITIAL", 14, 14, 20 * DAY, "Estoque inicial no cadastro do produto"),
];

const customer = (n: number, name: string, phone: string, orders: number, spent: number, lastMinAgo: number | null): Customer => ({
  id: `cus-${n}`,
  store_id: STORE,
  name,
  phone,
  email: null,
  notes: null,
  total_orders: orders,
  total_spent_cents: spent,
  last_order_at: lastMinAgo === null ? null : iso(lastMinAgo),
  created_at: iso(120 * DAY),
  updated_at: iso(DAY),
});

export const fixtureCustomers: Customer[] = [
  customer(1, "Marina Lopes", "11988887777", 14, 61240, 2),
  customer(2, "Rafael Souza", "11977776666", 3, 9870, 5 * 60),
  customer(3, "Júlia Prado", "11966665555", 22, 104300, DAY),
  customer(4, "Pedro Alves", "11955554444", 1, 12250, 3 * DAY),
  customer(5, "Ana Costa", "11944443333", 7, 31890, 9 * DAY),
  customer(6, "Lucas Reis", "11933332222", 2, 5480, 41 * DAY),
  customer(7, "Bruno Lima", "11922221111", 0, 0, null),
];

const customerOrder = (n: number, customerId: string, name: string, phone: string, status: Order["status"], minAgo: number, items: [number, string, number][], fee = 500): Order => {
  const subtotal = items.reduce((sum, [q, , p]) => sum + q * p, 0);
  return {
    id: `co-${n}`,
    store_id: STORE,
    customer_id: customerId,
    order_number: n,
    source: "DIGITAL_MENU",
    fulfillment_type: fee ? "DELIVERY" : "PICKUP",
    table_or_reference: null,
    status,
    customer_name_snapshot: name,
    customer_phone_snapshot: phone,
    subtotal_cents: subtotal,
    discount_cents: 0,
    fee_cents: fee,
    total_cents: subtotal + fee,
    notes: null,
    created_at: iso(minAgo),
    updated_at: iso(minAgo),
    items: items.map(([quantity, itemName, price], i) => ({
      id: `co-${n}-i${i}`,
      store_id: STORE,
      order_id: `co-${n}`,
      product_id: null,
      product_name_snapshot: itemName,
      unit_price_cents: price,
      options_unit_price_cents: 0,
      quantity,
      total_item_cents: quantity * price,
      notes: null,
      created_at: iso(minAgo),
    })),
  } as unknown as Order;
};

export const fixtureCustomerOrders: Order[] = [
  customerOrder(420, "cus-1", "Marina Lopes", "11988887777", "NEW", 2, [[2, "Smash duplo", 3490], [1, "Batata rústica", 1490]]),
  customerOrder(398, "cus-1", "Marina Lopes", "11988887777", "COMPLETED", 4 * DAY, [[1, "Smash duplo", 3490], [1, "Limonada da casa", 990]]),
  customerOrder(377, "cus-1", "Marina Lopes", "11988887777", "COMPLETED", 11 * DAY, [[2, "Smash simples", 2490]], 0),
  customerOrder(361, "cus-1", "Marina Lopes", "11988887777", "CANCELLED", 19 * DAY, [[1, "Onion rings", 1890]]),
  customerOrder(419, "cus-2", "Rafael Souza", "11977776666", "COMPLETED", 5 * 60, [[1, "Smash simples", 2490]]),
  customerOrder(418, "cus-3", "Júlia Prado", "11966665555", "COMPLETED", DAY, [[1, "Veggie de grão-de-bico", 2990], [2, "Limonada da casa", 990]], 0),
];
