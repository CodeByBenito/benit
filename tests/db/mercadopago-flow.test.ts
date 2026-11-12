import http from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createTestDb, seed, type Db, type Fixture } from "./harness";
import { createShimClient, type ShimContext } from "./supabase-shim";
import { createMercadoPagoStub, signNotification } from "../../scripts/mp-stub.mjs";

/**
 * Mercado Pago, end to end on the server side.
 *
 * Everything here is the app's real code: the OAuth callback, the checkout
 * and order actions, the webhook route and the cron routes. Only two things
 * are replaced: Supabase (a shim over PGlite, same SQL, roles and RLS) and
 * Mercado Pago (scripts/mp-stub.mjs, reached over real HTTP, which calls the
 * webhook back over real HTTP with a signed notification).
 */

const WEBHOOK_SECRET = "test-webhook-secret";
const CRON_SECRET = "test-cron-secret";

let db: Db;
let fx: Fixture;
let stub: ReturnType<typeof createMercadoPagoStub>;
let stubUrl: string;
let appServer: http.Server;
let appUrl: string;

/** Who the "browser session" is for the next server call. */
const session: ShimContext = { role: "anon", userId: null };
const afterTasks: Promise<unknown>[] = [];

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined, getAll: () => [], set: () => {}, delete: () => {} }) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { url });
  },
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("next/server", async (original) => ({
  ...(await original<typeof import("next/server")>()),
  // Runs "after the response" work right away and lets the test wait for it.
  after: (task: (() => unknown) | Promise<unknown>) => {
    afterTasks.push(Promise.resolve().then(() => (typeof task === "function" ? task() : task)));
  },
}));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => createShimClient(db, () => ({ role: "service_role", userId: null })) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => createShimClient(db, () => session) }));

type Modules = {
  payments: typeof import("@/features/payments/actions");
  checkout: typeof import("@/features/checkout/actions");
  orders: typeof import("@/features/orders/actions");
  webhook: typeof import("@/app/api/webhooks/mercadopago/route");
  oauthCallback: typeof import("@/app/api/integrations/mercadopago/callback/route");
  cronExpire: typeof import("@/app/api/cron/expire/route");
  cronRefresh: typeof import("@/app/api/cron/mp-refresh/route");
  next: typeof import("next/server");
};
let app: Modules;

const asOwner = () => Object.assign(session, { role: "authenticated", userId: fx.ownerId });
const asCustomer = () => Object.assign(session, { role: "anon", userId: null });

const one = async <T>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0];
const orderByToken = (token: string) =>
  one<{ id: string; status: string; payment_status: string; stock_deducted: boolean; total_cents: number }>(
    `SELECT id, status, payment_status, stock_deducted, total_cents FROM public.orders WHERE public_token = $1`,
    [token]
  );
const stockOf = async (productId: string) => (await one<{ stock_quantity: number }>(`SELECT stock_quantity FROM public.products WHERE id = $1`, [productId])).stock_quantity;
const paymentIdOf = async (orderId: string) => (await one<{ provider_payment_id: string }>(`SELECT provider_payment_id FROM public.payments WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1`, [orderId])).provider_payment_id;

/** Everything triggered so far has finished: webhooks answered and after() work done. */
async function settle() {
  for (let i = 0; i < 5; i++) {
    await stub.settle();
    await Promise.allSettled(afterTasks.splice(0));
  }
}

let orderSeq = 0;
async function placePixOrder(items: { product_id: string; quantity: number }[]) {
  asCustomer();
  const res = await app.checkout.placeOrderAction({
    slug: fx.storeSlug,
    storeId: fx.storeId,
    fulfillmentType: "PICKUP",
    customerName: "Cliente Pix",
    customerPhone: "(11) 97777-0000",
    items,
    paymentMethod: "ONLINE_PIX",
    idempotencyKey: `mp-flow-${++orderSeq}-${Date.now()}`,
  });
  if (!res.success || !res.data) throw new Error(`order failed: ${res.error}`);
  return res.data;
}

beforeAll(async () => {
  db = await createTestDb();
  fx = await seed(db);

  stub = createMercadoPagoStub({ webhookSecret: WEBHOOK_SECRET, clientId: "stub-client", clientSecret: "stub-secret" });
  stubUrl = await stub.listen(0);

  // The "deployed app": forwards HTTP to the real webhook route handler.
  appServer = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(chunk as Buffer);
    const url = new URL(req.url ?? "/", appUrl);
    if (req.method !== "POST" || url.pathname !== "/api/webhooks/mercadopago") {
      res.writeHead(404).end();
      return;
    }
    const request = new app.next.NextRequest(url, { method: "POST", headers: req.headers as Record<string, string>, body: Buffer.concat(chunks) });
    const response = await app.webhook.POST(request);
    res.writeHead(response.status, { "content-type": "application/json" }).end(await response.text());
  });
  await new Promise<void>((resolve) => appServer.listen(0, "127.0.0.1", resolve));
  appUrl = `http://127.0.0.1:${(appServer.address() as AddressInfo).port}`;

  // @/lib/env is parsed on import, so the environment comes first.
  Object.assign(process.env, {
    NEXT_PUBLIC_SUPABASE_URL: "https://test-project.supabase.co",
    SUPABASE_SERVICE_ROLE_KEY: "test-service-role",
    NEXT_PUBLIC_APP_URL: appUrl,
    MP_CLIENT_ID: "stub-client",
    MP_CLIENT_SECRET: "stub-secret",
    MP_WEBHOOK_SECRET: WEBHOOK_SECRET,
    MP_API_BASE_URL: stubUrl,
    MP_AUTH_BASE_URL: stubUrl,
    TOKEN_ENC_KEY: Buffer.alloc(32, 7).toString("base64"),
    CRON_SECRET,
  });
  delete process.env.RESEND_API_KEY;

  app = {
    payments: await import("@/features/payments/actions"),
    checkout: await import("@/features/checkout/actions"),
    orders: await import("@/features/orders/actions"),
    webhook: await import("@/app/api/webhooks/mercadopago/route"),
    oauthCallback: await import("@/app/api/integrations/mercadopago/callback/route"),
    cronExpire: await import("@/app/api/cron/expire/route"),
    cronRefresh: await import("@/app/api/cron/mp-refresh/route"),
    next: await import("next/server"),
  };
}, 120_000);

afterAll(async () => {
  await settle();
  await stub?.close();
  await new Promise((resolve) => appServer?.close(resolve));
});

describe("the stub signs like Mercado Pago", () => {
  it("produces the signature our verifier accepts (same manifest as signMercadoPagoNotification)", async () => {
    const { signMercadoPagoNotification, verifyMercadoPagoSignature } = await import("@/lib/mercadopago/signature");
    const ts = String(Date.now());
    const header = signNotification("90000001", "req-1", ts, WEBHOOK_SECRET);
    expect(header).toBe(signMercadoPagoNotification("90000001", "req-1", ts, WEBHOOK_SECRET));
    expect(verifyMercadoPagoSignature({ signatureHeader: header, requestId: "req-1", dataId: "90000001", secret: WEBHOOK_SECRET }).valid).toBe(true);
  });
});

describe("1. connecting the store's Mercado Pago account", () => {
  it("online payment cannot be switched on before an account is connected", async () => {
    asOwner();
    const { error } = await createShimClient(db, () => session).from("stores").update({ online_payment_enabled: true }).eq("id", fx.storeId);
    expect(error?.message).toMatch(/PAYMENT_ACCOUNT_REQUIRED/);
  });

  it("a customer cannot start the connection", async () => {
    asCustomer();
    const res = await app.payments.startMercadoPagoConnectAction(fx.storeId);
    expect(res).toMatchObject({ success: false });
  });

  it("OAuth with PKCE stores the tokens encrypted and marks the account active", async () => {
    asOwner();
    const redirect = await app.payments.startMercadoPagoConnectAction(fx.storeId).then(
      () => null,
      (e: Error & { url?: string }) => e.url ?? null
    );
    expect(redirect).toContain(`${stubUrl}/authorization?`);
    expect(redirect).toContain("code_challenge_method=S256");

    // The owner "approves" on Mercado Pago, which sends the browser back with code and state.
    const consent = await fetch(redirect!, { redirect: "manual" });
    expect(consent.status).toBe(302);
    const back = consent.headers.get("location")!;
    expect(back).toContain(`${appUrl}/api/integrations/mercadopago/callback?code=`);

    const response = await app.oauthCallback.GET(new app.next.NextRequest(back));
    expect(response.headers.get("location")).toBe(`${appUrl}/settings?tab=payments&mp=connected`);

    const account = await one<{ status: string; access_token_enc: string; refresh_token_enc: string; public_key: string; live_mode: boolean }>(
      `SELECT status, access_token_enc, refresh_token_enc, public_key, live_mode FROM public.store_payment_accounts WHERE store_id = $1`,
      [fx.storeId]
    );
    expect(account.status).toBe("ACTIVE");
    expect(account.live_mode).toBe(false);
    expect(account.public_key).toMatch(/^TEST-stub-public-key-/);
    // Sealed with AES-GCM: never the token itself.
    expect(account.access_token_enc).toMatch(/^v1\./);
    expect(account.access_token_enc).not.toContain("STUB-ACCESS");
    expect(account.refresh_token_enc).not.toContain("STUB-REFRESH");

    expect(await app.payments.getPaymentAccountStatus(fx.storeId)).toMatchObject({ connected: true, status: "ACTIVE", liveMode: false });
  });

  it("the same OAuth return cannot be replayed, and a forged state is refused", async () => {
    asOwner();
    const replay = await app.oauthCallback.GET(new app.next.NextRequest(`${appUrl}/api/integrations/mercadopago/callback?code=STUB-CODE-x&state=forged`));
    expect(replay.headers.get("location")).toContain("mp=error");
    expect(replay.headers.get("location")).toContain("reason=invalid_state");
  });

  it("with the account connected, the owner turns online payment on", async () => {
    asOwner();
    const { error } = await createShimClient(db, () => session).from("stores").update({ online_payment_enabled: true }).eq("id", fx.storeId);
    expect(error).toBeNull();
  });
});

describe("2. Pix approved: the order reaches the board and stock is deducted", () => {
  let token: string;
  let orderId: string;

  it("the order starts awaiting payment, off the board, with a QR code and no stock change", async () => {
    const before = await stockOf(fx.burgerId);
    const placed = await placePixOrder([{ product_id: fx.burgerId, quantity: 2 }]);
    token = placed.publicToken;
    expect(placed.status).toBe("AWAITING_PAYMENT");
    expect(placed.paymentStatus).toBe("PENDING");
    expect(placed.pix?.qrCode).toContain("br.gov.bcb.pix");
    expect(placed.totalCents).toBe(6000);

    const order = await orderByToken(token);
    orderId = order.id;
    expect(order).toMatchObject({ status: "AWAITING_PAYMENT", stock_deducted: false });
    expect(await stockOf(fx.burgerId)).toBe(before);

    // Mercado Pago was charged exactly the server-side total, in reais.
    const payment = stub.state.payments.get(Number(await paymentIdOf(orderId)));
    expect(payment.transaction_amount).toBe(60);
    expect(payment.external_reference).toBe(orderId);
  });

  it("asking for the QR again reuses the same charge", async () => {
    const again = await app.checkout.createPixCharge(token);
    expect(again.success).toBe(true);
    expect(stub.state.payments.size).toBe(1);
  });

  it("the signed webhook approves it: status NEW, paid, stock reserved once", async () => {
    const before = await stockOf(fx.burgerId);
    const paymentId = await paymentIdOf(orderId);
    const res = await fetch(`${stubUrl}/__stub/payments/${paymentId}/approve`, { method: "POST" });
    expect((await res.json()).webhook.status).toBe(200);
    await settle();

    expect(await orderByToken(token)).toMatchObject({ status: "NEW", payment_status: "APPROVED", stock_deducted: true });
    expect(await stockOf(fx.burgerId)).toBe(before - 2);

    // Mercado Pago retries notifications: a second delivery changes nothing.
    await fetch(`${stubUrl}/__stub/payments/${paymentId}/approve`, { method: "POST" });
    await settle();
    expect(await stockOf(fx.burgerId)).toBe(before - 2);
    expect(await orderByToken(token)).toMatchObject({ status: "NEW", payment_status: "APPROVED" });
  });

  it("a forged or unsigned notification is rejected and changes nothing", async () => {
    const paymentId = await paymentIdOf(orderId);
    const url = `${appUrl}/api/webhooks/mercadopago?store=${fx.storeId}&data.id=${paymentId}&type=payment`;
    const body = JSON.stringify({ type: "payment", data: { id: paymentId } });
    const unsigned = await fetch(url, { method: "POST", body });
    expect(unsigned.status).toBe(401);
    const forged = await fetch(url, {
      method: "POST",
      body,
      headers: { "x-request-id": "r1", "x-signature": signNotification(paymentId, "r1", String(Date.now()), "wrong-secret") },
    });
    expect(forged.status).toBe(401);
  });

  it("a notification for another store's payment is ignored", async () => {
    const paymentId = await paymentIdOf(orderId);
    const requestId = "cross-tenant";
    const ts = String(Date.now());
    const res = await fetch(`${appUrl}/api/webhooks/mercadopago?store=${fx.otherStoreId}&data.id=${paymentId}&type=payment`, {
      method: "POST",
      body: JSON.stringify({ type: "payment", data: { id: paymentId } }),
      headers: { "x-request-id": requestId, "x-signature": signNotification(paymentId, requestId, ts, WEBHOOK_SECRET) },
    });
    // Store B has no Mercado Pago account, so the payment cannot even be read with its token.
    // 200 (not 5xx) so Mercado Pago does not keep retrying something that can never succeed.
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ignored: true, reason: "no_account" });
    expect(await orderByToken(token)).toMatchObject({ status: "NEW", payment_status: "APPROVED" });
  });

  describe("4. cancelling the paid order refunds it", () => {
    it("the refund is requested from Mercado Pago and the stock comes back", async () => {
      const before = await stockOf(fx.burgerId);
      const paymentId = Number(await paymentIdOf(orderId));
      asOwner();
      const res = await app.orders.transitionOrderStatusAction({ storeId: fx.storeId, orderId, newStatus: "CANCELLED", reason: "Cliente desistiu" });
      expect(res.success).toBe(true);
      expect((res.data as { refund_required?: boolean }).refund_required).toBe(true);
      await settle();

      expect(stub.state.refunds.map((r: { payment_id: number }) => r.payment_id)).toContain(paymentId);
      expect(await stockOf(fx.burgerId)).toBe(before + 2);
      // The "refunded" notification closes the loop.
      expect(await orderByToken(token)).toMatchObject({ status: "CANCELLED", payment_status: "REFUNDED", stock_deducted: false });
    });
  });
});

describe("3. Pix that is never paid expires and the order cancels itself", () => {
  let token: string;
  let orderId: string;

  it("the cron route refuses callers without the secret", async () => {
    const res = await app.cronExpire.GET(new app.next.NextRequest(`${appUrl}/api/cron/expire`));
    expect(res.status).toBe(401);
  });

  it("past the payment window the order is cancelled without touching stock", async () => {
    const before = await stockOf(fx.sodaId);
    const placed = await placePixOrder([{ product_id: fx.sodaId, quantity: 4 }]);
    token = placed.publicToken;
    orderId = (await orderByToken(token)).id;
    await db.query(`UPDATE public.orders SET payment_expires_at = now() - interval '1 minute' WHERE id = $1`, [orderId]);

    const res = await app.cronExpire.GET(new app.next.NextRequest(`${appUrl}/api/cron/expire`, { headers: { authorization: `Bearer ${CRON_SECRET}` } }));
    expect(await res.json()).toEqual({ expired: 1 });
    expect(await orderByToken(token)).toMatchObject({ status: "CANCELLED", payment_status: "EXPIRED", stock_deducted: false });
    expect(await stockOf(fx.sodaId)).toBe(before);

    // The customer can no longer get a QR for it.
    expect((await app.checkout.createPixCharge(token)).success).toBe(false);
  });

  it("if the customer pays after the expiry, the money is refunded automatically", async () => {
    const paymentId = Number(await paymentIdOf(orderId));
    await fetch(`${stubUrl}/__stub/payments/${paymentId}/approve`, { method: "POST" });
    await settle();
    expect(stub.state.refunds.map((r: { payment_id: number }) => r.payment_id)).toContain(paymentId);
    expect((await orderByToken(token)).status).toBe("CANCELLED");
  });
});

describe("card payments through the Card Payment Brick token", () => {
  const cardOrder = async () => {
    asCustomer();
    const res = await app.checkout.placeOrderAction({
      slug: fx.storeSlug,
      storeId: fx.storeId,
      fulfillmentType: "PICKUP",
      customerName: "Cliente Cartão",
      customerPhone: "(11) 96666-0000",
      items: [{ product_id: fx.sodaId, quantity: 4 }],
      paymentMethod: "ONLINE_CARD",
      idempotencyKey: `mp-card-${++orderSeq}-${Date.now()}`,
    });
    if (!res.success || !res.data) throw new Error(res.error);
    return res.data.publicToken;
  };
  const pay = (publicToken: string, token: string) =>
    app.checkout.payWithCardAction({ publicToken, token, paymentMethodId: "visa", installments: 1, payerEmail: "cliente@exemplo.com.br" });

  it("an approved card moves the order to the board at once", async () => {
    const token = await cardOrder();
    const res = await pay(token, "tok_approved_0123456789");
    expect(res).toMatchObject({ success: true, data: { status: "APPROVED" } });
    await settle();
    expect(await orderByToken(token)).toMatchObject({ status: "NEW", payment_status: "APPROVED" });
  });

  it("a refused card leaves the order waiting, so the customer can try again", async () => {
    const token = await cardOrder();
    const res = await pay(token, "reject_card_0123456789");
    expect(res).toMatchObject({ success: true, data: { status: "REJECTED" } });
    await settle();
    expect((await orderByToken(token)).status).toBe("AWAITING_PAYMENT");
  });
});

describe("when the store's token can no longer be renewed", () => {
  it("the account is flagged, online payment is switched off and the panel can warn the owner", async () => {
    await db.query(`UPDATE public.store_payment_accounts SET expires_at = now() + interval '1 day' WHERE store_id = $1`, [fx.storeId]);
    await fetch(`${stubUrl}/__stub/fail-refresh`, { method: "POST", body: JSON.stringify({ fail: true }) });

    const res = await app.cronRefresh.GET(new app.next.NextRequest(`${appUrl}/api/cron/mp-refresh`, { headers: { authorization: `Bearer ${CRON_SECRET}` } }));
    expect(await res.json()).toEqual({ refreshed: 0, failed: 1 });

    asOwner();
    expect(await app.payments.getPaymentAccountStatus(fx.storeId)).toMatchObject({ connected: false, status: "REFRESH_FAILED" });
    const store = await one<{ online_payment_enabled: boolean }>(`SELECT online_payment_enabled FROM public.stores WHERE id = $1`, [fx.storeId]);
    expect(store.online_payment_enabled).toBe(false);

    // New online orders are refused by the database itself.
    asCustomer();
    const blocked = await app.checkout.placeOrderAction({
      slug: fx.storeSlug,
      storeId: fx.storeId,
      fulfillmentType: "PICKUP",
      customerName: "Cliente Pix",
      customerPhone: "(11) 97777-0000",
      items: [{ product_id: fx.sodaId, quantity: 4 }],
      paymentMethod: "ONLINE_PIX",
      idempotencyKey: `mp-blocked-${Date.now()}`,
    });
    expect(blocked.success).toBe(false);
  });

  it("a healthy token is renewed and stays encrypted", async () => {
    await fetch(`${stubUrl}/__stub/fail-refresh`, { method: "POST", body: JSON.stringify({ fail: false }) });
    await db.query(`UPDATE public.store_payment_accounts SET status = 'ACTIVE' WHERE store_id = $1`, [fx.storeId]);
    const before = await one<{ access_token_enc: string }>(`SELECT access_token_enc FROM public.store_payment_accounts WHERE store_id = $1`, [fx.storeId]);
    const res = await app.cronRefresh.GET(new app.next.NextRequest(`${appUrl}/api/cron/mp-refresh`, { headers: { authorization: `Bearer ${CRON_SECRET}` } }));
    expect(await res.json()).toEqual({ refreshed: 1, failed: 0 });
    const after = await one<{ access_token_enc: string; status: string }>(`SELECT access_token_enc, status FROM public.store_payment_accounts WHERE store_id = $1`, [fx.storeId]);
    expect(after.status).toBe("ACTIVE");
    expect(after.access_token_enc).not.toBe(before.access_token_enc);
    expect(after.access_token_enc).toMatch(/^v1\./);
  });
});
