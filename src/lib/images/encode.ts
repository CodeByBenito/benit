import { cropSourceRect, type CropView } from "./brand-assets";

/** Browser-only image helpers (canvas). */

export function loadImageFromFile(file: Blob): Promise<{ image: HTMLImageElement; revoke: () => void }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve({ image, revoke: () => URL.revokeObjectURL(url) });
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Não foi possível ler esta imagem. Tente outro arquivo."));
    };
    image.src = url;
  });
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/**
 * Encodes a canvas as WebP. Safari cannot encode WebP and silently returns
 * PNG, so when that happens we choose the format ourselves: PNG keeps
 * transparency (logos), JPEG keeps photos small.
 */
async function encode(canvas: HTMLCanvasElement, fallback: "image/png" | "image/jpeg"): Promise<Blob> {
  const webp = await toBlob(canvas, "image/webp", 0.86);
  if (webp && webp.type === "image/webp") return webp;
  const other = await toBlob(canvas, fallback, 0.88);
  if (!other) throw new Error("Seu navegador não conseguiu processar a imagem.");
  return other;
}

export interface CroppedImage {
  /** What the site shows (WebP when the browser can encode it). */
  blob: Blob;
  /** JPEG twin for share images, only when `blob` is WebP (see shareVariantPath). */
  shareBlob: Blob | null;
}

/** Renders the visible crop to exactly `width` x `height`. */
export async function renderCrop(image: HTMLImageElement, view: CropView, width: number, height: number, fallback: "image/png" | "image/jpeg"): Promise<CroppedImage> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Seu navegador não conseguiu processar a imagem.");
  ctx.imageSmoothingQuality = "high";
  const { sx, sy, sw, sh } = cropSourceRect(view);
  ctx.drawImage(image, sx, sy, sw, sh, 0, 0, width, height);
  const blob = await encode(canvas, fallback);
  if (blob.type !== "image/webp") return { blob, shareBlob: null };

  // JPEG has no transparency: paint the card color behind the image first.
  const flat = document.createElement("canvas");
  flat.width = width;
  flat.height = height;
  const flatCtx = flat.getContext("2d");
  if (!flatCtx) return { blob, shareBlob: null };
  flatCtx.fillStyle = "#242424";
  flatCtx.fillRect(0, 0, width, height);
  flatCtx.drawImage(canvas, 0, 0);
  return { blob, shareBlob: await toBlob(flat, "image/jpeg", 0.86) };
}

/** Downscales a photo so its longest side is at most `maxSide` (never upscales). */
export async function resizeToFit(file: Blob, maxSide: number): Promise<Blob> {
  const { image, revoke } = await loadImageFromFile(file);
  try {
    const ratio = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Seu navegador não conseguiu processar a imagem.");
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return await encode(canvas, "image/jpeg");
  } finally {
    revoke();
  }
}
