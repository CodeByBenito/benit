-- =============================================================================
-- BENIT SaaS — Migration 0010: Catalog ordering and storage limits
--
-- 1. reorder_catalog: saves a drag-and-drop order (categories or products) in
--    one statement instead of one request per row.
-- 2. benit-assets bucket: images only, with a size cap enforced by Storage
--    itself (the app also resizes before uploading).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. DRAG-AND-DROP ORDER
--    SECURITY INVOKER on purpose: the caller's RLS policies on `categories`
--    and `products` decide what can be updated, exactly as a direct update
--    would. `p_ids` is the complete new order of one list; rows of another
--    store are ignored.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reorder_catalog(
    p_store_id UUID,
    p_kind TEXT,
    p_ids UUID[]
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    v_count INTEGER := 0;
BEGIN
    IF auth.uid() IS NULL OR NOT public.has_store_access(p_store_id) THEN
        RAISE EXCEPTION 'FORBIDDEN: Sem permissão para organizar o cardápio desta loja.';
    END IF;
    IF p_ids IS NULL OR cardinality(p_ids) = 0 THEN
        RETURN 0;
    END IF;
    IF cardinality(p_ids) > 500 THEN
        RAISE EXCEPTION 'TOO_MANY_ITEMS: Reordene no máximo 500 itens por vez.';
    END IF;

    IF p_kind = 'category' THEN
        UPDATE public.categories c
        SET sort_order = (x.ord - 1) * 10
        FROM unnest(p_ids) WITH ORDINALITY AS x(id, ord)
        WHERE c.id = x.id AND c.store_id = p_store_id;
    ELSIF p_kind = 'product' THEN
        UPDATE public.products p
        SET sort_order = (x.ord - 1) * 10
        FROM unnest(p_ids) WITH ORDINALITY AS x(id, ord)
        WHERE p.id = x.id AND p.store_id = p_store_id;
    ELSE
        RAISE EXCEPTION 'INVALID_KIND: Use category ou product.';
    END IF;

    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.reorder_catalog(UUID, TEXT, UUID[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reorder_catalog(UUID, TEXT, UUID[]) TO authenticated;

-- -----------------------------------------------------------------------------
-- 2. STORAGE: the public bucket only takes images, up to 5 MB each.
--    (Logos and covers are capped at 2 MB by the app; product photos are
--    resized in the browser. 5 MB leaves room for older app versions.)
-- -----------------------------------------------------------------------------
UPDATE storage.buckets
SET file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/webp', 'image/jpeg', 'image/png']
WHERE id = 'benit-assets';
