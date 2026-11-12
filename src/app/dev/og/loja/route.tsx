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
