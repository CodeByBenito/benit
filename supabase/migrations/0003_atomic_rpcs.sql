-- =============================================================================
-- BENIT SaaS — Migration 0003: Hardened Atomic RPCs, Public Menu Projection & Storage RLS
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. CONTROLLED PUBLIC DIGITAL MENU PROJECTION (Zero Private Column Leakage)
-- Returns ONLY sanitized store profile, active categories, and non-archived
-- products with a boolean `in_stock` flag (never exposing stock_quantity or sku).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_public_menu_by_slug(p_slug TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_store RECORD;
    v_categories JSONB;
    v_products JSONB;
BEGIN
    SELECT
        id,
        name,
        slug,
        description,
        logo_url,
        banner_url,
        phone,
        whatsapp,
        address,
        currency,
        is_open
    INTO v_store
    FROM public.stores
    WHERE slug = lower(trim(p_slug))
      AND is_published = true;

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', c.id,
                'name', c.name,
                'description', c.description
            )
            ORDER BY c.sort_order ASC, c.created_at ASC
        ),
        '[]'::jsonb
    )
    INTO v_categories
    FROM public.categories c
    WHERE c.store_id = v_store.id
      AND c.is_active = true;

    SELECT COALESCE(
        jsonb_agg(
            jsonb_build_object(
                'id', p.id,
                'category_id', p.category_id,
                'name', p.name,
                'description', p.description,
                'price_cents', p.price_cents,
                'image_url', p.image_url,
                'is_available', p.is_available,
                'in_stock', (NOT p.track_stock OR p.stock_quantity > 0),
                'option_groups', COALESCE(
                    (
                        SELECT jsonb_agg(
                            jsonb_build_object(
                                'id', g.id,
                                'name', g.name,
                                'min_select', g.min_select,
                                'max_select', g.max_select,
                                'is_required', g.is_required,
                                'options', COALESCE(
                                    (
                                        SELECT jsonb_agg(
                                            jsonb_build_object(
                                                'id', o.id,
                                                'name', o.name,
                                                'price_cents', o.price_cents
                                            )
                                            ORDER BY o.sort_order ASC, o.created_at ASC
                                        )
                                        FROM public.product_options o
                                        WHERE o.group_id = g.id
                                          AND o.store_id = v_store.id
                                          AND o.is_available = true
                                    ),
                                    '[]'::jsonb
                                )
                            )
                            ORDER BY g.sort_order ASC, g.created_at ASC
                        )
                        FROM public.product_option_groups g
                        WHERE g.product_id = p.id
                          AND g.store_id = v_store.id
                    ),
                    '[]'::jsonb
                )
            )
            ORDER BY p.sort_order ASC, p.created_at DESC
        ),
        '[]'::jsonb
    )
    INTO v_products
    FROM public.products p
    WHERE p.store_id = v_store.id
      AND p.is_archived = false;

    RETURN jsonb_build_object(
        'store', jsonb_build_object(
            'id', v_store.id,
            'name', v_store.name,
            'slug', v_store.slug,
            'description', v_store.description,
            'logo_url', v_store.logo_url,
            'banner_url', v_store.banner_url,
            'phone', v_store.phone,
            'whatsapp', v_store.whatsapp,
            'address', v_store.address,
            'currency', v_store.currency,
            'is_open', v_store.is_open
        ),
        'categories', v_categories,
        'products', v_products
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. ATOMIC TENANT ONBOARDING (Organization + Membership + Initial Store)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.onboard_organization_and_store(
    p_org_name TEXT,
    p_org_slug TEXT,
    p_store_name TEXT,
    p_store_slug TEXT,
    p_phone TEXT DEFAULT NULL,
    p_whatsapp TEXT DEFAULT NULL,
    p_description TEXT DEFAULT NULL,
    p_address TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_org_id UUID;
    v_store_id UUID;
BEGIN
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'NOT_AUTHENTICATED: Usuário não autenticado.';
    END IF;

    INSERT INTO public.profiles (id, full_name, email)
    SELECT u.id, COALESCE(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)), COALESCE(u.email, '')
    FROM auth.users u
    WHERE u.id = v_user_id
    ON CONFLICT (id) DO NOTHING;

    INSERT INTO public.organizations (name, slug, created_by)
    VALUES (trim(p_org_name), lower(trim(p_org_slug)), v_user_id)
    RETURNING id INTO v_org_id;

    INSERT INTO public.memberships (organization_id, store_id, user_id, role)
    VALUES (v_org_id, NULL, v_user_id, 'OWNER');

    INSERT INTO public.stores (
        organization_id,
        name,
        slug,
        phone,
        whatsapp,
        description,
        address,
        is_open,
        is_published
    )
    VALUES (
        v_org_id,
        trim(p_store_name),
        lower(trim(p_store_slug)),
        NULLIF(trim(p_phone), ''),
        NULLIF(trim(COALESCE(p_whatsapp, p_phone)), ''),
        NULLIF(trim(p_description), ''),
        NULLIF(trim(p_address), ''),
        true,
        true
    )
    RETURNING id INTO v_store_id;

    RETURN jsonb_build_object(
        'organization_id', v_org_id,
        'store_id', v_store_id,
        'store_slug', lower(trim(p_store_slug))
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. ATOMIC STOCK ADJUSTMENT (Manual Entry, Exit, Adjustment)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.adjust_product_stock_atomic(
    p_store_id UUID,
    p_product_id UUID,
    p_movement_type public.stock_movement_type,
    p_quantity INTEGER,
    p_reason TEXT DEFAULT NULL,
    p_reference_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_product RECORD;
    v_delta INTEGER;
    v_new_qty INTEGER;
    v_movement_id UUID;
BEGIN
    IF v_user_id IS NULL OR NOT public.has_store_access(p_store_id) THEN
        RAISE EXCEPTION 'FORBIDDEN: Sem permissão para gerenciar o estoque desta loja.';
    END IF;

    IF p_movement_type NOT IN ('INITIAL', 'ENTRY', 'EXIT', 'ADJUSTMENT') THEN
        RAISE EXCEPTION 'INVALID_MOVEMENT_TYPE: Tipo de movimentação manual inválido.';
    END IF;

    SELECT * INTO v_product
    FROM public.products
    WHERE id = p_product_id AND store_id = p_store_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'PRODUCT_NOT_FOUND: Produto não encontrado nesta loja.';
    END IF;

    IF p_movement_type IN ('INITIAL', 'ADJUSTMENT') THEN
        IF p_quantity < 0 THEN
            RAISE EXCEPTION 'INVALID_QUANTITY: O saldo de estoque não pode ser negativo.';
        END IF;
        v_new_qty := p_quantity;
        v_delta := v_new_qty - v_product.stock_quantity;
        IF v_delta = 0 THEN
            RETURN jsonb_build_object(
                'product_id', v_product.id,
                'previous_quantity', v_product.stock_quantity,
                'new_quantity', v_product.stock_quantity,
                'unchanged', true
            );
        END IF;
    ELSIF p_movement_type = 'ENTRY' THEN
        IF p_quantity <= 0 THEN
            RAISE EXCEPTION 'INVALID_QUANTITY: A quantidade de entrada deve ser maior que zero.';
        END IF;
        v_delta := p_quantity;
        v_new_qty := v_product.stock_quantity + p_quantity;
    ELSIF p_movement_type = 'EXIT' THEN
        IF p_quantity <= 0 THEN
            RAISE EXCEPTION 'INVALID_QUANTITY: A quantidade de saída deve ser maior que zero.';
        END IF;
        IF v_product.stock_quantity < p_quantity THEN
            RAISE EXCEPTION 'INSUFFICIENT_STOCK: Saldo insuficiente para saída (Disponível: %, Solicitado: %).',
                v_product.stock_quantity, p_quantity;
        END IF;
        v_delta := -p_quantity;
        v_new_qty := v_product.stock_quantity - p_quantity;
    END IF;

    UPDATE public.products
    SET stock_quantity = v_new_qty,
        track_stock = true
    WHERE id = v_product.id;

    INSERT INTO public.stock_movements (
        store_id,
        product_id,
        movement_type,
        quantity_delta,
        previous_quantity,
        new_quantity,
        reference_key,
        reason,
        created_by
    )
    VALUES (
        p_store_id,
        v_product.id,
        p_movement_type,
        v_delta,
        v_product.stock_quantity,
        v_new_qty,
        p_reference_key,
        COALESCE(NULLIF(trim(p_reason), ''), 'Ajuste manual no painel'),
        v_user_id
    )
    RETURNING id INTO v_movement_id;

    RETURN jsonb_build_object(
        'movement_id', v_movement_id,
        'product_id', v_product.id,
        'previous_quantity', v_product.stock_quantity,
        'new_quantity', v_new_qty,
        'quantity_delta', v_delta
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 4. ATOMIC ORDER CREATION (With Option Group min/max/is_required Validation)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_order_atomic(
    p_store_id UUID,
    p_source public.order_source,
    p_fulfillment_type public.fulfillment_type,
    p_customer_name TEXT,
    p_customer_phone TEXT,
    p_items JSONB,
    p_table_or_reference TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_discount_cents INTEGER DEFAULT 0,
    p_fee_cents INTEGER DEFAULT 0,
    p_initial_status public.order_status DEFAULT 'NEW',
    p_idempotency_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_store RECORD;
    v_existing_order RECORD;
    v_order_number INTEGER;
    v_customer_id UUID;
    v_normalized_phone TEXT;
    v_order_id UUID;
    v_subtotal_cents INTEGER := 0;
    v_total_cents INTEGER := 0;
    v_discount INTEGER := COALESCE(p_discount_cents, 0);
    v_fee INTEGER := COALESCE(p_fee_cents, 0);
    v_should_deduct_stock BOOLEAN := false;
    v_item JSONB;
    v_product RECORD;
    v_item_qty INTEGER;
    v_options_unit_cents INTEGER;
    v_total_item_cents INTEGER;
    v_order_item_id UUID;
    v_opt_id UUID;
    v_opt RECORD;
    v_group_check RECORD;
    v_selected_opt_ids UUID[];
    v_req_Row RECORD;
BEGIN
    SELECT * INTO v_store
    FROM public.stores
    WHERE id = p_store_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'STORE_NOT_FOUND: Loja não encontrada.';
    END IF;

    IF p_source = 'MANUAL' THEN
        IF v_user_id IS NULL OR NOT public.has_store_access(p_store_id) THEN
            RAISE EXCEPTION 'FORBIDDEN: Apenas usuários autorizados podem registrar pedidos manuais.';
        END IF;
        IF p_initial_status NOT IN ('NEW', 'CONFIRMED') THEN
            RAISE EXCEPTION 'INVALID_INITIAL_STATUS: Pedido manual deve iniciar como NEW ou CONFIRMED.';
        END IF;
    ELSE
        IF NOT v_store.is_published THEN
            RAISE EXCEPTION 'STORE_UNPUBLISHED: O cardápio digital desta loja não está publicado.';
        END IF;
        IF NOT v_store.is_open THEN
            RAISE EXCEPTION 'STORE_CLOSED: A loja está fechada para novos pedidos no momento.';
        END IF;
        p_initial_status := 'NEW';
        v_discount := 0;
        v_fee := 0;
    END IF;

    -- Idempotency check
    IF p_idempotency_key IS NOT NULL AND trim(p_idempotency_key) <> '' THEN
        SELECT id, order_number, status, total_cents
        INTO v_existing_order
        FROM public.orders
        WHERE store_id = p_store_id AND idempotency_key = trim(p_idempotency_key);

        IF FOUND THEN
            RETURN jsonb_build_object(
                'order_id', v_existing_order.id,
                'order_number', v_existing_order.order_number,
                'status', v_existing_order.status,
                'total_cents', v_existing_order.total_cents,
                'idempotent_replay', true
            );
        END IF;
    END IF;

    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'EMPTY_ORDER: O pedido deve conter pelo menos um item.';
    END IF;

    -- Lock and validate aggregated product quantities (ordered by product_id to prevent deadlocks)
    FOR v_req_Row IN
        SELECT
            (elem->>'product_id')::UUID AS product_id,
            SUM(COALESCE((elem->>'quantity')::INTEGER, 0)) AS total_requested
        FROM jsonb_array_elements(p_items) AS elem
        GROUP BY (elem->>'product_id')::UUID
        ORDER BY (elem->>'product_id')::UUID
    LOOP
        IF v_req_Row.total_requested <= 0 THEN
            RAISE EXCEPTION 'INVALID_QUANTITY: A quantidade de cada item deve ser maior que zero.';
        END IF;

        SELECT * INTO v_product
        FROM public.products
        WHERE id = v_req_Row.product_id AND store_id = p_store_id AND is_archived = false
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'PRODUCT_NOT_FOUND: Um dos produtos selecionados não existe mais.';
        END IF;

        IF NOT v_product.is_available THEN
            RAISE EXCEPTION 'PRODUCT_UNAVAILABLE: O produto "%" está indisponível no momento.', v_product.name;
        END IF;

        IF v_product.track_stock AND v_product.stock_quantity < v_req_Row.total_requested THEN
            RAISE EXCEPTION 'INSUFFICIENT_STOCK: Estoque insuficiente para "%" (Disponível: %, Solicitado: %).',
                v_product.name, v_product.stock_quantity, v_req_Row.total_requested;
        END IF;
    END LOOP;

    -- Upsert store-scoped customer
    v_normalized_phone := regexp_replace(COALESCE(p_customer_phone, ''), '[^0-9]', '', 'g');
    IF char_length(v_normalized_phone) < 8 THEN
        v_normalized_phone := trim(p_customer_phone);
    END IF;

    INSERT INTO public.customers (store_id, name, phone, last_order_at)
    VALUES (p_store_id, trim(p_customer_name), v_normalized_phone, now())
    ON CONFLICT (store_id, phone) DO UPDATE
    SET name = EXCLUDED.name,
        last_order_at = now()
    RETURNING id INTO v_customer_id;

    -- Increment sequential order_number atomically
    UPDATE public.stores
    SET last_order_number = last_order_number + 1
    WHERE id = p_store_id
    RETURNING last_order_number INTO v_order_number;

    v_should_deduct_stock := (p_initial_status = 'CONFIRMED');

    INSERT INTO public.orders (
        store_id,
        customer_id,
        order_number,
        source,
        fulfillment_type,
        table_or_reference,
        status,
        customer_name_snapshot,
        customer_phone_snapshot,
        subtotal_cents,
        discount_cents,
        fee_cents,
        total_cents,
        notes,
        stock_deducted,
        idempotency_key,
        created_by
    )
    VALUES (
        p_store_id,
        v_customer_id,
        v_order_number,
        p_source,
        COALESCE(p_fulfillment_type, 'PICKUP'),
        NULLIF(trim(p_table_or_reference), ''),
        p_initial_status,
        trim(p_customer_name),
        v_normalized_phone,
        0,
        GREATEST(0, v_discount),
        GREATEST(0, v_fee),
        0,
        NULLIF(trim(p_notes), ''),
        v_should_deduct_stock,
        NULLIF(trim(p_idempotency_key), ''),
        v_user_id
    )
    RETURNING id INTO v_order_id;

    -- Process each item and validate option group rules on the server
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        SELECT * INTO v_product
        FROM public.products
        WHERE id = (v_item->>'product_id')::UUID AND store_id = p_store_id;

        v_item_qty := (v_item->>'quantity')::INTEGER;
        v_options_unit_cents := 0;
        v_selected_opt_ids := ARRAY[]::UUID[];

        IF v_item ? 'option_ids' AND jsonb_typeof(v_item->'option_ids') = 'array' THEN
            SELECT COALESCE(array_agg((val #>> '{}')::UUID), ARRAY[]::UUID[])
            INTO v_selected_opt_ids
            FROM jsonb_array_elements(v_item->'option_ids') AS val;
        END IF;

        -- Prevent duplicate option_ids in the same order item
        IF COALESCE(array_length(v_selected_opt_ids, 1), 0) <> (
            SELECT COUNT(DISTINCT u) FROM unnest(v_selected_opt_ids) AS u
        ) THEN
            RAISE EXCEPTION 'DUPLICATE_OPTION: O mesmo item opcional não pode ser enviado duplicado em "%".', v_product.name;
        END IF;

        -- Enforce min_select, max_select, and is_required for every option group of this product
        FOR v_group_check IN
            SELECT
                pog.id,
                pog.name,
                pog.min_select,
                pog.max_select,
                pog.is_required,
                COUNT(po.id)::INTEGER AS chosen_count
            FROM public.product_option_groups pog
            LEFT JOIN public.product_options po
                ON po.group_id = pog.id
               AND po.store_id = p_store_id
               AND po.id = ANY(v_selected_opt_ids)
            WHERE pog.product_id = v_product.id
              AND pog.store_id = p_store_id
            GROUP BY pog.id, pog.name, pog.min_select, pog.max_select, pog.is_required
        LOOP
            IF (v_group_check.is_required AND v_group_check.chosen_count < GREATEST(1, v_group_check.min_select))
               OR (v_group_check.chosen_count < v_group_check.min_select) THEN
                RAISE EXCEPTION 'OPTION_MIN_REQUIRED: Selecione pelo menos % opção(ões) em "%" para o produto "%".',
                    GREATEST(CASE WHEN v_group_check.is_required THEN 1 ELSE 0 END, v_group_check.min_select),
                    v_group_check.name,
                    v_product.name;
            END IF;

            IF v_group_check.chosen_count > v_group_check.max_select THEN
                RAISE EXCEPTION 'OPTION_MAX_EXCEEDED: O grupo "%" permite no máximo % opção(ões) em "%".',
                    v_group_check.name,
                    v_group_check.max_select,
                    v_product.name;
            END IF;
        END LOOP;

        INSERT INTO public.order_items (
            store_id,
            order_id,
            product_id,
            product_name_snapshot,
            unit_price_cents,
            options_unit_price_cents,
            quantity,
            total_item_cents,
            notes
        )
        VALUES (
            p_store_id,
            v_order_id,
            v_product.id,
            v_product.name,
            v_product.price_cents,
            0,
            v_item_qty,
            0,
            NULLIF(trim(v_item->>'notes'), '')
        )
        RETURNING id INTO v_order_item_id;

        FOREACH v_opt_id IN ARRAY v_selected_opt_ids
        LOOP
            SELECT po.*, pog.name AS group_name
            INTO v_opt
            FROM public.product_options po
            JOIN public.product_option_groups pog ON pog.id = po.group_id AND pog.store_id = po.store_id
            WHERE po.id = v_opt_id
              AND po.store_id = p_store_id
              AND pog.product_id = v_product.id
              AND po.is_available = true;

            IF NOT FOUND THEN
                RAISE EXCEPTION 'INVALID_OPTION: Uma das opções selecionadas para "%" é inválida ou está indisponível.', v_product.name;
            END IF;

            v_options_unit_cents := v_options_unit_cents + v_opt.price_cents;

            INSERT INTO public.order_item_options (
                store_id,
                order_item_id,
                option_id,
                group_name_snapshot,
                option_name_snapshot,
                price_cents
            )
            VALUES (
                p_store_id,
                v_order_item_id,
                v_opt.id,
                v_opt.group_name,
                v_opt.name,
                v_opt.price_cents
            );
        END LOOP;

        v_total_item_cents := (v_product.price_cents + v_options_unit_cents) * v_item_qty;
        v_subtotal_cents := v_subtotal_cents + v_total_item_cents;

        UPDATE public.order_items
        SET options_unit_price_cents = v_options_unit_cents,
            total_item_cents = v_total_item_cents
        WHERE id = v_order_item_id;

        IF v_should_deduct_stock AND v_product.track_stock THEN
            UPDATE public.products
            SET stock_quantity = stock_quantity - v_item_qty
            WHERE id = v_product.id;

            INSERT INTO public.stock_movements (
                store_id,
                product_id,
                order_id,
                movement_type,
                quantity_delta,
                previous_quantity,
                new_quantity,
                reference_key,
                reason,
                created_by
            )
            VALUES (
                p_store_id,
                v_product.id,
                v_order_id,
                'ORDER_DEDUCTION',
                -v_item_qty,
                v_product.stock_quantity,
                v_product.stock_quantity - v_item_qty,
                'order:' || v_order_id || ':item:' || v_order_item_id || ':deduct',
                'Baixa automática na confirmação do pedido #' || v_order_number,
                v_user_id
            );

            -- Refresh v_product.stock_quantity if another line in the same order references the same product
            v_product.stock_quantity := v_product.stock_quantity - v_item_qty;
        END IF;
    END LOOP;

    v_total_cents := GREATEST(0, v_subtotal_cents - GREATEST(0, v_discount) + GREATEST(0, v_fee));

    UPDATE public.orders
    SET subtotal_cents = v_subtotal_cents,
        total_cents = v_total_cents
    WHERE id = v_order_id;

    UPDATE public.customers
    SET total_orders = total_orders + 1,
        total_spent_cents = total_spent_cents + v_total_cents,
        last_order_at = now()
    WHERE id = v_customer_id;

    INSERT INTO public.order_status_history (
        store_id,
        order_id,
        from_status,
        to_status,
        reason,
        changed_by
    )
    VALUES (
        p_store_id,
        v_order_id,
        NULL,
        p_initial_status,
        CASE WHEN p_source = 'MANUAL' THEN 'Pedido registrado manualmente no painel' ELSE 'Pedido recebido pelo cardápio digital' END,
        v_user_id
    );

    RETURN jsonb_build_object(
        'order_id', v_order_id,
        'order_number', v_order_number,
        'status', p_initial_status,
        'subtotal_cents', v_subtotal_cents,
        'total_cents', v_total_cents,
        'stock_deducted', v_should_deduct_stock
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. ATOMIC ORDER STATUS TRANSITION (With Stock Deduction & Reversal)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.transition_order_status_atomic(
    p_store_id UUID,
    p_order_id UUID,
    p_new_status public.order_status,
    p_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_order RECORD;
    v_item RECORD;
    v_product RECORD;
    v_stock_deducted BOOLEAN;
BEGIN
    IF v_user_id IS NULL OR NOT public.has_store_access(p_store_id) THEN
        RAISE EXCEPTION 'FORBIDDEN: Sem permissão para atualizar pedidos desta loja.';
    END IF;

    SELECT * INTO v_order
    FROM public.orders
    WHERE id = p_order_id AND store_id = p_store_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ORDER_NOT_FOUND: Pedido não encontrado.';
    END IF;

    IF v_order.status = p_new_status THEN
        RETURN jsonb_build_object(
            'order_id', v_order.id,
            'order_number', v_order.order_number,
            'status', v_order.status,
            'stock_deducted', v_order.stock_deducted,
            'unchanged', true
        );
    END IF;

    IF v_order.status = 'CANCELLED' THEN
        RAISE EXCEPTION 'INVALID_TRANSITION: Não é possível alterar o status de um pedido cancelado.';
    END IF;

    IF v_order.status = 'COMPLETED' AND p_new_status <> 'COMPLETED' THEN
        RAISE EXCEPTION 'INVALID_TRANSITION: Um pedido concluído já foi finalizado.';
    END IF;

    v_stock_deducted := v_order.stock_deducted;

    IF NOT v_order.stock_deducted AND p_new_status IN ('CONFIRMED', 'PREPARING', 'READY', 'COMPLETED') THEN
        FOR v_item IN
            SELECT
                oi.product_id,
                SUM(oi.quantity)::INTEGER AS total_qty
            FROM public.order_items oi
            WHERE oi.order_id = v_order.id AND oi.product_id IS NOT NULL
            GROUP BY oi.product_id
            ORDER BY oi.product_id
        LOOP
            SELECT * INTO v_product
            FROM public.products
            WHERE id = v_item.product_id AND store_id = p_store_id
            FOR UPDATE;

            IF FOUND AND v_product.track_stock THEN
                IF v_product.stock_quantity < v_item.total_qty THEN
                    RAISE EXCEPTION 'INSUFFICIENT_STOCK: Estoque insuficiente para confirmar "%" (Disponível: %, Necessário: %).',
                        v_product.name, v_product.stock_quantity, v_item.total_qty;
                END IF;
            END IF;
        END LOOP;

        FOR v_item IN
            SELECT oi.id AS order_item_id, oi.product_id, oi.quantity
            FROM public.order_items oi
            WHERE oi.order_id = v_order.id AND oi.product_id IS NOT NULL
            ORDER BY oi.id
        LOOP
            SELECT * INTO v_product
            FROM public.products
            WHERE id = v_item.product_id AND store_id = p_store_id;

            IF FOUND AND v_product.track_stock THEN
                UPDATE public.products
                SET stock_quantity = stock_quantity - v_item.quantity
                WHERE id = v_product.id;

                INSERT INTO public.stock_movements (
                    store_id,
                    product_id,
                    order_id,
                    movement_type,
                    quantity_delta,
                    previous_quantity,
                    new_quantity,
                    reference_key,
                    reason,
                    created_by
                )
                VALUES (
                    p_store_id,
                    v_product.id,
                    v_order.id,
                    'ORDER_DEDUCTION',
                    -v_item.quantity,
                    v_product.stock_quantity,
                    v_product.stock_quantity - v_item.quantity,
                    'order:' || v_order.id || ':item:' || v_item.order_item_id || ':deduct',
                    'Baixa de estoque na confirmação do pedido #' || v_order.order_number,
                    v_user_id
                );
            END IF;
        END LOOP;

        v_stock_deducted := true;
    END IF;

    IF p_new_status = 'CANCELLED' AND v_order.stock_deducted THEN
        FOR v_item IN
            SELECT oi.id AS order_item_id, oi.product_id, oi.quantity
            FROM public.order_items oi
            WHERE oi.order_id = v_order.id AND oi.product_id IS NOT NULL
            ORDER BY oi.product_id, oi.id
        LOOP
            SELECT * INTO v_product
            FROM public.products
            WHERE id = v_item.product_id AND store_id = p_store_id
            FOR UPDATE;

            IF FOUND AND v_product.track_stock THEN
                UPDATE public.products
                SET stock_quantity = stock_quantity + v_item.quantity
                WHERE id = v_product.id;

                INSERT INTO public.stock_movements (
                    store_id,
                    product_id,
                    order_id,
                    movement_type,
                    quantity_delta,
                    previous_quantity,
                    new_quantity,
                    reference_key,
                    reason,
                    created_by
                )
                VALUES (
                    p_store_id,
                    v_product.id,
                    v_order.id,
                    'ORDER_REVERSAL',
                    v_item.quantity,
                    v_product.stock_quantity,
                    v_product.stock_quantity + v_item.quantity,
                    'order:' || v_order.id || ':item:' || v_item.order_item_id || ':reverse',
                    COALESCE(NULLIF(trim(p_reason), ''), 'Estorno automático por cancelamento do pedido #' || v_order.order_number),
                    v_user_id
                );
            END IF;
        END LOOP;

        v_stock_deducted := false;
    END IF;

    IF p_new_status = 'CANCELLED' AND v_order.customer_id IS NOT NULL THEN
        UPDATE public.customers
        SET total_orders = GREATEST(0, total_orders - 1),
            total_spent_cents = GREATEST(0, total_spent_cents - v_order.total_cents)
        WHERE id = v_order.customer_id;
    END IF;

    UPDATE public.orders
    SET status = p_new_status,
        stock_deducted = v_stock_deducted
    WHERE id = v_order.id;

    INSERT INTO public.order_status_history (
        store_id,
        order_id,
        from_status,
        to_status,
        reason,
        changed_by
    )
    VALUES (
        p_store_id,
        v_order.id,
        v_order.status,
        p_new_status,
        NULLIF(trim(p_reason), ''),
        v_user_id
    );

    RETURN jsonb_build_object(
        'order_id', v_order.id,
        'order_number', v_order.order_number,
        'from_status', v_order.status,
        'status', p_new_status,
        'stock_deducted', v_stock_deducted
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. EXPLICIT FUNCTION PRIVILEGE HARDENING (REVOKE PUBLIC/ANON -> GRANT SCOPED)
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.get_public_menu_by_slug(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_menu_by_slug(TEXT) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.onboard_organization_and_store FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.onboard_organization_and_store TO authenticated;

REVOKE ALL ON FUNCTION public.adjust_product_stock_atomic FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_product_stock_atomic TO authenticated;

REVOKE ALL ON FUNCTION public.create_order_atomic FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_order_atomic TO anon, authenticated;

REVOKE ALL ON FUNCTION public.transition_order_status_atomic FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_order_status_atomic TO authenticated;

-- -----------------------------------------------------------------------------
-- 7. TENANT-ISOLATED SUPABASE STORAGE POLICIES (Path: <store_id>/...)
-- Helper safely parses UUID folder prefix so invalid paths return false instead of throwing.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_manage_store_asset(p_object_name TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_folder TEXT;
    v_store_uuid UUID;
BEGIN
    v_folder := split_part(COALESCE(p_object_name, ''), '/', 1);
    IF v_folder !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
        RETURN false;
    END IF;
    v_store_uuid := v_folder::UUID;
    RETURN public.has_store_access(v_store_uuid);
END;
$$;

INSERT INTO storage.buckets (id, name, public)
VALUES ('benit-assets', 'benit-assets', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "benit_assets_public_read" ON storage.objects;
CREATE POLICY "benit_assets_public_read" ON storage.objects
    FOR SELECT
    TO public
    USING (bucket_id = 'benit-assets');

DROP POLICY IF EXISTS "benit_assets_auth_insert" ON storage.objects;
CREATE POLICY "benit_assets_auth_insert" ON storage.objects
    FOR INSERT
    TO authenticated
    WITH CHECK (
        bucket_id = 'benit-assets'
        AND public.can_manage_store_asset(name)
    );

DROP POLICY IF EXISTS "benit_assets_auth_update" ON storage.objects;
CREATE POLICY "benit_assets_auth_update" ON storage.objects
    FOR UPDATE
    TO authenticated
    USING (
        bucket_id = 'benit-assets'
        AND public.can_manage_store_asset(name)
    )
    WITH CHECK (
        bucket_id = 'benit-assets'
        AND public.can_manage_store_asset(name)
    );

DROP POLICY IF EXISTS "benit_assets_auth_delete" ON storage.objects;
CREATE POLICY "benit_assets_auth_delete" ON storage.objects
    FOR DELETE
    TO authenticated
    USING (
        bucket_id = 'benit-assets'
        AND public.can_manage_store_asset(name)
    );
