import type { PaymentMethod, PaymentStatus } from "@/types/domain.types";

/** Maps Mercado Pago payment.status to BENIT's payment_status. */
export function mapMercadoPagoStatus(status: string | undefined | null): PaymentStatus {
  switch (status) {
    case "approved":
      return "APPROVED";
    case "refunded":
    case "charged_back":
      return "REFUNDED";
    case "rejected":
    case "cancelled":
      return "REJECTED";
    case "pending":
    case "in_process":
    case "in_mediation":
    case "authorized":
    default:
      return "PENDING";
  }
}

export function mapMercadoPagoMethod(paymentTypeId: string | undefined | null): PaymentMethod {
  return paymentTypeId === "bank_transfer" || paymentTypeId === "pix" ? "ONLINE_PIX" : "ONLINE_CARD";
}

/** Converts reais (MP uses decimal amounts) to integer cents without float drift. */
export function reaisToCents(amount: number): number {
  return Math.round(amount * 100);
}

export function centsToReais(cents: number): number {
  return Math.round(cents) / 100;
}
