"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FULFILLMENT_LABEL } from "@/lib/labels";
import type { Order } from "@/types/domain.types";

/**
 * Kitchen ticket for 80 mm thermal printers. It lives in a portal on <body>
 * and is invisible on screen; the print stylesheet in globals.css hides
 * everything else and prints only this (see `.print-ticket`).
 *
 * What the cook needs and nothing else: no prices, phone or address.
 */
export function KitchenTicket({ order, storeName }: { order: Order; storeName: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const created = new Date(order.created_at);
  const itemCount = (order.items ?? []).reduce((sum, item) => sum + item.quantity, 0);
  return createPortal(
    <div className="print-ticket" aria-hidden>
      <p className="print-ticket__store">{storeName}</p>
      <p className="print-ticket__number">#{order.order_number}</p>
      <p className="print-ticket__meta">
        {FULFILLMENT_LABEL[order.fulfillment_type].toUpperCase()}
        {order.table_or_reference ? ` ${order.table_or_reference}` : ""} · {order.customer_name_snapshot.trim().split(/\s+/)[0]}
      </p>
      <p className="print-ticket__meta">
        {created.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} {created.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
      </p>
      <hr />
      <ul>
        {(order.items ?? []).map((item) => (
          <li key={item.id}>
            <p className="print-ticket__item">
              <span>{item.quantity}×</span> {item.product_name_snapshot}
            </p>
            {(item.options ?? []).map((option) => (
              <p key={option.id} className="print-ticket__option">
                + {option.option_name_snapshot}
              </p>
            ))}
            {item.notes ? <p className="print-ticket__note">OBS: {item.notes}</p> : null}
          </li>
        ))}
      </ul>
      {order.notes ? (
        <>
          <hr />
          <p className="print-ticket__note">OBS DO PEDIDO: {order.notes}</p>
        </>
      ) : null}
      <hr />
      <p className="print-ticket__meta">
        {itemCount} {itemCount === 1 ? "item" : "itens"}
      </p>
    </div>,
    document.body
  );
}
