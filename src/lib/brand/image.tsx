import "server-only";

/**
 * Building blocks for generated brand images (favicon, app icons, Open Graph).
 * Rendered by next/og (Satori): flexbox only, inline styles, no Tailwind.
 *
 * Every route that uses this runs on the Edge runtime (`runtime = "edge"`):
 * the Node build of next/og in Next 15.1 cannot load its fallback font on
 * Windows, which would break local development. Fonts are therefore bundled
 * as assets and read with fetch, not with the file system.
 */

export const BRAND = {
  bg: "#101010",
  surface: "#1C1C1C",
  card: "#242424",
  border: "#333333",
  orange: "#FF6A00",
  text: "#F3F3F0",
  muted: "#A1A1A1",
  subtle: "#6E6E6E",
} as const;

export const OG_SIZE = { width: 1200, height: 630 } as const;

type BrandFont = { name: string; data: ArrayBuffer; weight: 500 | 800; style: "normal" };

const asset = (url: URL) => fetch(url).then((res) => res.arrayBuffer());
let fontsPromise: Promise<BrandFont[]> | null = null;

/** Static cuts of the brand fonts (Satori cannot read variable fonts or woff2). */
export function brandFonts(): Promise<BrandFont[]> {
  fontsPromise ??= Promise.all([
    asset(new URL("../../assets/fonts/bricolage-grotesque-latin-800-normal.woff", import.meta.url)),
    asset(new URL("../../assets/fonts/inter-latin-500-normal.woff", import.meta.url)),
  ]).then(([display, sans]) => [
    { name: "Bricolage Grotesque", data: display, weight: 800, style: "normal" },
    { name: "Inter", data: sans, weight: 500, style: "normal" },
  ]);
  return fontsPromise;
}

/**
 * The wordmark: lowercase "benit" where the tittle of the "i" is the orange
 * live-order dot. Mirrors components/layout/benit-logo.tsx.
 */
export function Wordmark({ size, color = BRAND.text }: { size: number; color?: string }) {
  const dot = size * 0.21;
  const tracking = -0.055 * size;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        fontFamily: "Bricolage Grotesque",
        fontWeight: 800,
        fontSize: size,
        lineHeight: 1,
        letterSpacing: tracking,
        color,
      }}
    >
      <span>ben</span>
      <div style={{ display: "flex", position: "relative" }}>
        <span>ı</span>
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: size * 0.06,
            width: dot,
            height: dot,
            marginLeft: -dot / 2 + tracking / 2,
            borderRadius: dot,
            background: BRAND.orange,
          }}
        />
      </div>
      <span>t</span>
    </div>
  );
}

/** Small-size mark for favicons: the "b" with the live-order dot. */
export function Monogram({ size }: { size: number }) {
  const dot = size * 0.2;
  return (
    <div
      style={{
        display: "flex",
        width: size,
        height: size,
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        background: BRAND.bg,
        borderRadius: size * 0.22,
        fontFamily: "Bricolage Grotesque",
        fontWeight: 800,
        fontSize: size * 0.86,
        lineHeight: 1,
        color: BRAND.text,
      }}
    >
      <span style={{ marginTop: -size * 0.09, marginLeft: -size * 0.1 }}>b</span>
      <div
        style={{
          position: "absolute",
          right: size * 0.13,
          top: size * 0.17,
          width: dot,
          height: dot,
          borderRadius: dot,
          background: BRAND.orange,
        }}
      />
    </div>
  );
}

/** App-icon tile: full wordmark centered on the dark base. */
export function WordmarkTile({ size, rounded = false }: { size: number; rounded?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        width: size,
        height: size,
        alignItems: "center",
        justifyContent: "center",
        background: BRAND.bg,
        borderRadius: rounded ? size * 0.22 : 0,
      }}
    >
      <Wordmark size={size * 0.3} />
    </div>
  );
}
