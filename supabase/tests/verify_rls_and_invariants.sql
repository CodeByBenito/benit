-- =============================================================================
-- BENIT SaaS — Verificação SQL Completa (RLS, Projeção Pública, FKs Compostas,
-- Opcionais Server-Side, Isolamento de Storage e Concorrência da Última Unidade)
-- =============================================================================

BEGIN;

DO $$
DECLARE
    v_user_a UUID := '11111111-1111-4111-8111-111111111111';
    v_user_b UUID := '22222222-2222-4222-8222-222222222222';
    v_store_a UUID;
    v_store_b UUID;
    v_cat_b UUID;
    v_prod_a UUID;
    v_group_a UUID;
    v_opt_a1 UUID;
    v_public_menu JSONB;
    v_order_1 JSONB;
    v_order_2 JSONB;
    v_stock_after INTEGER;
BEGIN
    -- 1. Confirmar RLS ativo nas 14 tabelas públicas
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

    -- 2. Confirmar que `anon` NÃO possui políticas de SELECT direto em `stores` ou `products`
    IF EXISTS (
        SELECT 1 FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename IN ('stores', 'products')
          AND 'anon' = ANY(roles)
    ) THEN
        RAISE EXCEPTION 'FALHA DE SEGURANÇA: Tabelas base stores/products não devem expor SELECT direto para anon.';
    END IF;

    INSERT INTO auth.users (id, email, raw_user_meta_data)
    VALUES
        (v_user_a, 'owner_a@benit.test', '{"full_name": "Proprietário Loja A"}'::jsonb),
        (v_user_b, 'owner_b@benit.test', '{"full_name": "Proprietário Loja B"}'::jsonb)
    ON CONFLICT (id) DO NOTHING;

    -- Onboarding Loja A
    PERFORM set_config('request.jwt.claim.sub', v_user_a::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_a::text, 'role', 'authenticated')::text, true);

    SELECT (public.onboard_organization_and_store(
        'Grupo A', 'grupo-a-verify', 'Loja A Burger', 'loja-a-verify', '11999990001'
    )->>'store_id')::UUID INTO v_store_a;

    -- Onboarding Loja B
    PERFORM set_config('request.jwt.claim.sub', v_user_b::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_b::text, 'role', 'authenticated')::text, true);

    SELECT (public.onboard_organization_and_store(
        'Grupo B', 'grupo-b-verify', 'Loja B Pizza', 'loja-b-verify', '11999990002'
    )->>'store_id')::UUID INTO v_store_b;

    INSERT INTO public.categories (store_id, name)
    VALUES (v_store_b, 'Categoria Exclusiva B')
    RETURNING id INTO v_cat_b;

    -- Testar isolamento de Storage: User B não pode gerenciar pasta da Loja A
    IF public.can_manage_store_asset(v_store_a::text || '/products/foto.jpg') THEN
        RAISE EXCEPTION 'FALHA DE STORAGE RLS: User B obteve permissão na pasta da Loja A!';
    END IF;

    -- Voltar para User A
    PERFORM set_config('request.jwt.claim.sub', v_user_a::text, true);
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user_a::text, 'role', 'authenticated')::text, true);

    -- Testar FK Composta: tentar vincular produto da Loja A à categoria da Loja B deve falhar
    BEGIN
        INSERT INTO public.products (store_id, category_id, name, price_cents)
        VALUES (v_store_a, v_cat_b, 'Produto Cruzado', 2000);
        RAISE EXCEPTION 'FALHA DE INTEGRIDADE: FK composta permitiu categoria de outra loja!';
    EXCEPTION
        WHEN foreign_key_violation THEN
            NULL; -- Esperado!
    END;

    -- Criar produto na Loja A com 1 unidade e grupo de opcional obrigatório
    INSERT INTO public.products (store_id, sku, name, price_cents, is_available, track_stock, stock_quantity, low_stock_threshold)
    VALUES (v_store_a, 'SKU-SECRETO', 'Burger Especial', 3500, true, true, 1, 2)
    RETURNING id INTO v_prod_a;

    INSERT INTO public.product_option_groups (store_id, product_id, name, min_select, max_select, is_required)
    VALUES (v_store_a, v_prod_a, 'Ponto da Carne', 1, 1, true)
    RETURNING id INTO v_group_a;

    INSERT INTO public.product_options (store_id, group_id, name, price_cents, is_available)
    VALUES (v_store_a, v_group_a, 'Ao Ponto', 0, true)
    RETURNING id INTO v_opt_a1;

    -- Testar Projeção Pública (`get_public_menu_by_slug`): não deve conter `stock_quantity` nem `sku`
    v_public_menu := public.get_public_menu_by_slug('loja-a-verify');
    IF (v_public_menu->'products'->0 ? 'stock_quantity') OR (v_public_menu->'products'->0 ? 'sku') THEN
        RAISE EXCEPTION 'VAZAMENTO PÚBLICO: Colunas privadas apareceram no JSON público!';
    END IF;

    -- Testar rejeição de pedido sem opcional obrigatório
    BEGIN
        PERFORM public.create_order_atomic(
            v_store_a, 'DIGITAL_MENU', 'PICKUP', 'Cliente Teste', '11988881111',
            jsonb_build_array(jsonb_build_object('product_id', v_prod_a, 'quantity', 1, 'option_ids', '[]'::jsonb))
        );
        RAISE EXCEPTION 'FALHA DE VALIDAÇÃO: Pedido aceito sem opcional obrigatório!';
    EXCEPTION
        WHEN OTHERS THEN
            IF position('OPTION_MIN_REQUIRED' in SQLERRM) = 0 THEN
                RAISE;
            END IF;
    END;

    -- Criar 2 pedidos concorrentes válidos com o opcional obrigatório
    v_order_1 := public.create_order_atomic(
        v_store_a, 'DIGITAL_MENU', 'PICKUP', 'Cliente 1', '11988881111',
        jsonb_build_array(jsonb_build_object('product_id', v_prod_a, 'quantity', 1, 'option_ids', jsonb_build_array(v_opt_a1)))
    );
    v_order_2 := public.create_order_atomic(
        v_store_a, 'DIGITAL_MENU', 'PICKUP', 'Cliente 2', '11988882222',
        jsonb_build_array(jsonb_build_object('product_id', v_prod_a, 'quantity', 1, 'option_ids', jsonb_build_array(v_opt_a1)))
    );

    -- Confirmar Pedido 1 consome a última unidade (1 -> 0)
    PERFORM public.transition_order_status_atomic(v_store_a, (v_order_1->>'order_id')::UUID, 'CONFIRMED');

    -- Confirmar Pedido 2 deve falhar com INSUFFICIENT_STOCK
    BEGIN
        PERFORM public.transition_order_status_atomic(v_store_a, (v_order_2->>'order_id')::UUID, 'CONFIRMED');
        RAISE EXCEPTION 'FALHA DE CONCORRÊNCIA: Segunda confirmação não deveria passar!';
    EXCEPTION
        WHEN OTHERS THEN
            IF position('INSUFFICIENT_STOCK' in SQLERRM) = 0 THEN
                RAISE;
            END IF;
    END;

    -- Cancelar Pedido 1 estorna a unidade (0 -> 1)
    PERFORM public.transition_order_status_atomic(v_store_a, (v_order_1->>'order_id')::UUID, 'CANCELLED');
    SELECT stock_quantity INTO v_stock_after FROM public.products WHERE id = v_prod_a;
    IF v_stock_after <> 1 THEN
        RAISE EXCEPTION 'FALHA DE ESTORNO: Estoque esperado = 1, atual = %', v_stock_after;
    END IF;

    RAISE NOTICE 'TODAS AS 7 CORREÇÕES ARQUITETURAIS E DE SEGURANÇA FORAM VALIDADAS COM SUCESSO!';
END $$;

ROLLBACK;
