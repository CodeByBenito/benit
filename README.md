# BENIT

**Sua operação. Sob controle.**

BENIT é um SaaS multi-loja para restaurantes, hamburguerias, pizzarias e cafés. O dono do negócio vê num só quadro, em tempo real, os pedidos do cardápio digital, do balcão e da mesa. O estoque baixa sozinho, e o Pix e o cartão caem direto na conta Mercado Pago do próprio restaurante.

## O que tem dentro

| Para quem | Onde | O que faz |
|---|---|---|
| Visitante | `/` | Landing com 7 cenas. A chamada principal é o WhatsApp do time BENIT. |
| Cliente da loja | `/menu/<slug>` | Cardápio público, sacola, entrega por bairro, cupom, Pix ou cartão online, ou pagamento na entrega. |
| Cliente da loja | `/pedido/<token>` | Acompanhamento do pedido ao vivo, com o QR do Pix quando falta pagar. |
| Lojista | `/dashboard` | Visão geral: faturamento do dia, fila, 7 dias, estoque em alerta. |
| Lojista | `/orders` | Quadro de pedidos em tempo real, pedido no balcão, comanda de 80 mm. A cozinha vê um quadro próprio. |
| Lojista | `/menu-manager` | Cardápio por categoria, arrastar para ordenar, editor de produto com adicionais. |
| Lojista | `/inventory` | Níveis de estoque, entrada, saída, contagem e histórico por produto. |
| Lojista | `/customers` | Clientes com busca, ordenação, histórico e atalho de WhatsApp. |
| Lojista | `/settings` | Loja (logo e capa), pagamentos, entrega, horários, cupons e equipe. |

Não existe cobrança de assinatura do lojista dentro do produto.

## Stack

- **Next.js 15** (App Router), **React 19**, **TypeScript**, **Tailwind 3**
- **Supabase**: Postgres, Auth, Realtime e Storage
- **Mercado Pago** (OAuth por loja, Pix e cartão), **Resend** (e-mail)
- **GSAP + Lenis** na landing, **dnd-kit** no cardápio, **Zod** nas validações
- **Vitest + PGlite** (regras de banco num Postgres embutido) e **Playwright** (telas)

## Rodar localmente

Requisitos: Node 22 e npm.

```bash
npm install
```

```bash
cp .env.example .env.local
```

Preencha no `.env.local` pelo menos `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` e `SUPABASE_SERVICE_ROLE_KEY`. As outras integrações são opcionais: sem elas, a parte correspondente fica desligada e nada quebra.

```bash
npm run dev
```

Abra <http://localhost:3000>.

**Sem Supabase nenhum**, dá para ver e revisar todas as telas com dados fictícios em <http://localhost:3000/dev>. Essas rotas respondem 404 em produção.

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento. |
| `npm run build` / `npm start` | Build e servidor de produção. Pare o `dev` antes do `build`: os dois usam a pasta `.next`. |
| `npm run typecheck` | `tsc --noEmit`. |
| `npm test` | Vitest: unidades, regras de banco no PGlite e o fluxo do Mercado Pago contra o stub. Não precisa de rede nem de credenciais. |
| `npm run test:e2e` | Playwright sobre as rotas `/dev/*` (sobe um `next dev` na porta 3100). |
| `npm run mp:stub` | Sobe o Mercado Pago de mentira em `localhost:4010`. Veja `docs/PAYMENTS_AND_NOTIFICATIONS_SETUP.md`. |
| `npm run shots -- --url http://localhost:3000 /login /dev/painel` | Screenshots em 390, 768 e 1440 px, acusando rolagem horizontal. |
| `npm run verify:scroll` | Screenshots da landing ao longo da rolagem (desktop, celular e movimento reduzido). |
| `node scripts/build-apply-bundle.mjs` | Regenera o `passo-3` do SQL Editor a partir das migrations. |

Antes de dizer que algo está pronto:

```bash
npx tsc --noEmit && npm test && npx next build && npm run test:e2e
```

O mesmo roda no GitHub Actions a cada push e PR (`.github/workflows/ci.yml`).

## Banco de dados

O esquema vive em `supabase/migrations/`, numerado. **Nunca edite uma migration já aplicada**: mudança de esquema é sempre um arquivo novo.

| Migration | Conteúdo |
|---|---|
| `0001`–`0003` | Esquema base, RLS e RPCs atômicas (pedidos e estoque). |
| `0004`–`0008` | Checkout, entrega por bairro, cupons, pagamentos, acompanhamento público e endurecimento de segurança. |
| `0009` | Equipe: listar, convidar, trocar papel e remover. |
| `0010` | Ordenação do cardápio por arrastar; bucket de imagens limitado a imagens de até 5 MB. |
| `0011` | Anti-spam do checkout público: limite por telefone e contador por visitante. |

### Como aplicar

**Pelo SQL Editor do Supabase** (sem instalar nada): cole e rode, nesta ordem, os arquivos de `supabase/apply/`.

1. `passo-1-base.sql` (0001–0004). Rode uma vez só.
2. `passo-2-checkout-pagamentos.sql` (0005–0008). Pode repetir.
3. `passo-3-equipe-cardapio-protecoes.sql` (0009 em diante). Pode repetir.

São três colagens porque o Postgres não deixa usar um valor de enum na mesma transação que o cria.

**Pela CLI do Supabase:** `supabase db push`.

Depois de aplicar, confira em *Database → Extensions* se o `pg_cron` está ativo e rode o *Security Advisor* do painel.

Criou uma migration nova? Rode `node scripts/build-apply-bundle.mjs` para atualizar o passo 3 (um teste acusa se você esquecer) e `npm test`.

### A regra de ouro

Preço, taxa, desconto, horário, estoque e estado de pagamento são decididos **somente** pelas RPCs `SECURITY DEFINER` do banco. O total que o navegador manda nunca é usado, e triggers de guarda bloqueiam escrita direta nessas colunas. Dinheiro é sempre inteiro, em centavos.

## Estrutura de pastas

```
src/
  app/
    (auth)/            login, cadastro, recuperar e redefinir senha
    (dashboard)/       painel do lojista (cada página confere o papel)
    (legal)/           /termos e /privacidade
    (onboarding)/      criação da primeira loja
    api/               webhook e OAuth do Mercado Pago, crons
    auth/callback/     destino de todo link de e-mail
    dev/               prévias com dados fictícios (404 em produção)
    menu/[slug]/       cardápio público e sua imagem de compartilhamento
    pedido/[token]/    acompanhamento do pedido
    icon.tsx, opengraph-image.tsx, robots.ts, sitemap.ts, manifest.ts
  components/
    ui/                primitivos do design system
    landing/           as 7 cenas, efeitos (fx.tsx) e movimento (motion.tsx)
    layout/            casca do painel, casca de auth, telas de erro
    orders/ menu/ inventory/ customers/ settings/ dashboard/ tracking/ legal/
  features/*/actions.ts   server actions por domínio
  lib/
    supabase/          clientes (navegador, servidor, admin, público) e middleware
    mercadopago/       API, contas, assinatura do webhook, máquina de pagamento
    permissions/       contexto do tenant e papéis
    images/ inventory/ customers/ dashboard/ orders/   regras puras, testadas
    email/ notifications/ crypto/ brand/
supabase/
  migrations/          esquema numerado
  apply/               os três passos para o SQL Editor
tests/
  *.test.ts            unidades
  db/                  PGlite: migrations de verdade, RLS, RPCs, fluxo Mercado Pago
  e2e/                 Playwright
scripts/               stub do Mercado Pago, screenshots, bundle do SQL
docs/                  regras de negócio, segurança, esquema, deploy, pagamentos
```

## Documentação

| Arquivo | Leia quando |
|---|---|
| `BRIEF.md` | For mexer em design. As decisões ali já estão tomadas. |
| `docs/BUSINESS_RULES.md` | For mexer em pedido, estoque, cupom, entrega, pagamento ou equipe. |
| `docs/SECURITY.md` | For criar tabela, função, rota pública ou permissão. |
| `docs/DATABASE_SCHEMA.md` | Precisar do mapa das tabelas e RPCs. |
| `docs/DEPLOY_VERCEL.md` | For colocar no ar: variáveis, Supabase Auth, domínios e crons. |
| `docs/PAYMENTS_AND_NOTIFICATIONS_SETUP.md` | For ativar Mercado Pago, e-mail ou testar com o stub. |

## Design

- Paleta fixa: fundo `#101010`; superfícies `#1C1C1C`, `#242424`, `#2C2C2C`; laranja `#FF6A00` como único acento; texto e creme `#F3F3F0`.
- Fontes: Bricolage Grotesque (títulos), Inter (texto), JetBrains Mono (números).
- Tokens em `tailwind.config.ts` e `src/app/globals.css`; primitivos em `src/components/ui/`.
- Toda animação respeita `prefers-reduced-motion`. Telas são conferidas em 390, 768 e 1440 px, sem rolagem horizontal.
- Nada de dado inventado: sem números de clientes, depoimentos ou logos falsos.

## Antes de abrir para clientes reais

1. Preencher `src/lib/legal.ts` e passar `/termos` e `/privacidade` por um advogado.
2. Seguir `docs/DEPLOY_VERCEL.md` (variáveis, URLs do Supabase Auth, SMTP, domínio).
3. Validar pagamentos com a conta de teste do Mercado Pago (seção 8 do guia de pagamentos).
