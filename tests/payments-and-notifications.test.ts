import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { open, seal } from "@/lib/crypto/secretbox";
import { signMercadoPagoNotification, verifyMercadoPagoSignature } from "@/lib/mercadopago/signature";
import { mapMercadoPagoMethod, mapMercadoPagoStatus, reaisToCents, centsToReais } from "@/lib/mercadopago/status-map";
import { buildCustomerStatusMessage, buildWhatsAppLink, trackingUrl } from "@/lib/notifications/whatsapp-templates";
import { checkoutSchema, checkoutSettingsSchema, couponSchema, businessHoursSchema } from "@/lib/validations";

describe("Mercado Pago webhook signature", () => {
  const secret = "whsec_test";
  const ts = String(Math.floor(Date.now() / 1000));

  it("accepts a correctly signed notification", () => {
    const header = signMercadoPagoNotification("123456", "req-1", ts, secret);
    expect(verifyMercadoPagoSignature({ signatureHeader: header, requestId: "req-1", dataId: "123456", secret }).valid).toBe(true);
  });

  it("rejects tampered data id, wrong secret, missing header and stale timestamps", () => {
    const header = signMercadoPagoNotification("123456", "req-1", ts, secret);
    expect(verifyMercadoPagoSignature({ signatureHeader: header, requestId: "req-1", dataId: "999", secret }).valid).toBe(false);
    expect(verifyMercadoPagoSignature({ signatureHeader: header, requestId: "req-1", dataId: "123456", secret: "other" }).valid).toBe(false);
    expect(verifyMercadoPagoSignature({ signatureHeader: null, requestId: "req-1", dataId: "123456", secret }).valid).toBe(false);
    const old = String(Math.floor(Date.now() / 1000) - 3600);
    const oldHeader = signMercadoPagoNotification("123456", "req-1", old, secret);
    expect(verifyMercadoPagoSignature({ signatureHeader: oldHeader, requestId: "req-1", dataId: "123456", secret }).reason).toBe("stale timestamp");
  });

  it("does not throw on malformed v1 values", () => {
    expect(verifyMercadoPagoSignature({ signatureHeader: `ts=${ts},v1=zz`, requestId: "r", dataId: "1", secret }).valid).toBe(false);
  });
});

describe("token encryption at rest", () => {
  const key = randomBytes(32).toString("base64");

  it("round-trips and produces different ciphertexts each time", () => {
    const a = seal("APP_USR-secret-token", key);
    const b = seal("APP_USR-secret-token", key);
    expect(a).not.toBe(b);
    expect(open(a, key)).toBe("APP_USR-secret-token");
  });

  it("detects tampering and wrong keys", () => {
    const sealed = seal("token", key);
    const parts = sealed.split(".");
    parts[3] = Buffer.from("other").toString("base64url");
    expect(() => open(parts.join("."), key)).toThrow();
    expect(() => open(sealed, randomBytes(32).toString("base64"))).toThrow();
    expect(() => seal("x", Buffer.from("short").toString("base64"))).toThrow(/32 bytes/);
  });
});

describe("payment status mapping", () => {
  it("maps MP statuses conservatively", () => {
    expect(mapMercadoPagoStatus("approved")).toBe("APPROVED");
    expect(mapMercadoPagoStatus("in_process")).toBe("PENDING");
    expect(mapMercadoPagoStatus("rejected")).toBe("REJECTED");
    expect(mapMercadoPagoStatus("charged_back")).toBe("REFUNDED");
    expect(mapMercadoPagoStatus(undefined)).toBe("PENDING");
    expect(mapMercadoPagoMethod("bank_transfer")).toBe("ONLINE_PIX");
    expect(mapMercadoPagoMethod("credit_card")).toBe("ONLINE_CARD");
  });

  it("converts money without float drift", () => {
    expect(reaisToCents(19.99)).toBe(1999);
    expect(reaisToCents(0.1 + 0.2)).toBe(30);
    expect(centsToReais(4250)).toBe(42.5);
  });
});

describe("WhatsApp customer messages", () => {
  const base = {
    storeName: "Smash da Vila",
    customerName: "Ana Paula Souza",
    orderNumber: 412,
    fulfillmentType: "DELIVERY" as const,
    trackingUrl: trackingUrl("https://app.benit.com.br/", "a".repeat(64)),
  };

  it("writes a specific message per status with the tracking link", () => {
    const confirmed = buildCustomerStatusMessage({ ...base, status: "CONFIRMED", etaMinutes: 35 })!;
    expect(confirmed).toContain("Ana,");
    expect(confirmed).toContain("#412");
    expect(confirmed).toContain("~35 min");
    expect(confirmed).toContain("https://app.benit.com.br/pedido/");
    expect(buildCustomerStatusMessage({ ...base, status: "READY", fulfillmentType: "PICKUP" })).toContain("retirada");
    expect(buildCustomerStatusMessage({ ...base, status: "AWAITING_PAYMENT" })).toBeNull();
  });

  it("builds wa.me links defaulting to Brazil and encoding text", () => {
    const link = buildWhatsAppLink("(11) 98888-7777", "Oi & tchau");
    expect(link).toBe("https://wa.me/5511988887777?text=Oi%20%26%20tchau");
    expect(buildWhatsAppLink("+55 11 98888-7777", "x")).toContain("wa.me/5511988887777");
  });
});

describe("checkout validation", () => {
  const valid = {
    slug: "loja-a",
    storeId: "6f9619ff-8b86-4d11-b42d-00c04fc964ff",
    fulfillmentType: "DELIVERY",
    customerName: "Ana",
    customerPhone: "(11) 98888-7777",
    items: [{ product_id: "6f9619ff-8b86-4d11-b42d-00c04fc964ff", quantity: 1 }],
    paymentMethod: "ONLINE_PIX",
    delivery: { street: "Rua A", number: "10", neighborhood: "Centro" },
    couponCode: " bemvindo10 ",
    idempotencyKey: "checkout-abc-123",
  };

  it("normalizes coupon codes and accepts a full delivery checkout", () => {
    const r = checkoutSchema.safeParse(valid);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.couponCode).toBe("BEMVINDO10");
  });

  it("requires an address for delivery and a table for dine-in", () => {
    expect(checkoutSchema.safeParse({ ...valid, delivery: undefined }).success).toBe(false);
    expect(checkoutSchema.safeParse({ ...valid, fulfillmentType: "DINE_IN", delivery: undefined }).success).toBe(false);
    expect(checkoutSchema.safeParse({ ...valid, fulfillmentType: "DINE_IN", tableOrReference: "12" }).success).toBe(true);
  });

  it("rejects short phones", () => {
    expect(checkoutSchema.safeParse({ ...valid, customerPhone: "98888" }).success).toBe(false);
  });
});

describe("settings validation", () => {
  const storeId = "6f9619ff-8b86-4d11-b42d-00c04fc964ff";

  it("requires a Pix key when Pix on delivery is enabled", () => {
    const base = {
      storeId,
      minOrderCents: 0,
      defaultEtaMinutes: 40,
      acceptsDelivery: true,
      acceptsPickup: true,
      acceptsDineIn: false,
      offlineMethods: ["PIX_MANUAL"],
      onlinePaymentEnabled: false,
      paymentWindowMinutes: 15,
      notifyOwnerEmail: true,
    };
    expect(checkoutSettingsSchema.safeParse(base).success).toBe(false);
    expect(checkoutSettingsSchema.safeParse({ ...base, pixKey: "pix@loja.com" }).success).toBe(true);
  });

  it("caps percent coupons at 100 and validates date windows", () => {
    expect(couponSchema.safeParse({ storeId, code: "metade", kind: "PERCENT", value: 150 }).success).toBe(false);
    const ok = couponSchema.safeParse({ storeId, code: "metade", kind: "PERCENT", value: 50 });
    expect(ok.success && ok.data.code).toBe("METADE");
    expect(
      couponSchema.safeParse({
        storeId,
        code: "NATAL",
        kind: "FIXED",
        value: 500,
        startsAt: "2026-12-25T00:00:00-03:00",
        endsAt: "2026-12-24T00:00:00-03:00",
      }).success
    ).toBe(false);
  });

  it("validates HH:MM business hours", () => {
    expect(businessHoursSchema.safeParse({ storeId, slots: [{ weekday: 1, opensAt: "18:00", closesAt: "02:00" }] }).success).toBe(true);
    expect(businessHoursSchema.safeParse({ storeId, slots: [{ weekday: 1, opensAt: "25:00", closesAt: "02:00" }] }).success).toBe(false);
  });
});
