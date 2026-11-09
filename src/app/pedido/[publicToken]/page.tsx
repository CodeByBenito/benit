import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTrackedOrderAction } from "@/features/checkout/actions";
import { OrderTracking } from "@/components/tracking/order-tracking";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: { absolute: "Acompanhe seu pedido" },
  robots: { index: false, follow: false },
};

export default async function TrackingPage({ params }: { params: Promise<{ publicToken: string }> }) {
  const { publicToken } = await params;
  const order = await getTrackedOrderAction(publicToken);
  if (!order) notFound();
  return <OrderTracking token={publicToken} initial={order} />;
}
