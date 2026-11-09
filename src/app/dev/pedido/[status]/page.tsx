import { notFound } from "next/navigation";
import { OrderTracking } from "@/components/tracking/order-tracking";
import { fixtureTracked } from "../../fixtures";

/** Development-only design preview of the tracking page. 404 in production. */
export default async function DevTrackingPreview({ params }: { params: Promise<{ status: string }> }) {
  if (process.env.NODE_ENV === "production") notFound();
  const { status } = await params;
  return <OrderTracking token={"f".repeat(64)} initial={fixtureTracked(status.toUpperCase())} />;
}
