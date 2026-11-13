"use client";

import { CustomersClient } from "@/components/customers/customers-client";
import type { Customer, Order } from "@/types/domain.types";

export function CustomersPreview({ storeId, storeName, customers, orders }: { storeId: string; storeName: string; customers: Customer[]; orders: Order[] }) {
  /** Preview-only: serves the order history from the fixtures. */
  const loadOrders = async (_storeId: string, customerId: string) => {
    await new Promise((r) => setTimeout(r, 250));
    return { success: true as const, data: orders.filter((o) => o.customer_id === customerId) };
  };
  return <CustomersClient storeId={storeId} storeName={storeName} customers={customers} loadOrders={loadOrders} />;
}
