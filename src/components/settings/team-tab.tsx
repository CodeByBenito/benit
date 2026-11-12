"use client";

import { useState, useTransition } from "react";
import { Loader2, MailPlus, RotateCw, Trash2, UserPlus, Users } from "lucide-react";
import type { ActionResult } from "@/features/auth/actions";
import {
  inviteTeamMemberAction,
  removeTeamMemberAction,
  resendTeamInviteAction,
  updateTeamMemberRoleAction,
  type InviteOutcome,
} from "@/features/team/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { INVITABLE_ROLES, ROLE_DESCRIPTION, ROLE_LABEL, type InvitableRole } from "@/lib/permissions/roles";
import { cn } from "@/lib/utils";
import type { TeamMember } from "@/types/domain.types";
import { FormMessage, SettingsSection } from "./shared";

export interface TeamActions {
  invite: (payload: { organizationId: string; email: string; fullName: string; role: InvitableRole; storeId: string | null }) => Promise<ActionResult<{ outcome: InviteOutcome; membershipId: string; userId: string }>>;
  changeRole: (payload: { membershipId: string; role: InvitableRole }) => Promise<ActionResult>;
  remove: (payload: { membershipId: string }) => Promise<ActionResult>;
  resend: (payload: { membershipId: string }) => Promise<ActionResult>;
}

const serverActions: TeamActions = {
  invite: inviteTeamMemberAction,
  changeRole: updateTeamMemberRoleAction,
  remove: removeTeamMemberAction,
  resend: resendTeamInviteAction,
};

const ALL_STORES = "all";

/**
 * "Equipe" tab. The owner invites by e-mail, changes roles and removes people;
 * managers see the list read-only. Rules live in the database RPCs (0009).
 */
export function TeamTab({
  organizationId,
  organizationName,
  stores,
  members: initial,
  canEdit,
  actions = serverActions,
}: {
  organizationId: string;
  organizationName: string;
  stores: { id: string; name: string }[];
  members: TeamMember[];
  /** Only the organization owner manages the team. */
  canEdit: boolean;
  actions?: TeamActions;
}) {
  const [members, setMembers] = useState(initial);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [removing, setRemoving] = useState<TeamMember | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const multiStore = stores.length > 1;

  function changeRole(member: TeamMember, role: InvitableRole) {
    if (role === member.role) return;
    const previous = member.role;
    setMembers((prev) => prev.map((m) => (m.membership_id === member.membership_id ? { ...m, role } : m)));
    setBusyId(member.membership_id);
    start(async () => {
      const res = await actions.changeRole({ membershipId: member.membership_id, role });
      setBusyId(null);
      if (!res.success) {
        setMembers((prev) => prev.map((m) => (m.membership_id === member.membership_id ? { ...m, role: previous } : m)));
        toast.error(res.error ?? "Não foi possível alterar o papel.");
      } else toast.success(`${member.full_name || member.email} agora é ${ROLE_LABEL[role]}.`);
    });
  }

  function confirmRemove() {
    if (!removing) return;
    const member = removing;
    setBusyId(member.membership_id);
    start(async () => {
      const res = await actions.remove({ membershipId: member.membership_id });
      setBusyId(null);
      if (!res.success) {
        toast.error(res.error ?? "Não foi possível remover.");
        return;
      }
      setMembers((prev) => prev.filter((m) => m.membership_id !== member.membership_id));
      setRemoving(null);
      toast.success(`${member.full_name || member.email} saiu da equipe.`);
    });
  }

  function resend(member: TeamMember) {
    setBusyId(member.membership_id);
    start(async () => {
      const res = await actions.resend({ membershipId: member.membership_id });
      setBusyId(null);
      if (!res.success) toast.error(res.error ?? "Não foi possível reenviar.");
      else toast.success(`Novo convite enviado para ${member.email}.`);
    });
  }

  return (
    <div>
      <SettingsSection
        title="Pessoas"
        description={
          canEdit
            ? `Quem trabalha em ${organizationName} e o que cada pessoa vê no painel.`
            : "Só o proprietário convida, muda papéis e remove pessoas. Você pode consultar a lista."
        }
        aside={
          canEdit ? (
            <Button className="mt-5" onClick={() => setInviteOpen(true)}>
              <UserPlus className="h-4 w-4" /> Convidar pessoa
            </Button>
          ) : null
        }
      >
        {members.length === 0 ? (
          <EmptyState icon={<Users className="h-5 w-5" />} title="Ninguém na equipe ainda" description="Convide quem atende, quem cozinha e quem gerencia." />
        ) : (
          <ul className="divide-y divide-border rounded-2xl border border-border bg-surface" aria-label="Membros da equipe">
            {members.map((m) => {
              const name = m.full_name || m.email.split("@")[0];
              const busy = busyId === m.membership_id && pending;
              const editable = canEdit && m.role !== "OWNER";
              return (
                <li key={m.membership_id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-5">
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      aria-hidden
                      className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-display text-sm font-extrabold",
                        m.role === "OWNER" ? "bg-brand text-white" : "bg-surface-elevated text-foreground"
                      )}
                    >
                      {name.charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-medium">
                        <span className="truncate">{name}</span>
                        {m.is_self ? <span className="rounded-full bg-surface-card px-2 py-0.5 text-[11px] font-normal text-foreground-muted">Você</span> : null}
                        {m.pending ? <span className="rounded-full border border-warning/30 bg-warning/10 px-2 py-0.5 text-[11px] font-normal text-warning">Convite pendente</span> : null}
                      </p>
                      <p className="truncate text-xs text-foreground-muted">
                        {m.email}
                        {multiStore || m.store_id ? ` · ${m.store_name ?? "Todas as lojas"}` : ""}
                      </p>
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2 pl-[52px] sm:pl-0">
                    {editable ? (
                      <Select value={m.role} onValueChange={(v) => changeRole(m, v as InvitableRole)} disabled={busy}>
                        <SelectTrigger className="h-9 w-[140px]" aria-label={`Papel de ${name}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {INVITABLE_ROLES.map((r) => (
                            <SelectItem key={r} value={r}>
                              {ROLE_LABEL[r]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="rounded-full border border-border px-3 py-1 text-xs text-foreground-muted">{ROLE_LABEL[m.role]}</span>
                    )}
                    {editable && m.pending ? (
                      <Button variant="ghost" size="icon" aria-label={`Reenviar convite para ${name}`} title="Reenviar convite" onClick={() => resend(m)} disabled={busy}>
                        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCw className="h-4 w-4" />}
                      </Button>
                    ) : null}
                    {editable ? (
                      <Button variant="ghost" size="icon" aria-label={`Remover ${name}`} onClick={() => setRemoving(m)} disabled={busy}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </SettingsSection>

      <SettingsSection title="O que cada papel vê" description="As permissões valem na tela e também no banco de dados.">
        <dl className="grid gap-3 sm:grid-cols-2">
          {(["OWNER", ...INVITABLE_ROLES] as const).map((r) => (
            <div key={r} className="rounded-2xl border border-border bg-surface p-4">
              <dt className="text-sm font-medium">{ROLE_LABEL[r]}</dt>
              <dd className="mt-1 text-xs leading-relaxed text-foreground-muted">{ROLE_DESCRIPTION[r]}</dd>
            </div>
          ))}
        </dl>
      </SettingsSection>

      {inviteOpen ? (
        <InviteDialog
          organizationId={organizationId}
          stores={stores}
          invite={actions.invite}
          onClose={() => setInviteOpen(false)}
          onInvited={(member) => {
            setMembers((prev) => [...prev, member]);
            setInviteOpen(false);
          }}
        />
      ) : null}

      <Dialog open={Boolean(removing)} onOpenChange={(open) => (!open ? setRemoving(null) : undefined)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Remover {removing?.full_name || removing?.email}?</DialogTitle>
            <DialogDescription>
              A pessoa perde o acesso ao painel na hora. Os pedidos e registros feitos por ela continuam no histórico. Você pode convidar de novo depois.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRemoving(null)} disabled={pending}>
              Cancelar
            </Button>
            <Button variant="destructive" onClick={confirmRemove} disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Remover da equipe
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InviteDialog({
  organizationId,
  stores,
  invite,
  onClose,
  onInvited,
}: {
  organizationId: string;
  stores: { id: string; name: string }[];
  invite: TeamActions["invite"];
  onClose: () => void;
  onInvited: (member: TeamMember) => void;
}) {
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<InvitableRole>("ATTENDANT");
  const [scope, setScope] = useState<string>(stores.length === 1 ? stores[0].id : ALL_STORES);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const storeId = scope === ALL_STORES ? null : scope;
    const cleanEmail = email.trim().toLowerCase();
    start(async () => {
      const res = await invite({ organizationId, email: cleanEmail, fullName: fullName.trim(), role, storeId });
      if (!res.success || !res.data) {
        setError(res.error ?? "Não foi possível convidar.");
        return;
      }
      const invited = res.data.outcome !== "added";
      toast.success(invited ? `Convite enviado para ${cleanEmail}.` : `${cleanEmail} já tinha conta e entrou na equipe.`);
      onInvited({
        membership_id: res.data.membershipId,
        user_id: res.data.userId,
        full_name: fullName.trim(),
        email: cleanEmail,
        role,
        store_id: storeId,
        store_name: stores.find((s) => s.id === storeId)?.name ?? null,
        pending: invited,
        is_self: false,
        created_at: new Date().toISOString(),
      });
    });
  }

  return (
    <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Convidar pessoa</DialogTitle>
          <DialogDescription>Ela recebe um e-mail com um link para criar a senha e já entra no painel com o papel escolhido.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="invite-email">E-mail</Label>
            <Input id="invite-email" type="email" required autoComplete="off" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="pessoa@exemplo.com.br" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="invite-name">Nome (opcional)</Label>
            <Input id="invite-name" value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={80} autoComplete="off" />
          </div>
          <fieldset className="space-y-2">
            <legend className="text-xs font-medium tracking-wide text-foreground-muted">Papel</legend>
            <div className="grid gap-2" role="radiogroup" aria-label="Papel">
              {INVITABLE_ROLES.map((r) => (
                <label
                  key={r}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors duration-fast",
                    role === r ? "border-brand/60 bg-brand/10" : "border-border hover:border-border-strong"
                  )}
                >
                  <input type="radio" name="role" value={r} checked={role === r} onChange={() => setRole(r)} className="mt-1 h-4 w-4 accent-brand" />
                  <span>
                    <span className="block text-sm font-medium">{ROLE_LABEL[r]}</span>
                    <span className="block text-xs text-foreground-muted">{ROLE_DESCRIPTION[r]}</span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
          {stores.length > 1 ? (
            <div className="space-y-1.5">
              <Label htmlFor="invite-scope">Onde trabalha</Label>
              <Select value={scope} onValueChange={setScope}>
                <SelectTrigger id="invite-scope">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_STORES}>Todas as lojas</SelectItem>
                  {stores.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <FormMessage error={error} />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={pending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <MailPlus className="h-4 w-4" />} Enviar convite
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
