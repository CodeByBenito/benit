import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { as, createTestDb, rpc, seed, type Db, type Fixture } from "./harness";

let db: Db;
let fx: Fixture;
let seq = 0;

/** Places a public (anonymous) order and commits it. */
async function publicOrder(phone: string, overrides: Record<string, unknown> = {}) {
  return db.transaction(async (tx) => {
    await tx.query(`SELECT set_config('request.jwt.claim.sub', '', true)`);
    await tx.exec(`SET LOCAL ROLE anon`);
    return rpc<{ order_id: string; order_number: number; idempotent_replay?: boolean }>(tx, "create_order_atomic", {
      p_store_id: fx.storeId,
      p_source: "DIGITAL_MENU",
      p_fulfillment_type: "PICKUP",
      p_customer_name: "Cliente Teste",
      p_customer_phone: phone,
      p_items: [{ product_id: fx.sodaId, quantity: 4 }],
      p_payment_method: "CASH",
      p_idempotency_key: `rl-${++seq}`,
      ...overrides,
    });
  });
}

const service = <T>(fn: string, args: Record<string, unknown>) =>
  db.transaction(async (tx) => {
    await tx.exec(`SET LOCAL ROLE service_role`);
    return rpc<T>(tx, fn, args);
  });

beforeAll(async () => {
  db = await createTestDb();
  fx = await seed(db);
}, 120_000);

beforeEach(async () => {
  await db.exec(`DELETE FROM public.orders; DELETE FROM public.rate_limit_buckets;`);
});

describe("public orders: per-phone limit", () => {
  it("accepts 5 orders from one phone in 10 minutes and refuses the 6th with a friendly message", async () => {
    for (let i = 0; i < 5; i++) await publicOrder("(11) 98888-7777");
    await expect(publicOrder("11 98888 7777")).rejects.toThrow(/RATE_LIMITED: Você fez muitos pedidos em pouco tempo/);
    const { rows } = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM public.orders`);
    expect(rows[0].n).toBe(5);
  });

  it("another phone, or the same phone in another store, is not affected", async () => {
    for (let i = 0; i < 5; i++) await publicOrder("11988887777");
    await expect(publicOrder("11977776666")).resolves.toMatchObject({ order_number: expect.any(Number) });

    await db.query(`UPDATE public.stores SET offline_methods = ARRAY['CASH']::public.payment_method[] WHERE id = $1`, [fx.otherStoreId]);
    const [{ id: product }] = (await db.query<{ id: string }>(`INSERT INTO public.products (store_id, name, price_cents, track_stock) VALUES ($1, 'Item B', 5000, false) RETURNING id`, [fx.otherStoreId])).rows;
    await expect(publicOrder("11988887777", { p_store_id: fx.otherStoreId, p_items: [{ product_id: product, quantity: 1 }] })).resolves.toBeTruthy();
  });

  it("the window slides: orders older than 10 minutes stop counting", async () => {
    for (let i = 0; i < 5; i++) await publicOrder("11988887777");
    await db.query(`UPDATE public.orders SET created_at = now() - interval '11 minutes'`);
    await expect(publicOrder("11988887777")).resolves.toBeTruthy();
  });

  it("a retry of the same order (idempotency key) is not a new order and still answers", async () => {
    for (let i = 0; i < 4; i++) await publicOrder("11988887777");
    const first = await publicOrder("11988887777", { p_idempotency_key: "same-key" });
    const replay = await publicOrder("11988887777", { p_idempotency_key: "same-key" });
    expect(replay).toMatchObject({ order_id: first.order_id, idempotent_replay: true });
  });

  it("cancelled orders still count, so cancel-and-retry is not a way around", async () => {
    for (let i = 0; i < 5; i++) await publicOrder("11988887777");
    await db.query(`UPDATE public.orders SET status = 'CANCELLED'`);
    await expect(publicOrder("11988887777")).rejects.toThrow(/RATE_LIMITED/);
  });

  it("staff typing manual orders for the same customer are never limited", async () => {
    for (let i = 0; i < 5; i++) await publicOrder("11988887777");
    const manual = () =>
      db.transaction(async (tx) => {
        await tx.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [fx.ownerId]);
        await tx.exec(`SET LOCAL ROLE authenticated`);
        return rpc(tx, "create_order_atomic", {
          p_store_id: fx.storeId,
          p_source: "MANUAL",
          p_fulfillment_type: "PICKUP",
          p_customer_name: "Cliente Teste",
          p_customer_phone: "11988887777",
          p_items: [{ product_id: fx.sodaId, quantity: 1 }],
          p_payment_method: "CASH",
        });
      });
    await expect(manual()).resolves.toBeTruthy();
    await expect(manual()).resolves.toBeTruthy();
  });
});

describe("generic rate limit counter", () => {
  const hit = (key = "quote:abcdef0123456789", limit = 3, seconds = 600) => service<boolean>("consume_rate_limit", { p_key: key, p_limit: limit, p_window_seconds: seconds });

  it("allows up to the limit inside the window, then refuses", async () => {
    expect([await hit(), await hit(), await hit(), await hit(), await hit()]).toEqual([true, true, true, false, false]);
  });

  it("keys are independent", async () => {
    for (let i = 0; i < 4; i++) await hit("quote:aaaaaaaaaaaaaaaa");
    expect(await hit("quote:bbbbbbbbbbbbbbbb")).toBe(true);
  });

  it("starts a fresh window once the old one has passed", async () => {
    for (let i = 0; i < 4; i++) await hit();
    await db.query(`UPDATE public.rate_limit_buckets SET window_start = now() - interval '11 minutes'`);
    expect(await hit()).toBe(true);
    const { rows } = await db.query<{ hits: number }>(`SELECT hits FROM public.rate_limit_buckets`);
    expect(rows[0].hits).toBe(1);
  });

  it("is closed to anonymous and signed-in callers: function and table", async () => {
    for (const [role, user] of [["anon", null], ["authenticated", fx.ownerId]] as const) {
      await expect(as(db, role, user, (tx) => rpc(tx, "consume_rate_limit", { p_key: "quote:abcdef0123456789", p_limit: 1, p_window_seconds: 60 }))).rejects.toThrow(/permission denied/);
      await expect(as(db, role, user, (tx) => tx.query(`SELECT * FROM public.rate_limit_buckets`))).rejects.toThrow(/permission denied/);
    }
  });

  it("rejects nonsense parameters", async () => {
    await expect(hit("short", 3, 60)).rejects.toThrow(/INVALID_RATE_LIMIT/);
    await expect(hit("quote:abcdef0123456789", 0, 60)).rejects.toThrow(/INVALID_RATE_LIMIT/);
  });
});
