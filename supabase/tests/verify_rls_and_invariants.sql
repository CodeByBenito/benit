-- =============================================================================
-- BENIT SaaS — Verificação Automatizada de RLS, Isolamento Multi-Tenant e Concorrência
-- Execute no SQL Editor do Supabase ou via psql.
-- Todo o teste roda em uma transação (BEGIN ... ROLLBACK) para validar as regras
-- reais do PostgreSQL sem deixar dados residuais no banco.
-- =============================================================================

BEGIN;

DO $$
DECLARE
    v_user_a UUID := '11111111-1111-4111-8111-111111111111';
    v_user_b UUID := '22222222-2222-4222-8222-222222222222';
    v_org_a UUID;
    v_store_a UUID;
    v_org_b UUID;
    v_store_b UUID;
    v_prod_a UUID;
    v_order_1 JSONB;
    v_order_2 JSONB;
    v_replay JSONB;
    v_stock_after INTEGER;
BEGIN
    -- 1. Validar que todas as tabelas possuem RLS ativo
    IF EXISTS (
        SELECT 1 FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename IN (
              'profiles', 'organizations', 'memberships', 'stores',
              'categories', 'products', 'product_option_groups', 'product_options',
              'customers', 'orders', 'order_items', 'order_item_options',
              'order_status_history', 'stock_movements'
          )
          AND rowsecurity = false
    ) THEN
        RAISE EXCEPTION 'FALHA DE SEGURANÇA: Uma ou mais tabelas estão com RLS desativado.';
    END IF;

    -- 2. Criar usuários simulados em auth.users e profiles
    INSERT INTO auth.users (id, email, raw_user_meta_data)
    VALUES
        (v_user_a, 'owner_a@benit.test', '{"full_name": "Proprietário Loja A"}'::jsonb),
        (v_user_b, 'owner_b@benit.test', '{"full_name": "Proprietário Loja B"}'::jsonb)
    ON CONFLICT (id) DO NOTHING;

    -- 3. Simular sessão autenticada do Owner A e executar onboarding
    PERFORM set_config('request.jwt.claim.sub', v_user_a::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_a::text, 'role', 'authenticated')::text, true);

    SELECT (public.onboard_organization_and_store(
        'Grupo A', 'grupo-a-test', 'Loja A Burger', 'loja-a-test', '11999990001'
    )->>'store_id')::UUID INTO v_store_a;

    -- Criar produto com apenas 1 unidade em estoque na Loja A
    INSERT INTO public.products (store_id, name, price_cents, is_available, track_stock, stock_quantity, low_stock_threshold)
    VALUES (v_store_a, 'Burger Exclusivo', 3500, true, true, 1, 2)
    RETURNING id INTO v_prod_a;

    -- 4. Simular sessão autenticada do Owner B e executar onboarding
    PERFORM set_config('request.jwt.claim.sub', v_user_b::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_b::text, 'role', 'authenticated')::text, true);

    SELECT (public.onboard_organization_and_store(
        'Grupo B', 'grupo-b-test', 'Loja B Pizza', 'loja-b-test', '11999990002'
    )->>'store_id')::UUID INTO v_store_b;

    -- TESTE DE ISOLAMENTO: Owner B NÃO tem acesso à Loja A
    IF public.has_store_access(v_store_a) THEN
        RAISE EXCEPTION 'FALHA DE ISOLAMENTO MULTI-TENANT: Owner B obteve acesso à Loja A!';
    END IF;

    -- 5. Voltar para sessão do Owner A e testar Idempotência, Baixa e Estorno
    PERFORM set_config('request.jwt.claim.sub', v_user_a::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_a::text, 'role', 'authenticated')::text, true);

    -- Criar Pedido 1 (Digital Menu -> status inicial NEW, não deduz estoque ainda)
    v_order_1 := public.create_order_atomic(
        v_store_a,
        'DIGITAL_MENU',
        'DELIVERY',
        'Cliente Um',
        '11988881111',
        jsonb_build_array(jsonb_build_object('product_id', v_prod_a, 'quantity', 1)),
        'Rua A, 10',
        NULL,
        0,
        0,
        'NEW',
        'idem-sql-test-1'
    );

    -- Testar replay idempotente com a mesma chave
    v_replay := public.create_order_atomic(
        v_store_a,
        'DIGITAL_MENU',
        'DELIVERY',
        'Cliente Um',
        '11988881111',
        jsonb_build_array(jsonb_build_object('product_id', v_prod_a, 'quantity', 1)),
        'Rua A, 10',
        NULL,
        0,
        0,
        'NEW',
        'idem-sql-test-1'
    );

    IF (v_order_1->>'order_id') <> (v_replay->>'order_id') THEN
        RAISE EXCEPTION 'FALHA DE IDEMPOTÊNCIA: Pedido duplicado criado!';
    END IF;

    -- Criar Pedido 2 concorrente para a mesma última unidade antes da confirmação do Pedido 1
    v_order_2 := public.create_order_atomic(
        v_store_a,
        'DIGITAL_MENU',
        'PICKUP',
        'Cliente Dois',
        '11988882222',
        jsonb_build_array(jsonb_build_object('product_id', v_prod_a, 'quantity', 1)),
        NULL,
        NULL,
        0,
        0,
        'NEW',
        'idem-sql-test-2'
    );

    -- Confirmar Pedido 1 -> Deduz a última unidade (estoque cai de 1 para 0)
    PERFORM public.transition_order_status_atomic(
        v_store_a,
        (v_order_1->>'order_id')::UUID,
        'CONFIRMED',
        'Confirmado no teste'
    );

    SELECT stock_quantity INTO v_stock_after FROM public.products WHERE id = v_prod_a;
    IF v_stock_after <> 0 THEN
        RAISE EXCEPTION 'FALHA DE ESTOQUE: Esperado 0 após confirmação, encontrado %', v_stock_after;
    END IF;

    -- Tentar confirmar Pedido 2 com estoque zerado -> Deve lançar exceção INSUFFICIENT_STOCK
    BEGIN
        PERFORM public.transition_order_status_atomic(
            v_store_a,
            (v_order_2->>'order_id')::UUID,
            'CONFIRMED',
            'Tentativa concorrente'
        );
        RAISE EXCEPTION 'FALHA DE CONCORRÊNCIA: O Pedido 2 não deveria ter sido confirmado sem estoque!';
    EXCEPTION
        WHEN OTHERS THEN
            IF position('INSUFFICIENT_STOCK' in SQLERRM) = 0 THEN
                RAISE;
            END IF;
    END;

    -- Cancelar Pedido 1 -> Estorna 1 unidade de volta para o estoque (0 -> 1)
    PERFORM public.transition_order_status_atomic(
        v_store_a,
        (v_order_1->>'order_id')::UUID,
        'CANCELLED',
        'Cancelamento de teste'
    );

    SELECT stock_quantity INTO v_stock_after FROM public.products WHERE id = v_prod_a;
    IF v_stock_after <> 1 THEN
        RAISE EXCEPTION 'FALHA DE ESTORNO: Esperado 1 após cancelamento, encontrado %', v_stock_after;
    END IF;

    RAISE NOTICE 'SUCESSO TOTAL: RLS, Isolamento Multi-Tenant, Idempotência, Concorrência da Última Unidade e Estorno validados!';
END $$;

ROLLBACK;
