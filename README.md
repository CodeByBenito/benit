# BENIT.
**"Sua operação. Sob controle."**

Plataforma SaaS multi-tenant em tempo real para gestão operacional de restaurantes, hamburguerias, pizzarias, lanchonetes e cafeterias.

---

## Pilares Operacionais (MVP)

1. **Dashboard Operacional (`/dashboard`)**: Indicadores reais de faturamento, novos pedidos, pedidos em andamento, concluídos, gráfico dos últimos 7 dias e alertas de estoque crítico.
2. **Gestão de Pedidos (`/orders`)**: *Board por estágios* (`NOVOS`, `CONFIRMADOS`, `EM PREPARO`, `PRONTOS`) com Modo Foco, filtros por modalidade (`MESA`, `DELIVERY`, `RETIRADA`), lançamento de pedido manual e sincronização em tempo real via Supabase Realtime.
3. **Cardápio Digital & Catálogo (`/menu-manager` e `/menu/[slug]`)**: Gestão de categorias, produtos, opcionais/adicionais, upload de imagens e cardápio público mobile-first com sacola de compras.
4. **Central de Controle de Estoque (`/inventory`)**: Controle por produto com baixa atômica na confirmação do pedido, estorno automático em cancelamentos, entradas/saídas manuais e histórico auditável (`stock_movements`).
5. **Clientes & Atendimento (`/customers`)**: Base de clientes por loja com histórico de pedidos e botão de contato rápido via WhatsApp.

---

## Configuração Rápida (Supabase + Next.js)

### 1. Variáveis de Ambiente
Copie o arquivo `.env.example` para `.env.local`:

```bash
cp .env.example .env.local
```

Preencha com as credenciais do seu projeto Supabase:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### 2. Executar Migrations no Supabase
No **SQL Editor** do seu painel Supabase, execute na ordem:
1. [`supabase/migrations/0001_initial_schema.sql`](./supabase/migrations/0001_initial_schema.sql)
2. [`supabase/migrations/0002_rls_policies.sql`](./supabase/migrations/0002_rls_policies.sql)
3. [`supabase/migrations/0003_atomic_rpcs.sql`](./supabase/migrations/0003_atomic_rpcs.sql)

### 3. Rodar Localmente

```bash
npm install
npm run dev
```

Acesse `http://localhost:3000`.

