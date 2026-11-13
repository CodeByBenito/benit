-- =============================================================================
-- BENIT SaaS — Migration 0011: Anti-spam for the public checkout
--
-- Two independent layers:
--
-- 1. Per phone, inside the order transaction. A trigger on `orders` refuses a
--    digital-menu order when the same phone already placed too many orders in
--    the same store in the last 10 minutes. It runs inside create_order_atomic
--    (which locks the store row first, so concurrent requests are counted
--    correctly) and it cannot be bypassed by calling the RPC directly with the
--    anon key. Manual orders typed by staff are never limited.
--
-- 2. Per visitor, for the app server. `consume_rate_limit` is a fixed-window
--    counter keyed by an opaque string. The app calls it with a hash of the
--    visitor's IP before quote_checkout and create_order_atomic. Only the
--    service role can call it; raw IPs are never stored.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. PER-PHONE LIMIT ON DIGITAL-MENU ORDERS
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_orders_store_phone_created
    ON public.orders (store_id, customer_phone_snapshot, created_at DESC)
    WHERE source = 'DIGITAL_MENU';

-- Limits live in one place so they can be tuned without touching the trigger.
CREATE OR REPLACE FUNCTION public.public_order_limit()
RETURNS TABLE (max_orders INTEGER, window_minutes INTEGER)
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
    SELECT 5, 10;
$$;

CREATE OR REPLACE FUNCTION public.enforce_public_order_rate_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_limit RECORD;
    v_phone TEXT;
    v_recent INTEGER;
BEGIN
    IF NEW.source <> 'DIGITAL_MENU' THEN
        RETURN NEW;
    END IF;

    SELECT * INTO v_limit FROM public.public_order_limit();
    v_phone := regexp_replace(COALESCE(NEW.customer_phone_snapshot, ''), '[^0-9]', '', 'g');
    IF v_phone = '' THEN
        RETURN NEW;
    END IF;

    SELECT count(*) INTO v_recent
    FROM public.orders o
    WHERE o.store_id = NEW.store_id
      AND o.source = 'DIGITAL_MENU'
      AND o.customer_phone_snapshot = v_phone
      AND o.created_at > now() - make_interval(mins => v_limit.window_minutes);

    IF v_recent >= v_limit.max_orders THEN
        RAISE EXCEPTION 'RATE_LIMITED: Você fez muitos pedidos em pouco tempo. Aguarde alguns minutos ou fale com a loja pelo WhatsApp.';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_public_rate_limit ON public.orders;
CREATE TRIGGER trg_orders_public_rate_limit
    BEFORE INSERT ON public.orders
    FOR EACH ROW EXECUTE FUNCTION public.enforce_public_order_rate_limit();

REVOKE ALL ON FUNCTION public.public_order_limit() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_public_order_rate_limit() FROM PUBLIC, anon, authenticated;

-- -----------------------------------------------------------------------------
-- 2. GENERIC FIXED-WINDOW COUNTER (service role only)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.rate_limit_buckets (
    bucket_key TEXT PRIMARY KEY CHECK (char_length(bucket_key) BETWEEN 8 AND 200),
    window_start TIMESTAMPTZ NOT NULL DEFAULT now(),
    hits INTEGER NOT NULL DEFAULT 0 CHECK (hits >= 0)
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_buckets_window ON public.rate_limit_buckets (window_start);

-- No policies on purpose: with RLS on, only the service role (which bypasses
-- RLS) can read or write it.
ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.rate_limit_buckets FROM PUBLIC, anon, authenticated;

-- Counts one hit and answers whether the caller is still within the limit.
CREATE OR REPLACE FUNCTION public.consume_rate_limit(
    p_key TEXT,
    p_limit INTEGER,
    p_window_seconds INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_hits INTEGER;
BEGIN
    IF p_key IS NULL OR char_length(p_key) < 8 OR p_limit < 1 OR p_window_seconds < 1 THEN
        RAISE EXCEPTION 'INVALID_RATE_LIMIT: Parâmetros inválidos.';
    END IF;

    INSERT INTO public.rate_limit_buckets AS b (bucket_key, window_start, hits)
    VALUES (p_key, now(), 1)
    ON CONFLICT (bucket_key) DO UPDATE
    SET hits = CASE WHEN b.window_start < now() - make_interval(secs => p_window_seconds) THEN 1 ELSE b.hits + 1 END,
        window_start = CASE WHEN b.window_start < now() - make_interval(secs => p_window_seconds) THEN now() ELSE b.window_start END
    RETURNING hits INTO v_hits;

    -- Housekeeping: now and then, drop buckets nobody touched for a day.
    IF random() < 0.02 THEN
        DELETE FROM public.rate_limit_buckets WHERE window_start < now() - interval '1 day';
    END IF;

    RETURN v_hits <= p_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_rate_limit(TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(TEXT, INTEGER, INTEGER) TO service_role;
