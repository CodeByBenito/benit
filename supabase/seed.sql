-- =============================================================================
-- BENIT SaaS — Development Seed Helper
-- Run this optionally in a DEVELOPMENT Supabase environment after onboarding
-- your first store to populate realistic categories and products for testing.
-- =============================================================================

DO $$
DECLARE
    v_store_id UUID;
    v_cat_burgers UUID;
    v_cat_sides UUID;
    v_cat_drinks UUID;
    v_prod_smash UUID;
    v_group_addons UUID;
BEGIN
    -- Pick the most recently created store in the development database
    SELECT id INTO v_store_id
    FROM public.stores
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_store_id IS NULL THEN
        RAISE NOTICE 'Nenhuma loja encontrada. Conclua o onboarding em /onboarding primeiro.';
        RETURN;
    END IF;

    -- Only seed if the store has 0 categories
    IF EXISTS (SELECT 1 FROM public.categories WHERE store_id = v_store_id) THEN
        RAISE NOTICE 'A loja já possui categorias cadastradas. Seed ignorado para proteger os dados.';
        RETURN;
    END IF;

    INSERT INTO public.categories (store_id, name, description, sort_order, is_active)
    VALUES (v_store_id, 'Burgers Artesanais', 'Blends bovinos grelhados na brasa no pão brioche', 10, true)
    RETURNING id INTO v_cat_burgers;

    INSERT INTO public.categories (store_id, name, description, sort_order, is_active)
    VALUES (v_store_id, 'Porções & Acompanhamentos', 'Batatas crocantes e entradas artesanais', 20, true)
    RETURNING id INTO v_cat_sides;

    INSERT INTO public.categories (store_id, name, description, sort_order, is_active)
    VALUES (v_store_id, 'Bebidas & Drinks', 'Refrigerantes, sucos naturais e cervejas', 30, true)
    RETURNING id INTO v_cat_drinks;

    -- Insert sample products
    INSERT INTO public.products (
        store_id, category_id, sku, name, description, price_cents,
        is_available, track_stock, stock_quantity, low_stock_threshold, sort_order
    )
    VALUES (
        v_store_id, v_cat_burgers, 'BRG-001', 'Classic Smash Duplo',
        'Pão brioche selado na manteiga, 2 blends de 90g, queijo cheddar inglês duplo, picles artesanal e molho especial BENIT.',
        3490, true, true, 25, 5, 10
    )
    RETURNING id INTO v_prod_smash;

    INSERT INTO public.products (
        store_id, category_id, sku, name, description, price_cents,
        is_available, track_stock, stock_quantity, low_stock_threshold, sort_order
    )
    VALUES
    (
        v_store_id, v_cat_burgers, 'BRG-002', 'Bacon Crispy Burger',
        'Blend 160g na brasa, fatias de bacon crocante defumado, queijo prato, cebola caramelizada e maionese defumada.',
        3890, true, true, 4, 5, 20
    ),
    (
        v_store_id, v_cat_sides, 'POR-001', 'Batata Rústica com Cheddar & Bacon',
        'Porção individual de batatas rústicas crocantes finalizadas com molho cheddar cremoso e farofa de bacon.',
        2290, true, true, 30, 8, 10
    ),
    (
        v_store_id, v_cat_drinks, 'BEB-001', 'Limonada Suíça com Hortelã 400ml',
        'Preparada na hora com limão taiti fresco e folhas de hortelã.',
        1290, true, true, 40, 10, 10
    );

    -- Add Option Group to Classic Smash Duplo
    INSERT INTO public.product_option_groups (
        store_id, product_id, name, min_select, max_select, is_required, sort_order
    )
    VALUES (
        v_store_id, v_prod_smash, 'Adicionais Extras', 0, 3, false, 10
    )
    RETURNING id INTO v_group_addons;

    INSERT INTO public.product_options (
        store_id, group_id, name, price_cents, is_available, sort_order
    )
    VALUES
        (v_store_id, v_group_addons, 'Bacon Crocante Extra', 600, true, 10),
        (v_store_id, v_group_addons, 'Cheddar Inglês Extra', 500, true, 20),
        (v_store_id, v_group_addons, 'Hambúrguer 90g Extra', 1100, true, 30);

    -- Record initial stock movements
    INSERT INTO public.stock_movements (
        store_id, product_id, movement_type, quantity_delta, previous_quantity, new_quantity, reason
    )
    SELECT
        store_id, id, 'INITIAL', stock_quantity, 0, stock_quantity, 'Carga inicial de desenvolvimento'
    FROM public.products
    WHERE store_id = v_store_id AND track_stock = true AND stock_quantity > 0;

    RAISE NOTICE 'Seed de desenvolvimento aplicado com sucesso para a loja %.', v_store_id;
END $$;

