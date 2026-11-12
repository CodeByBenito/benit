"use client";

import { TeamTab, type TeamActions } from "@/components/settings/team-tab";
import type { TeamMember } from "@/types/domain.types";

const wait = () => new Promise((r) => setTimeout(r, 300));

/** Preview-only: answers like the server would, without touching any account. */
const previewActions: TeamActions = {
  async invite({ email }) {
    await wait();
    if (email.startsWith("ja@")) return { success: false, error: "Esta pessoa já faz parte da equipe. Altere o papel dela na lista." };
    return { success: true, data: { outcome: "invited", membershipId: crypto.randomUUID(), userId: crypto.randomUUID() } };
  },
  async changeRole() {
    await wait();
    return { success: true };
  },
  async remove() {
    await wait();
    return { success: true };
  },
  async resend() {
    await wait();
    return { success: true };
  },
};

export function TeamTabPreview({ members, canEdit }: { members: TeamMember[]; canEdit: boolean }) {
  return (
    <TeamTab
      organizationId="00000000-0000-4000-8000-000000000001"
      organizationName="Smash Group"
      stores={[{ id: "00000000-0000-4000-8000-000000000002", name: "Smash da Vila" }]}
      members={members}
      canEdit={canEdit}
      actions={previewActions}
    />
  );
}
