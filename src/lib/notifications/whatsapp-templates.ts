import type { FulfillmentType, OrderStatus } from "@/types/domain.types";

export interface WhatsAppTemplateInput {
  storeName: string;
  customerName: string;
  orderNumber: number;
  status: OrderStatus;
  fulfillmentType: FulfillmentType;
  trackingUrl: string;
  etaMinutes?: number | null;
}

function firstName(name: string) {
  return name.trim().split(/\s+/)[0] || name;
}

/**
 * One message per status. Kept short, warm and specific — this is the store
 * talking to its own customer, so it never sounds like a bot.
 */
export function buildCustomerStatusMessage(input: WhatsAppTemplateInput): string | null {
  const name = firstName(input.customerName);
  const n = `#${input.orderNumber}`;
  const track = `Acompanhe aqui: ${input.trackingUrl}`;

  switch (input.status) {
    case "NEW":
      return `Oi, ${name}! Recebemos seu pedido ${n} na ${input.storeName}. Já já confirmamos. ${track}`;
    case "CONFIRMED":
      return `${name}, seu pedido ${n} foi confirmado e entrou na fila da cozinha.${
        input.etaMinutes ? ` Previsão: ~${input.etaMinutes} min.` : ""
      } ${track}`;
    case "PREPARING":
      return `Mão na massa! Seu pedido ${n} está sendo preparado agora. ${track}`;
    case "READY":
      if (input.fulfillmentType === "DELIVERY") return `${name}, seu pedido ${n} está pronto e já vai sair para entrega. ${track}`;
      if (input.fulfillmentType === "DINE_IN") return `${name}, seu pedido ${n} está pronto e já vai para a sua mesa.`;
      return `${name}, seu pedido ${n} está pronto para retirada na ${input.storeName}. Te esperamos!`;
    case "COMPLETED":
      return `Pedido ${n} finalizado. Obrigado pela preferência, ${name}! Volte sempre à ${input.storeName}.`;
    case "CANCELLED":
      return `${name}, seu pedido ${n} foi cancelado. Se tiver qualquer dúvida, é só responder esta mensagem.`;
    default:
      return null;
  }
}

/** wa.me deep link. Phone is normalized to digits and defaults to Brazil (+55). */
export function buildWhatsAppLink(phone: string, message: string): string {
  let digits = phone.replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

export function trackingUrl(appUrl: string, publicToken: string) {
  return `${appUrl.replace(/\/$/, "")}/pedido/${publicToken}`;
}
