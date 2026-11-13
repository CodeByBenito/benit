import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { as, connectPaymentAccount, createTestDb, rpc, seed, type Db, type Fixture } from "./harness";

let db: Db;
let fx: Fixture;

type OrderResult = {
  order_id: string;
  order_number: number;
  status: string;
  payment_status: string;
  subtotal_cents: number;
  discount_cents: number;
  fee_cents: number;
  total_cents: number;
  public_token: string;
};

const deliveryTo = (neighborhood: string) => ({
  street: "Rua das Flores",
  number: "100",
  neighborhood,
});

async function publicOrder(args: Record<string, unknown>): Promise<OrderResult> {
  return db.transaction(async (tx) => {
    await tx.query(`SELECT set_config('request.jwt.claim.sub', '', true)`);
    await tx.exec(`SET LOCAL ROLE anon`);
    return rpc<OrderResult>(tx, "create_order_atomic", {
      p_store_id: fx.storeId,
      p_source: "DIGITAL_MENU",
      p_fulfillment_type: "PICKUP",
      p_customer_name: "Cliente Teste",
      p_customer_phone: "(11) 98888-7777",
      p_items: [{ product_id: fx.sodaId, quantity: 4 }],
      p_payment_method: "CASH",
      ...args,
    });
  });
}

async function staff<T>(userId: string, fn: string, args: Record<string, unknown>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [userId]);
    await tx.exec(`SET LOCAL ROLE authenticated`);
    return rpc<T>(tx, fn, args);
  });
}

async function service<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.exec(`SET LOCAL ROLE service_role`);
    return rpc<T>(tx, fn, args);
  });
}

const stock = async (productId: string) =>
  (await db.query<{ stock_quantity: number }>(`SELECT stock_quantity FROM public.products WHERE id = $1`, [productId])).rows[0]
    .stock_quantity;

const order = async (id: string) =>
  (await db.query<Record<string, unknown>>(`SELECT * FROM public.orders WHERE id = $1`, [id])).rows[0];

beforeAll(async () => {
  db = await createTestDb();
  fx = await seed(db);
}, 120_000);

beforeEach(async () => {
  // Reset mutable state between tests
  await db.exec(`
    DELETE FROM public.orders;
    DELETE FROM public.customers;
    DELETE FROM public.store_business_hours;
    DELETE FROM public.store_payment_accounts;
    UPDATE public.coupons SET used_count = 0, is_active = true;
    UPDATE public.products SET stock_quantity = 5 WHERE name = 'Smash';
    UPDATE public.products SET stock_quantity = 1 WHERE name = 'Batata';
    UPDATE public.stores SET is_open = true, online_payment_enabled = false, min_order_cents = 0;
  `);
});

describe("legacy RPC surface", () => {
  it("drops the old 12-argument create_order_atomic that trusted client fees", async () => {
    const res = await db.query<{ n: number }>(
      `SELECT COUNT(*)::int AS n FROM pg_proc WHERE proname = 'create_order_atomic' AND pronargs = 12`
    );
    expect(res.rows[0].n).toBe(0);
  });
});

describe("server-side pricing", () => {
  it("ignores fee/discount sent by a public client and computes zone fee itself", async () => {
    const r = await publicOrder({
      p_fulfillment_type: "DELIVERY",
      p_delivery: deliveryTo("sao joao"), // accent/case-insensitive match of "São João"
      p_items: [{ product_id: fx.burgerId, quantity: 1, option_ids: [fx.cheddarOptionId] }],
      p_fee_cents: 0,
      p_discount_cents: 99999,
    });
    expect(r.subtotal_cents).toBe(3500);
    expect(r.fee_cents).toBe(700);
    expect(r.discount_cents).toBe(0);
    expect(r.total_cents).toBe(4200);
    expect(r.status).toBe("NEW");
    expect(r.payment_status).toBe("PAY_ON_DELIVERY");
    expect(r.public_token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects delivery to a neighborhood without a zone", async () => {
    await expect(
      publicOrder({ p_fulfillment_type: "DELIVERY", p_delivery: deliveryTo("Bairro Longe"), p_items: [{ product_id: fx.burgerId, quantity: 1 }] })
    ).rejects.toThrow(/DELIVERY_ZONE_NOT_FOUND/);
  });

  it("enforces the zone minimum order", async () => {
    // Zone Centro min = R$ 25,00 ; 1 soda = R$ 8,00
    await expect(
      publicOrder({ p_fulfillment_type: "DELIVERY", p_delivery: deliveryTo("Centro"), p_items: [{ product_id: fx.sodaId, quantity: 1 }] })
    ).rejects.toThrow(/MIN_ORDER_NOT_MET/);
  });

  it("rejects payment methods the store does not accept", async () => {
    await db.query(`UPDATE public.stores SET offline_methods = ARRAY['CASH']::public.payment_method[] WHERE id = $1`, [fx.storeId]);
    await expect(publicOrder({ p_payment_method: "CARD_ON_DELIVERY" })).rejects.toThrow(/PAYMENT_METHOD_UNAVAILABLE/);
    await expect(publicOrder({ p_payment_method: "ONLINE_PIX" })).rejects.toThrow(/PAYMENT_METHOD_UNAVAILABLE/);
    await db.query(
      `UPDATE public.stores SET offline_methods = ARRAY['CASH','CARD_ON_DELIVERY','PIX_MANUAL']::public.payment_method[] WHERE id = $1`,
      [fx.storeId]
    );
  });

  it("quote_checkout previews totals and reports coupon errors without raising", async () => {
    const q = await as(db, "anon", null, (tx) =>
      rpc<Record<string, unknown>>(tx, "quote_checkout", {
        p_slug: fx.storeSlug,
        p_items: [{ product_id: fx.burgerId, quantity: 2 }],
        p_fulfillment_type: "DELIVERY",
        p_neighborhood: "Centro",
        p_coupon_code: "NAOEXISTE",
      })
    );
    expect(q.subtotal_cents).toBe(6000);
    expect(q.fee_cents).toBe(700);
    expect(q.coupon_error).toMatch(/inválido/i);
    expect(q.meets_minimum).toBe(true);
  });
});

describe("coupons", () => {
  it("applies percent coupon with cap and records redemption", async () => {
    const r = await publicOrder({ p_items: [{ product_id: fx.burgerId, quantity: 2 }], p_coupon_code: "bemvindo10" });
    expect(r.discount_cents).toBe(600);
    expect(r.total_cents).toBe(5400);
    const c = await db.query<{ used_count: number }>(`SELECT used_count FROM public.coupons WHERE code = 'BEMVINDO10'`);
    expect(c.rows[0].used_count).toBe(1);
  });

  it("enforces per-customer limit and global usage limit", async () => {
    await publicOrder({ p_coupon_code: "BEMVINDO10" });
    await expect(publicOrder({ p_coupon_code: "BEMVINDO10" })).rejects.toThrow(/COUPON_CUSTOMER_LIMIT/);
    await publicOrder({ p_coupon_code: "BEMVINDO10", p_customer_phone: "11977776666" });
    await expect(publicOrder({ p_coupon_code: "BEMVINDO10", p_customer_phone: "11955554444" })).rejects.toThrow(/COUPON_EXHAUSTED/);
  });

  it("releases the coupon when the order is cancelled", async () => {
    const r = await publicOrder({ p_coupon_code: "BEMVINDO10" });
    await staff(fx.ownerId, "transition_order_status_atomic", { p_store_id: fx.storeId, p_order_id: r.order_id, p_new_status: "CANCELLED" });
    const c = await db.query<{ used_count: number }>(`SELECT used_count FROM public.coupons WHERE code = 'BEMVINDO10'`);
    expect(c.rows[0].used_count).toBe(0);
    // The same customer may use it again.
    await expect(publicOrder({ p_coupon_code: "BEMVINDO10" })).resolves.toBeTruthy();
  });
});

describe("business hours", () => {
  it("rejects public orders outside configured hours, accepts inside", async () => {
    // A slot that is never "now": 1 minute window 12 hours away.
    const now = await db.query<{ dow: number; t: string }>(
      `SELECT EXTRACT(DOW FROM now() AT TIME ZONE 'America/Sao_Paulo')::int AS dow,
              to_char((now() AT TIME ZONE 'America/Sao_Paulo') + interval '12 hours', 'HH24:MI') AS t`
    );
    const { dow } = now.rows[0];
    await db.query(
      `INSERT INTO public.store_business_hours (store_id, weekday, opens_at, closes_at) VALUES ($1, $2, $3::time, ($3::time + interval '1 minute'))`,
      [fx.storeId, dow, now.rows[0].t]
    );
    await expect(publicOrder({})).rejects.toThrow(/STORE_CLOSED/);

    await db.query(`DELETE FROM public.store_business_hours`);
    // Overnight slot covering every moment: opens 00:01 closes 00:00 -> crosses midnight, covers all but 1 minute.
    for (let d = 0; d < 7; d++) {
      await db.query(`INSERT INTO public.store_business_hours (store_id, weekday, opens_at, closes_at) VALUES ($1, $2, '00:00', '23:59:59')`, [
        fx.storeId,
        d,
      ]);
    }
    await expect(publicOrder({})).resolves.toBeTruthy();
  });

  it("handles overnight slots (18:00 → 02:00) on the next morning", async () => {
    await db.query(`INSERT INTO public.store_business_hours (store_id, weekday, opens_at, closes_at) VALUES ($1, 5, '18:00', '02:00')`, [fx.storeId]);
    // Saturday 01:30 local belongs to Friday's overnight slot; 03:00 does not.
    const ok = await db.query<{ ok: boolean }>(`SELECT public.is_store_accepting($1, '2026-11-07 01:30:00-03'::timestamptz) AS ok`, [fx.storeId]);
    const closed = await db.query<{ ok: boolean }>(`SELECT public.is_store_accepting($1, '2026-11-07 03:00:00-03'::timestamptz) AS ok`, [fx.storeId]);
    expect(ok.rows[0].ok).toBe(true);
    expect(closed.rows[0].ok).toBe(false);
  });
});

describe("online payment lifecycle", () => {
  it("online order waits for payment, never deducts stock, and does not count in stats", async () => {
    await connectPaymentAccount(db, fx.storeId);
    const r = await publicOrder({ p_items: [{ product_id: fx.burgerId, quantity: 2 }], p_payment_method: "ONLINE_PIX" });
    expect(r.status).toBe("AWAITING_PAYMENT");
    expect(r.payment_status).toBe("PENDING");
    expect(await stock(fx.burgerId)).toBe(5);
    const c = await db.query<{ total_orders: number }>(`SELECT total_orders FROM public.customers`);
    expect(c.rows[0].total_orders).toBe(0);
  });

  it("staff cannot advance an unpaid order", async () => {
    await connectPaymentAccount(db, fx.storeId);
    const r = await publicOrder({ p_payment_method: "ONLINE_PIX" });
    await expect(
      staff(fx.ownerId, "transition_order_status_atomic", { p_store_id: fx.storeId, p_order_id: r.order_id, p_new_status: "CONFIRMED" })
    ).rejects.toThrow(/AWAITING_PAYMENT/);
  });

  it("approval reserves stock exactly once and is idempotent", async () => {
    await connectPaymentAccount(db, fx.storeId);
    const r = await publicOrder({ p_items: [{ product_id: fx.burgerId, quantity: 2 }], p_payment_method: "ONLINE_PIX" });
    const args = {
      p_order_id: r.order_id,
      p_provider_payment_id: "mp-123",
      p_status: "APPROVED",
      p_amount_cents: r.total_cents,
      p_method: "ONLINE_PIX",
    };
    const first = await service<{ result: string }>("apply_payment_update", args);
    const second = await service<{ result: string }>("apply_payment_update", args);
    expect(first.result).toBe("APPROVED");
    expect(second.result).toBe("NOOP");
    expect(await stock(fx.burgerId)).toBe(3);
    const o = await order(r.order_id);
    expect(o.status).toBe("NEW");
    expect(o.payment_status).toBe("APPROVED");
    expect(o.stock_deducted).toBe(true);

    // Confirming later must not deduct again.
    await staff(fx.ownerId, "transition_order_status_atomic", { p_store_id: fx.storeId, p_order_id: r.order_id, p_new_status: "CONFIRMED" });
    expect(await stock(fx.burgerId)).toBe(3);

    const c = await db.query<{ total_orders: number }>(`SELECT total_orders FROM public.customers`);
    expect(c.rows[0].total_orders).toBe(1);
  });

  it("approval with stock gone cancels and asks for a refund", async () => {
    await connectPaymentAccount(db, fx.storeId);
    const r = await publicOrder({ p_items: [{ product_id: fx.friesId, quantity: 1 }], p_payment_method: "ONLINE_PIX" });
    // Someone else buys the last fries at the counter.
    await db.query(`UPDATE public.products SET stock_quantity = 0 WHERE id = $1`, [fx.friesId]);
    const res = await service<{ result: string }>("apply_payment_update", {
      p_order_id: r.order_id,
      p_provider_payment_id: "mp-456",
      p_status: "APPROVED",
      p_amount_cents: r.total_cents,
      p_method: "ONLINE_PIX",
    });
    expect(res.result).toBe("REFUND_REQUIRED");
    const o = await order(r.order_id);
    expect(o.status).toBe("CANCELLED");
    expect(o.payment_status).toBe("REFUND_PENDING");
  });

  it("amount mismatch never approves the order", async () => {
    await connectPaymentAccount(db, fx.storeId);
    const r = await publicOrder({ p_payment_method: "ONLINE_PIX" });
    const res = await service<{ result: string }>("apply_payment_update", {
      p_order_id: r.order_id,
      p_provider_payment_id: "mp-789",
      p_status: "APPROVED",
      p_amount_cents: 1,
      p_method: "ONLINE_PIX",
    });
    expect(res.result).toBe("REFUND_REQUIRED");
    expect((await order(r.order_id)).status).toBe("AWAITING_PAYMENT");
  });

  it("expiry cancels unpaid orders and releases coupons; late payment requires refund", async () => {
    await connectPaymentAccount(db, fx.storeId);
    const r = await publicOrder({ p_payment_method: "ONLINE_PIX", p_coupon_code: "BEMVINDO10" });
    await db.query(`UPDATE public.orders SET payment_expires_at = now() - interval '1 minute' WHERE id = $1`, [r.order_id]);
    const expired = await service<number>("expire_unpaid_orders", {});
    expect(expired).toBe(1);
    const o = await order(r.order_id);
    expect(o.status).toBe("CANCELLED");
    expect(o.payment_status).toBe("EXPIRED");
    const c = await db.query<{ used_count: number }>(`SELECT used_count FROM public.coupons WHERE code = 'BEMVINDO10'`);
    expect(c.rows[0].used_count).toBe(0);

    const late = await service<{ result: string }>("apply_payment_update", {
      p_order_id: r.order_id,
      p_provider_payment_id: "mp-late",
      p_status: "APPROVED",
      p_amount_cents: r.total_cents,
      p_method: "ONLINE_PIX",
    });
    expect(late.result).toBe("REFUND_REQUIRED");
  });

  it("cancelling a paid order returns stock and flags refund", async () => {
    await connectPaymentAccount(db, fx.storeId);
    const r = await publicOrder({ p_items: [{ product_id: fx.burgerId, quantity: 1 }], p_payment_method: "ONLINE_CARD" });
    await service("apply_payment_update", {
      p_order_id: r.order_id,
      p_provider_payment_id: "mp-card",
      p_status: "APPROVED",
      p_amount_cents: r.total_cents,
      p_method: "ONLINE_CARD",
    });
    expect(await stock(fx.burgerId)).toBe(4);
    const t = await staff<{ refund_required: boolean; payment_status: string }>(fx.ownerId, "transition_order_status_atomic", {
      p_store_id: fx.storeId,
      p_order_id: r.order_id,
      p_new_status: "CANCELLED",
    });
    expect(t.refund_required).toBe(true);
    expect(t.payment_status).toBe("REFUND_PENDING");
    expect(await stock(fx.burgerId)).toBe(5);

    const refunded = await service<{ result: string }>("apply_payment_update", {
      p_order_id: r.order_id,
      p_provider_payment_id: "mp-card",
      p_status: "REFUNDED",
      p_amount_cents: r.total_cents,
      p_method: "ONLINE_CARD",
    });
    expect(refunded.result).toBe("REFUNDED");
    expect(await stock(fx.burgerId)).toBe(5); // no double reversal
  });
});

describe("privileges & isolation", () => {
  it("API roles cannot call payment state machine or expiry", async () => {
    for (const role of ["anon", "authenticated"] as const) {
      await expect(
        as(db, role, role === "authenticated" ? fx.ownerId : null, (tx) =>
          rpc(tx, "apply_payment_update", {
            p_order_id: "00000000-0000-0000-0000-000000000000",
            p_provider_payment_id: "x",
            p_status: "APPROVED",
            p_amount_cents: 0,
            p_method: "ONLINE_PIX",
          })
        )
      ).rejects.toThrow(/permission denied/);
      await expect(as(db, role, null, (tx) => rpc(tx, "expire_unpaid_orders", {}))).rejects.toThrow(/permission denied/);
    }
  });

  it("nobody but service role reads payment secrets or webhook events", async () => {
    await connectPaymentAccount(db, fx.storeId);
    for (const role of ["anon", "authenticated"] as const) {
      await expect(
        as(db, role, fx.ownerId, (tx) => tx.query(`SELECT * FROM public.store_payment_accounts`))
      ).rejects.toThrow(/permission denied/);
      await expect(as(db, role, fx.ownerId, (tx) => tx.query(`SELECT * FROM public.webhook_events`))).rejects.toThrow(
        /permission denied/
      );
    }
  });

  it("anon cannot read coupons, zones or hours tables directly", async () => {
    // Since migration 0012 anon has no table privilege at all (it used to get zero rows from RLS).
    for (const table of ["coupons", "delivery_zones", "store_business_hours"]) {
      await expect(as(db, "anon", null, (tx) => tx.query(`SELECT * FROM public.${table}`)), table).rejects.toThrow(/permission denied/);
    }
  });

  it("kitchen staff cannot change money settings or coupons; owner can", async () => {
    await expect(
      as(db, "authenticated", fx.kitchenId, (tx) => tx.query(`UPDATE public.stores SET pix_key = 'golpe@pix' WHERE id = $1`, [fx.storeId]))
    ).rejects.toThrow(/FORBIDDEN/);
    const updated = await as(db, "authenticated", fx.kitchenId, async (tx) =>
      (await tx.query(`UPDATE public.coupons SET value = 90 WHERE store_id = $1 RETURNING id`, [fx.storeId])).rows
    );
    expect(updated).toHaveLength(0);
    await expect(
      as(db, "authenticated", fx.ownerId, (tx) => tx.query(`UPDATE public.stores SET pix_key = 'novo@pix' WHERE id = $1`, [fx.storeId]))
    ).resolves.toBeTruthy();
  });

  it("cannot enable online payment without a connected account", async () => {
    await expect(
      as(db, "authenticated", fx.ownerId, (tx) =>
        tx.query(`UPDATE public.stores SET online_payment_enabled = true WHERE id = $1`, [fx.storeId])
      )
    ).rejects.toThrow(/PAYMENT_ACCOUNT_REQUIRED/);
  });

  it("staff cannot forge payment status or totals with a direct UPDATE", async () => {
    await connectPaymentAccount(db, fx.storeId);
    const r = await publicOrder({ p_payment_method: "ONLINE_PIX" });
    await expect(
      as(db, "authenticated", fx.ownerId, (tx) =>
        tx.query(`UPDATE public.orders SET payment_status = 'APPROVED', status = 'NEW' WHERE id = $1`, [r.order_id])
      )
    ).rejects.toThrow(/FORBIDDEN/);
    await expect(
      as(db, "authenticated", fx.ownerId, (tx) => tx.query(`UPDATE public.orders SET notes = 'ok' WHERE id = $1`, [r.order_id]))
    ).resolves.toBeTruthy();
  });

  it("another tenant cannot transition this store's orders", async () => {
    const r = await publicOrder({});
    await expect(
      staff(fx.outsiderId, "transition_order_status_atomic", { p_store_id: fx.storeId, p_order_id: r.order_id, p_new_status: "CONFIRMED" })
    ).rejects.toThrow(/FORBIDDEN/);
  });
});

describe("public tracking", () => {
  it("returns order progress without customer personal data", async () => {
    const r = await publicOrder({
      p_fulfillment_type: "DELIVERY",
      p_delivery: deliveryTo("Centro"),
      p_items: [{ product_id: fx.burgerId, quantity: 1 }],
    });
    const t = await as(db, "anon", null, (tx) => rpc<Record<string, unknown>>(tx, "get_public_order_by_token", { p_token: r.public_token }));
    expect(t.order_number).toBe(r.order_number);
    const serialized = JSON.stringify(t);
    expect(serialized).not.toContain("Cliente Teste");
    expect(serialized).not.toContain("98888");
    expect(serialized).not.toContain("Rua das Flores");
  });

  it("rejects malformed or unknown tokens", async () => {
    const bad = await as(db, "anon", null, (tx) => rpc(tx, "get_public_order_by_token", { p_token: "' OR 1=1 --" }));
    expect(bad).toBeNull();
  });

  it("broadcasts status changes to the order's public channel", async () => {
    const r = await publicOrder({});
    await db.exec(`DELETE FROM realtime.sent`);
    await staff(fx.ownerId, "transition_order_status_atomic", { p_store_id: fx.storeId, p_order_id: r.order_id, p_new_status: "CONFIRMED" });
    const sent = await db.query<{ topic: string; payload: { status: string } }>(`SELECT topic, payload FROM realtime.sent`);
    expect(sent.rows).toHaveLength(1);
    expect(sent.rows[0].topic).toBe(`track:${r.public_token}`);
    expect(sent.rows[0].payload.status).toBe("CONFIRMED");
  });
});

describe("public menu projection", () => {
  it("exposes checkout configuration but never secrets", async () => {
    await connectPaymentAccount(db, fx.storeId);
    const menu = await as(db, "anon", null, (tx) => rpc<Record<string, any>>(tx, "get_public_menu_by_slug", { p_slug: fx.storeSlug }));
    expect(menu.store.online_payment.enabled).toBe(true);
    expect(menu.store.online_payment.public_key).toBe("TEST-public-key");
    expect(menu.delivery_zones[0].fee_cents).toBe(700);
    const s = JSON.stringify(menu);
    expect(s).not.toContain("access_token");
    expect(s).not.toContain("v1.sealed");
    expect(s).not.toContain("stock_quantity");
  });
});

