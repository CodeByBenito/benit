import { NextResponse, type NextRequest } from "next/server";
import { isAuthorizedCron } from "@/lib/cron-auth";
import { integrations } from "@/lib/env";
import { refreshExpiringAccounts } from "@/lib/mercadopago/accounts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Daily: refresh Mercado Pago tokens expiring within 7 days. */
export async function GET(request: NextRequest) {
  if (!isAuthorizedCron(request.headers.get("authorization"))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  if (!integrations.mercadoPago) return NextResponse.json({ skipped: true });
  return NextResponse.json(await refreshExpiringAccounts());
}
