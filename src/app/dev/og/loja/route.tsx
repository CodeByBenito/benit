import { notFound } from "next/navigation";
import { renderStoreOg } from "@/lib/brand/store-og";
import { fixtureStore } from "../../fixtures";

export const runtime = "edge";

export const dynamic = "force-dynamic";

/** Development-only preview of the per-store share image, from the fixture store. */
export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") notFound();
  const name = new URL(request.url).searchParams.get("name") ?? fixtureStore.name;
  return renderStoreOg({ name, description: fixtureStore.description, logoUrl: null, bannerUrl: null });
}

/** Same preview with images supplied as data URLs: `{ "logo": "data:image/webp;base64,...", "banner": null }`. */
export async function POST(request: Request) {
  if (process.env.NODE_ENV === "production") notFound();
  const body = (await request.json()) as { logo?: string | null; banner?: string | null };
  const isDataImage = (v: unknown): v is string => typeof v === "string" && v.startsWith("data:image/");
  return renderStoreOg(
    { name: fixtureStore.name, description: fixtureStore.description, logoUrl: null, bannerUrl: null },
    { logo: isDataImage(body.logo) ? body.logo : null, banner: isDataImage(body.banner) ? body.banner : null }
  );
}
