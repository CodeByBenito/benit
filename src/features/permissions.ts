import "server-only";
import { createClient } from "@/lib/supabase/server";

/** OWNER (org-wide) or MANAGER of the store, checked by the database helper. */
export async function requireStoreManager(
  storeId: string
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sessão expirada. Entre novamente." };
  const { data, error } = await supabase.rpc("can_manage_store", { p_store_id: storeId });
  if (error || !data) return { ok: false, error: "Apenas proprietário ou gerente podem alterar esta configuração." };
  return { ok: true, userId: user.id };
}
