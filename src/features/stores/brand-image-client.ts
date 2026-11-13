"use client";

import type { BrandImageIO } from "@/components/settings/image-upload";
import { setStoreBrandImageAction } from "@/features/stores/actions";
import { ASSETS_BUCKET, brandImagePath, shareVariantPath } from "@/lib/images/brand-assets";
import { createClient } from "@/lib/supabase/client";

/**
 * Uploads straight from the browser to Supabase Storage (the storage policies
 * only accept `<store_id>/...` from members of that store), then asks the
 * server to point the store at the new file.
 */
export function createBrandImageIO(storeId: string): BrandImageIO {
  return {
    async save(kind, { blob, shareBlob }) {
      const supabase = createClient();
      const path = brandImagePath(storeId, kind, blob.type);
      const { error } = await supabase.storage.from(ASSETS_BUCKET).upload(path, blob, {
        contentType: blob.type,
        cacheControl: "31536000",
        upsert: false,
      });
      if (error) return { ok: false, error: "Não foi possível enviar a imagem. Confira sua conexão e tente de novo." };

      // JPEG twin for share images. Optional: without it the share card just omits the picture.
      const sharePath = shareVariantPath(path);
      if (shareBlob && sharePath) {
        await supabase.storage.from(ASSETS_BUCKET).upload(sharePath, shareBlob, { contentType: "image/jpeg", cacheControl: "31536000", upsert: false });
      }

      const res = await setStoreBrandImageAction({ storeId, kind, path });
      if (!res.success) {
        await supabase.storage.from(ASSETS_BUCKET).remove(sharePath ? [path, sharePath] : [path]);
        return { ok: false, error: res.error ?? "Não foi possível salvar a imagem." };
      }
      return { ok: true, url: res.data?.url ?? null };
    },
    async remove(kind) {
      const res = await setStoreBrandImageAction({ storeId, kind, path: null });
      if (!res.success) return { ok: false, error: res.error ?? "Não foi possível remover a imagem." };
      return { ok: true, url: null };
    },
  };
}
