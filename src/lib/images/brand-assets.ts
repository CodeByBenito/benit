/**
 * Rules and math for store images (logo, cover, product photos). Pure and
 * shared by the browser (crop + upload) and the server (path validation).
 */

export const ASSETS_BUCKET = "benit-assets";
export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
export const ACCEPTED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export const ACCEPT_ATTRIBUTE = ACCEPTED_IMAGE_TYPES.join(",");

export type BrandImageKind = "logo" | "banner";

/** Output size of each kind after cropping. */
export const BRAND_IMAGE_SPEC: Record<BrandImageKind, { width: number; height: number; label: string }> = {
  logo: { width: 512, height: 512, label: "Logo" },
  banner: { width: 1600, height: 600, label: "Capa" },
};

export function validateImageFile(file: { type: string; size: number }): string | null {
  if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return "Envie uma imagem JPG, PNG ou WebP.";
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return "A imagem precisa ter no máximo 2 MB.";
  }
  if (file.size === 0) {
    return "O arquivo está vazio.";
  }
  return null;
}

const EXTENSION: Record<string, string> = { "image/webp": "webp", "image/png": "png", "image/jpeg": "jpg" };

/**
 * `<store_id>/logo-<timestamp>.webp`: the first folder must be the store id,
 * which is what the storage policies of migration 0003 check. Browsers that
 * cannot encode WebP (Safari) produce PNG/JPEG, and the extension follows.
 */
export function brandImagePath(storeId: string, kind: BrandImageKind, mimeType: string, now: number = Date.now()): string {
  return `${storeId}/${kind}-${now}.${EXTENSION[mimeType] ?? "webp"}`;
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** True when `path` is a brand image of exactly this store and kind. */
export function isBrandImagePath(path: string, storeId: string, kind: BrandImageKind): boolean {
  if (!new RegExp(`^${UUID}$`, "i").test(storeId)) return false;
  return new RegExp(`^${storeId}/${kind}-\\d{10,16}\\.(webp|png|jpg)$`, "i").test(path);
}

/**
 * next/og cannot decode WebP, so every WebP brand image gets a JPEG twin used
 * only by the share image (`logo-1.webp` -> `logo-1-og.jpg`). PNG/JPEG
 * originals need none.
 */
export function shareVariantPath(path: string): string | null {
  return /\.webp$/i.test(path) ? path.replace(/\.webp$/i, "-og.jpg") : null;
}

export function publicAssetUrl(supabaseUrl: string, path: string): string {
  return `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/${ASSETS_BUCKET}/${path}`;
}

/** Storage path of a public URL of our bucket, or null for any other URL. */
export function assetPathFromPublicUrl(url: string | null | undefined, supabaseUrl: string | undefined): string | null {
  if (!url || !supabaseUrl) return null;
  const prefix = publicAssetUrl(supabaseUrl, "");
  if (!url.startsWith(prefix)) return null;
  const path = url.slice(prefix.length).split("?")[0];
  return path && !path.includes("..") ? decodeURIComponent(path) : null;
}

// --- Crop math ---------------------------------------------------------------

export interface CropView {
  /** Natural image size. */
  imageWidth: number;
  imageHeight: number;
  /** On-screen crop window size. */
  viewWidth: number;
  viewHeight: number;
  /** 1 = image just covers the window. */
  zoom: number;
  /** Pan in screen pixels from the centered position. */
  offsetX: number;
  offsetY: number;
}

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 4;

/** Screen scale at which the image exactly covers the crop window, times zoom. */
export function cropScale(view: Pick<CropView, "imageWidth" | "imageHeight" | "viewWidth" | "viewHeight" | "zoom">): number {
  const cover = Math.max(view.viewWidth / view.imageWidth, view.viewHeight / view.imageHeight);
  return cover * Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom));
}

/** Keeps the image covering the whole window: no empty band can be cropped. */
export function clampOffset(view: CropView): { offsetX: number; offsetY: number } {
  const scale = cropScale(view);
  const maxX = Math.max(0, (view.imageWidth * scale - view.viewWidth) / 2);
  const maxY = Math.max(0, (view.imageHeight * scale - view.viewHeight) / 2);
  return {
    offsetX: Math.min(maxX, Math.max(-maxX, view.offsetX)),
    offsetY: Math.min(maxY, Math.max(-maxY, view.offsetY)),
  };
}

/** Source rectangle (in natural image pixels) visible through the crop window. */
export function cropSourceRect(view: CropView): { sx: number; sy: number; sw: number; sh: number } {
  const scale = cropScale(view);
  const { offsetX, offsetY } = clampOffset(view);
  const sw = view.viewWidth / scale;
  const sh = view.viewHeight / scale;
  const sx = (view.imageWidth - sw) / 2 - offsetX / scale;
  const sy = (view.imageHeight - sh) / 2 - offsetY / scale;
  return {
    sx: Math.min(Math.max(0, sx), view.imageWidth - sw),
    sy: Math.min(Math.max(0, sy), view.imageHeight - sh),
    sw,
    sh,
  };
}
