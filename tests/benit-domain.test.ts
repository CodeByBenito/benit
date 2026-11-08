import { describe, expect, it } from "vitest";
import {
  buildWhatsAppUrl,
  formatCurrencyCents,
  formatPhoneBR,
  parsePriceToCents,
  slugify,
} from "@/lib/utils";
import {
  categorySchema,
  createOrderSchema,
  onboardingSchema,
  productSchema,
  stockAdjustmentSchema,
  transitionOrderStatusSchema,
} from "@/lib/validations";

describe("BENIT Financial & Minor Unit (Cents) Integrity", () => {
  it("parses Brazilian formatted currency strings into exact integer cents without float drift", () => {
    expect(parsePriceToCents("25,90")).toBe(2590);
    expect(parsePriceToCents("R$ 1.250,50")).toBe(125050);
    expect(parsePriceToCents("19.99")).toBe(1999);
    expect(parsePriceToCents(34.9)).toBe(3490);
    expect(parsePriceToCents("-10")).toBe(0);
  });

  it("formats integer cents into BRL string", () => {
    const formatted = formatCurrencyCents(3490);
    expect(formatted).toContain("34,90");
  });
});

describe("BENIT Slug, Phone & WhatsApp Customer Helpers", () => {
  it("normalizes store names into clean slugs", () => {
    expect(slugify("Benit Burger & Café São Paulo!")).toBe(
      "benit-burger-cafe-sao-paulo"
    );
  });

  it("formats 11-digit BR mobile phones and builds WhatsApp URLs", () => {
    expect(formatPhoneBR("11988887777")).toBe("(11) 98888-7777");
    const waUrl = buildWhatsAppUrl("(11) 98888-7777", "Olá pedido #12");
    expect(waUrl).toBe(
      "https://wa.me/5511988887777?text=Ol%C3%A1%20pedido%20%2312"
    );
  });
});

describe("BENIT Multi-Tenant & Operational Schema Validations", () => {
  const validStoreId = "11111111-2222-4333-8444-555555555555";
  const validProductId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

  it("validates onboarding payloads and enforces URL-safe slugs", () => {
    const valid = onboardingSchema.safeParse({
      organizationName: "Grupo Benit",
      storeName: "Benit Smash Burger",
      storeSlug: "benit-smash-burger",
      phone: "11999998888",
    });
    expect(valid.success).toBe(true);

    const invalidSlug = onboardingSchema.safeParse({
      organizationName: "Grupo Benit",
      storeName: "Benit Smash",
      storeSlug: "Slug Com Espaco!",
      phone: "11999998888",
    });
    expect(invalidSlug.success).toBe(false);
  });

  it("validates categories and products with stock thresholds and option groups", () => {
    const cat = categorySchema.safeParse({
      storeId: validStoreId,
      name: "Hambúrgueres Artesanais",
      sortOrder: 10,
      isActive: true,
    });
    expect(cat.success).toBe(true);

    const prod = productSchema.safeParse({
      storeId: validStoreId,
      name: "Classic Burger",
      priceCents: 2990,
      isAvailable: true,
      trackStock: true,
      stockQuantity: 25,
      lowStockThreshold: 5,
      optionGroups: [
        {
          name: "Adicionais",
          minSelect: 0,
          maxSelect: 2,
          isRequired: false,
          options: [{ name: "Bacon Extra", priceCents: 600, isAvailable: true }],
        },
      ],
    });
    expect(prod.success).toBe(true);
  });

  it("prevents negative prices or negative stock quantities", () => {
    const badProd = productSchema.safeParse({
      storeId: validStoreId,
      name: "Invalid Burger",
      priceCents: -100,
      stockQuantity: -5,
    });
    expect(badProd.success).toBe(false);
  });

  it("validates digital and manual order creation payloads", () => {
    const digitalOrder = createOrderSchema.safeParse({
      storeId: validStoreId,
      source: "DIGITAL_MENU",
      fulfillmentType: "DELIVERY",
      customerName: "Robson Almeida",
      customerPhone: "11977776666",
      tableOrReference: "Rua Augusta, 500",
      items: [
        {
          product_id: validProductId,
          quantity: 2,
          option_ids: [],
          notes: "Sem picles",
        },
      ],
    });
    expect(digitalOrder.success).toBe(true);

    const manualConfirmedOrder = createOrderSchema.safeParse({
      storeId: validStoreId,
      source: "MANUAL",
      fulfillmentType: "DINE_IN",
      customerName: "Mesa 04",
      customerPhone: "11900000000",
      tableOrReference: "MESA 04",
      initialStatus: "CONFIRMED",
      items: [
        {
          product_id: validProductId,
          quantity: 1,
        },
      ],
    });
    expect(manualConfirmedOrder.success).toBe(true);
  });

  it("validates stock adjustments and order status transitions", () => {
    const stockAdj = stockAdjustmentSchema.safeParse({
      storeId: validStoreId,
      productId: validProductId,
      movementType: "ENTRY",
      quantity: 15,
      reason: "Reposição diária",
    });
    expect(stockAdj.success).toBe(true);

    const transition = transitionOrderStatusSchema.safeParse({
      storeId: validStoreId,
      orderId: validProductId,
      newStatus: "CONFIRMED",
    });
    expect(transition.success).toBe(true);
  });
});

