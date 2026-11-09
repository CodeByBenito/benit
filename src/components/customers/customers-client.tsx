"use client";

import { useMemo, useState } from "react";
import {
  Calendar,
  MessageCircle,
  Search,
  ShoppingBag,
  Users,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  buildWhatsAppUrl,
  formatCurrencyCents,
  formatPhoneBR,
} from "@/lib/utils";
import type { Customer, Order } from "@/types/domain.types";

export function CustomersClient({
  storeName,
  customers,
  orders,
}: {
  storeName: string;
  customers: Customer[];
  orders: Order[];
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(
    null
  );

  const filteredCustomers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.phone.toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q)
    );
  }, [customers, searchQuery]);

  const customerOrders = useMemo(() => {
    if (!selectedCustomer) return [];
    return orders.filter(
      (o) =>
        o.customer_id === selectedCustomer.id ||
        o.customer_phone_snapshot === selectedCustomer.phone
    );
  }, [orders, selectedCustomer]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-display text-display-sm font-extrabold sm:text-3xl">
            Clientes & Atendimento
          </h1>
          <p className="text-xs text-foreground-muted">
            Base de clientes de {storeName}, histórico de pedidos e contato
            rápido via WhatsApp.
          </p>
        </div>

        <Badge variant="secondary" className="tabular-nums">
          {customers.length} cliente(s) cadastrado(s)
        </Badge>
      </div>

      {/* Search Bar */}
      <div className="rounded-2xl border border-border bg-surface p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-foreground-muted" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar cliente por nome ou número de telefone/WhatsApp..."
            className="pl-9"
          />
        </div>
      </div>

      {/* Customers Table */}
      <div className="overflow-hidden rounded-2xl border border-border bg-surface">
        {filteredCustomers.length === 0 ? (
          <div className="p-12 text-center">
            <Users className="mx-auto h-10 w-10 text-foreground-muted" />
            <h3 className="mt-3 font-display text-base font-bold text-foreground">
              Nenhum cliente encontrado
            </h3>
            <p className="mx-auto mt-1 max-w-md text-xs text-foreground-muted">
              Os clientes são registrados e atualizados automaticamente sempre
              que realizam um pedido pelo cardápio digital ou balcão.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-border bg-surface text-[11px] uppercase tracking-wider text-foreground-muted">
                  <th className="px-4 py-3.5 font-semibold">Cliente</th>
                  <th className="px-4 py-3.5 font-semibold">Telefone / WhatsApp</th>
                  <th className="px-4 py-3.5 font-semibold">Total de Pedidos</th>
                  <th className="px-4 py-3.5 font-semibold">Total Gasto</th>
                  <th className="px-4 py-3.5 font-semibold">Último Pedido</th>
                  <th className="px-4 py-3.5 text-right font-semibold">
                    Atendimento
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredCustomers.map((customer) => (
                  <tr
                    key={customer.id}
                    className="transition-colors hover:bg-surface/60"
                  >
                    <td className="px-4 py-3.5 font-semibold text-foreground">
                      {customer.name}
                    </td>
                    <td className="px-4 py-3.5 font-mono text-foreground-muted tabular-nums">
                      {formatPhoneBR(customer.phone)}
                    </td>
                    <td className="px-4 py-3.5">
                      <Badge variant="secondary" className="tabular-nums">
                        {customer.total_orders} pedido(s)
                      </Badge>
                    </td>
                    <td className="px-4 py-3.5 font-display font-bold text-foreground tabular-nums">
                      {formatCurrencyCents(customer.total_spent_cents)}
                    </td>
                    <td className="px-4 py-3.5 text-foreground-muted tabular-nums">
                      {customer.last_order_at
                        ? new Date(customer.last_order_at).toLocaleDateString(
                            "pt-BR"
                          )
                        : "—"}
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="inline-flex items-center gap-2">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setSelectedCustomer(customer)}
                        >
                          <ShoppingBag className="h-3.5 w-3.5" />
                          <span>Histórico</span>
                        </Button>
                        <Button size="sm" asChild>
                          <a
                            href={buildWhatsAppUrl(
                              customer.phone,
                              `Olá ${customer.name}, tudo bem? Aqui é da ${storeName}!`
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            <MessageCircle className="h-3.5 w-3.5" />
                            <span>WhatsApp</span>
                          </a>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Customer Order History Drawer */}
      {selectedCustomer && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/75 backdrop-blur-sm">
          <div className="flex h-full w-full max-w-md flex-col border-l border-border bg-surface-card p-6 shadow-2xl overflow-y-auto">
            <div className="flex items-start justify-between border-b border-border pb-4">
              <div>
                <h2 className="font-display text-lg font-bold text-foreground">
                  {selectedCustomer.name}
                </h2>
                <p className="text-xs text-foreground-muted tabular-nums">
                  {formatPhoneBR(selectedCustomer.phone)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedCustomer(null)}
                className="text-foreground-muted hover:text-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-border bg-surface p-3.5">
                <span className="text-[11px] text-foreground-muted">
                  Pedidos Realizados
                </span>
                <p className="mt-1 font-display text-xl font-extrabold text-foreground tabular-nums">
                  {selectedCustomer.total_orders}
                </p>
              </div>
              <div className="rounded-xl border border-border bg-surface p-3.5">
                <span className="text-[11px] text-foreground-muted">
                  Valor Acumulado
                </span>
                <p className="mt-1 font-display text-xl font-extrabold text-brand tabular-nums">
                  {formatCurrencyCents(selectedCustomer.total_spent_cents)}
                </p>
              </div>
            </div>

            <div className="mt-4">
              <Button className="w-full" asChild>
                <a
                  href={buildWhatsAppUrl(
                    selectedCustomer.phone,
                    `Olá ${selectedCustomer.name}! Aqui é da ${storeName}.`
                  )}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <MessageCircle className="h-4 w-4" />
                  <span>Iniciar Conversa no WhatsApp</span>
                </a>
              </Button>
            </div>

            <div className="mt-6 space-y-3 border-t border-border pt-4">
              <h3 className="font-display text-xs font-bold uppercase tracking-wider text-foreground-muted">
                Histórico de Pedidos ({customerOrders.length})
              </h3>

              {customerOrders.length === 0 ? (
                <p className="text-xs text-foreground-muted">
                  Nenhum pedido listado.
                </p>
              ) : (
                customerOrders.map((order) => (
                  <div
                    key={order.id}
                    className="rounded-xl border border-border bg-surface p-3.5 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-mono font-bold text-brand tabular-nums">
                        Pedido #{order.order_number}
                      </span>
                      <Badge variant="secondary">{order.status}</Badge>
                    </div>
                    <div className="mt-2 flex items-center justify-between text-foreground-muted">
                      <span className="inline-flex items-center gap-1 tabular-nums">
                        <Calendar className="h-3 w-3" />
                        {new Date(order.created_at).toLocaleDateString("pt-BR")}
                      </span>
                      <span className="font-bold text-foreground tabular-nums">
                        {formatCurrencyCents(order.total_cents)}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

