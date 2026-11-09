import { notFound } from "next/navigation";
import { PublicMenuClient } from "@/components/menu/public-menu-client";
import { fixtureCategories, fixtureProducts, fixtureStore, fixtureZones } from "../fixtures";

/** Development-only design preview of the public menu. 404 in production. */
export default function DevMenuPreview() {
  if (process.env.NODE_ENV === "production") notFound();
  return <PublicMenuClient store={fixtureStore} categories={fixtureCategories} products={fixtureProducts} zones={fixtureZones} />;
}
