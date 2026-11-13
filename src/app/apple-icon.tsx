import { ImageResponse } from "next/og";
import { WordmarkTile, brandFonts } from "@/lib/brand/image";

export const runtime = "edge";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** iOS home-screen icon (iOS rounds the corners itself). */
export default async function AppleIcon() {
  return new ImageResponse(<WordmarkTile size={180} />, { ...size, fonts: await brandFonts() });
}
