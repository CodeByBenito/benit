"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

export type RealtimeTable = "orders" | "products" | "stock_movements";

/**
 * Reusable store-scoped Supabase Realtime subscription hook.
 * - Subscribes to `postgres_changes` filtered strictly by `store_id=eq.<storeId>`.
 * - Relies on PostgreSQL RLS + authenticated user JWT so cross-tenant events are blocked at the broker.
 * - Automatically refreshes server state when tab regains focus or WebSocket reconnects.
 */
export function useStoreRealtime(
  storeId: string,
  tables: RealtimeTable[],
  channelPrefix = "benit-realtime"
) {
  const router = useRouter();
  const [connected, setConnected] = useState(false);
  const tablesKey = tables.join(",");

  useEffect(() => {
    if (!storeId || !isSupabaseConfigured()) {
      return;
    }

    const supabase = createClient();
    const tableList = tablesKey.split(",").filter(Boolean) as RealtimeTable[];
    let channel = supabase.channel(`${channelPrefix}-${storeId}`);

    for (const table of tableList) {
      channel = channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: `store_id=eq.${storeId}`,
        },
        () => {
          router.refresh();
        }
      );
    }

    channel.subscribe((status) => {
      const isLive = status === "SUBSCRIBED";
      setConnected(isLive);
      if (isLive) {
        // Ensure any missed transitions during a brief disconnect are reconciled
        router.refresh();
      }
    });

    const handleVisibilityOrOnline = () => {
      if (document.visibilityState === "visible") {
        router.refresh();
      }
    };

    window.addEventListener("visibilitychange", handleVisibilityOrOnline);
    window.addEventListener("online", handleVisibilityOrOnline);

    return () => {
      window.removeEventListener("visibilitychange", handleVisibilityOrOnline);
      window.removeEventListener("online", handleVisibilityOrOnline);
      supabase.removeChannel(channel);
    };
  }, [storeId, tablesKey, channelPrefix, router]);

  return { connected };
}

