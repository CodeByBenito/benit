import { formatCurrencyCents } from "@/lib/utils";

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

/** Table-based layout: survives Gmail/Outlook. Brand palette, no images required. */
function layout(title: string, body: string, cta?: { label: string; href: string }) {
  return `<!doctype html><html lang="pt-BR"><body style="margin:0;background:#101010;padding:32px 12px;font-family:Inter,Segoe UI,Arial,sans-serif;color:#F3F3F0">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center">
<table role="presentation" width="560" cellspacing="0" cellpadding="0" style="max-width:560px;width:100%;background:#1C1C1C;border:1px solid #333;border-radius:16px">
<tr><td style="padding:28px 32px 8px"><span style="display:inline-block;width:10px;height:10px;border-radius:99px;background:#FF6A00;vertical-align:middle"></span>
<span style="font-weight:800;letter-spacing:-0.02em;font-size:18px;vertical-align:middle;margin-left:8px">BENIT</span></td></tr>
<tr><td style="padding:12px 32px 0"><h1 style="margin:0;font-size:26px;line-height:1.15;letter-spacing:-0.03em;font-weight:800">${escape(title)}</h1></td></tr>
<tr><td style="padding:16px 32px 8px;font-size:15px;line-height:1.6;color:#C9C9C4">${body}</td></tr>
${cta ? `<tr><td style="padding:16px 32px 32px"><a href="${cta.href}" style="display:inline-block;background:#FF6A00;color:#fff;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:10px">${escape(cta.label)}</a></td></tr>` : `<tr><td style="padding:16px"></td></tr>`}
</table>
<p style="color:#6E6E6E;font-size:12px;margin-top:20px">Você recebeu este e-mail porque usa o BENIT.</p>
</td></tr></table></body></html>`;
}

export function welcomeEmail(input: { name: string; appUrl: string }) {
  const first = input.name.split(" ")[0] || input.name;
  const html = layout(
    `Bem-vindo, ${first}.`,
    `<p style="margin:0 0 12px">Sua conta no BENIT está pronta. Em poucos minutos você cadastra o cardápio, define os bairros de entrega e começa a receber pedidos em tempo real.</p>
     <p style="margin:0">Se precisar de ajuda, responda este e-mail.</p>`,
    { label: "Abrir meu painel", href: `${input.appUrl}/dashboard` }
  );
  const text = `Bem-vindo, ${first}. Sua conta no BENIT está pronta. Abra seu painel: ${input.appUrl}/dashboard`;
  return { subject: "Sua operação no BENIT está pronta", html, text };
}

export function newOrderEmail(input: {
  storeName: string;
  orderNumber: number;
  customerName: string;
  totalCents: number;
  fulfillment: string;
  paymentLabel: string;
  items: { name: string; quantity: number }[];
  appUrl: string;
}) {
  const rows = input.items
    .map((i) => `<tr><td style="padding:4px 0;color:#F3F3F0">${i.quantity}× ${escape(i.name)}</td></tr>`)
    .join("");
  const html = layout(
    `Novo pedido #${input.orderNumber}`,
    `<p style="margin:0 0 12px"><strong style="color:#F3F3F0">${escape(input.customerName)}</strong> fez um pedido na ${escape(input.storeName)}.</p>
     <table role="presentation" cellspacing="0" cellpadding="0">${rows}</table>
     <p style="margin:16px 0 0">${escape(input.fulfillment)} · ${escape(input.paymentLabel)} · <strong style="color:#FF6A00">${formatCurrencyCents(input.totalCents)}</strong></p>`,
    { label: "Ver no quadro de pedidos", href: `${input.appUrl}/orders` }
  );
  const text = `Novo pedido #${input.orderNumber} de ${input.customerName} — ${formatCurrencyCents(input.totalCents)}. ${input.appUrl}/orders`;
  return { subject: `Novo pedido #${input.orderNumber} · ${formatCurrencyCents(input.totalCents)}`, html, text };
}

export function teamAddedEmail(input: { organizationName: string; roleLabel: string; invitedBy: string; loginUrl: string }) {
  const html = layout(
    `Você entrou na equipe de ${input.organizationName}.`,
    `<p style="margin:0 0 12px"><strong style="color:#F3F3F0">${escape(input.invitedBy)}</strong> adicionou você como <strong style="color:#F3F3F0">${escape(input.roleLabel)}</strong>.</p>
     <p style="margin:0">Entre com o e-mail e a senha que você já usa no BENIT.</p>`,
    { label: "Entrar no painel", href: input.loginUrl }
  );
  const text = `${input.invitedBy} adicionou você à equipe de ${input.organizationName} como ${input.roleLabel}. Entre em: ${input.loginUrl}`;
  return { subject: `Você entrou na equipe de ${input.organizationName}`, html, text };
}
