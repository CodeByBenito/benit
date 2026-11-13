// Local stand-in for the Mercado Pago API. Development and tests only.
//
//   node scripts/mp-stub.mjs                 # http://localhost:4010
//   node scripts/mp-stub.mjs --port 4020 --secret my-webhook-secret
//
// Point the app at it in .env.local:
//   MP_API_BASE_URL=http://localhost:4010
//   MP_AUTH_BASE_URL=http://localhost:4010
//   MP_CLIENT_ID=stub-client   MP_CLIENT_SECRET=stub-secret
//   MP_WEBHOOK_SECRET=stub-webhook-secret   (the same value as --secret)
//
// What it imitates:
//   GET  /authorization              OAuth consent: redirects back with ?code=&state=
//   POST /oauth/token                authorization_code (with PKCE) and refresh_token
//   POST /v1/payments                Pix (pending, with QR) or card (approved / rejected)
//   GET  /v1/payments/:id
//   POST /v1/payments/:id/refunds
// and it calls the payment's notification_url with a signed webhook whenever a
// payment changes, exactly as Mercado Pago signs it (x-signature: ts=..,v1=..).
//
// Control endpoints (not part of Mercado Pago), to drive a scenario:
//   POST /__stub/payments/:id/approve | reject | expire
//   POST /__stub/fail-refresh        body: {"fail": true}   next token refreshes fail
//   GET  /__stub/state               payments, refunds and webhook deliveries
//   POST /__stub/reset
//
// Card tokens: "reject..." is refused, anything else is approved.

import { createHash, createHmac, randomBytes, randomUUID } from "node:crypto";
import http from "node:http";
import { pathToFileURL } from "node:url";

/**
 * Same manifest and HMAC as src/lib/mercadopago/signature.ts
 * (signMercadoPagoNotification); tests assert the two agree.
 */
export function signNotification(dataId, requestId, ts, secret) {
  const manifest = `id:${String(dataId).toLowerCase()};request-id:${requestId};ts:${ts};`;
  return `ts=${ts},v1=${createHmac("sha256", secret).update(manifest).digest("hex")}`;
}

const json = (res, status, body) => {
  const text = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(text) });
  res.end(text);
};

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

/**
 * @param {{ webhookSecret?: string, clientId?: string, clientSecret?: string, log?: (line: string) => void }} [options]
 */
export function createMercadoPagoStub(options = {}) {
  const webhookSecret = options.webhookSecret ?? "stub-webhook-secret";
  const log = options.log ?? (() => {});
  const state = {
    codes: new Map(), // code -> { challenge, redirectUri, used }
    accessTokens: new Map(), // token -> userId
    refreshTokens: new Map(), // token -> userId
    payments: new Map(), // id -> payment
    idempotency: new Map(), // key -> payment id
    refunds: [],
    webhooks: [],
    failRefresh: false,
    nextPaymentId: 90000001,
    nextUserId: 7000001,
  };
  const pending = new Set();

  function issueTokens(userId) {
    const access = `STUB-ACCESS-${randomBytes(12).toString("hex")}`;
    const refresh = `STUB-REFRESH-${randomBytes(12).toString("hex")}`;
    state.accessTokens.set(access, userId);
    state.refreshTokens.set(refresh, userId);
    return {
      access_token: access,
      refresh_token: refresh,
      public_key: `TEST-stub-public-key-${userId}`,
      user_id: userId,
      expires_in: 15552000,
      scope: "offline_access payments write",
      token_type: "Bearer",
      live_mode: false,
    };
  }

  const publicPayment = (p) => ({
    id: p.id,
    status: p.status,
    status_detail: p.status_detail,
    transaction_amount: p.transaction_amount,
    payment_type_id: p.payment_type_id,
    payment_method_id: p.payment_method_id,
    external_reference: p.external_reference,
    date_of_expiration: p.date_of_expiration ?? null,
    point_of_interaction: p.point_of_interaction,
  });

  /** Delivers the signed notification; resolves when the app has answered. */
  function notify(payment, action) {
    if (!payment.notification_url) return Promise.resolve(null);
    const url = new URL(payment.notification_url);
    url.searchParams.set("data.id", String(payment.id));
    url.searchParams.set("type", "payment");
    const requestId = randomUUID();
    const ts = String(Date.now());
    const delivery = { paymentId: payment.id, action, url: url.toString(), requestId, status: null, error: null };
    state.webhooks.push(delivery);
    const task = fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-request-id": requestId,
        "x-signature": signNotification(payment.id, requestId, ts, webhookSecret),
      },
      body: JSON.stringify({ action, type: "payment", data: { id: String(payment.id) }, live_mode: false }),
    })
      .then((res) => {
        delivery.status = res.status;
        log(`webhook ${action} #${payment.id} -> ${res.status}`);
        return delivery;
      })
      .catch((error) => {
        delivery.error = String(error?.message ?? error);
        log(`webhook ${action} #${payment.id} failed: ${delivery.error}`);
        return delivery;
      })
      .finally(() => pending.delete(task));
    pending.add(task);
    return task;
  }

  function authorize(req) {
    const header = req.headers.authorization ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : "";
    return state.accessTokens.has(token) ? state.accessTokens.get(token) : null;
  }

  async function handle(req, res) {
    const url = new URL(req.url ?? "/", "http://stub");
    const path = url.pathname;
    const method = req.method ?? "GET";

    // --- OAuth -------------------------------------------------------------
    if (method === "GET" && path === "/authorization") {
      const redirectUri = url.searchParams.get("redirect_uri");
      const challenge = url.searchParams.get("code_challenge");
      if (!redirectUri) return json(res, 400, { message: "redirect_uri is required" });
      if (options.clientId && url.searchParams.get("client_id") !== options.clientId) return json(res, 400, { message: "invalid client_id" });
      const code = `STUB-CODE-${randomBytes(9).toString("hex")}`;
      state.codes.set(code, { challenge, redirectUri, used: false });
      const back = new URL(redirectUri);
      back.searchParams.set("code", code);
      const oauthState = url.searchParams.get("state");
      if (oauthState) back.searchParams.set("state", oauthState);
      res.writeHead(302, { location: back.toString() });
      return res.end();
    }

    if (method === "POST" && path === "/oauth/token") {
      const body = await readJson(req);
      if (options.clientId && body.client_id !== options.clientId) return json(res, 401, { message: "invalid client_id", error: "invalid_client" });
      if (options.clientSecret && body.client_secret !== options.clientSecret) return json(res, 401, { message: "invalid client_secret", error: "invalid_client" });

      if (body.grant_type === "authorization_code") {
        const entry = state.codes.get(body.code);
        if (!entry || entry.used) return json(res, 400, { message: "invalid or used code", error: "invalid_grant" });
        if (entry.redirectUri !== body.redirect_uri) return json(res, 400, { message: "redirect_uri mismatch", error: "invalid_grant" });
        if (entry.challenge) {
          const expected = createHash("sha256").update(String(body.code_verifier ?? "")).digest("base64url");
          if (expected !== entry.challenge) return json(res, 400, { message: "PKCE verification failed", error: "invalid_grant" });
        }
        entry.used = true;
        return json(res, 200, issueTokens(state.nextUserId++));
      }

      if (body.grant_type === "refresh_token") {
        if (state.failRefresh) return json(res, 400, { message: "invalid refresh token", error: "invalid_grant" });
        const userId = state.refreshTokens.get(body.refresh_token);
        if (!userId) return json(res, 400, { message: "invalid refresh token", error: "invalid_grant" });
        state.refreshTokens.delete(body.refresh_token);
        return json(res, 200, issueTokens(userId));
      }
      return json(res, 400, { message: "unsupported grant_type", error: "unsupported_grant_type" });
    }

    // --- Payments ----------------------------------------------------------
    if (method === "POST" && path === "/v1/payments") {
      const userId = authorize(req);
      if (!userId) return json(res, 401, { message: "invalid access token" });
      const body = await readJson(req);
      const key = `${userId}:${req.headers["x-idempotency-key"] ?? randomUUID()}`;
      if (state.idempotency.has(key)) return json(res, 200, publicPayment(state.payments.get(state.idempotency.get(key))));
      if (!(Number(body.transaction_amount) > 0)) return json(res, 400, { message: "transaction_amount must be positive" });

      const id = state.nextPaymentId++;
      const isPix = body.payment_method_id === "pix";
      const rejected = !isPix && String(body.token ?? "").startsWith("reject");
      const payment = {
        id,
        collector_id: userId,
        status: isPix ? "pending" : rejected ? "rejected" : "approved",
        status_detail: isPix ? "pending_waiting_transfer" : rejected ? "cc_rejected_other_reason" : "accredited",
        transaction_amount: Number(body.transaction_amount),
        payment_type_id: isPix ? "bank_transfer" : "credit_card",
        payment_method_id: body.payment_method_id ?? "visa",
        external_reference: body.external_reference ?? null,
        notification_url: body.notification_url ?? null,
        date_of_expiration: body.date_of_expiration ?? null,
        point_of_interaction: isPix
          ? {
              transaction_data: {
                qr_code: `00020126580014br.gov.bcb.pix0136stub-${id}5204000053039865802BR5909BENIT STUB6009SAO PAULO62070503***6304ABCD`,
                qr_code_base64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
                ticket_url: `http://stub.local/pix/${id}`,
              },
            }
          : undefined,
      };
      state.payments.set(id, payment);
      state.idempotency.set(key, id);
      log(`payment #${id} created (${payment.status}) for order ${payment.external_reference}`);
      if (!isPix) notify(payment, "payment.created");
      return json(res, 201, publicPayment(payment));
    }

    const paymentMatch = path.match(/^\/v1\/payments\/(\d+)(\/refunds)?$/);
    if (paymentMatch) {
      const userId = authorize(req);
      if (!userId) return json(res, 401, { message: "invalid access token" });
      const payment = state.payments.get(Number(paymentMatch[1]));
      if (!payment || payment.collector_id !== userId) return json(res, 404, { message: "payment not found" });

      if (method === "GET" && !paymentMatch[2]) return json(res, 200, publicPayment(payment));

      if (method === "POST" && paymentMatch[2]) {
        if (payment.status !== "approved") return json(res, 400, { message: `cannot refund a payment that is ${payment.status}` });
        payment.status = "refunded";
        payment.status_detail = "refunded";
        const refund = { id: state.refunds.length + 1, payment_id: payment.id, amount: payment.transaction_amount, status: "approved", idempotencyKey: req.headers["x-idempotency-key"] ?? null };
        state.refunds.push(refund);
        log(`payment #${payment.id} refunded`);
        notify(payment, "payment.updated");
        return json(res, 201, { id: refund.id, status: refund.status, payment_id: payment.id, amount: refund.amount });
      }
    }

    // --- Control (stub only) -------------------------------------------------
    const control = path.match(/^\/__stub\/payments\/(\d+)\/(approve|reject|expire)$/);
    if (method === "POST" && control) {
      const payment = state.payments.get(Number(control[1]));
      if (!payment) return json(res, 404, { message: "payment not found" });
      const next = { approve: ["approved", "accredited"], reject: ["rejected", "cc_rejected_other_reason"], expire: ["cancelled", "expired"] }[control[2]];
      [payment.status, payment.status_detail] = next;
      const delivery = await notify(payment, "payment.updated");
      return json(res, 200, { payment: publicPayment(payment), webhook: delivery });
    }
    if (method === "POST" && path === "/__stub/fail-refresh") {
      const body = await readJson(req);
      state.failRefresh = body.fail !== false;
      return json(res, 200, { failRefresh: state.failRefresh });
    }
    if (method === "GET" && path === "/__stub/state") {
      return json(res, 200, { payments: [...state.payments.values()].map(publicPayment), refunds: state.refunds, webhooks: state.webhooks, failRefresh: state.failRefresh });
    }
    if (method === "POST" && path === "/__stub/reset") {
      for (const key of ["codes", "accessTokens", "refreshTokens", "payments", "idempotency"]) state[key].clear();
      state.refunds.length = 0;
      state.webhooks.length = 0;
      state.failRefresh = false;
      return json(res, 200, { reset: true });
    }

    return json(res, 404, { message: `stub: no route for ${method} ${path}` });
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((error) => json(res, 500, { message: String(error?.message ?? error) }));
  });

  return {
    state,
    /** Starts listening; port 0 picks a free one. Resolves to the base URL. */
    listen(port = 0, host = "127.0.0.1") {
      return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => {
          const address = server.address();
          resolve(`http://${host === "0.0.0.0" ? "localhost" : host}:${typeof address === "object" && address ? address.port : port}`);
        });
      });
    },
    /** Waits until every webhook already triggered has been answered. */
    async settle() {
      while (pending.size) await Promise.allSettled([...pending]);
    },
    close() {
      return new Promise((resolve) => server.close(() => resolve(undefined)));
    },
  };
}

// --- CLI -------------------------------------------------------------------
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const arg = (name, fallback) => {
    const i = process.argv.indexOf(`--${name}`);
    return i === -1 ? fallback : process.argv[i + 1];
  };
  const port = Number(arg("port", process.env.MP_STUB_PORT ?? "4010"));
  const webhookSecret = arg("secret", process.env.MP_WEBHOOK_SECRET ?? "stub-webhook-secret");
  const stub = createMercadoPagoStub({ webhookSecret, log: (line) => console.log(`[mp-stub] ${line}`) });
  const base = await stub.listen(port, "127.0.0.1");
  console.log(`[mp-stub] Mercado Pago stub em ${base}`);
  console.log(`[mp-stub] Aprovar um Pix:  curl -X POST ${base}/__stub/payments/<id>/approve`);
  console.log(`[mp-stub] Ver o estado:    curl ${base}/__stub/state`);
}
