/**
 * Landing copy & demo data.
 * RULE: no invented numbers, testimonials or logos. Everything below is either
 * a product fact or clearly a product demo (a fictional order inside the UI).
 */

export function salesWhatsAppHref(phone: string | undefined) {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  const text = "Oi! Vim pelo site do BENIT e quero colocar minha operação sob controle.";
  return `https://wa.me/${digits.length <= 11 ? `55${digits}` : digits}?text=${encodeURIComponent(text)}`;
}

/** Fictional order used in the product demo (hero → peak continuity). */
export const DEMO_ORDER = {
  number: 412,
  customer: "Ana",
  channel: "Cardápio digital",
  fulfillment: "Entrega · Centro",
  items: [
    { qty: 2, name: "Smash duplo" },
    { qty: 1, name: "Batata rústica" },
  ],
  totalCents: 8470, // 2 × 34,90 + 14,90 (same prices as the menu mock)
  payment: "Pix aprovado",
};

export const DEMO_STORE = "Smash da Vila";

/** Demo counters inside the board (UI illustration, not business claims). */
export const DEMO_COUNTERS = {
  revenueBefore: 128_400,
  stock: [
    { name: "Pão brioche", before: 48, after: 46 },
    { name: "Blend 90g", before: 96, after: 92 },
    { name: "Batata", before: 21, after: 20 },
  ],
};

export const BOARD_COLUMNS = [
  { key: "NEW", label: "Novos" },
  { key: "CONFIRMED", label: "Confirmados" },
  { key: "PREPARING", label: "Em preparo" },
  { key: "READY", label: "Prontos" },
] as const;

export const PEAK_STEPS = [
  { title: "Chegou pelo cardápio.", body: "O cliente pediu no link da sua loja e pagou no Pix. O pedido entra sozinho — sem digitar nada." },
  { title: "Confirmado. Estoque baixado.", body: "No clique de confirmação, cada ingrediente sai do estoque. Cancelou? Volta sozinho." },
  { title: "Na chapa.", body: "A cozinha vê só o que importa: itens, adicionais e observações, no tempo certo." },
  { title: "Pronto. Cliente avisado.", body: "Um toque abre o WhatsApp com a mensagem pronta, e o cliente acompanha tudo por um link." },
] as const;

export const PAINS = [
  "Pedido anotado no papel, que some no meio do rush.",
  "WhatsApp lotado de conversa sem resposta.",
  "Taxa de entrega calculada de cabeça.",
  "Estoque conferido no olho, no fim da noite.",
  "Cliente ligando pra saber se o pedido saiu.",
];

export const INCLUDED = [
  { title: "Cardápio digital com link próprio", body: "Fotos, adicionais obrigatórios e opcionais, sacola e checkout em etapas." },
  { title: "Quadro de pedidos em tempo real", body: "Cardápio, balcão e mesa no mesmo lugar, do novo ao concluído." },
  { title: "Pix e cartão online", body: "Você conecta sua conta Mercado Pago e o dinheiro cai direto nela." },
  { title: "Entrega por bairro", body: "Taxa, pedido mínimo e prazo por bairro, calculados sozinhos no checkout." },
  { title: "Horários e cupons", body: "A loja abre e fecha no horário certo. Cupons com limite por cliente e validade." },
  { title: "Estoque automático", body: "Baixa na confirmação ou no pagamento aprovado, com histórico de cada movimento." },
  { title: "Acompanhamento do pedido", body: "O cliente recebe um link e vê o pedido mudar de etapa ao vivo." },
  { title: "Clientes e histórico", body: "Quem pediu, quantas vezes e quanto gastou — por loja." },
];

export const SECURITY = [
  { title: "Cada loja isolada no banco", body: "Regras de acesso linha a linha: uma loja nunca enxerga os dados de outra." },
  { title: "Preço calculado no servidor", body: "Taxa, desconto e total são recalculados por nós. Ninguém altera valor pelo navegador." },
  { title: "Credenciais criptografadas", body: "O acesso à sua conta Mercado Pago fica cifrado e só o servidor usa." },
];

export const FAQ = [
  {
    q: "Como o dinheiro dos pedidos chega até mim?",
    a: "Você conecta a sua própria conta Mercado Pago em Configurações. Pix e cartão caem direto nela — o BENIT não fica com o dinheiro de ninguém. Se preferir, também dá para receber na entrega: dinheiro, maquininha ou Pix com a sua chave.",
  },
  {
    q: "Quanto custa?",
    a: "Estamos em fase de lançamento e conversando com cada operação. Chame a gente no WhatsApp para conhecer as condições.",
  },
  {
    q: "Preciso instalar algum aplicativo?",
    a: "Não. O painel roda no navegador do computador, tablet ou celular, e o cardápio abre direto pelo link da sua loja.",
  },
  {
    q: "Funciona junto com o iFood?",
    a: "O BENIT é o seu canal próprio de pedidos. Ele não importa pedidos de marketplaces; você pode usar os dois em paralelo e levar seus clientes para o seu link.",
  },
  {
    q: "E se um item acabar depois que o cliente pagou?",
    a: "No pagamento online, o estoque é reservado no momento da aprovação. Se o item tiver acabado, o pedido é cancelado e o valor é estornado automaticamente.",
  },
  {
    q: "Consigo atender mais de uma loja?",
    a: "Sim. A estrutura é multiloja: cada unidade tem cardápio, estoque, equipe e configurações próprias.",
  },
];

/**
 * Testimonials stay OFF until there are real, authorized quotes.
 * Fill this array with { quote, name, role, store } and flip the flag.
 */
export const SHOW_TESTIMONIALS = false;
export const TESTIMONIALS: { quote: string; name: string; role: string; store: string }[] = [];
