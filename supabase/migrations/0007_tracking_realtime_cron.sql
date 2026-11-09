-- =============================================================================
-- BENIT SaaS — Migration 0007: Public order tracking, broadcast & scheduled jobs
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. PUBLIC TRACKING PROJECTION
-- The unguessable public_token (256 bits) is the capability. Returns NO
-- customer name, phone or address — only what the tracking page shows.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_public_order_by_token(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_order RECORD;
    v_store RECORD;
    v_items JSONB;
    v_timeline JSONB;
    v_pix JSONB;
    v_public_key TEXT;
BEGIN
    IF p_token IS NULL OR p_token !~ '^[0-9a-f]{64}$' THEN
        RETURN NULL;
    END IF;

    SELECT * INTO v_order FROM public.orders WHERE public_token = p_token;
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    SELECT name, slug, whatsapp, logo_url, online_payment_enabled INTO v_store FROM public.stores WHERE id = v_order.store_id;
    -- MP public key is public by design (used by the card Brick in the browser).
    IF v_order.status = 'AWAITING_PAYMENT' AND v_store.online_payment_enabled THEN
        SELECT a.public_key INTO v_public_key FROM public.store_payment_accounts a WHERE a.store_id = v_order.store_id AND a.status = 'ACTIVE';
    END IF;

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'name', oi.product_name_snapshot,
        'quantity', oi.quantity,
        'total_cents', oi.total_item_cents,
        'options', COALESCE((SELECT jsonb_agg(oio.option_name_snapshot ORDER BY oio.created_at)
                             FROM public.order_item_options oio WHERE oio.order_item_id = oi.id), '[]'::jsonb)
    ) ORDER BY oi.created_at), '[]'::jsonb)
    INTO v_items FROM public.order_items oi WHERE oi.order_id = v_order.id;

    SELECT COALESCE(jsonb_agg(jsonb_build_object('status', h.to_status, 'at', h.created_at) ORDER BY h.created_at), '[]'::jsonb)
    INTO v_timeline FROM public.order_status_history h WHERE h.order_id = v_order.id AND h.from_status IS DISTINCT FROM h.to_status;

    -- Latest pending Pix (so the customer can pay from the tracking page if they closed the tab).
    IF v_order.status = 'AWAITING_PAYMENT' THEN
        SELECT jsonb_build_object('qr_code', p.qr_code, 'qr_code_base64', p.qr_code_base64, 'expires_at', p.expires_at)
        INTO v_pix FROM public.payments p
        WHERE p.order_id = v_order.id AND p.method = 'ONLINE_PIX' AND p.status = 'PENDING'
        ORDER BY p.created_at DESC LIMIT 1;
    END IF;

    RETURN jsonb_build_object(
        'order_number', v_order.order_number,
        'status', v_order.status,
        'payment_status', v_order.payment_status,
        'payment_method', v_order.payment_method,
        'payment_expires_at', v_order.payment_expires_at,
        'fulfillment_type', v_order.fulfillment_type,
        'eta_minutes', v_order.eta_minutes,
        'subtotal_cents', v_order.subtotal_cents,
        'discount_cents', v_order.discount_cents,
        'fee_cents', v_order.fee_cents,
        'total_cents', v_order.total_cents,
        'created_at', v_order.created_at,
        'items', v_items,
        'timeline', v_timeline,
        'pix', v_pix,
        'mp_public_key', v_public_key,
        'store', jsonb_build_object('name', v_store.name, 'slug', v_store.slug, 'whatsapp', v_store.whatsapp, 'logo_url', v_store.logo_url)
    );
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_order_by_token(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_order_by_token(TEXT) TO anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. BROADCAST STATUS CHANGES TO THE PUBLIC CHANNEL  track:<token>
-- Payload is minimal (no personal data). Failure never blocks the order update.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.broadcast_order_tracking()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF NEW.status IS DISTINCT FROM OLD.status OR NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
        BEGIN
            PERFORM realtime.send(
                jsonb_build_object('status', NEW.status, 'payment_status', NEW.payment_status, 'at', now()),
                'status',
                'track:' || NEW.public_token,
                false
            );
        EXCEPTION WHEN OTHERS THEN
            NULL; -- realtime not available (local Postgres / tests): tracking page falls back to polling
        END;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_broadcast_tracking ON public.orders;
CREATE TRIGGER trg_orders_broadcast_tracking
    AFTER UPDATE OF status, payment_status ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.broadcast_order_tracking();

-- -----------------------------------------------------------------------------
-- 3. SCHEDULED EXPIRY (pg_cron). If pg_cron is unavailable, the Vercel cron
--    route /api/cron/expire calls expire_unpaid_orders() instead.
-- -----------------------------------------------------------------------------
DO $$
BEGIN
    CREATE EXTENSION IF NOT EXISTS pg_cron;
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'benit-expire-unpaid-orders';
    PERFORM cron.schedule('benit-expire-unpaid-orders', '* * * * *', 'SELECT public.expire_unpaid_orders();');
EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'pg_cron indisponível (%). Use a rota /api/cron/expire.', SQLERRM;
END $$;
