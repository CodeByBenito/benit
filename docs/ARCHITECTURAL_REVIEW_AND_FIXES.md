# BENIT — Relatório de Auditoria Arquitetural e Resolução Técnica

**Data:** 08/11/2026  
**Status da Arquitetura:** **APROVADO PARA PRODUÇÃO (HARDENED)**  
**Escopo:** Resolução integral dos 7 pontos identificados na revisão técnica de arquitetura, isolamento multi-tenant, segurança RLS, Storage, regras de negócio server-side, escalabilidade SaaS e Realtime.

---

## Resumo Executivo

Todas as 7 vulnerabilidades e lacunas arquiteturais levantadas durante a auditoria pré-produção foram resolvidas diretamente nas migrations SQL do PostgreSQL, na camada de permissões e componentes do Next.js, na suíte de testes automatizados e na documentação oficial do projeto.

| # | Problema Identificado | Severidade Original | Status | Solução Aplicada |
| :--- | :--- | :--- | :--- | :--- |
| **1** | Leitura direta `anon` nas tabelas `stores` e `products` expondo colunas internas (`stock_quantity`, `sku`, `last_order_number`) | Alta | **Resolvido** | Remoção de `anon` das tabelas base + criação da RPC `get_public_menu_by_slug(p_slug)` retornando apenas campos públicos e booleano `in_stock`. |
| **2** | Políticas de upload/exclusão no Supabase Storage (`benit-assets`) sem isolamento por loja | Alta | **Resolvido** | Criação da função `can_manage_store_asset(name)` exigindo prefixo UUID `<store_id>/...` validado por `has_store_access`. |
| **3** | Ausência de validação server-side de `min_select`, `max_select`, `is_required` e duplicatas em grupos de opcionais | Média/Alta | **Resolvido** | Validação agregada por grupo dentro de `create_order_atomic` (`OPTION_MIN_REQUIRED`, `OPTION_MAX_EXCEEDED`, `DUPLICATE_OPTION`). |
| **4** | Chaves estrangeiras simples permitindo potencial vínculo cruzado de `store_id` entre tabelas pais e filhas | Média | **Resolvido** | Índices `UNIQUE (id, store_id)` nas tabelas pais e `FOREIGN KEY (ref_id, store_id)` compostas em todas as tabelas filhas. |
| **5** | Modelo `memberships` restrito apenas à organização e ausência de metadados base de planos/múltiplas lojas | Média | **Resolvido** | Coluna opcional `store_id` em `memberships` (acesso global `NULL` vs filial específica) + colunas `plan_tier`, `subscription_status` e `max_stores` em `organizations`. |
| **6** | Ausência de `REVOKE ALL FROM PUBLIC, anon` explícito nas funções administrativas `SECURITY DEFINER` | Baixa/Média | **Resolvido** | Aplicação de `REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon` antes de cada `GRANT EXECUTE` escopado. |
| **7** | Escopo parcial do Supabase Realtime e ausência de `REPLICA IDENTITY FULL` | Baixa/Média | **Resolvido** | `REPLICA IDENTITY FULL` em `orders` e `products` + hook reutilizável `useStoreRealtime` integrado em Pedidos e Estoque com reconexão automática. |

---

## Detalhamento Técnico das Soluções Implementadas

### 1. Blindagem de Dados Internos no Cardápio Público (`get_public_menu_by_slug`)
- **O que foi feito:**
  - Removidas todas as políticas `FOR SELECT TO anon` das tabelas base `stores`, `categories`, `products`, `product_option_groups` e `product_options` em `supabase/migrations/0002_rls_policies.sql`. Agora 100% das tabelas base exigem papel `authenticated` validado por `public.has_store_access(store_id)`.
  - Criada a RPC `public.get_public_menu_by_slug(p_slug TEXT)` em `supabase/migrations/0003_atomic_rpcs.sql`, que projeta em JSON **apenas** os atributos públicos da loja publicada, categorias ativas e produtos não arquivados, convertendo o estoque interno em um booleano seguro `in_stock = (NOT p.track_stock OR p.stock_quantity > 0)`.
  - Atualizada a rota pública `src/app/menu/[slug]/page.tsx` para consumir exclusivamente `supabase.rpc("get_public_menu_by_slug")`.
- **Resultado:** Mesmo que alguém extraia a `NEXT_PUBLIC_SUPABASE_ANON_KEY` do navegador e chame a API REST do Supabase diretamente, o banco retorna zero linhas para tabelas internas; `stock_quantity`, `low_stock_threshold`, `sku` e `last_order_number` jamais saem do servidor.

### 2. Isolamento Multi-Tenant no Supabase Storage (`benit-assets`)
- **O que foi feito:**
  - Criada a função `public.can_manage_store_asset(p_object_name TEXT)` em `supabase/migrations/0003_atomic_rpcs.sql`, que extrai o primeiro diretório do caminho (`split_part(p_object_name, '/', 1)`), valida formato UUID seguro via regex (evitando exceções de cast) e verifica `public.has_store_access(v_store_uuid)`.
  - Atualizadas as políticas `benit_assets_auth_insert`, `benit_assets_auth_update` e `benit_assets_auth_delete` em `storage.objects` para exigir `public.can_manage_store_asset(name)`.
- **Resultado:** O Proprietário da Loja B está fisicamente impedido pelo banco de sobrescrever ou apagar imagens em `<store_a_id>/products/...`.

### 3. Validação Server-Side Completa dos Grupos de Opcionais no Pedido
- **O que foi feito:**
  - Na função transacional `public.create_order_atomic` (`supabase/migrations/0003_atomic_rpcs.sql`), antes de inserir os itens do pedido:
    1. Verifica se o array `option_ids` contém IDs repetidos no mesmo item (`DUPLICATE_OPTION`).
    2. Faz `LEFT JOIN` entre todos os `product_option_groups` do produto e as opções enviadas pelo cliente, validando `chosen_count >= GREATEST(1, min_select)` quando `is_required = true`, `chosen_count >= min_select` nos demais casos (`OPTION_MIN_REQUIRED`), e `chosen_count <= max_select` (`OPTION_MAX_EXCEEDED`).
- **Resultado:** Requisições malformadas ou enviadas fora da interface web não conseguem burlar escolhas obrigatórias nem limites máximos de adicionais.

### 4. Integridade Referencial Multi-Tenant com Chaves Estrangeiras Compostas
- **O que foi feito:**
  - Em `supabase/migrations/0001_initial_schema.sql`, todas as entidades pais receberam constraints `UNIQUE (id, store_id)` (e `stores` recebeu `UNIQUE (id, organization_id)`).
  - Todas as tabelas filhas passaram a utilizar chaves estrangeiras compostas incluindo `store_id` (usando `ON DELETE SET NULL (coluna_ref)` nativo do PostgreSQL 15+ onde aplicável para preservar o `store_id NOT NULL`):
    - `fk_memberships_store_org`: `(store_id, organization_id) -> stores(id, organization_id)`
    - `fk_products_category_store`: `(category_id, store_id) -> categories(id, store_id)`
    - `fk_option_groups_product_store`: `(product_id, store_id) -> products(id, store_id)`
    - `fk_options_group_store`: `(group_id, store_id) -> product_option_groups(id, store_id)`
    - `fk_orders_customer_store`: `(customer_id, store_id) -> customers(id, store_id)`
    - `fk_order_items_order_store` & `fk_order_items_product_store`
    - `fk_order_item_options_item_store` & `fk_order_item_options_option_store`
    - `fk_order_status_history_order_store`
    - `fk_stock_movements_product_store` & `fk_stock_movements_order_store`
- **Resultado:** Torna-se matematicamente impossível vincular um produto, item de pedido ou movimentação de estoque de uma loja a uma categoria, pedido ou opcional pertencente a outra loja.

### 5. Suporte Nativo a Planos SaaS e Permissões por Unidade (`memberships.store_id`)
- **O que foi feito:**
  - Adicionadas em `organizations` as colunas `plan_tier` (`'FREE_PILOT'`), `subscription_status` (`'ACTIVE'`) e `max_stores` (`DEFAULT 1 CHECK (max_stores >= 1)`).
  - Adicionada em `memberships` a coluna opcional `store_id UUID` com dois índices parciais de unicidade (`uq_memberships_org_user_all_stores` para acesso global à organização quando `store_id IS NULL`, e `uq_memberships_org_store_user` para acesso restrito a uma filial específica).
  - Atualizadas `public.has_store_access(p_store_id)` em `0002_rls_policies.sql`, `src/types/domain.types.ts` e `src/lib/permissions/tenant.ts` para respeitar tanto membros globais (`OWNER`) quanto membros escopados por unidade (`MANAGER`, `ATTENDANT`, `KITCHEN`).

### 6. Hardening de Privilégios de Execução (`REVOKE ALL FROM PUBLIC, anon`)
- **O que foi feito:**
  - Adicionadas instruções explícitas `REVOKE ALL ON FUNCTION ... FROM PUBLIC, anon;` em `supabase/migrations/0003_atomic_rpcs.sql` para `onboard_organization_and_store`, `adjust_product_stock_atomic` e `transition_order_status_atomic`, concedendo `GRANT EXECUTE` estritamente a `authenticated`.
  - Para `get_public_menu_by_slug` e `create_order_atomic`, revogado `PUBLIC` e concedido `EXECUTE` explicitamente apenas a `anon, authenticated`.

### 7. Padronização e Segurança do Supabase Realtime (`useStoreRealtime`)
- **O que foi feito:**
  - Configurado `ALTER TABLE public.orders REPLICA IDENTITY FULL` e `ALTER TABLE public.products REPLICA IDENTITY FULL` em `0002_rls_policies.sql`.
  - Criado o hook reutilizável `src/lib/supabase/use-store-realtime.ts`, que gerencia a assinatura WebSocket filtrada por `store_id=eq.<storeId>` e reconcilia automaticamente estados defasados ao reconectar (`SUBSCRIBED`), recuperar rede (`online`) ou voltar à aba (`visibilitychange`).
  - Integrado o hook tanto no **Board por estágios** (`src/components/orders/orders-board-client.tsx`, ouvindo `orders` e `products`) quanto na **Central de Controle de Estoque** (`src/components/inventory/inventory-control-client.tsx`, ouvindo `products` e `stock_movements`).

---

## Arquivos Criados e Modificados

- **Banco de Dados & Testes SQL:**
  - `supabase/migrations/0001_initial_schema.sql`
  - `supabase/migrations/0002_rls_policies.sql`
  - `supabase/migrations/0003_atomic_rpcs.sql`
  - `supabase/tests/verify_rls_and_invariants.sql`
- **Aplicação Next.js & Tipos:**
  - `src/types/domain.types.ts`
  - `src/lib/permissions/tenant.ts`
  - `src/lib/supabase/use-store-realtime.ts` *(novo)*
  - `src/app/menu/[slug]/page.tsx`
  - `src/components/orders/orders-board-client.tsx`
  - `src/components/inventory/inventory-control-client.tsx`
- **Documentação & Testes Automatizados:**
  - `docs/ARCHITECTURE.md`
  - `docs/DATABASE_SCHEMA.md`
  - `docs/BUSINESS_RULES.md`
  - `docs/SECURITY.md`
  - `docs/ARCHITECTURAL_REVIEW_AND_FIXES.md` *(novo)*
  - `tests/benit-workflows-and-concurrency.test.ts`

