"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import type { ActionResult } from "@/features/auth/actions";
import { sendEmail } from "@/lib/email/send";
import { teamAddedEmail } from "@/lib/email/templates";
import { integrations } from "@/lib/env";
import { cleanDbError } from "@/lib/labels";
import { ROLE_LABEL } from "@/lib/permissions/roles";
import { absoluteUrl, authCallbackUrl } from "@/lib/site";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { inviteTeamMemberSchema, teamMembershipSchema, updateTeamMemberRoleSchema } from "@/lib/validations";
import type { TeamMember } from "@/types/domain.types";

type AddResult = { status: "ADDED"; membership_id: string; user_id: string; pending: boolean } | { status: "USER_NOT_FOUND" };

export type InviteOutcome = "invited" | "added";

const NO_SERVICE_ROLE = "Convites por e-mail precisam da chave SUPABASE_SERVICE_ROLE_KEY configurada no servidor.";

/** Sends (or re-sends) the Supabase invitation; the link lands on /auth/callback and then on the new-password screen. */
async function sendInvitation(email: string, fullName?: string): Promise<{ ok: true; userId: string | null } | { ok: false; error: string }> {
  if (!integrations.supabaseAdmin) return { ok: false, error: NO_SERVICE_ROLE };
  const { data, error } = await createAdminClient().auth.admin.inviteUserByEmail(email, {
    redirectTo: authCallbackUrl("/reset-password"),
    data: fullName ? { full_name: fullName } : undefined,
  });
  if (error) {
    if (error.status === 429) return { ok: false, error: "Muitos convites em pouco tempo. Aguarde alguns minutos e tente de novo." };
    console.error("[team] inviteUserByEmail:", error.message);
    return { ok: false, error: "Não foi possível enviar o convite por e-mail. Tente de novo em instantes." };
  }
  return { ok: true, userId: data.user?.id ?? null };
}

/**
 * Invites a person to the team.
 *
 * Every rule (only the OWNER invites, valid role and store, no duplicates) is
 * enforced by `add_team_member`, called with the signed-in user's own session.
 * The service role is used for one thing only: sending the invitation e-mail
 * to an address that has no account yet, and only after that RPC accepted the
 * request.
 */
export async function inviteTeamMemberAction(payload: unknown): Promise<ActionResult<{ outcome: InviteOutcome; membershipId: string; userId: string }>> {
  const parsed = inviteTeamMemberSchema.safeParse(payload);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Convite inválido." };
  const { organizationId, email, fullName, role, storeId } = parsed.data;

  const supabase = await createClient();
  const add = () =>
    supabase.rpc("add_team_member", { p_org_id: organizationId, p_email: email, p_role: role, p_store_id: storeId });

  const first = await add();
  if (first.error) return { success: false, error: cleanDbError(first.error.message, "Não foi possível convidar.") };
  let result = first.data as AddResult;
  let outcome: InviteOutcome = "added";

  if (result.status === "USER_NOT_FOUND") {
    // New e-mail: create the invited account, then link it.
    const invitation = await sendInvitation(email, fullName || undefined);
    if (!invitation.ok) return { success: false, error: invitation.error };

    const second = await add();
    const linked = !second.error && (second.data as AddResult).status === "ADDED";
    if (!linked) {
      // Do not leave an invited account that belongs to no team.
      if (invitation.userId) await createAdminClient().auth.admin.deleteUser(invitation.userId);
      return { success: false, error: cleanDbError(second.error?.message, "Não foi possível concluir o convite. Tente de novo.") };
    }
    result = second.data as AddResult;
    outcome = "invited";
  } else if (result.pending) {
    // Account created by an earlier invitation that was never accepted: send a fresh link.
    const invitation = await sendInvitation(email, fullName || undefined);
    if (invitation.ok) outcome = "invited";
  } else {
    // Existing account: access is immediate, so tell the person by e-mail.
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const { data: org } = await supabase.from("organizations").select("name").eq("id", organizationId).maybeSingle();
    const mail = teamAddedEmail({
      organizationName: org?.name ?? "um negócio",
      roleLabel: ROLE_LABEL[role],
      invitedBy: (user?.user_metadata?.full_name as string | undefined) ?? user?.email ?? "O proprietário",
      loginUrl: absoluteUrl("/login"),
    });
    after(() => sendEmail({ to: email, ...mail }));
  }

  revalidatePath("/settings");
  if (result.status !== "ADDED") return { success: false, error: "Não foi possível concluir o convite." };
  return { success: true, data: { outcome, membershipId: result.membership_id, userId: result.user_id } };
}

export async function updateTeamMemberRoleAction(payload: unknown): Promise<ActionResult> {
  const parsed = updateTeamMemberRoleSchema.safeParse(payload);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Papel inválido." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_team_member_role", {
    p_membership_id: parsed.data.membershipId,
    p_role: parsed.data.role,
  });
  if (error) return { success: false, error: cleanDbError(error.message, "Não foi possível alterar o papel.") };

  revalidatePath("/", "layout");
  return { success: true };
}

export async function removeTeamMemberAction(payload: unknown): Promise<ActionResult> {
  const parsed = teamMembershipSchema.safeParse(payload);
  if (!parsed.success) return { success: false, error: "Membro inválido." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_team_member", { p_membership_id: parsed.data.membershipId });
  if (error) return { success: false, error: cleanDbError(error.message, "Não foi possível remover.") };

  revalidatePath("/", "layout");
  return { success: true };
}

/** Sends a new invitation link to a member who has not signed in yet. Owner only. */
export async function resendTeamInviteAction(payload: unknown): Promise<ActionResult> {
  const parsed = teamMembershipSchema.safeParse(payload);
  if (!parsed.success) return { success: false, error: "Membro inválido." };

  const supabase = await createClient();
  // RLS shows a membership only to people of the same organization...
  const { data: membership } = await supabase
    .from("memberships")
    .select("organization_id")
    .eq("id", parsed.data.membershipId)
    .maybeSingle();
  if (!membership) return { success: false, error: "Membro não encontrado." };

  // ...and only its owner may trigger an e-mail.
  const { data: isOwner } = await supabase.rpc("is_org_owner", { p_org_id: membership.organization_id });
  if (!isOwner) return { success: false, error: "Apenas o proprietário pode reenviar convites." };

  const { data: members, error } = await supabase.rpc("list_team_members", { p_org_id: membership.organization_id });
  if (error) return { success: false, error: cleanDbError(error.message, "Não foi possível carregar a equipe.") };
  const member = ((members ?? []) as TeamMember[]).find((m) => m.membership_id === parsed.data.membershipId);
  if (!member) return { success: false, error: "Membro não encontrado." };
  if (!member.pending) return { success: false, error: "Esta pessoa já aceitou o convite." };

  const invitation = await sendInvitation(member.email, member.full_name);
  if (!invitation.ok) return { success: false, error: invitation.error };
  return { success: true };
}
