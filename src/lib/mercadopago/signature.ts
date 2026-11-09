import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Validates Mercado Pago's `x-signature` header.
 * Header format: "ts=<unix seconds|ms>,v1=<hex hmac>".
 * Manifest:      "id:<data.id>;request-id:<x-request-id>;ts:<ts>;"
 * (parts are omitted when absent, per MP docs; data.id lowercased when alphanumeric).
 */
export function verifyMercadoPagoSignature(input: {
  signatureHeader: string | null;
  requestId: string | null;
  dataId: string | null;
  secret: string;
  nowMs?: number;
  toleranceSeconds?: number;
}): { valid: boolean; reason?: string } {
  const { signatureHeader, requestId, dataId, secret } = input;
  if (!signatureHeader) return { valid: false, reason: "missing x-signature" };

  const parts = Object.fromEntries(
    signatureHeader.split(",").map((kv) => {
      const [k, ...rest] = kv.trim().split("=");
      return [k, rest.join("=")];
    })
  );
  const ts = parts.ts;
  const v1 = parts.v1;
  if (!ts || !v1) return { valid: false, reason: "malformed x-signature" };

  const tolerance = input.toleranceSeconds ?? 10 * 60;
  const tsMs = ts.length > 11 ? Number(ts) : Number(ts) * 1000;
  const now = input.nowMs ?? Date.now();
  if (!Number.isFinite(tsMs) || Math.abs(now - tsMs) > tolerance * 1000) {
    return { valid: false, reason: "stale timestamp" };
  }

  let manifest = "";
  if (dataId) manifest += `id:${/^[a-z0-9]+$/i.test(dataId) ? dataId.toLowerCase() : dataId};`;
  if (requestId) manifest += `request-id:${requestId};`;
  manifest += `ts:${ts};`;

  const expected = createHmac("sha256", secret).update(manifest).digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(v1, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { valid: false, reason: "signature mismatch" };
  }
  return { valid: true };
}

/** Helper for tests and the local MP stub. */
export function signMercadoPagoNotification(dataId: string, requestId: string, ts: string, secret: string): string {
  const manifest = `id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`;
  return `ts=${ts},v1=${createHmac("sha256", secret).update(manifest).digest("hex")}`;
}
