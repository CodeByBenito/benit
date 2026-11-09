# BRIEF — Redesign BENIT

Entrevista feita em 2026-11-08. Referência de estrutura: brendi.com.br. Régua: Awwards.

| # | Tema | Decisão |
|---|------|---------|
| 1 | Escopo | Landing, auth/onboarding, painel e cardápio público, todos com o mesmo peso |
| 2 | Back-end | Pagamento online no cardápio, entrega por bairro, pedido mínimo, horários, cupons, notificações. Sem cobrança de assinatura do lojista |
| 3 | Pagamento | Cada restaurante conecta a própria conta Mercado Pago (Pix + cartão); "pagar na entrega" continua |
| 4 | Paleta | Base #101010, superfícies #1C1C1C/#242424/#2C2C2C, acento #FF6A00, texto #F3F3F0. Landing alterna 2–3 cenas creme (#F3F3F0) |
| 5 | Prova social | Nenhuma (pré-lançamento). Proibido inventar números, logos ou depoimentos. Bloco de depoimentos existe, mas fica desligado |
| 6 | CTA | Falar com o time BENIT no WhatsApp (`NEXT_PUBLIC_SALES_WHATSAPP`). Cadastro é secundário |
| 7 | Pico | "O pedido que atravessa": um pedido cruza o quadro conforme a rolagem; o estoque desce e o faturamento sobe |
| 8 | Motor | GSAP + ScrollTrigger + Lenis; respeita movimento-reduzido |
| 9 | WhatsApp do cliente | Botão "Avisar cliente" (wa.me) + página pública de acompanhamento |
| 10 | E-mail | Resend |
| 11 | Estoque | Pedido pago online baixa o estoque na aprovação; se faltar, cancela e estorna |
| 12 | Zonas | Só por bairro |
| 13 | Tipografia | Bricolage Grotesque (títulos), Inter (texto), JetBrains Mono (números) |

## Jornada (7 cenas)
1. Abertura (escuro): revelação tipográfica, quadro em silhueta, ponto laranja de "novo pedido".
2. O caos de hoje (creme): dores do dia riscadas pela rolagem.
3. **PICO** (escuro): o pedido que atravessa, cena fixa longa.
4. Três telas, uma operação (creme): trilha horizontal com cardápio, painel e estoque.
5. Dinheiro e entrega (escuro): Pix resolvendo, bairros com taxa, cupom.
6. Incluso, segurança e FAQ (creme): calma, objeções respondidas.
7. Fechamento (escuro): uma chamada, WhatsApp.
