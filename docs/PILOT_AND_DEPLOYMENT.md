# BENIT — Guia de Implantação (Deploy) & Operação Piloto

Este guia descreve o passo a passo para colocar o **BENIT** em produção na **Vercel + Supabase** e conduzir a validação com 2 a 3 estabelecimentos pilotos (Fase 6).

---

## 1. Configuração do Banco de Dados no Supabase

1. Crie um novo projeto no [Supabase Dashboard](https://supabase.com/dashboard).
2. Abra o **SQL Editor** e execute, na ordem exata:
   - `supabase/migrations/0001_initial_schema.sql`
   - `supabase/migrations/0002_rls_policies.sql`
   - `supabase/migrations/0003_atomic_rpcs.sql`
   - *(Opcional para validar invariantes)*: `supabase/tests/verify_rls_and_invariants.sql`
3. Em **Authentication -> Providers -> Email**:
   - Para agilizar o onboarding dos estabelecimentos pilotos, você pode desativar temporariamente *"Confirm email"* (ou configurar seu provedor SMTP customizado).
4. Em **Project Settings -> API**, copie:
   - `Project URL` (`NEXT_PUBLIC_SUPABASE_URL`)
   - `anon public` key (`NEXT_PUBLIC_SUPABASE_ANON_KEY`)

---

## 2. Deploy na Vercel

1. Conecte o repositório GitHub `https://github.com/CodeByBenito/benit.git` à sua conta na **Vercel**.
2. Configure as **Environment Variables** no painel da Vercel:
   - `NEXT_PUBLIC_SUPABASE_URL`: URL do seu projeto Supabase
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`: Chave pública `anon` do seu projeto Supabase
   - `NEXT_PUBLIC_APP_URL`: URL de produção (ex: `https://benit.app` ou `https://benit.vercel.app`)
3. Clique em **Deploy**.

---

## 3. Roteiro de Validação e Operação Piloto (Checklist Fase 6)

Para cada estabelecimento piloto (ex: Hamburgueria, Pizzaria ou Cafeteria):

1. **Cadastro e Onboarding (`/register` -> `/onboarding`):**
   - Crie a conta do proprietário.
   - Cadastre o nome da empresa, nome da loja, WhatsApp e slug do cardápio (ex: `/menu/benit-burger`).
2. **Estruturação do Cardápio (`/menu-manager`):**
   - Crie 3 a 5 categorias ordenadas.
   - Cadastre os produtos com foto, preço, estoque inicial, alerta de estoque mínimo e grupos de adicionais.
3. **Teste do Cardápio Público (`/menu/[slug]`):**
   - Abra o link público pelo celular.
   - Adicione itens com adicionais à sacola e envie um pedido de teste.
4. **Operação do Quadro de Pedidos (`/orders`):**
   - Verifique a chegada em tempo real na coluna **NOVOS**.
   - Clique em **Confirmar Pedido** e valide que o estoque foi deduzido na **Central de Estoque (`/inventory`)**.
   - Avance pelos estágios **EM PREPARO -> PRONTOS -> CONCLUÍDO**.
   - Teste também um pedido manual no balcão e um cancelamento para confirmar o estorno automático no histórico de estoque.
5. **Isolamento Multi-Tenant:**
   - Confirme que a Loja Piloto A visualiza exclusivamente seus próprios produtos, pedidos, clientes e estoque, sem qualquer acesso aos dados da Loja Piloto B.

