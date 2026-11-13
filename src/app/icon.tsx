import { ImageResponse } from "next/og";
import { Monogram, WordmarkTile, brandFonts } from "@/lib/brand/image";

export const runtime = "edge";

const SIZES = [32, 192, 512] as const;

export function generateImageMetadata() {
  return SIZES.map((s) => ({ id: String(s), size: { width: s, height: s }, contentType: "image/png" }));
}

/**
 * Favicon and app icons. At 32px the wordmark is unreadable, so the tab icon
 * is the "b" with the orange dot; larger sizes carry the full "benit".
 */
export default async function Icon({ id }: { id: string | Promise<string> }) {
  const size = Number(await id) || 32;
  return new ImageResponse(size <= 64 ? <Monogram size={size} /> : <WordmarkTile size={size} />, {
    width: size,
    height: size,
    fonts: await brandFonts(),
  });
}
