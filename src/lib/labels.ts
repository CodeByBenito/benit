import type { FulfillmentType, OrderStatus, PaymentMethod, PaymentStatus } from "@/types/domain.types";

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  AWAITING_PAYMENT: "Aguardando pagamento",
  NEW: "Novo",
  CONFIRMED: "Confirmado",
  PREPARING: "Em preparo",
  READY: "Pronto",
  COMPLETED: "Concluído",
  CANCELLED: "Cancelado",
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  ONLINE_PIX: "Pix online",
  ONLINE_CARD: "Cartão online",
  CASH: "Dinheiro",
  CARD_ON_DELIVERY: "Cartão na entrega",
  PIX_MANUAL: "Pix na entrega",
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  PAY_ON_DELIVERY: "Paga na entrega",
  PENDING: "Pagamento pendente",
  APPROVED: "Pago",
  REJECTED: "Pagamento recusado",
  EXPIRED: "Pagamento expirado",
  REFUND_PENDING: "Estorno em andamento",
  REFUNDED: "Estornado",
};

export const FULFILLMENT_LABEL: Record<FulfillmentType, string> = {
  DELIVERY: "Entrega",
  PICKUP: "Retirada",
  DINE_IN: "Na mesa",
};

export const WEEKDAY_LABEL = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"] as const;
export const WEEKDAY_SHORT = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;

/** Strips the "CODE: " prefix our SQL errors carry. */
export function cleanDbError(message: string | undefined | null, fallback: string) {
  const clean = (message ?? "").replace(/^[A-Z_]+:\s*/, "").trim();
  return clean || fallback;
}
