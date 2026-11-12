import { describe, expect, it } from "vitest";
import {
  MAX_UPLOAD_BYTES,
  assetPathFromPublicUrl,
  brandImagePath,
  clampOffset,
  cropScale,
  cropSourceRect,
  isBrandImagePath,
  publicAssetUrl,
  shareVariantPath,
  validateImageFile,
} from "@/lib/images/brand-assets";
import { storeBrandImageSchema, storeSettingsSchema } from "@/lib/validations";

const STORE = "0b1f6c1e-3a52-4d0e-9a67-2f1f0c9d8e11";
const OTHER = "7c9e6679-7425-40de-944b-e07fc1f90ae7";
const SUPABASE = "https://abc.supabase.co";

describe("store images: file rules", () => {
  it("accepts JPG, PNG and WebP up to 2 MB", () => {
    for (const type of ["image/jpeg", "image/png", "image/webp"]) expect(validateImageFile({ type, size: 300_000 })).toBeNull();
    expect(validateImageFile({ type: "image/png", size: MAX_UPLOAD_BYTES })).toBeNull();
  });

  it("rejects files over 2 MB, other formats and empty files", () => {
    expect(validateImageFile({ type: "image/png", size: MAX_UPLOAD_BYTES + 1 })).toBe("A imagem precisa ter no máximo 2 MB.");
    expect(validateImageFile({ type: "image/gif", size: 10 })).toBe("Envie uma imagem JPG, PNG ou WebP.");
    expect(validateImageFile({ type: "image/svg+xml", size: 10 })).toBe("Envie uma imagem JPG, PNG ou WebP.");
    expect(validateImageFile({ type: "image/png", size: 0 })).toBe("O arquivo está vazio.");
  });
});

describe("store images: storage path", () => {
  it("builds <store_id>/<kind>-<timestamp>.webp, the shape the storage policies accept", () => {
    expect(brandImagePath(STORE, "logo", "image/webp", 1767225600000)).toBe(`${STORE}/logo-1767225600000.webp`);
    expect(brandImagePath(STORE, "banner", "image/jpeg", 1767225600000)).toBe(`${STORE}/banner-1767225600000.jpg`);
  });

  it("only validates paths of the same store and kind", () => {
    const path = `${STORE}/logo-1767225600000.webp`;
    expect(isBrandImagePath(path, STORE, "logo")).toBe(true);
    expect(isBrandImagePath(path, STORE, "banner")).toBe(false);
    expect(isBrandImagePath(path, OTHER, "logo")).toBe(false);
    expect(isBrandImagePath(`${STORE}/../${OTHER}/logo-1767225600000.webp`, STORE, "logo")).toBe(false);
    expect(isBrandImagePath(`${STORE}/products/logo-1767225600000.webp`, STORE, "logo")).toBe(false);
    expect(isBrandImagePath(`${STORE}/logo-1767225600000.svg`, STORE, "logo")).toBe(false);
    expect(isBrandImagePath(path, "not-a-uuid", "logo")).toBe(false);
  });

  it("maps public URLs of our bucket back to paths and ignores everything else", () => {
    const path = `${STORE}/logo-1767225600000.webp`;
    expect(assetPathFromPublicUrl(publicAssetUrl(SUPABASE, path), SUPABASE)).toBe(path);
    expect(assetPathFromPublicUrl(`${publicAssetUrl(SUPABASE, path)}?v=2`, SUPABASE)).toBe(path);
    expect(assetPathFromPublicUrl("https://cdn.example.com/logo.png", SUPABASE)).toBeNull();
    expect(assetPathFromPublicUrl(null, SUPABASE)).toBeNull();
  });

  it("gives WebP images a JPEG twin for share images (next/og cannot decode WebP)", () => {
    expect(shareVariantPath(`${STORE}/logo-1767225600000.webp`)).toBe(`${STORE}/logo-1767225600000-og.jpg`);
    expect(shareVariantPath(publicAssetUrl(SUPABASE, `${STORE}/banner-1.webp`))).toBe(publicAssetUrl(SUPABASE, `${STORE}/banner-1-og.jpg`));
    expect(shareVariantPath(`${STORE}/logo-1767225600000.png`)).toBeNull();
    // The twin is never accepted as the store's own image path.
    expect(isBrandImagePath(`${STORE}/logo-1767225600000-og.jpg`, STORE, "logo")).toBe(false);
  });

  it("the server action payload carries a path, never a URL field", () => {
    expect(storeBrandImageSchema.safeParse({ storeId: STORE, kind: "logo", path: `${STORE}/logo-1.webp` }).success).toBe(true);
    expect(storeBrandImageSchema.safeParse({ storeId: STORE, kind: "logo", path: null }).success).toBe(true);
    expect(storeBrandImageSchema.safeParse({ storeId: STORE, kind: "avatar", path: null }).success).toBe(false);
    const settings = storeSettingsSchema.parse({ storeId: STORE, name: "Smash", slug: "smash", isOpen: true, isPublished: true, logoUrl: "https://evil.example/x.png" });
    expect(settings).not.toHaveProperty("logoUrl");
  });
});

describe("store images: crop math", () => {
  const landscape = { imageWidth: 2000, imageHeight: 1000, viewWidth: 300, viewHeight: 300 };

  it("covers the square window at zoom 1 and crops the centered square", () => {
    const view = { ...landscape, zoom: 1, offsetX: 0, offsetY: 0 };
    expect(cropScale(view)).toBeCloseTo(0.3);
    expect(cropSourceRect(view)).toEqual({ sx: 500, sy: 0, sw: 1000, sh: 1000 });
  });

  it("never lets the image leave an empty band", () => {
    const pushed = clampOffset({ ...landscape, zoom: 1, offsetX: 9999, offsetY: 9999 });
    expect(pushed).toEqual({ offsetX: 150, offsetY: 0 });
    const rect = cropSourceRect({ ...landscape, zoom: 1, offsetX: 9999, offsetY: -9999 });
    expect(rect.sx).toBe(0);
    expect(rect.sx + rect.sw).toBeLessThanOrEqual(2000);
    expect(rect.sy + rect.sh).toBeLessThanOrEqual(1000);
  });

  it("zooming narrows the source rectangle and keeps its aspect ratio", () => {
    const rect = cropSourceRect({ ...landscape, zoom: 2, offsetX: 0, offsetY: 0 });
    expect(rect.sw).toBeCloseTo(500);
    expect(rect.sh).toBeCloseTo(500);
    const banner = cropSourceRect({ imageWidth: 1200, imageHeight: 1200, viewWidth: 800, viewHeight: 300, zoom: 1, offsetX: 0, offsetY: 0 });
    expect(banner.sw / banner.sh).toBeCloseTo(8 / 3);
  });

  it("clamps zoom to the allowed range", () => {
    expect(cropScale({ ...landscape, zoom: 0.1 })).toBeCloseTo(0.3);
    expect(cropScale({ ...landscape, zoom: 99 })).toBeCloseTo(1.2);
  });
});
