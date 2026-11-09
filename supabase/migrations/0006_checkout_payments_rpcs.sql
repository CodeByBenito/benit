-- =============================================================================
-- BENIT SaaS — Migration 0006: Checkout & payment business logic (RPCs)
-- Server is the single source of truth for fees, discounts, minimums, hours,
-- payment state and stock. Client-sent totals are never trusted.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. STORE AVAILABILITY
-- -----------------------------------------------------------------------------
-- True when the manual switch is on AND (no hours configured OR now is inside a slot).
CREATE OR REPLACE FUNCTION public.is_store_accepting(p_store_id UUID, p_at TIMESTAMPTZ DEFAULT now())
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_store RECORD;
    v_local TIMESTAMP;
    v_dow SMALLINT;
    v_prev_dow SMALLINT;
    v_time TIME;
BEGIN
    SELECT is_open, timezone INTO v_store FROM public.stores WHERE id = p_store_id;
    IF NOT FOUND OR NOT v_store.is_open THEN
        RETURN false;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.store_business_hours WHERE store_id = p_store_id) THEN
        RETURN true;
    END IF;

    v_local := p_at AT TIME ZONE COALESCE(v_store.timezone, 'America/Sao_Paulo');
    v_dow := EXTRACT(DOW FROM v_local)::SMALLINT;
    v_prev_dow := ((v_dow + 6) % 7)::SMALLINT;
    v_time := v_local::TIME;

    RETURN EXISTS (
        SELECT 1 FROM public.store_business_hours h
        WHERE h.store_id = p_store_id
          AND (
              -- same-day slot
              (h.weekday = v_dow AND h.opens_at < h.closes_at AND v_time >= h.opens_at AND v_time < h.closes_at)
              -- overnight slot, evening part
              OR (h.weekday = v_dow AND h.opens_at > h.closes_at AND v_time >= h.opens_at)
              -- overnight slot that started yesterday, early-morning part
              OR (h.weekday = v_prev_dow AND h.opens_at > h.closes_at AND v_time < h.closes_at)
          )
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 2. PRICING HELPERS (pure reads; used by quote_checkout and create_order_atomic)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_delivery_zone(p_store_id UUID, p_neighborhood TEXT)
RETURNS public.delivery_zones
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT z.*
    FROM public.delivery_zones z
    WHERE z.store_id = p_store_id
      AND z.is_active
      AND public.normalize_text(p_neighborhood) = ANY(z.neighborhoods_normalized)
    ORDER BY z.fee_cents ASC, z.sort_order ASC
    LIMIT 1;
$$;

-- Returns {discount_cents, coupon_id, code} or raises COUPON_* errors.
-- p_lock=true locks the coupon row (inside order creation).
CREATE OR REPLACE FUNCTION public.price_coupon(
    p_store_id UUID,
    p_code TEXT,
    p_subtotal_cents INTEGER,
    p_customer_phone TEXT DEFAULT NULL,
    p_lock BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_coupon RECORD;
    v_code TEXT := upper(trim(COALESCE(p_code, '')));
    v_phone TEXT := regexp_replace(COALESCE(p_customer_phone, ''), '[^0-9]', '', 'g');
    v_customer_uses INTEGER;
    v_discount INTEGER;
BEGIN
    IF v_code = '' THEN
        RETURN NULL;
    END IF;

    IF p_lock THEN
        SELECT * INTO v_coupon FROM public.coupons
        WHERE store_id = p_store_id AND code = v_code
        FOR UPDATE;
    ELSE
        SELECT * INTO v_coupon FROM public.coupons
        WHERE store_id = p_store_id AND code = v_code;
    END IF;

    IF NOT FOUND OR NOT v_coupon.is_active THEN
        RAISE EXCEPTION 'COUPON_INVALID: Cupom inválido ou inativo.';
    END IF;
    IF v_coupon.starts_at IS NOT NULL AND now() < v_coupon.starts_at THEN
        RAISE EXCEPTION 'COUPON_NOT_STARTED: Este cupom ainda não está valendo.';
    END IF;
    IF v_coupon.ends_at IS NOT NULL AND now() >= v_coupon.ends_at THEN
        RAISE EXCEPTION 'COUPON_EXPIRED: Este cupom expirou.';
    END IF;
    IF p_subtotal_cents < v_coupon.min_order_cents THEN
        RAISE EXCEPTION 'COUPON_MIN_ORDER: Pedido mínimo para este cupom: R$ %.',
            to_char(v_coupon.min_order_cents / 100.0, 'FM999G990D00');
    END IF;
    IF v_coupon.usage_limit IS NOT NULL AND v_coupon.used_count >= v_coupon.usage_limit THEN
        RAISE EXCEPTION 'COUPON_EXHAUSTED: Este cupom atingiu o limite de usos.';
    END IF;
    IF v_coupon.per_customer_limit IS NOT NULL AND char_length(v_phone) >= 8 THEN
        SELECT COUNT(*) INTO v_customer_uses
        FROM public.coupon_redemptions r
        JOIN public.customers c ON c.id = r.customer_id
        WHERE r.coupon_id = v_coupon.id AND r.voided_at IS NULL
          AND c.store_id = p_store_id AND c.phone = v_phone;
        IF v_customer_uses >= v_coupon.per_customer_limit THEN
            RAISE EXCEPTION 'COUPON_CUSTOMER_LIMIT: Você já usou este cupom o máximo de vezes permitido.';
        END IF;
    END IF;

    IF v_coupon.kind = 'PERCENT' THEN
        v_discount := floor(p_subtotal_cents * v_coupon.value / 100.0)::INTEGER;
    ELSE
        v_discount := v_coupon.value;
    END IF;
    IF v_coupon.max_discount_cents IS NOT NULL THEN
        v_discount := LEAST(v_discount, v_coupon.max_discount_cents);
    END IF;
    v_discount := LEAST(GREATEST(v_discount, 0), p_subtotal_cents);

    RETURN jsonb_build_object('coupon_id', v_coupon.id, 'code', v_coupon.code, 'discount_cents', v_discount);
END;
$$;

-- Subtotal of a cart, validating products & option rules. Raises on invalid cart.
CREATE OR REPLACE FUNCTION public.price_cart_items(p_store_id UUID, p_items JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_item JSONB;
    v_product RECORD;
    v_qty INTEGER;
    v_opt_ids UUID[];
    v_opts_cents INTEGER;
    v_valid_count INTEGER;
    v_subtotal INTEGER := 0;
BEGIN
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'EMPTY_ORDER: O pedido deve conter pelo menos um item.';
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        v_qty := COALESCE((v_item->>'quantity')::INTEGER, 0);
        IF v_qty <= 0 THEN
            RAISE EXCEPTION 'INVALID_QUANTITY: A quantidade de cada item deve ser maior que zero.';
        END IF;

        SELECT * INTO v_product FROM public.products
        WHERE id = (v_item->>'product_id')::UUID AND store_id = p_store_id AND is_archived = false;
        IF NOT FOUND OR NOT v_product.is_available THEN
            RAISE EXCEPTION 'PRODUCT_UNAVAILABLE: Um dos produtos não está mais disponível.';
        END IF;

        v_opt_ids := ARRAY[]::UUID[];
        IF v_item ? 'option_ids' AND jsonb_typeof(v_item->'option_ids') = 'array' THEN
            SELECT COALESCE(array_agg(DISTINCT (val #>> '{}')::UUID), ARRAY[]::UUID[])
            INTO v_opt_ids FROM jsonb_array_elements(v_item->'option_ids') AS val;
        END IF;

        SELECT COALESCE(SUM(po.price_cents), 0)::INTEGER, COUNT(*)::INTEGER
        INTO v_opts_cents, v_valid_count
        FROM public.product_options po
        JOIN public.product_option_groups g ON g.id = po.group_id AND g.store_id = po.store_id
        WHERE po.id = ANY(v_opt_ids) AND po.store_id = p_store_id
          AND g.product_id = v_product.id AND po.is_available;

        IF v_valid_count <> COALESCE(array_length(v_opt_ids, 1), 0) THEN
            RAISE EXCEPTION 'INVALID_OPTION: Uma das opções de "%" está indisponível.', v_product.name;
        END IF;

        v_subtotal := v_subtotal + (v_product.price_cents + v_opts_cents) * v_qty;
    END LOOP;

    RETURN v_subtotal;
END;
$$;

-- -----------------------------------------------------------------------------
-- 3. INTERNAL STOCK / LIFECYCLE HELPERS (not granted to API roles)
-- -----------------------------------------------------------------------------
-- Returns the name of the first product lacking stock for this order, or NULL.
CREATE OR REPLACE FUNCTION public._order_stock_shortage(p_order_id UUID, p_store_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_row RECORD;
BEGIN
    FOR v_row IN
        SELECT p.id, p.name, p.track_stock, p.stock_quantity, SUM(oi.quantity)::INTEGER AS needed
        FROM public.order_items oi
        JOIN public.products p ON p.id = oi.product_id AND p.store_id = oi.store_id
        WHERE oi.order_id = p_order_id AND oi.store_id = p_store_id
        GROUP BY p.id, p.name, p.track_stock, p.stock_quantity
        ORDER BY p.id
    LOOP
        PERFORM 1 FROM public.products WHERE id = v_row.id FOR UPDATE;
        IF v_row.track_stock AND v_row.stock_quantity < v_row.needed THEN
            RETURN v_row.name;
        END IF;
    END LOOP;
    RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public._deduct_order_stock(p_order_id UUID, p_store_id UUID, p_actor UUID, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_item RECORD;
    v_qty INTEGER;
BEGIN
    FOR v_item IN
        SELECT oi.id AS order_item_id, oi.product_id, oi.quantity
        FROM public.order_items oi
        JOIN public.products p ON p.id = oi.product_id AND p.store_id = oi.store_id AND p.track_stock
        WHERE oi.order_id = p_order_id AND oi.store_id = p_store_id
        ORDER BY oi.product_id, oi.id
    LOOP
        UPDATE public.products SET stock_quantity = stock_quantity - v_item.quantity
        WHERE id = v_item.product_id
        RETURNING stock_quantity INTO v_qty;

        INSERT INTO public.stock_movements (store_id, product_id, order_id, movement_type, quantity_delta,
            previous_quantity, new_quantity, reference_key, reason, created_by)
        VALUES (p_store_id, v_item.product_id, p_order_id, 'ORDER_DEDUCTION', -v_item.quantity,
            v_qty + v_item.quantity, v_qty,
            'order:' || p_order_id || ':item:' || v_item.order_item_id || ':deduct', p_reason, p_actor)
        ON CONFLICT (reference_key) DO NOTHING;
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public._reverse_order_stock(p_order_id UUID, p_store_id UUID, p_actor UUID, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_item RECORD;
    v_qty INTEGER;
BEGIN
    FOR v_item IN
        SELECT oi.id AS order_item_id, oi.product_id, oi.quantity
        FROM public.order_items oi
        JOIN public.products p ON p.id = oi.product_id AND p.store_id = oi.store_id AND p.track_stock
        WHERE oi.order_id = p_order_id AND oi.store_id = p_store_id
        ORDER BY oi.product_id, oi.id
    LOOP
        UPDATE public.products SET stock_quantity = stock_quantity + v_item.quantity
        WHERE id = v_item.product_id
        RETURNING stock_quantity INTO v_qty;

        INSERT INTO public.stock_movements (store_id, product_id, order_id, movement_type, quantity_delta,
            previous_quantity, new_quantity, reference_key, reason, created_by)
        VALUES (p_store_id, v_item.product_id, p_order_id, 'ORDER_REVERSAL', v_item.quantity,
            v_qty - v_item.quantity, v_qty,
            'order:' || p_order_id || ':item:' || v_item.order_item_id || ':reverse', p_reason, p_actor)
        ON CONFLICT (reference_key) DO NOTHING;
    END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public._release_order_coupon(p_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_coupon_id UUID;
BEGIN
    UPDATE public.coupon_redemptions SET voided_at = now()
    WHERE order_id = p_order_id AND voided_at IS NULL
    RETURNING coupon_id INTO v_coupon_id;

    IF v_coupon_id IS NOT NULL THEN
        UPDATE public.coupons SET used_count = GREATEST(0, used_count - 1) WHERE id = v_coupon_id;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public._count_order_in_stats(p_order_id UUID, p_delta INTEGER)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order RECORD;
BEGIN
    SELECT id, customer_id, total_cents, counted_in_stats INTO v_order FROM public.orders WHERE id = p_order_id;
    IF v_order.customer_id IS NULL THEN
        RETURN;
    END IF;
    IF p_delta > 0 AND NOT v_order.counted_in_stats THEN
        UPDATE public.customers
        SET total_orders = total_orders + 1, total_spent_cents = total_spent_cents + v_order.total_cents, last_order_at = now()
        WHERE id = v_order.customer_id;
        UPDATE public.orders SET counted_in_stats = true WHERE id = p_order_id;
    ELSIF p_delta < 0 AND v_order.counted_in_stats THEN
        UPDATE public.customers
        SET total_orders = GREATEST(0, total_orders - 1), total_spent_cents = GREATEST(0, total_spent_cents - v_order.total_cents)
        WHERE id = v_order.customer_id;
        UPDATE public.orders SET counted_in_stats = false WHERE id = p_order_id;
    END IF;
END;
$$;

REVOKE ALL ON FUNCTION public._order_stock_shortage(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._deduct_order_stock(UUID, UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._reverse_order_stock(UUID, UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._release_order_coupon(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public._count_order_in_stats(UUID, INTEGER) FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 4. CHECKOUT QUOTE (preview only — never trusted at order time)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.quote_checkout(
    p_slug TEXT,
    p_items JSONB,
    p_fulfillment_type public.fulfillment_type,
    p_neighborhood TEXT DEFAULT NULL,
    p_coupon_code TEXT DEFAULT NULL,
    p_customer_phone TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_store RECORD;
    v_subtotal INTEGER;
    v_zone public.delivery_zones;
    v_fee INTEGER := 0;
    v_min INTEGER;
    v_discount INTEGER := 0;
    v_coupon JSONB;
    v_coupon_error TEXT;
    v_zone_error TEXT;
    v_has_zones BOOLEAN;
BEGIN
    SELECT * INTO v_store FROM public.stores WHERE slug = lower(trim(p_slug)) AND is_published;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'STORE_NOT_FOUND: Loja não encontrada.';
    END IF;

    v_subtotal := public.price_cart_items(v_store.id, p_items);
    v_min := v_store.min_order_cents;

    IF p_fulfillment_type = 'DELIVERY' THEN
        SELECT EXISTS (SELECT 1 FROM public.delivery_zones WHERE store_id = v_store.id AND is_active) INTO v_has_zones;
        IF v_has_zones THEN
            IF public.normalize_text(p_neighborhood) IS NULL THEN
                v_zone_error := 'Escolha o seu bairro.';
            ELSE
                v_zone := public.resolve_delivery_zone(v_store.id, p_neighborhood);
                IF v_zone.id IS NULL THEN
                    v_zone_error := 'Ainda não entregamos nesse bairro.';
                ELSE
                    v_fee := v_zone.fee_cents;
                    v_min := GREATEST(v_min, COALESCE(v_zone.min_order_cents, 0));
                END IF;
            END IF;
        END IF;
    END IF;

    IF NULLIF(trim(COALESCE(p_coupon_code, '')), '') IS NOT NULL THEN
        BEGIN
            v_coupon := public.price_coupon(v_store.id, p_coupon_code, v_subtotal, p_customer_phone, false);
            v_discount := (v_coupon->>'discount_cents')::INTEGER;
        EXCEPTION WHEN OTHERS THEN
            v_coupon_error := regexp_replace(SQLERRM, '^[A-Z_]+:\s*', '');
        END;
    END IF;

    RETURN jsonb_build_object(
        'subtotal_cents', v_subtotal,
        'discount_cents', v_discount,
        'fee_cents', v_fee,
        'total_cents', GREATEST(0, v_subtotal - v_discount + v_fee),
        'min_order_cents', v_min,
        'meets_minimum', v_subtotal >= v_min,
        'accepting_now', public.is_store_accepting(v_store.id),
        'zone', CASE WHEN v_zone.id IS NULL THEN NULL ELSE jsonb_build_object('id', v_zone.id, 'name', v_zone.name, 'eta_minutes', COALESCE(v_zone.eta_minutes, v_store.default_eta_minutes)) END,
        'zone_error', v_zone_error,
        'coupon', CASE WHEN v_coupon IS NULL THEN NULL ELSE v_coupon - 'coupon_id' END,
        'coupon_error', v_coupon_error
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. ORDER CREATION (replaces 0003 version — old signature is DROPPED so anon
--    can never call the legacy function that trusted client fees/discounts)
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.create_order_atomic(
    UUID, public.order_source, public.fulfillment_type, TEXT, TEXT, JSONB, TEXT, TEXT, INTEGER, INTEGER, public.order_status, TEXT
);

CREATE OR REPLACE FUNCTION public.create_order_atomic(
    p_store_id UUID,
    p_source public.order_source,
    p_fulfillment_type public.fulfillment_type,
    p_customer_name TEXT,
    p_customer_phone TEXT,
    p_items JSONB,
    p_table_or_reference TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL,
    p_discount_cents INTEGER DEFAULT 0,      -- MANUAL only
    p_fee_cents INTEGER DEFAULT 0,           -- MANUAL only
    p_initial_status public.order_status DEFAULT 'NEW',
    p_idempotency_key TEXT DEFAULT NULL,
    p_payment_method public.payment_method DEFAULT NULL,
    p_delivery JSONB DEFAULT NULL,           -- {neighborhood, street, number, complement, reference}
    p_coupon_code TEXT DEFAULT NULL,
    p_change_for_cents INTEGER DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_store RECORD;
    v_existing RECORD;
    v_order_number INTEGER;
    v_customer_id UUID;
    v_phone TEXT;
    v_order_id UUID;
    v_public_token TEXT;
    v_subtotal INTEGER := 0;
    v_total INTEGER;
    v_discount INTEGER := GREATEST(0, COALESCE(p_discount_cents, 0));
    v_fee INTEGER := GREATEST(0, COALESCE(p_fee_cents, 0));
    v_min INTEGER := 0;
    v_zone public.delivery_zones;
    v_coupon JSONB;
    v_method public.payment_method := p_payment_method;
    v_is_online BOOLEAN;
    v_status public.order_status := p_initial_status;
    v_payment_status public.payment_status := 'PAY_ON_DELIVERY';
    v_expires TIMESTAMPTZ;
    v_eta INTEGER;
    v_delivery JSONB;
    v_item JSONB;
    v_product RECORD;
    v_req RECORD;
    v_qty INTEGER;
    v_opt_cents INTEGER;
    v_item_total INTEGER;
    v_order_item_id UUID;
    v_opt_id UUID;
    v_opt RECORD;
    v_group RECORD;
    v_opt_ids UUID[];
BEGIN
    SELECT * INTO v_store FROM public.stores WHERE id = p_store_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'STORE_NOT_FOUND: Loja não encontrada.';
    END IF;

    -- Idempotent replay (double click, network retry)
    IF NULLIF(trim(COALESCE(p_idempotency_key, '')), '') IS NOT NULL THEN
        SELECT id, order_number, status, total_cents, public_token, payment_status INTO v_existing
        FROM public.orders WHERE store_id = p_store_id AND idempotency_key = trim(p_idempotency_key);
        IF FOUND THEN
            RETURN jsonb_build_object(
                'order_id', v_existing.id, 'order_number', v_existing.order_number,
                'status', v_existing.status, 'total_cents', v_existing.total_cents,
                'public_token', v_existing.public_token, 'payment_status', v_existing.payment_status,
                'idempotent_replay', true);
        END IF;
    END IF;

    v_is_online := v_method IN ('ONLINE_PIX', 'ONLINE_CARD');

    IF p_source = 'MANUAL' THEN
        IF v_user_id IS NULL OR NOT public.has_store_access(p_store_id) THEN
            RAISE EXCEPTION 'FORBIDDEN: Apenas usuários autorizados podem registrar pedidos manuais.';
        END IF;
        IF v_status NOT IN ('NEW', 'CONFIRMED') THEN
            RAISE EXCEPTION 'INVALID_INITIAL_STATUS: Pedido manual deve iniciar como NEW ou CONFIRMED.';
        END IF;
        IF v_is_online THEN
            RAISE EXCEPTION 'INVALID_PAYMENT_METHOD: Pedido manual não aceita pagamento online.';
        END IF;
    ELSE
        IF NOT v_store.is_published THEN
            RAISE EXCEPTION 'STORE_UNPUBLISHED: O cardápio digital desta loja não está publicado.';
        END IF;
        IF NOT public.is_store_accepting(p_store_id) THEN
            RAISE EXCEPTION 'STORE_CLOSED: A loja está fechada para novos pedidos no momento.';
        END IF;
        v_status := 'NEW';
        v_discount := 0;
        v_fee := 0;
        v_min := v_store.min_order_cents;

        IF p_fulfillment_type = 'DELIVERY' AND NOT v_store.accepts_delivery THEN
            RAISE EXCEPTION 'FULFILLMENT_UNAVAILABLE: Esta loja não está fazendo entregas.';
        ELSIF p_fulfillment_type = 'PICKUP' AND NOT v_store.accepts_pickup THEN
            RAISE EXCEPTION 'FULFILLMENT_UNAVAILABLE: Esta loja não está aceitando retirada.';
        ELSIF p_fulfillment_type = 'DINE_IN' AND NOT v_store.accepts_dine_in THEN
            RAISE EXCEPTION 'FULFILLMENT_UNAVAILABLE: Esta loja não está aceitando pedidos na mesa.';
        END IF;

        IF v_method IS NULL THEN
            RAISE EXCEPTION 'PAYMENT_METHOD_REQUIRED: Escolha a forma de pagamento.';
        END IF;
        IF v_is_online THEN
            IF NOT v_store.online_payment_enabled OR NOT EXISTS (
                SELECT 1 FROM public.store_payment_accounts a WHERE a.store_id = p_store_id AND a.status = 'ACTIVE'
            ) THEN
                RAISE EXCEPTION 'PAYMENT_METHOD_UNAVAILABLE: Pagamento online indisponível nesta loja.';
            END IF;
        ELSIF NOT (v_method = ANY(v_store.offline_methods)) THEN
            RAISE EXCEPTION 'PAYMENT_METHOD_UNAVAILABLE: Forma de pagamento não aceita por esta loja.';
        END IF;

        IF p_fulfillment_type = 'DELIVERY' THEN
            IF p_delivery IS NULL OR public.normalize_text(p_delivery->>'street') IS NULL
               OR public.normalize_text(p_delivery->>'neighborhood') IS NULL THEN
                RAISE EXCEPTION 'ADDRESS_REQUIRED: Informe rua, número e bairro para entrega.';
            END IF;
            IF EXISTS (SELECT 1 FROM public.delivery_zones WHERE store_id = p_store_id AND is_active) THEN
                v_zone := public.resolve_delivery_zone(p_store_id, p_delivery->>'neighborhood');
                IF v_zone.id IS NULL THEN
                    RAISE EXCEPTION 'DELIVERY_ZONE_NOT_FOUND: Ainda não entregamos no bairro informado.';
                END IF;
                v_fee := v_zone.fee_cents;
                v_min := GREATEST(v_min, COALESCE(v_zone.min_order_cents, 0));
                v_eta := COALESCE(v_zone.eta_minutes, v_store.default_eta_minutes);
            ELSE
                v_eta := v_store.default_eta_minutes;
            END IF;
            v_delivery := jsonb_build_object(
                'street', left(trim(p_delivery->>'street'), 160),
                'number', left(trim(COALESCE(p_delivery->>'number', '')), 20),
                'complement', left(trim(COALESCE(p_delivery->>'complement', '')), 120),
                'neighborhood', left(trim(p_delivery->>'neighborhood'), 80),
                'reference', left(trim(COALESCE(p_delivery->>'reference', '')), 160)
            );
        ELSIF p_fulfillment_type = 'DINE_IN' AND NULLIF(trim(COALESCE(p_table_or_reference, '')), '') IS NULL THEN
            RAISE EXCEPTION 'TABLE_REQUIRED: Informe o número da mesa.';
        END IF;
    END IF;

    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'EMPTY_ORDER: O pedido deve conter pelo menos um item.';
    END IF;

    -- Lock products in id order (deadlock-safe) and validate availability/stock.
    FOR v_req IN
        SELECT (elem->>'product_id')::UUID AS product_id, SUM(COALESCE((elem->>'quantity')::INTEGER, 0)) AS total_requested
        FROM jsonb_array_elements(p_items) AS elem
        GROUP BY 1 ORDER BY 1
    LOOP
        IF v_req.total_requested <= 0 THEN
            RAISE EXCEPTION 'INVALID_QUANTITY: A quantidade de cada item deve ser maior que zero.';
        END IF;
        SELECT * INTO v_product FROM public.products
        WHERE id = v_req.product_id AND store_id = p_store_id AND is_archived = false
        FOR UPDATE;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'PRODUCT_NOT_FOUND: Um dos produtos selecionados não existe mais.';
        END IF;
        IF NOT v_product.is_available THEN
            RAISE EXCEPTION 'PRODUCT_UNAVAILABLE: O produto "%" está indisponível no momento.', v_product.name;
        END IF;
        IF v_product.track_stock AND v_product.stock_quantity < v_req.total_requested THEN
            RAISE EXCEPTION 'INSUFFICIENT_STOCK: Estoque insuficiente para "%" (Disponível: %, Solicitado: %).',
                v_product.name, v_product.stock_quantity, v_req.total_requested;
        END IF;
    END LOOP;

    -- Store-scoped customer
    v_phone := regexp_replace(COALESCE(p_customer_phone, ''), '[^0-9]', '', 'g');
    IF char_length(v_phone) < 8 THEN
        RAISE EXCEPTION 'INVALID_PHONE: Informe um telefone/WhatsApp válido.';
    END IF;
    INSERT INTO public.customers (store_id, name, phone, last_order_at)
    VALUES (p_store_id, trim(p_customer_name), v_phone, now())
    ON CONFLICT (store_id, phone) DO UPDATE SET name = EXCLUDED.name, last_order_at = now()
    RETURNING id INTO v_customer_id;

    UPDATE public.stores SET last_order_number = last_order_number + 1
    WHERE id = p_store_id RETURNING last_order_number INTO v_order_number;

    IF v_is_online THEN
        v_status := 'AWAITING_PAYMENT';
        v_payment_status := 'PENDING';
        v_expires := now() + make_interval(mins => v_store.payment_window_minutes);
    END IF;

    INSERT INTO public.orders (
        store_id, customer_id, order_number, source, fulfillment_type, table_or_reference, status,
        customer_name_snapshot, customer_phone_snapshot, subtotal_cents, discount_cents, fee_cents, total_cents,
        notes, stock_deducted, idempotency_key, created_by,
        payment_method, payment_status, payment_expires_at, change_for_cents,
        delivery_zone_id, delivery_address, eta_minutes
    )
    VALUES (
        p_store_id, v_customer_id, v_order_number, p_source, COALESCE(p_fulfillment_type, 'PICKUP'),
        NULLIF(trim(p_table_or_reference), ''), v_status,
        trim(p_customer_name), v_phone, 0, 0, 0, 0,
        NULLIF(left(trim(COALESCE(p_notes, '')), 500), ''), false, NULLIF(trim(p_idempotency_key), ''), v_user_id,
        v_method, v_payment_status, v_expires,
        CASE WHEN v_method = 'CASH' THEN NULLIF(GREATEST(0, COALESCE(p_change_for_cents, 0)), 0) END,
        v_zone.id, v_delivery, v_eta
    )
    RETURNING id, public_token INTO v_order_id, v_public_token;

    -- Items with server-side option rule validation
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
        SELECT * INTO v_product FROM public.products WHERE id = (v_item->>'product_id')::UUID AND store_id = p_store_id;
        v_qty := (v_item->>'quantity')::INTEGER;
        v_opt_cents := 0;
        v_opt_ids := ARRAY[]::UUID[];

        IF v_item ? 'option_ids' AND jsonb_typeof(v_item->'option_ids') = 'array' THEN
            SELECT COALESCE(array_agg((val #>> '{}')::UUID), ARRAY[]::UUID[])
            INTO v_opt_ids FROM jsonb_array_elements(v_item->'option_ids') AS val;
        END IF;

        IF COALESCE(array_length(v_opt_ids, 1), 0) <> (SELECT COUNT(DISTINCT u) FROM unnest(v_opt_ids) AS u) THEN
            RAISE EXCEPTION 'DUPLICATE_OPTION: O mesmo item opcional não pode ser enviado duplicado em "%".', v_product.name;
        END IF;

        FOR v_group IN
            SELECT pog.id, pog.name, pog.min_select, pog.max_select, pog.is_required, COUNT(po.id)::INTEGER AS chosen
            FROM public.product_option_groups pog
            LEFT JOIN public.product_options po
                ON po.group_id = pog.id AND po.store_id = p_store_id AND po.id = ANY(v_opt_ids)
            WHERE pog.product_id = v_product.id AND pog.store_id = p_store_id
            GROUP BY pog.id, pog.name, pog.min_select, pog.max_select, pog.is_required
        LOOP
            IF (v_group.is_required AND v_group.chosen < GREATEST(1, v_group.min_select)) OR v_group.chosen < v_group.min_select THEN
                RAISE EXCEPTION 'OPTION_MIN_REQUIRED: Selecione pelo menos % opção(ões) em "%" para o produto "%".',
                    GREATEST(CASE WHEN v_group.is_required THEN 1 ELSE 0 END, v_group.min_select), v_group.name, v_product.name;
            END IF;
            IF v_group.chosen > v_group.max_select THEN
                RAISE EXCEPTION 'OPTION_MAX_EXCEEDED: O grupo "%" permite no máximo % opção(ões) em "%".',
                    v_group.name, v_group.max_select, v_product.name;
            END IF;
        END LOOP;

        INSERT INTO public.order_items (store_id, order_id, product_id, product_name_snapshot, unit_price_cents,
            options_unit_price_cents, quantity, total_item_cents, notes)
        VALUES (p_store_id, v_order_id, v_product.id, v_product.name, v_product.price_cents, 0, v_qty, 0,
            NULLIF(left(trim(COALESCE(v_item->>'notes', '')), 280), ''))
        RETURNING id INTO v_order_item_id;

        FOREACH v_opt_id IN ARRAY v_opt_ids LOOP
            SELECT po.*, pog.name AS group_name INTO v_opt
            FROM public.product_options po
            JOIN public.product_option_groups pog ON pog.id = po.group_id AND pog.store_id = po.store_id
            WHERE po.id = v_opt_id AND po.store_id = p_store_id AND pog.product_id = v_product.id AND po.is_available;
            IF NOT FOUND THEN
                RAISE EXCEPTION 'INVALID_OPTION: Uma das opções selecionadas para "%" é inválida ou está indisponível.', v_product.name;
            END IF;
            v_opt_cents := v_opt_cents + v_opt.price_cents;
            INSERT INTO public.order_item_options (store_id, order_item_id, option_id, group_name_snapshot, option_name_snapshot, price_cents)
            VALUES (p_store_id, v_order_item_id, v_opt.id, v_opt.group_name, v_opt.name, v_opt.price_cents);
        END LOOP;

        v_item_total := (v_product.price_cents + v_opt_cents) * v_qty;
        v_subtotal := v_subtotal + v_item_total;
        UPDATE public.order_items SET options_unit_price_cents = v_opt_cents, total_item_cents = v_item_total
        WHERE id = v_order_item_id;
    END LOOP;

    IF p_source <> 'MANUAL' AND v_subtotal < v_min THEN
        RAISE EXCEPTION 'MIN_ORDER_NOT_MET: O pedido mínimo é R$ %.', to_char(v_min / 100.0, 'FM999G990D00');
    END IF;

    -- Coupon (locked; counts toward limits inside this transaction)
    IF NULLIF(trim(COALESCE(p_coupon_code, '')), '') IS NOT NULL THEN
        v_coupon := public.price_coupon(p_store_id, p_coupon_code, v_subtotal, v_phone, true);
        v_discount := (v_coupon->>'discount_cents')::INTEGER;
        INSERT INTO public.coupon_redemptions (store_id, coupon_id, order_id, customer_id, discount_cents)
        VALUES (p_store_id, (v_coupon->>'coupon_id')::UUID, v_order_id, v_customer_id, v_discount);
        UPDATE public.coupons SET used_count = used_count + 1 WHERE id = (v_coupon->>'coupon_id')::UUID;
    END IF;

    v_discount := LEAST(v_discount, v_subtotal);
    v_total := GREATEST(0, v_subtotal - v_discount + v_fee);

    UPDATE public.orders
    SET subtotal_cents = v_subtotal, discount_cents = v_discount, fee_cents = v_fee, total_cents = v_total,
        coupon_id = (v_coupon->>'coupon_id')::UUID, coupon_code_snapshot = v_coupon->>'code'
    WHERE id = v_order_id;

    -- Manual CONFIRMED orders deduct immediately (same rule as before).
    IF v_status = 'CONFIRMED' THEN
        PERFORM public._deduct_order_stock(v_order_id, p_store_id, v_user_id, 'Baixa automática na confirmação do pedido #' || v_order_number);
        UPDATE public.orders SET stock_deducted = true WHERE id = v_order_id;
    END IF;

    -- Unpaid online orders do not count until approved.
    IF NOT v_is_online THEN
        PERFORM public._count_order_in_stats(v_order_id, 1);
    END IF;

    INSERT INTO public.order_status_history (store_id, order_id, from_status, to_status, reason, changed_by)
    VALUES (p_store_id, v_order_id, NULL, v_status,
        CASE WHEN p_source = 'MANUAL' THEN 'Pedido registrado manualmente no painel'
             WHEN v_is_online THEN 'Pedido aguardando pagamento online'
             ELSE 'Pedido recebido pelo cardápio digital' END,
        v_user_id);

    RETURN jsonb_build_object(
        'order_id', v_order_id,
        'order_number', v_order_number,
        'status', v_status,
        'payment_status', v_payment_status,
        'payment_expires_at', v_expires,
        'subtotal_cents', v_subtotal,
        'discount_cents', v_discount,
        'fee_cents', v_fee,
        'total_cents', v_total,
        'public_token', v_public_token,
        'stock_deducted', v_status = 'CONFIRMED'
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 6. STATUS TRANSITION (staff)
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
    v_shortage TEXT;
    v_stock_deducted BOOLEAN;
    v_payment_status public.payment_status;
    v_refund_required BOOLEAN := false;
BEGIN
    IF v_user_id IS NULL OR NOT public.has_store_access(p_store_id) THEN
        RAISE EXCEPTION 'FORBIDDEN: Sem permissão para atualizar pedidos desta loja.';
    END IF;

    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id AND store_id = p_store_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ORDER_NOT_FOUND: Pedido não encontrado.';
    END IF;

    IF v_order.status = p_new_status THEN
        RETURN jsonb_build_object('order_id', v_order.id, 'order_number', v_order.order_number, 'status', v_order.status,
            'payment_status', v_order.payment_status, 'stock_deducted', v_order.stock_deducted, 'unchanged', true);
    END IF;
    IF p_new_status = 'AWAITING_PAYMENT' THEN
        RAISE EXCEPTION 'INVALID_TRANSITION: Um pedido não pode voltar a aguardar pagamento.';
    END IF;
    IF v_order.status = 'CANCELLED' THEN
        RAISE EXCEPTION 'INVALID_TRANSITION: Não é possível alterar o status de um pedido cancelado.';
    END IF;
    IF v_order.status = 'COMPLETED' THEN
        RAISE EXCEPTION 'INVALID_TRANSITION: Um pedido concluído já foi finalizado.';
    END IF;
    IF v_order.status = 'AWAITING_PAYMENT' AND p_new_status <> 'CANCELLED' THEN
        RAISE EXCEPTION 'AWAITING_PAYMENT: Este pedido só avança quando o pagamento for aprovado.';
    END IF;

    v_stock_deducted := v_order.stock_deducted;
    v_payment_status := v_order.payment_status;

    IF NOT v_order.stock_deducted AND p_new_status IN ('CONFIRMED', 'PREPARING', 'READY', 'COMPLETED') THEN
        v_shortage := public._order_stock_shortage(v_order.id, p_store_id);
        IF v_shortage IS NOT NULL THEN
            RAISE EXCEPTION 'INSUFFICIENT_STOCK: Estoque insuficiente para confirmar "%".', v_shortage;
        END IF;
        PERFORM public._deduct_order_stock(v_order.id, p_store_id, v_user_id, 'Baixa de estoque na confirmação do pedido #' || v_order.order_number);
        v_stock_deducted := true;
    END IF;

    IF p_new_status = 'CANCELLED' THEN
        IF v_order.stock_deducted THEN
            PERFORM public._reverse_order_stock(v_order.id, p_store_id, v_user_id,
                COALESCE(NULLIF(trim(p_reason), ''), 'Estorno automático por cancelamento do pedido #' || v_order.order_number));
            v_stock_deducted := false;
        END IF;
        PERFORM public._release_order_coupon(v_order.id);
        PERFORM public._count_order_in_stats(v_order.id, -1);
        IF v_order.payment_status = 'APPROVED' THEN
            v_payment_status := 'REFUND_PENDING';
            v_refund_required := true;
        ELSIF v_order.payment_status IN ('PENDING', 'REJECTED') THEN
            v_payment_status := 'EXPIRED';
        END IF;
    END IF;

    UPDATE public.orders
    SET status = p_new_status, stock_deducted = v_stock_deducted, payment_status = v_payment_status
    WHERE id = v_order.id;

    INSERT INTO public.order_status_history (store_id, order_id, from_status, to_status, reason, changed_by)
    VALUES (p_store_id, v_order.id, v_order.status, p_new_status, NULLIF(trim(p_reason), ''), v_user_id);

    RETURN jsonb_build_object(
        'order_id', v_order.id,
        'order_number', v_order.order_number,
        'from_status', v_order.status,
        'status', p_new_status,
        'payment_status', v_payment_status,
        'stock_deducted', v_stock_deducted,
        'refund_required', v_refund_required
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 7. PAYMENT STATE MACHINE (service role only — called by the webhook handler)
-- Approved online payment: reserve stock NOW; if short, cancel + refund.
-- Idempotent: status never regresses, repeated deliveries are no-ops.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.apply_payment_update(
    p_order_id UUID,
    p_provider_payment_id TEXT,
    p_status public.payment_status,
    p_amount_cents INTEGER,
    p_method public.payment_method,
    p_status_detail TEXT DEFAULT NULL,
    p_raw JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order RECORD;
    v_shortage TEXT;
    v_result TEXT := 'NOOP';
BEGIN
    SELECT * INTO v_order FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ORDER_NOT_FOUND: Pedido não encontrado.';
    END IF;

    INSERT INTO public.payments (store_id, order_id, provider_payment_id, method, status, status_detail, amount_cents, raw)
    VALUES (v_order.store_id, v_order.id, p_provider_payment_id, p_method, p_status, p_status_detail, p_amount_cents, p_raw)
    ON CONFLICT (provider, provider_payment_id) DO UPDATE
    SET status = CASE
            -- terminal states never go back
            WHEN public.payments.status IN ('REFUNDED') THEN public.payments.status
            WHEN public.payments.status = 'APPROVED' AND EXCLUDED.status IN ('PENDING', 'REJECTED') THEN public.payments.status
            ELSE EXCLUDED.status END,
        status_detail = EXCLUDED.status_detail,
        amount_cents = EXCLUDED.amount_cents,
        raw = EXCLUDED.raw;

    IF p_status = 'APPROVED' THEN
        IF v_order.payment_status IN ('APPROVED', 'REFUND_PENDING', 'REFUNDED') THEN
            v_result := 'NOOP';
        ELSIF p_amount_cents <> v_order.total_cents THEN
            UPDATE public.orders SET payment_status = 'REFUND_PENDING' WHERE id = v_order.id;
            v_result := 'REFUND_REQUIRED';
        ELSIF v_order.status = 'AWAITING_PAYMENT' THEN
            v_shortage := public._order_stock_shortage(v_order.id, v_order.store_id);
            IF v_shortage IS NOT NULL THEN
                PERFORM public._release_order_coupon(v_order.id);
                UPDATE public.orders SET status = 'CANCELLED', payment_status = 'REFUND_PENDING', paid_at = now() WHERE id = v_order.id;
                INSERT INTO public.order_status_history (store_id, order_id, from_status, to_status, reason)
                VALUES (v_order.store_id, v_order.id, 'AWAITING_PAYMENT', 'CANCELLED',
                    'Pagamento aprovado, mas "' || v_shortage || '" esgotou. Estorno automático.');
                v_result := 'REFUND_REQUIRED';
            ELSE
                PERFORM public._deduct_order_stock(v_order.id, v_order.store_id, NULL,
                    'Reserva de estoque no pagamento aprovado do pedido #' || v_order.order_number);
                UPDATE public.orders
                SET status = 'NEW', payment_status = 'APPROVED', paid_at = now(), stock_deducted = true
                WHERE id = v_order.id;
                PERFORM public._count_order_in_stats(v_order.id, 1);
                INSERT INTO public.order_status_history (store_id, order_id, from_status, to_status, reason)
                VALUES (v_order.store_id, v_order.id, 'AWAITING_PAYMENT', 'NEW', 'Pagamento online aprovado');
                v_result := 'APPROVED';
            END IF;
        ELSE
            -- Paid after expiry/cancellation.
            UPDATE public.orders SET payment_status = 'REFUND_PENDING', paid_at = now() WHERE id = v_order.id;
            v_result := 'REFUND_REQUIRED';
        END IF;

    ELSIF p_status = 'REFUNDED' THEN
        IF v_order.payment_status <> 'REFUNDED' THEN
            IF v_order.status NOT IN ('CANCELLED', 'COMPLETED') THEN
                IF v_order.stock_deducted THEN
                    PERFORM public._reverse_order_stock(v_order.id, v_order.store_id, NULL, 'Estorno de estoque por reembolso do pedido #' || v_order.order_number);
                END IF;
                PERFORM public._release_order_coupon(v_order.id);
                PERFORM public._count_order_in_stats(v_order.id, -1);
                UPDATE public.orders SET status = 'CANCELLED', stock_deducted = false WHERE id = v_order.id;
                INSERT INTO public.order_status_history (store_id, order_id, from_status, to_status, reason)
                VALUES (v_order.store_id, v_order.id, v_order.status, 'CANCELLED', 'Pagamento reembolsado');
            END IF;
            UPDATE public.orders SET payment_status = 'REFUNDED' WHERE id = v_order.id;
            v_result := 'REFUNDED';
        END IF;

    ELSIF p_status IN ('REJECTED', 'PENDING') THEN
        -- Customer may retry until the payment window closes.
        IF v_order.status = 'AWAITING_PAYMENT' AND v_order.payment_status IN ('PENDING', 'REJECTED') THEN
            UPDATE public.orders SET payment_status = p_status WHERE id = v_order.id;
            v_result := p_status::TEXT;
        END IF;
    END IF;

    RETURN jsonb_build_object('result', v_result, 'order_id', v_order.id, 'store_id', v_order.store_id,
        'order_number', v_order.order_number, 'total_cents', v_order.total_cents);
END;
$$;

-- Records a Pix QR / card attempt created by the server action (service role).
CREATE OR REPLACE FUNCTION public.record_payment_attempt(
    p_order_id UUID,
    p_provider_payment_id TEXT,
    p_method public.payment_method,
    p_status public.payment_status,
    p_amount_cents INTEGER,
    p_qr_code TEXT DEFAULT NULL,
    p_qr_code_base64 TEXT DEFAULT NULL,
    p_ticket_url TEXT DEFAULT NULL,
    p_expires_at TIMESTAMPTZ DEFAULT NULL,
    p_raw JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_store_id UUID;
BEGIN
    SELECT store_id INTO v_store_id FROM public.orders WHERE id = p_order_id;
    INSERT INTO public.payments (store_id, order_id, provider_payment_id, method, status, amount_cents,
        qr_code, qr_code_base64, ticket_url, expires_at, raw)
    VALUES (v_store_id, p_order_id, p_provider_payment_id, p_method, p_status, p_amount_cents,
        p_qr_code, p_qr_code_base64, p_ticket_url, p_expires_at, p_raw)
    ON CONFLICT (provider, provider_payment_id) DO UPDATE
    SET qr_code = COALESCE(EXCLUDED.qr_code, public.payments.qr_code),
        qr_code_base64 = COALESCE(EXCLUDED.qr_code_base64, public.payments.qr_code_base64),
        ticket_url = COALESCE(EXCLUDED.ticket_url, public.payments.ticket_url),
        expires_at = COALESCE(EXCLUDED.expires_at, public.payments.expires_at);
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_refund_failed(p_order_id UUID, p_error TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    INSERT INTO public.order_status_history (store_id, order_id, from_status, to_status, reason)
    SELECT store_id, id, status, status, left('Falha no estorno automático: ' || COALESCE(p_error, 'erro desconhecido') || '. Estorne pelo Mercado Pago.', 500)
    FROM public.orders WHERE id = p_order_id;
$$;

-- -----------------------------------------------------------------------------
-- 8. EXPIRE UNPAID ORDERS (pg_cron every minute + /api/cron/expire fallback)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.expire_unpaid_orders()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order RECORD;
    v_count INTEGER := 0;
BEGIN
    FOR v_order IN
        SELECT id, store_id FROM public.orders
        WHERE status = 'AWAITING_PAYMENT' AND payment_expires_at < now()
        ORDER BY payment_expires_at
        FOR UPDATE SKIP LOCKED
    LOOP
        PERFORM public._release_order_coupon(v_order.id);
        UPDATE public.orders SET status = 'CANCELLED', payment_status = 'EXPIRED' WHERE id = v_order.id;
        INSERT INTO public.order_status_history (store_id, order_id, from_status, to_status, reason)
        VALUES (v_order.store_id, v_order.id, 'AWAITING_PAYMENT', 'CANCELLED', 'Prazo de pagamento expirado');
        v_count := v_count + 1;
    END LOOP;
    -- Housekeeping
    DELETE FROM public.oauth_states WHERE expires_at < now();
    RETURN v_count;
END;
$$;

-- -----------------------------------------------------------------------------
-- 9. PUBLIC MENU PROJECTION (adds checkout configuration; still zero private data)
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
    v_zones JSONB;
    v_hours JSONB;
    v_public_key TEXT;
    v_online BOOLEAN;
BEGIN
    SELECT * INTO v_store FROM public.stores WHERE slug = lower(trim(p_slug)) AND is_published = true;
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'description', c.description)
        ORDER BY c.sort_order, c.created_at), '[]'::jsonb)
    INTO v_categories FROM public.categories c WHERE c.store_id = v_store.id AND c.is_active;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', p.id, 'category_id', p.category_id, 'name', p.name, 'description', p.description,
        'price_cents', p.price_cents, 'image_url', p.image_url, 'is_available', p.is_available,
        'in_stock', (NOT p.track_stock OR p.stock_quantity > 0),
        'option_groups', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
                'id', g.id, 'name', g.name, 'min_select', g.min_select, 'max_select', g.max_select, 'is_required', g.is_required,
                'options', COALESCE((
                    SELECT jsonb_agg(jsonb_build_object('id', o.id, 'name', o.name, 'price_cents', o.price_cents) ORDER BY o.sort_order, o.created_at)
                    FROM public.product_options o WHERE o.group_id = g.id AND o.store_id = v_store.id AND o.is_available
                ), '[]'::jsonb)
            ) ORDER BY g.sort_order, g.created_at)
            FROM public.product_option_groups g WHERE g.product_id = p.id AND g.store_id = v_store.id
        ), '[]'::jsonb)
    ) ORDER BY p.sort_order, p.created_at DESC), '[]'::jsonb)
    INTO v_products FROM public.products p WHERE p.store_id = v_store.id AND p.is_archived = false;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'id', z.id, 'name', z.name, 'neighborhoods', z.neighborhoods, 'fee_cents', z.fee_cents,
        'min_order_cents', z.min_order_cents, 'eta_minutes', COALESCE(z.eta_minutes, v_store.default_eta_minutes)
    ) ORDER BY z.sort_order, z.name), '[]'::jsonb)
    INTO v_zones FROM public.delivery_zones z WHERE z.store_id = v_store.id AND z.is_active;

    SELECT COALESCE(jsonb_agg(jsonb_build_object('weekday', h.weekday, 'opens_at', to_char(h.opens_at, 'HH24:MI'), 'closes_at', to_char(h.closes_at, 'HH24:MI'))
        ORDER BY h.weekday, h.opens_at), '[]'::jsonb)
    INTO v_hours FROM public.store_business_hours h WHERE h.store_id = v_store.id;

    SELECT a.public_key INTO v_public_key FROM public.store_payment_accounts a WHERE a.store_id = v_store.id AND a.status = 'ACTIVE';
    v_online := v_store.online_payment_enabled AND v_public_key IS NOT NULL;

    RETURN jsonb_build_object(
        'store', jsonb_build_object(
            'id', v_store.id, 'name', v_store.name, 'slug', v_store.slug, 'description', v_store.description,
            'logo_url', v_store.logo_url, 'banner_url', v_store.banner_url, 'phone', v_store.phone,
            'whatsapp', v_store.whatsapp, 'address', v_store.address, 'currency', v_store.currency,
            'is_open', v_store.is_open,
            'accepting_now', public.is_store_accepting(v_store.id),
            'min_order_cents', v_store.min_order_cents,
            'default_eta_minutes', v_store.default_eta_minutes,
            'fulfillment', jsonb_build_object('delivery', v_store.accepts_delivery, 'pickup', v_store.accepts_pickup, 'dine_in', v_store.accepts_dine_in),
            'offline_methods', to_jsonb(v_store.offline_methods),
            'pix_key', CASE WHEN 'PIX_MANUAL' = ANY(v_store.offline_methods) THEN v_store.pix_key END,
            'online_payment', jsonb_build_object('enabled', v_online, 'public_key', CASE WHEN v_online THEN v_public_key END),
            'hours', v_hours
        ),
        'categories', v_categories,
        'products', v_products,
        'delivery_zones', v_zones
    );
END;
$$;

-- -----------------------------------------------------------------------------
-- 10. PRIVILEGES
-- -----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.is_store_accepting(UUID, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_store_accepting(UUID, TIMESTAMPTZ) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.resolve_delivery_zone(UUID, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.price_coupon(UUID, TEXT, INTEGER, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.price_cart_items(UUID, JSONB) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.quote_checkout(TEXT, JSONB, public.fulfillment_type, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.quote_checkout(TEXT, JSONB, public.fulfillment_type, TEXT, TEXT, TEXT) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.create_order_atomic(UUID, public.order_source, public.fulfillment_type, TEXT, TEXT, JSONB, TEXT, TEXT, INTEGER, INTEGER, public.order_status, TEXT, public.payment_method, JSONB, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_order_atomic(UUID, public.order_source, public.fulfillment_type, TEXT, TEXT, JSONB, TEXT, TEXT, INTEGER, INTEGER, public.order_status, TEXT, public.payment_method, JSONB, TEXT, INTEGER) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.transition_order_status_atomic(UUID, UUID, public.order_status, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transition_order_status_atomic(UUID, UUID, public.order_status, TEXT) TO authenticated;

REVOKE ALL ON FUNCTION public.apply_payment_update(UUID, TEXT, public.payment_status, INTEGER, public.payment_method, TEXT, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_payment_update(UUID, TEXT, public.payment_status, INTEGER, public.payment_method, TEXT, JSONB) TO service_role;

REVOKE ALL ON FUNCTION public.record_payment_attempt(UUID, TEXT, public.payment_method, public.payment_status, INTEGER, TEXT, TEXT, TEXT, TIMESTAMPTZ, JSONB) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_payment_attempt(UUID, TEXT, public.payment_method, public.payment_status, INTEGER, TEXT, TEXT, TEXT, TIMESTAMPTZ, JSONB) TO service_role;

REVOKE ALL ON FUNCTION public.mark_refund_failed(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_refund_failed(UUID, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.expire_unpaid_orders() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_unpaid_orders() TO service_role;
