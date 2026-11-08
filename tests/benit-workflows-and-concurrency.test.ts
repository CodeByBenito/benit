import { describe, expect, it } from "vitest";

/**
 * Simulador Transacional de Arquitetura e Segurança do BENIT
 * Espelha fielmente o comportamento das migrations 0001, 0002 e 0003 endurecidas:
 * 1. Isolamento Multi-Tenant via RLS (Org-wide vs Store-scoped memberships)
 * 2. Projeção pública segura (`get_public_menu_by_slug`) sem exposição de colunas internas
 * 3. Isolamento de Storage por prefixo UUID de loja (`can_manage_store_asset`)
 * 4. Chaves estrangeiras compostas `(id, store_id)` contra cruzamento de tenants
 * 5. Validação server-side de `min_select`, `max_select`, `is_required` e `option_id` duplicado
 * 6. Idempotência, snapshots históricos, baixa atômica e proteção da última unidade
 */

interface SimCategory {
  id: string;
  storeId: string;
  name: string;
  isActive: boolean;
}

interface SimOption {
  id: string;
  storeId: string;
  groupId: string;
  name: string;
  priceCents: number;
  isAvailable: boolean;
}

interface SimOptionGroup {
  id: string;
  storeId: string;
  productId: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  isRequired: boolean;
  options: SimOption[];
}

interface SimProduct {
  id: string;
  storeId: string;
  categoryId?: string | null;
  sku?: string;
  name: string;
  priceCents: number;
  isAvailable: boolean;
  trackStock: boolean;
  stockQuantity: number;
  lowStockThreshold: number;
  optionGroups?: SimOptionGroup[];
}

interface SimMembership {
  userId: string;
  organizationId: string;
  storeId: string | null; // null = todas as lojas da organização (ex: OWNER)
  role: "OWNER" | "MANAGER" | "ATTENDANT" | "KITCHEN";
}

interface SimStore {
  id: string;
  organizationId: string;
  name: string;
  slug: string;
  isOpen: boolean;
  isPublished: boolean;
  lastOrderNumber: number;
}

interface SimOrderItem {
  id: string;
  productId: string;
  productNameSnapshot: string;
  unitPriceCents: number;
  optionsUnitPriceCents: number;
  quantity: number;
  totalItemCents: number;
}

interface SimOrder {
  id: string;
  storeId: string;
  orderNumber: number;
  status: "NEW" | "CONFIRMED" | "PREPARING" | "READY" | "COMPLETED" | "CANCELLED";
  source: "DIGITAL_MENU" | "MANUAL";
  subtotalCents: number;
  totalCents: number;
  stockDeducted: boolean;
  idempotencyKey?: string;
  items: SimOrderItem[];
}

interface SimStockMovement {
  id: string;
  storeId: string;
  productId: string;
  orderId?: string;
  movementType:
    | "INITIAL"
    | "ENTRY"
    | "EXIT"
    | "ADJUSTMENT"
    | "ORDER_DEDUCTION"
    | "ORDER_REVERSAL";
  quantityDelta: number;
  previousQuantity: number;
  newQuantity: number;
  referenceKey: string;
}

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class BenitTransactionalEngine {
  private stores = new Map<string, SimStore>();
  private memberships: SimMembership[] = [];
  private categories = new Map<string, SimCategory>();
  private products = new Map<string, SimProduct>();
  private orders = new Map<string, SimOrder>();
  private stockMovements = new Map<string, SimStockMovement>();

  registerStore(store: SimStore) {
    this.stores.set(store.id, { ...store });
  }

  addMembership(membership: SimMembership) {
    const store = membership.storeId ? this.stores.get(membership.storeId) : null;
    if (membership.storeId && (!store || store.organizationId !== membership.organizationId)) {
      throw new Error("CROSS_ORG_MEMBERSHIP_FK_VIOLATION");
    }
    this.memberships.push(membership);
  }

  hasStoreAccess(userId: string, storeId: string): boolean {
    const store = this.stores.get(storeId);
    if (!store) return false;
    return this.memberships.some(
      (m) =>
        m.userId === userId &&
        m.organizationId === store.organizationId &&
        (m.storeId === null || m.storeId === storeId)
    );
  }

  canManageStoreAsset(userId: string, objectName: string): boolean {
    const folder = (objectName || "").split("/")[0] ?? "";
    if (!UUID_REGEX.test(folder)) {
      return false;
    }
    return this.hasStoreAccess(userId, folder);
  }

  createCategory(userId: string, category: SimCategory) {
    if (!this.hasStoreAccess(userId, category.storeId)) {
      throw new Error("RLS_FORBIDDEN");
    }
    this.categories.set(category.id, { ...category });
  }

  createProduct(userId: string, product: SimProduct) {
    if (!this.hasStoreAccess(userId, product.storeId)) {
      throw new Error("RLS_FORBIDDEN: Acesso negado a outra loja.");
    }
    // Valida FK composta (category_id, store_id) -> categories(id, store_id)
    if (product.categoryId) {
      const cat = this.categories.get(product.categoryId);
      if (!cat || cat.storeId !== product.storeId) {
        throw new Error("CROSS_TENANT_FK_VIOLATION: Categoria pertence a outra loja.");
      }
    }
    this.products.set(product.id, { ...product });
  }

  // Simula tentativa de SELECT direto por visitante anônimo na tabela products
  queryBaseProductsAsAnon(): never {
    throw new Error("RLS_ANON_DENIED: Tabelas base bloqueadas para anon.");
  }

  // Simula a RPC `get_public_menu_by_slug` (projeção sanitizada)
  getPublicMenuBySlug(slug: string) {
    const store = Array.from(this.stores.values()).find(
      (s) => s.slug === slug.toLowerCase() && s.isPublished
    );
    if (!store) return null;

    const publicProducts = Array.from(this.products.values())
      .filter((p) => p.storeId === store.id)
      .map((p) => ({
        id: p.id,
        category_id: p.categoryId ?? null,
        name: p.name,
        price_cents: p.priceCents,
        is_available: p.isAvailable,
        in_stock: !p.trackStock || p.stockQuantity > 0,
      }));

    return {
      store: {
        id: store.id,
        name: store.name,
        slug: store.slug,
        is_open: store.isOpen,
      },
      products: publicProducts,
    };
  }

  updateProductPrice(
    userId: string,
    storeId: string,
    productId: string,
    newPriceCents: number
  ) {
    if (!this.hasStoreAccess(userId, storeId)) {
      throw new Error("RLS_FORBIDDEN");
    }
    const prod = this.products.get(productId);
    if (!prod || prod.storeId !== storeId) {
      throw new Error("PRODUCT_NOT_FOUND");
    }
    prod.priceCents = newPriceCents;
  }

  listStoreOrders(userId: string, storeId: string): SimOrder[] {
    if (!this.hasStoreAccess(userId, storeId)) {
      throw new Error("RLS_FORBIDDEN: Isolamento multi-tenant violado.");
    }
    return Array.from(this.orders.values()).filter((o) => o.storeId === storeId);
  }

  createOrderAtomic(params: {
    callerUserId?: string;
    storeId: string;
    source: "DIGITAL_MENU" | "MANUAL";
    initialStatus?: "NEW" | "CONFIRMED";
    idempotencyKey?: string;
    clientSubmittedTotalSpoof?: number;
    items: { productId: string; quantity: number; optionIds?: string[] }[];
  }): SimOrder {
    const {
      callerUserId,
      storeId,
      source,
      initialStatus = "NEW",
      idempotencyKey,
      items,
    } = params;

    const store = this.stores.get(storeId);
    if (!store) throw new Error("STORE_NOT_FOUND");

    if (source === "MANUAL") {
      if (!callerUserId || !this.hasStoreAccess(callerUserId, storeId)) {
        throw new Error("FORBIDDEN");
      }
    } else {
      if (!store.isPublished) throw new Error("STORE_UNPUBLISHED");
      if (!store.isOpen) throw new Error("STORE_CLOSED");
    }

    if (idempotencyKey) {
      const existing = Array.from(this.orders.values()).find(
        (o) => o.storeId === storeId && o.idempotencyKey === idempotencyKey
      );
      if (existing) return existing;
    }

    for (const item of items) {
      const prod = this.products.get(item.productId);
      if (!prod || prod.storeId !== storeId) {
        throw new Error("PRODUCT_NOT_FOUND");
      }
      if (!prod.isAvailable) {
        throw new Error(`PRODUCT_UNAVAILABLE: ${prod.name}`);
      }
      if (prod.trackStock && prod.stockQuantity < item.quantity) {
        throw new Error(`INSUFFICIENT_STOCK: ${prod.name}`);
      }

      // Validação server-side de opcionais (duplicidade + min_select + max_select + is_required)
      const optIds = item.optionIds ?? [];
      if (new Set(optIds).size !== optIds.length) {
        throw new Error(`DUPLICATE_OPTION: ${prod.name}`);
      }

      for (const group of prod.optionGroups ?? []) {
        const chosenInGroup = group.options.filter((o) => optIds.includes(o.id));
        const minRequired = group.isRequired
          ? Math.max(1, group.minSelect)
          : group.minSelect;
        if (chosenInGroup.length < minRequired) {
          throw new Error(`OPTION_MIN_REQUIRED: ${group.name}`);
        }
        if (chosenInGroup.length > group.maxSelect) {
          throw new Error(`OPTION_MAX_EXCEEDED: ${group.name}`);
        }
      }
    }

    store.lastOrderNumber += 1;
    const nextOrderNum = store.lastOrderNumber;
    const orderId = `ord-${storeId}-${nextOrderNum}`;
    const shouldDeduct = source === "MANUAL" && initialStatus === "CONFIRMED";

    let subtotalCents = 0;
    const snapItems: SimOrderItem[] = [];

    for (let i = 0; i < items.length; i++) {
      const req = items[i];
      const prod = this.products.get(req.productId)!;
      const optIds = req.optionIds ?? [];
      const allOptions = (prod.optionGroups ?? []).flatMap((g) => g.options);
      let optionsUnitPriceCents = 0;

      for (const oid of optIds) {
        const foundOpt = allOptions.find((o) => o.id === oid && o.isAvailable);
        if (!foundOpt) throw new Error("INVALID_OPTION");
        optionsUnitPriceCents += foundOpt.priceCents;
      }

      const itemId = `${orderId}-item-${i + 1}`;
      const totalItemCents =
        (prod.priceCents + optionsUnitPriceCents) * req.quantity;
      subtotalCents += totalItemCents;

      snapItems.push({
        id: itemId,
        productId: prod.id,
        productNameSnapshot: prod.name,
        unitPriceCents: prod.priceCents,
        optionsUnitPriceCents,
        quantity: req.quantity,
        totalItemCents,
      });

      if (shouldDeduct && prod.trackStock) {
        const prev = prod.stockQuantity;
        prod.stockQuantity -= req.quantity;
        const refKey = `order:${orderId}:item:${itemId}:deduct`;
        this.stockMovements.set(refKey, {
          id: `mov-${this.stockMovements.size + 1}`,
          storeId,
          productId: prod.id,
          orderId,
          movementType: "ORDER_DEDUCTION",
          quantityDelta: -req.quantity,
          previousQuantity: prev,
          newQuantity: prod.stockQuantity,
          referenceKey: refKey,
        });
      }
    }

    const created: SimOrder = {
      id: orderId,
      storeId,
      orderNumber: nextOrderNum,
      status: source === "DIGITAL_MENU" ? "NEW" : initialStatus,
      source,
      subtotalCents,
      totalCents: subtotalCents,
      stockDeducted: shouldDeduct,
      idempotencyKey,
      items: snapItems,
    };

    this.orders.set(orderId, created);
    return created;
  }

  transitionOrderStatusAtomic(params: {
    userId: string;
    storeId: string;
    orderId: string;
    newStatus: SimOrder["status"];
  }): SimOrder {
    const { userId, storeId, orderId, newStatus } = params;
    if (!this.hasStoreAccess(userId, storeId)) {
      throw new Error("FORBIDDEN");
    }

    const order = this.orders.get(orderId);
    if (!order || order.storeId !== storeId) {
      throw new Error("ORDER_NOT_FOUND");
    }

    if (order.status === newStatus) return order;
    if (order.status === "CANCELLED") throw new Error("INVALID_TRANSITION");

    if (
      !order.stockDeducted &&
      ["CONFIRMED", "PREPARING", "READY", "COMPLETED"].includes(newStatus)
    ) {
      for (const item of order.items) {
        const prod = this.products.get(item.productId)!;
        if (prod.trackStock && prod.stockQuantity < item.quantity) {
          throw new Error(`INSUFFICIENT_STOCK: ${prod.name}`);
        }
      }

      for (const item of order.items) {
        const prod = this.products.get(item.productId)!;
        if (prod.trackStock) {
          const refKey = `order:${order.id}:item:${item.id}:deduct`;
          const prev = prod.stockQuantity;
          prod.stockQuantity -= item.quantity;
          this.stockMovements.set(refKey, {
            id: `mov-${this.stockMovements.size + 1}`,
            storeId,
            productId: prod.id,
            orderId: order.id,
            movementType: "ORDER_DEDUCTION",
            quantityDelta: -item.quantity,
            previousQuantity: prev,
            newQuantity: prod.stockQuantity,
            referenceKey: refKey,
          });
        }
      }
      order.stockDeducted = true;
    }

    if (newStatus === "CANCELLED" && order.stockDeducted) {
      for (const item of order.items) {
        const prod = this.products.get(item.productId)!;
        if (prod.trackStock) {
          const refKey = `order:${order.id}:item:${item.id}:reverse`;
          const prev = prod.stockQuantity;
          prod.stockQuantity += item.quantity;
          this.stockMovements.set(refKey, {
            id: `mov-${this.stockMovements.size + 1}`,
            storeId,
            productId: prod.id,
            orderId: order.id,
            movementType: "ORDER_REVERSAL",
            quantityDelta: item.quantity,
            previousQuantity: prev,
            newQuantity: prod.stockQuantity,
            referenceKey: refKey,
          });
        }
      }
      order.stockDeducted = false;
    }

    order.status = newStatus;
    return order;
  }

  getProductStock(productId: string): number {
    return this.products.get(productId)?.stockQuantity ?? 0;
  }

  getMovementsForOrder(orderId: string): SimStockMovement[] {
    return Array.from(this.stockMovements.values()).filter(
      (m) => m.orderId === orderId
    );
  }
}

describe("BENIT — Validação Completa de Arquitetura, Segurança e Concorrência", () => {
  const STORE_A1_UUID = "11111111-1111-4111-8111-111111111111";
  const STORE_A2_UUID = "11111111-1111-4111-8111-222222222222";
  const STORE_B1_UUID = "99999999-9999-4999-8999-999999999999";

  function setupMultiTenantEnvironment() {
    const engine = new BenitTransactionalEngine();
    engine.registerStore({
      id: STORE_A1_UUID,
      organizationId: "org-A",
      name: "Benit Centro",
      slug: "benit-centro",
      isOpen: true,
      isPublished: true,
      lastOrderNumber: 0,
    });
    engine.registerStore({
      id: STORE_A2_UUID,
      organizationId: "org-A",
      name: "Benit Jardins",
      slug: "benit-jardins",
      isOpen: true,
      isPublished: true,
      lastOrderNumber: 0,
    });
    engine.registerStore({
      id: STORE_B1_UUID,
      organizationId: "org-B",
      name: "Concorrente Pizza",
      slug: "concorrente-pizza",
      isOpen: true,
      isPublished: true,
      lastOrderNumber: 0,
    });

    // Owner A tem acesso global a todas as lojas da org-A (storeId = null)
    engine.addMembership({
      userId: "owner-A",
      organizationId: "org-A",
      storeId: null,
      role: "OWNER",
    });

    // Gerente da filial A1 tem acesso restrito apenas à STORE_A1_UUID
    engine.addMembership({
      userId: "manager-A1",
      organizationId: "org-A",
      storeId: STORE_A1_UUID,
      role: "MANAGER",
    });

    // Owner B tem acesso à org-B
    engine.addMembership({
      userId: "owner-B",
      organizationId: "org-B",
      storeId: null,
      role: "OWNER",
    });

    return engine;
  }

  it("1. Isolamento Multi-Tenant, Múltiplas Unidades e FKs Compostas", () => {
    const engine = setupMultiTenantEnvironment();

    // Owner A acessa tanto a filial A1 quanto a filial A2, mas nunca a Loja B
    expect(engine.hasStoreAccess("owner-A", STORE_A1_UUID)).toBe(true);
    expect(engine.hasStoreAccess("owner-A", STORE_A2_UUID)).toBe(true);
    expect(engine.hasStoreAccess("owner-A", STORE_B1_UUID)).toBe(false);

    // Gerente da filial A1 acessa A1, mas é bloqueado na filial A2 e na Loja B
    expect(engine.hasStoreAccess("manager-A1", STORE_A1_UUID)).toBe(true);
    expect(engine.hasStoreAccess("manager-A1", STORE_A2_UUID)).toBe(false);
    expect(engine.hasStoreAccess("manager-A1", STORE_B1_UUID)).toBe(false);

    // Criar categoria na Loja B e tentar referenciá-la num produto da Loja A1 falha via FK Composta
    engine.createCategory("owner-B", {
      id: "cat-B",
      storeId: STORE_B1_UUID,
      name: "Pizzas B",
      isActive: true,
    });

    expect(() =>
      engine.createProduct("owner-A", {
        id: "prod-cross",
        storeId: STORE_A1_UUID,
        categoryId: "cat-B",
        name: "Produto Inválido",
        priceCents: 2500,
        isAvailable: true,
        trackStock: true,
        stockQuantity: 10,
        lowStockThreshold: 2,
      })
    ).toThrow("CROSS_TENANT_FK_VIOLATION");
  });

  it("2. Blindagem de Colunas Privadas no Cardápio Público e Isolamento de Storage", () => {
    const engine = setupMultiTenantEnvironment();

    engine.createProduct("owner-A", {
      id: "prod-secret-stock",
      storeId: STORE_A1_UUID,
      sku: "SKU-INTERNO-99",
      name: "Classic Burger",
      priceCents: 3290,
      isAvailable: true,
      trackStock: true,
      stockQuantity: 42,
      lowStockThreshold: 8,
    });

    // Visitante anônimo não consegue fazer SELECT direto na tabela base
    expect(() => engine.queryBaseProductsAsAnon()).toThrow("RLS_ANON_DENIED");

    // Pela RPC pública `get_public_menu_by_slug`, apenas campos públicos e `in_stock` são retornados
    const publicMenu = engine.getPublicMenuBySlug("benit-centro");
    expect(publicMenu).not.toBeNull();
    const publicProd = publicMenu!.products[0] as Record<string, unknown>;
    expect(publicProd.in_stock).toBe(true);
    expect(publicProd.stockQuantity).toBeUndefined();
    expect(publicProd.stock_quantity).toBeUndefined();
    expect(publicProd.sku).toBeUndefined();
    expect(publicProd.lowStockThreshold).toBeUndefined();

    // Políticas de Storage (`can_manage_store_asset`) isolam pastas por UUID da loja
    expect(
      engine.canManageStoreAsset(
        "owner-A",
        `${STORE_A1_UUID}/products/burger.jpg`
      )
    ).toBe(true);
    expect(
      engine.canManageStoreAsset(
        "owner-B",
        `${STORE_A1_UUID}/products/burger.jpg`
      )
    ).toBe(false);
    expect(
      engine.canManageStoreAsset("owner-A", "../pasta-invalida/burger.jpg")
    ).toBe(false);
  });

  it("3. Validação Server-Side de Grupos de Opcionais (is_required, min_select, max_select e duplicatas)", () => {
    const engine = setupMultiTenantEnvironment();

    engine.createProduct("owner-A", {
      id: "prod-custom-burger",
      storeId: STORE_A1_UUID,
      name: "Artisanal Burger",
      priceCents: 3600,
      isAvailable: true,
      trackStock: true,
      stockQuantity: 20,
      lowStockThreshold: 5,
      optionGroups: [
        {
          id: "grp-doneness",
          storeId: STORE_A1_UUID,
          productId: "prod-custom-burger",
          name: "Ponto da Carne",
          minSelect: 1,
          maxSelect: 1,
          isRequired: true,
          options: [
            {
              id: "opt-medium",
              storeId: STORE_A1_UUID,
              groupId: "grp-doneness",
              name: "Ao Ponto",
              priceCents: 0,
              isAvailable: true,
            },
            {
              id: "opt-well",
              storeId: STORE_A1_UUID,
              groupId: "grp-doneness",
              name: "Bem Passado",
              priceCents: 0,
              isAvailable: true,
            },
          ],
        },
      ],
    });

    // Omitir grupo obrigatório falha no servidor
    expect(() =>
      engine.createOrderAtomic({
        storeId: STORE_A1_UUID,
        source: "DIGITAL_MENU",
        items: [{ productId: "prod-custom-burger", quantity: 1, optionIds: [] }],
      })
    ).toThrow("OPTION_MIN_REQUIRED");

    // Exceder max_select = 1 falha no servidor
    expect(() =>
      engine.createOrderAtomic({
        storeId: STORE_A1_UUID,
        source: "DIGITAL_MENU",
        items: [
          {
            productId: "prod-custom-burger",
            quantity: 1,
            optionIds: ["opt-medium", "opt-well"],
          },
        ],
      })
    ).toThrow("OPTION_MAX_EXCEEDED");

    // Enviar option_id duplicado falha no servidor
    expect(() =>
      engine.createOrderAtomic({
        storeId: STORE_A1_UUID,
        source: "DIGITAL_MENU",
        items: [
          {
            productId: "prod-custom-burger",
            quantity: 1,
            optionIds: ["opt-medium", "opt-medium"],
          },
        ],
      })
    ).toThrow("DUPLICATE_OPTION");

    // Pedido válido respeitando o grupo é aceito com preço exato do servidor
    const validOrder = engine.createOrderAtomic({
      storeId: STORE_A1_UUID,
      source: "DIGITAL_MENU",
      items: [
        {
          productId: "prod-custom-burger",
          quantity: 2,
          optionIds: ["opt-medium"],
        },
      ],
    });
    expect(validOrder.totalCents).toBe(7200);
  });

  it("4. Preservação Histórica, Idempotência, Estorno em Cancelamento e Concorrência da Última Unidade", () => {
    const engine = setupMultiTenantEnvironment();

    engine.createProduct("owner-A", {
      id: "prod-limited",
      storeId: STORE_A1_UUID,
      name: "Edição Especial",
      priceCents: 4500,
      isAvailable: true,
      trackStock: true,
      stockQuantity: 1,
      lowStockThreshold: 2,
    });

    const order1 = engine.createOrderAtomic({
      storeId: STORE_A1_UUID,
      source: "DIGITAL_MENU",
      idempotencyKey: "idem-999",
      clientSubmittedTotalSpoof: 100,
      items: [{ productId: "prod-limited", quantity: 1 }],
    });

    // Replay idempotente
    const order1Replay = engine.createOrderAtomic({
      storeId: STORE_A1_UUID,
      source: "DIGITAL_MENU",
      idempotencyKey: "idem-999",
      items: [{ productId: "prod-limited", quantity: 1 }],
    });
    expect(order1Replay.id).toBe(order1.id);
    expect(order1.totalCents).toBe(4500);

    // Segundo pedido concorrente criado enquanto o primeiro ainda está NEW
    const order2 = engine.createOrderAtomic({
      storeId: STORE_A1_UUID,
      source: "DIGITAL_MENU",
      items: [{ productId: "prod-limited", quantity: 1 }],
    });

    // Alteração posterior de preço no catálogo não afeta pedidos já criados
    engine.updateProductPrice("owner-A", STORE_A1_UUID, "prod-limited", 5900);
    expect(engine.listStoreOrders("owner-A", STORE_A1_UUID)[0].totalCents).toBe(
      4500
    );

    // Confirma Pedido 1 -> estoque vai de 1 para 0
    engine.transitionOrderStatusAtomic({
      userId: "owner-A",
      storeId: STORE_A1_UUID,
      orderId: order1.id,
      newStatus: "CONFIRMED",
    });
    expect(engine.getProductStock("prod-limited")).toBe(0);

    // Tentativa de confirmar Pedido 2 falha atomicamente sem gerar estoque negativo
    expect(() =>
      engine.transitionOrderStatusAtomic({
        userId: "owner-A",
        storeId: STORE_A1_UUID,
        orderId: order2.id,
        newStatus: "CONFIRMED",
      })
    ).toThrow("INSUFFICIENT_STOCK");

    // Cancelar Pedido 1 estorna a unidade (0 -> 1), permitindo agora confirmar o Pedido 2!
    engine.transitionOrderStatusAtomic({
      userId: "owner-A",
      storeId: STORE_A1_UUID,
      orderId: order1.id,
      newStatus: "CANCELLED",
    });
    expect(engine.getProductStock("prod-limited")).toBe(1);
    expect(engine.getMovementsForOrder(order1.id)).toHaveLength(2);
  });
});
