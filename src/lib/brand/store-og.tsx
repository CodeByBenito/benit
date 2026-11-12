import "server-only";
import { ImageResponse } from "next/og";
import { BRAND, OG_SIZE, Wordmark, brandFonts } from "@/lib/brand/image";
import { shareVariantPath } from "@/lib/images/brand-assets";
import { isOwnStorageUrl } from "@/lib/supabase/public";

export interface StoreOgInput {
  name: string;
  description: string | null;
  logoUrl: string | null;
  bannerUrl: string | null;
}

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

/**
 * Fetches a store image (own storage bucket only) as a data URL; null on any
 * problem. WebP originals are swapped for their JPEG twin, which is the one
 * next/og can decode.
 */
async function loadImage(url: string | null): Promise<string | null> {
  if (!isOwnStorageUrl(url)) return null;
  const target = shareVariantPath(url) ?? url;
  try {
    const res = await fetch(target, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return null;
    const type = res.headers.get("content-type")?.split(";")[0] ?? "";
    if (!type.startsWith("image/")) return null;
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_IMAGE_BYTES) return null;
    return `data:${type};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}

function clamp(text: string, max: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, max - 1).trimEnd()}…`;
}

function layout(store: StoreOgInput, logo: string | null, banner: string | null) {
  const name = clamp(store.name, 48);
  const nameSize = name.length > 30 ? 68 : name.length > 18 ? 84 : 104;
  const description = store.description ? clamp(store.description, 120) : "Peça online, acompanhe o pedido e pague do seu jeito.";
  const initial = name.charAt(0).toUpperCase();

  return (
    <div style={{ display: "flex", position: "relative", width: "100%", height: "100%", background: BRAND.bg, color: BRAND.text, fontFamily: "Inter" }}>
      {banner ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={banner} alt="" width={OG_SIZE.width} height={OG_SIZE.height} style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%", objectFit: "cover" }} />
      ) : null}
      <div
        style={{
          display: "flex",
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          backgroundImage: banner
            ? "linear-gradient(90deg, rgba(16,16,16,0.96) 0%, rgba(16,16,16,0.86) 55%, rgba(16,16,16,0.5) 100%)"
            : "radial-gradient(circle at 100% 0%, rgba(255,106,0,0.2), rgba(255,106,0,0) 55%)",
        }}
      />

      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", position: "relative", width: "100%", height: "100%", padding: "60px 72px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 22px",
              borderRadius: 999,
              border: `1px solid ${BRAND.orange}`,
              background: "rgba(255,106,0,0.14)",
              fontSize: 24,
            }}
          >
            <div style={{ width: 12, height: 12, borderRadius: 12, background: BRAND.orange }} />
            <span>Cardápio digital</span>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 36 }}>
          <div
            style={{
              display: "flex",
              flexShrink: 0,
              alignItems: "center",
              justifyContent: "center",
              width: 168,
              height: 168,
              borderRadius: 40,
              overflow: "hidden",
              border: `2px solid ${BRAND.border}`,
              background: BRAND.card,
              fontFamily: "Bricolage Grotesque",
              fontWeight: 800,
              fontSize: 96,
              color: BRAND.orange,
            }}
          >
            {logo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logo} alt="" width={168} height={168} style={{ width: 168, height: 168, objectFit: "cover" }} />
            ) : (
              <span>{initial}</span>
            )}
          </div>
          <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
            <div style={{ display: "flex", fontFamily: "Bricolage Grotesque", fontWeight: 800, fontSize: nameSize, lineHeight: 1, letterSpacing: -nameSize * 0.035 }}>
              {name}
            </div>
            <div style={{ display: "flex", marginTop: 20, fontSize: 30, lineHeight: 1.35, color: BRAND.muted }}>{description}</div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 24, color: BRAND.muted }}>
          <span>Peça pelo cardápio e acompanhe o pedido em tempo real.</span>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <span style={{ color: BRAND.subtle }}>feito com</span>
            <Wordmark size={40} />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Share image for a store menu. Renders eagerly so an image the renderer
 * cannot decode falls back to the text-only version instead of a broken card.
 */
export async function renderStoreOg(store: StoreOgInput, preloaded?: { logo: string | null; banner: string | null }): Promise<Response> {
  const fonts = await brandFonts();
  const [logo, banner] = preloaded ? [preloaded.logo, preloaded.banner] : await Promise.all([loadImage(store.logoUrl), loadImage(store.bannerUrl)]);
  const attempts: [string | null, string | null][] = logo || banner ? [[logo, banner], [logo, null], [null, null]] : [[null, null]];

  let lastError: unknown;
  for (const [l, b] of attempts) {
    try {
      const png = await new ImageResponse(layout(store, l, b), { ...OG_SIZE, fonts }).arrayBuffer();
      return new Response(png, {
        headers: { "Content-Type": "image/png", "Cache-Control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400" },
      });
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError;
}
