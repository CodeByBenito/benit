import { describe, expect, it } from "vitest";

/**
 * Simulador Transacional em Memória das Regras de Banco de Dados do BENIT
 * Reproduz fielmente as garantias das migrations 0001, 0002 e 0003:
 * - Isolamento Multi-Tenant via RLS (has_store_access / is_org_member)
 * - Preços autoritativos calculados exclusivamente no servidor em centavos
 * - Snapshots imutáveis de itens e adicionais do pedido
 * - Idempotência de criação de pedidos (idempotency_key) e de movimentações (reference_key)
 * - Bloqueio atômico de estoque na confirmação (NEW -> CONFIRMED) e estorno no cancelamento (CANCELLED)
 */

interface SimProduct {
  id: string;
  storeId: string;
  name: string;
  priceCents: number;
  isAvailable: boolean;
  trackStock: boolean;
  stockQuantity: number;
  lowStockThreshold: number;
}

interface SimOrderItem {
  id: string;
  productId: string;
  productNameSnapshot: string;
  unitPriceCents: number;
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

class BenitTransactionalEngine {
  private memberships = new Map<string, Set<string>>(); // userId -> Set<storeId>
  private storeOrderCounters = new Map<string, number>();
  private products = new Map<string, SimProduct>();
  private orders = new Map<string, SimOrder>();
  private stockMovements = new Map<string, SimStockMovement>();

  grantStoreAccess(userId: string, storeId: string) {
    if (!this.memberships.has(userId)) {
      this.memberships.set(userId, new Set());
    }
    this.memberships.get(userId)!.add(storeId);
  }

  hasStoreAccess(userId: string, storeId: string): boolean {
    return this.memberships.get(userId)?.has(storeId) ?? false;
  }

  createProduct(userId: string, product: SimProduct) {
    if (!this.hasStoreAccess(userId, product.storeId)) {
      throw new Error("RLS_FORBIDDEN: Acesso negado a outra loja.");
    }
    this.products.set(product.id, { ...product });
  }

  updateProductPrice(userId: string, storeId: string, productId: string, newPriceCents: number) {
    if (!this.hasStoreAccess(userId, storeId)) {
      throw new Error("RLS_FORBIDDEN: Acesso negado.");
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
    clientSubmittedTotalSpoof?: number; // Deve ser ignorado pelo servidor
    items: { productId: string; quantity: number }[];
  }): SimOrder {
    const {
      callerUserId,
      storeId,
      source,
      initialStatus = "NEW",
      idempotencyKey,
      items,
    } = params;

    if (source === "MANUAL") {
      if (!callerUserId || !this.hasStoreAccess(callerUserId, storeId)) {
        throw new Error("FORBIDDEN: Sem permissão na loja.");
      }
    }

    // 1. Verificação de idempotência
    if (idempotencyKey) {
      const existing = Array.from(this.orders.values()).find(
        (o) => o.storeId === storeId && o.idempotencyKey === idempotencyKey
      );
      if (existing) {
        return existing;
      }
    }

    // 2. Pré-validação de estoque e disponibilidade
    for (const item of items) {
      const prod = this.products.get(item.productId);
      if (!prod || prod.storeId !== storeId) {
        throw new Error("PRODUCT_NOT_FOUND: Produto não pertence a esta loja.");
      }
      if (!prod.isAvailable) {
        throw new Error(`PRODUCT_UNAVAILABLE: ${prod.name}`);
      }
      if (prod.trackStock && prod.stockQuantity < item.quantity) {
        throw new Error(`INSUFFICIENT_STOCK: ${prod.name}`);
      }
    }

    // 3. Incremento atômico de order_number por loja
    const nextOrderNum = (this.storeOrderCounters.get(storeId) ?? 0) + 1;
    this.storeOrderCounters.set(storeId, nextOrderNum);

    const orderId = `ord-${storeId}-${nextOrderNum}`;
    const shouldDeduct = source === "MANUAL" && initialStatus === "CONFIRMED";

    let subtotalCents = 0;
    const snapItems: SimOrderItem[] = [];

    for (let i = 0; i < items.length; i++) {
      const req = items[i];
      const prod = this.products.get(req.productId)!;
      const itemId = `${orderId}-item-${i + 1}`;
      const totalItemCents = prod.priceCents * req.quantity;
      subtotalCents += totalItemCents;

      snapItems.push({
        id: itemId,
        productId: prod.id,
        productNameSnapshot: prod.name,
        unitPriceCents: prod.priceCents,
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
      throw new Error("FORBIDDEN: Sem permissão na loja.");
    }

    const order = this.orders.get(orderId);
    if (!order || order.storeId !== storeId) {
      throw new Error("ORDER_NOT_FOUND");
    }

    // Replay idempotente se o status já for o mesmo
    if (order.status === newStatus) {
      return order;
    }

    if (order.status === "CANCELLED") {
      throw new Error("INVALID_TRANSITION: Pedido já cancelado.");
    }

    // Confirmação deduz estoque atomicamente uma única vez
    if (
      !order.stockDeducted &&
      ["CONFIRMED", "PREPARING", "READY", "COMPLETED"].includes(newStatus)
    ) {
      // Verifica disponibilidade de todos os itens antes de deduzir (transação atômica)
      for (const item of order.items) {
        const prod = this.products.get(item.productId)!;
        if (prod.trackStock && prod.stockQuantity < item.quantity) {
          throw new Error(
            `INSUFFICIENT_STOCK: Estoque insuficiente para confirmar ${prod.name}`
          );
        }
      }

      for (const item of order.items) {
        const prod = this.products.get(item.productId)!;
        if (prod.trackStock) {
          const refKey = `order:${order.id}:item:${item.id}:deduct`;
          if (this.stockMovements.has(refKey)) {
            throw new Error("DUPLICATE_DEDUCTION_BLOCKED");
          }
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

    // Cancelamento de pedido já confirmado estorna o estoque atomicamente
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

describe("BENIT Fases 1 a 6 — Segurança Multi-Tenant, Concorrência de Estoque e Fluxo de Pedidos", () => {
  it("FASE 1 & 2: Garante isolamento estrito entre dois estabelecimentos (Tenant A vs Tenant B)", () => {
    const engine = new BenitTransactionalEngine();
    engine.grantStoreAccess("owner-A", "store-A");
    engine.grantStoreAccess("owner-B", "store-B");

    engine.createProduct("owner-A", {
      id: "prod-A1",
      storeId: "store-A",
      name: "Burger A",
      priceCents: 3000,
      isAvailable: true,
      trackStock: true,
      stockQuantity: 10,
      lowStockThreshold: 3,
    });

    // Owner B não pode criar produto na Store A nem listar pedidos da Store A
    expect(() =>
      engine.createProduct("owner-B", {
        id: "prod-hack",
        storeId: "store-A",
        name: "Invasão",
        priceCents: 100,
        isAvailable: true,
        trackStock: true,
        stockQuantity: 1,
        lowStockThreshold: 1,
      })
    ).toThrow("RLS_FORBIDDEN");

    expect(() => engine.listStoreOrders("owner-B", "store-A")).toThrow(
      "RLS_FORBIDDEN"
    );
  });

  it("FASE 2 & 3: Ignora preço adulterado pelo cliente, preserva snapshots históricos e garante idempotência", () => {
    const engine = new BenitTransactionalEngine();
    engine.grantStoreAccess("owner-A", "store-A");

    engine.createProduct("owner-A", {
      id: "prod-smash",
      storeId: "store-A",
      name: "Smash Duplo",
      priceCents: 3490,
      isAvailable: true,
      trackStock: true,
      stockQuantity: 15,
      lowStockThreshold: 5,
    });

    // Cliente tenta enviar pedido com idempotencyKey e preço falso (1 centavo)
    const order1 = engine.createOrderAtomic({
      storeId: "store-A",
      source: "DIGITAL_MENU",
      idempotencyKey: "idem-key-001",
      clientSubmittedTotalSpoof: 1,
      items: [{ productId: "prod-smash", quantity: 2 }],
    });

    // Preço calculado no servidor deve ser 2 * 3490 = 6980
    expect(order1.totalCents).toBe(6980);
    expect(order1.orderNumber).toBe(1);
    expect(order1.stockDeducted).toBe(false); // Pedido NEW ainda não deduz estoque

    // Duplo clique com mesma idempotencyKey retorna exatamente o mesmo pedido sem duplicar
    const duplicateReplay = engine.createOrderAtomic({
      storeId: "store-A",
      source: "DIGITAL_MENU",
      idempotencyKey: "idem-key-001",
      items: [{ productId: "prod-smash", quantity: 2 }],
    });
    expect(duplicateReplay.id).toBe(order1.id);
    expect(duplicateReplay.orderNumber).toBe(1);

    // Se o proprietário alterar o preço do produto depois, o pedido histórico permanece 6980
    engine.updateProductPrice("owner-A", "store-A", "prod-smash", 4500);
    const savedOrders = engine.listStoreOrders("owner-A", "store-A");
    expect(savedOrders[0].totalCents).toBe(6980);
    expect(savedOrders[0].items[0].unitPriceCents).toBe(3490);
  });

  it("FASE 4: Deduz estoque na confirmação, impede dupla baixa e estorna no cancelamento", () => {
    const engine = new BenitTransactionalEngine();
    engine.grantStoreAccess("owner-A", "store-A");

    engine.createProduct("owner-A", {
      id: "prod-pizza",
      storeId: "store-A",
      name: "Pizza Margherita",
      priceCents: 5990,
      isAvailable: true,
      trackStock: true,
      stockQuantity: 10,
      lowStockThreshold: 2,
    });

    const order = engine.createOrderAtomic({
      storeId: "store-A",
      source: "DIGITAL_MENU",
      items: [{ productId: "prod-pizza", quantity: 3 }],
    });

    expect(engine.getProductStock("prod-pizza")).toBe(10);

    // Confirmar pedido -> deduz 3 unidades (fica 7)
    engine.transitionOrderStatusAtomic({
      userId: "owner-A",
      storeId: "store-A",
      orderId: order.id,
      newStatus: "CONFIRMED",
    });
    expect(engine.getProductStock("prod-pizza")).toBe(7);

    // Repetir chamada de confirmação ou avançar para PREPARING não deduz novamente
    engine.transitionOrderStatusAtomic({
      userId: "owner-A",
      storeId: "store-A",
      orderId: order.id,
      newStatus: "CONFIRMED",
    });
    engine.transitionOrderStatusAtomic({
      userId: "owner-A",
      storeId: "store-A",
      orderId: order.id,
      newStatus: "PREPARING",
    });
    expect(engine.getProductStock("prod-pizza")).toBe(7);

    // Cancelar pedido confirmado -> estorna 3 unidades de volta para 10
    engine.transitionOrderStatusAtomic({
      userId: "owner-A",
      storeId: "store-A",
      orderId: order.id,
      newStatus: "CANCELLED",
    });
    expect(engine.getProductStock("prod-pizza")).toBe(10);

    const movements = engine.getMovementsForOrder(order.id);
    expect(movements).toHaveLength(2);
    expect(movements[0].movementType).toBe("ORDER_DEDUCTION");
    expect(movements[0].quantityDelta).toBe(-3);
    expect(movements[1].movementType).toBe("ORDER_REVERSAL");
    expect(movements[1].quantityDelta).toBe(3);
  });

  it("FASE 4 & 6: Protege contra venda simultânea da última unidade (nunca gera estoque negativo)", () => {
    const engine = new BenitTransactionalEngine();
    engine.grantStoreAccess("owner-A", "store-A");

    engine.createProduct("owner-A", {
      id: "prod-last-unit",
      storeId: "store-A",
      name: "Burger Edição Limitada",
      priceCents: 4990,
      isAvailable: true,
      trackStock: true,
      stockQuantity: 1, // Apenas 1 última unidade disponível
      lowStockThreshold: 2,
    });

    // Dois clientes abrem o cardápio e enviam pedidos NEW simultaneamente para a última unidade
    const orderClient1 = engine.createOrderAtomic({
      storeId: "store-A",
      source: "DIGITAL_MENU",
      items: [{ productId: "prod-last-unit", quantity: 1 }],
    });

    const orderClient2 = engine.createOrderAtomic({
      storeId: "store-A",
      source: "DIGITAL_MENU",
      items: [{ productId: "prod-last-unit", quantity: 1 }],
    });

    // O proprietário confirma o Pedido 1 -> consome a última unidade (estoque vai a 0)
    engine.transitionOrderStatusAtomic({
      userId: "owner-A",
      storeId: "store-A",
      orderId: orderClient1.id,
      newStatus: "CONFIRMED",
    });
    expect(engine.getProductStock("prod-last-unit")).toBe(0);

    // Quando tenta confirmar o Pedido 2, o banco bloqueia com INSUFFICIENT_STOCK e impede saldo negativo
    expect(() =>
      engine.transitionOrderStatusAtomic({
        userId: "owner-A",
        storeId: "store-A",
        orderId: orderClient2.id,
        newStatus: "CONFIRMED",
      })
    ).toThrow("INSUFFICIENT_STOCK");

    expect(engine.getProductStock("prod-last-unit")).toBe(0);
  });
});
