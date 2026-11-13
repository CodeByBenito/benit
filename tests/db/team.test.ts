import { beforeAll, describe, expect, it } from "vitest";
import { as, createTestDb, rpc, seed, type Db, type Fixture } from "./harness";

let db: Db;
let fx: Fixture;

type Member = {
  membership_id: string;
  user_id: string;
  full_name: string;
  email: string;
  role: string;
  store_id: string | null;
  store_name: string | null;
  pending: boolean;
  is_self: boolean;
};

/** Runs an RPC as a signed-in user and COMMITS (the `as` helper always rolls back). */
async function commit<T>(userId: string, fn: string, args: Record<string, unknown>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [userId]);
    await tx.exec(`SET LOCAL ROLE authenticated`);
    return rpc<T>(tx, fn, args);
  });
}

async function newUser(email: string, opts: { invited?: boolean; signedIn?: boolean } = {}): Promise<string> {
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO auth.users (email, invited_at, last_sign_in_at) VALUES ($1, $2, $3) RETURNING id`,
    [email, opts.invited ? new Date().toISOString() : null, opts.signedIn ? new Date().toISOString() : null]
  );
  return rows[0].id;
}

const membershipOf = async (userId: string, orgId: string) =>
  (await db.query<{ id: string; role: string; store_id: string | null }>(`SELECT id, role, store_id FROM public.memberships WHERE user_id = $1 AND organization_id = $2`, [userId, orgId])).rows;

beforeAll(async () => {
  db = await createTestDb();
  fx = await seed(db);
}, 120_000);

describe("team: listing", () => {
  it("shows the owner every member with name, e-mail, role and scope", async () => {
    const members = await as(db, "authenticated", fx.ownerId, (tx) => rpc<Member[]>(tx, "list_team_members", { p_org_id: fx.orgId }));
    expect(members.map((m) => [m.email, m.role, m.store_name, m.is_self])).toEqual([
      ["dono@a.com", "OWNER", null, true],
      ["cozinha@a.com", "KITCHEN", "Loja loja-a", false],
    ]);
    expect(members[0].full_name).toBe("Dona A");
  });

  it("is closed to kitchen staff, other tenants and anonymous callers", async () => {
    await expect(as(db, "authenticated", fx.kitchenId, (tx) => rpc(tx, "list_team_members", { p_org_id: fx.orgId }))).rejects.toThrow(/FORBIDDEN/);
    await expect(as(db, "authenticated", fx.outsiderId, (tx) => rpc(tx, "list_team_members", { p_org_id: fx.orgId }))).rejects.toThrow(/FORBIDDEN/);
    await expect(as(db, "anon", null, (tx) => rpc(tx, "list_team_members", { p_org_id: fx.orgId }))).rejects.toThrow(/permission denied/);
  });

  it("kitchen staff still cannot read teammates' profiles through the table", async () => {
    const rows = await as(db, "authenticated", fx.kitchenId, async (tx) => (await tx.query(`SELECT id FROM public.profiles`)).rows);
    expect(rows).toHaveLength(1);
  });
});

describe("team: inviting", () => {
  it("answers USER_NOT_FOUND for an e-mail without an account, creating nothing", async () => {
    const res = await commit<{ status: string }>(fx.ownerId, "add_team_member", { p_org_id: fx.orgId, p_email: "nova@pessoa.com", p_role: "ATTENDANT", p_store_id: fx.storeId });
    expect(res.status).toBe("USER_NOT_FOUND");
  });

  it("links an invited account to one store and reports it as pending", async () => {
    const invited = await newUser("Atendente@A.com", { invited: true });
    const res = await commit<{ status: string; pending: boolean; user_id: string }>(fx.ownerId, "add_team_member", {
      p_org_id: fx.orgId,
      p_email: "  atendente@a.com ",
      p_role: "ATTENDANT",
      p_store_id: fx.storeId,
    });
    expect(res).toMatchObject({ status: "ADDED", pending: true, user_id: invited });
    expect(await membershipOf(invited, fx.orgId)).toMatchObject([{ role: "ATTENDANT", store_id: fx.storeId }]);

    const members = await as(db, "authenticated", fx.ownerId, (tx) => rpc<Member[]>(tx, "list_team_members", { p_org_id: fx.orgId }));
    expect(members.find((m) => m.user_id === invited)).toMatchObject({ pending: true, role: "ATTENDANT", store_name: "Loja loja-a" });

    // Once the person signs in, the invitation is no longer pending.
    await db.query(`UPDATE auth.users SET last_sign_in_at = now() WHERE id = $1`, [invited]);
    const after = await as(db, "authenticated", fx.ownerId, (tx) => rpc<Member[]>(tx, "list_team_members", { p_org_id: fx.orgId }));
    expect(after.find((m) => m.user_id === invited)?.pending).toBe(false);

    // The new attendant really gets access to the store, and only to it.
    const access = await as(db, "authenticated", invited, async (tx) => (await tx.query<{ a: boolean; b: boolean; c: boolean }>(
      `SELECT public.has_store_access($1) AS a, public.can_manage_store($1) AS b, public.has_store_access($2) AS c`, [fx.storeId, fx.otherStoreId]
    )).rows[0]);
    expect(access).toEqual({ a: true, b: false, c: false });
  });

  it("can add an organization-wide manager", async () => {
    const manager = await newUser("gerente@a.com", { signedIn: true });
    const res = await commit<{ status: string; pending: boolean }>(fx.ownerId, "add_team_member", { p_org_id: fx.orgId, p_email: "gerente@a.com", p_role: "MANAGER", p_store_id: null });
    expect(res).toMatchObject({ status: "ADDED", pending: false });
    const can = await as(db, "authenticated", manager, async (tx) => (await tx.query<{ ok: boolean }>(`SELECT public.can_manage_store($1) AS ok`, [fx.storeId])).rows[0].ok);
    expect(can).toBe(true);
  });

  it("refuses duplicates, the OWNER role, foreign stores and accounts of another business", async () => {
    const add = (args: Record<string, unknown>) => commit(fx.ownerId, "add_team_member", { p_org_id: fx.orgId, p_role: "KITCHEN", p_store_id: fx.storeId, ...args });
    await expect(add({ p_email: "cozinha@a.com" })).rejects.toThrow(/ALREADY_MEMBER/);
    await expect(add({ p_email: "gerente@a.com" })).rejects.toThrow(/ALREADY_MEMBER/); // already org-wide
    await expect(add({ p_email: "cozinha@a.com", p_store_id: null })).rejects.toThrow(/ALREADY_MEMBER/); // store-scoped -> org-wide
    await expect(add({ p_email: "dono@a.com" })).rejects.toThrow(/ALREADY_MEMBER/);
    await expect(add({ p_email: "x@a.com", p_role: "OWNER" })).rejects.toThrow(/INVALID_ROLE/);
    await expect(add({ p_email: "x@a.com", p_store_id: fx.otherStoreId })).rejects.toThrow(/INVALID_STORE/);
    await expect(add({ p_email: "sem-arroba" })).rejects.toThrow(/INVALID_EMAIL/);
    await expect(add({ p_email: "dono@b.com" })).rejects.toThrow(/OTHER_ORGANIZATION/);
  });

  it("only the owner can invite: not a manager, kitchen staff or another tenant", async () => {
    const [{ id: managerId }] = (await db.query<{ id: string }>(`SELECT id FROM auth.users WHERE email = 'gerente@a.com'`)).rows;
    await newUser("alvo@a.com");
    for (const caller of [managerId, fx.kitchenId, fx.outsiderId]) {
      await expect(commit(caller, "add_team_member", { p_org_id: fx.orgId, p_email: "alvo@a.com", p_role: "KITCHEN", p_store_id: fx.storeId })).rejects.toThrow(/FORBIDDEN/);
    }
    await expect(as(db, "anon", null, (tx) => rpc(tx, "add_team_member", { p_org_id: fx.orgId, p_email: "alvo@a.com", p_role: "KITCHEN", p_store_id: null }))).rejects.toThrow(/permission denied/);
  });
});

describe("team: managers see their team but cannot change it", () => {
  it("a manager can list, but not change roles or remove", async () => {
    const [{ id: managerId }] = (await db.query<{ id: string }>(`SELECT id FROM auth.users WHERE email = 'gerente@a.com'`)).rows;
    const members = await as(db, "authenticated", managerId, (tx) => rpc<Member[]>(tx, "list_team_members", { p_org_id: fx.orgId }));
    expect(members.length).toBeGreaterThanOrEqual(3);
    const [kitchen] = await membershipOf(fx.kitchenId, fx.orgId);
    await expect(commit(managerId, "update_team_member_role", { p_membership_id: kitchen.id, p_role: "MANAGER" })).rejects.toThrow(/FORBIDDEN/);
    await expect(commit(managerId, "remove_team_member", { p_membership_id: kitchen.id })).rejects.toThrow(/FORBIDDEN/);
  });
});

describe("team: changing roles", () => {
  it("the owner promotes kitchen staff to attendant", async () => {
    const [kitchen] = await membershipOf(fx.kitchenId, fx.orgId);
    await commit(fx.ownerId, "update_team_member_role", { p_membership_id: kitchen.id, p_role: "ATTENDANT" });
    expect((await membershipOf(fx.kitchenId, fx.orgId))[0].role).toBe("ATTENDANT");
    await commit(fx.ownerId, "update_team_member_role", { p_membership_id: kitchen.id, p_role: "KITCHEN" });
  });

  it("nobody becomes OWNER this way and the owner's role is locked", async () => {
    const [kitchen] = await membershipOf(fx.kitchenId, fx.orgId);
    const [owner] = await membershipOf(fx.ownerId, fx.orgId);
    await expect(commit(fx.ownerId, "update_team_member_role", { p_membership_id: kitchen.id, p_role: "OWNER" })).rejects.toThrow(/INVALID_ROLE/);
    await expect(commit(fx.ownerId, "update_team_member_role", { p_membership_id: owner.id, p_role: "MANAGER" })).rejects.toThrow(/OWNER_ROLE_LOCKED/);
  });

  it("an owner of another business cannot touch this team", async () => {
    const [kitchen] = await membershipOf(fx.kitchenId, fx.orgId);
    await expect(commit(fx.outsiderId, "update_team_member_role", { p_membership_id: kitchen.id, p_role: "MANAGER" })).rejects.toThrow(/FORBIDDEN/);
    await expect(commit(fx.outsiderId, "remove_team_member", { p_membership_id: kitchen.id })).rejects.toThrow(/FORBIDDEN/);
    // Unknown ids answer the same way (no probing).
    await expect(commit(fx.outsiderId, "remove_team_member", { p_membership_id: "00000000-0000-4000-8000-000000000000" })).rejects.toThrow(/FORBIDDEN/);
  });

  it("direct table writes stay closed: no UPDATE or DELETE policy on memberships", async () => {
    const [kitchen] = await membershipOf(fx.kitchenId, fx.orgId);
    const updated = await as(db, "authenticated", fx.kitchenId, async (tx) => (await tx.query(`UPDATE public.memberships SET role = 'OWNER' WHERE id = $1 RETURNING id`, [kitchen.id])).rows);
    expect(updated).toHaveLength(0);
    const deleted = await as(db, "authenticated", fx.ownerId, async (tx) => (await tx.query(`DELETE FROM public.memberships WHERE id = $1 RETURNING id`, [kitchen.id])).rows);
    expect(deleted).toHaveLength(0);
  });
});

describe("team: removing", () => {
  it("the last owner cannot remove themself", async () => {
    const [owner] = await membershipOf(fx.ownerId, fx.orgId);
    await expect(commit(fx.ownerId, "remove_team_member", { p_membership_id: owner.id })).rejects.toThrow(/LAST_OWNER/);
    expect(await membershipOf(fx.ownerId, fx.orgId)).toHaveLength(1);
  });

  it("with a second owner, one of them may leave", async () => {
    const second = await newUser("socio@a.com", { signedIn: true });
    await db.query(`INSERT INTO public.memberships (organization_id, store_id, user_id, role) VALUES ($1, NULL, $2, 'OWNER')`, [fx.orgId, second]);
    const [secondMembership] = await membershipOf(second, fx.orgId);
    const res = await commit<{ removed: boolean }>(second, "remove_team_member", { p_membership_id: secondMembership.id });
    expect(res.removed).toBe(true);
    // Back to a single owner: the guard applies again.
    const [owner] = await membershipOf(fx.ownerId, fx.orgId);
    await expect(commit(fx.ownerId, "remove_team_member", { p_membership_id: owner.id })).rejects.toThrow(/LAST_OWNER/);
  });

  it("removing a member cuts their access immediately", async () => {
    const [kitchen] = await membershipOf(fx.kitchenId, fx.orgId);
    await commit(fx.ownerId, "remove_team_member", { p_membership_id: kitchen.id });
    expect(await membershipOf(fx.kitchenId, fx.orgId)).toHaveLength(0);
    const access = await as(db, "authenticated", fx.kitchenId, async (tx) => (await tx.query<{ ok: boolean }>(`SELECT public.has_store_access($1) AS ok`, [fx.storeId])).rows[0].ok);
    expect(access).toBe(false);
    const orders = await as(db, "authenticated", fx.kitchenId, async (tx) => (await tx.query(`SELECT id FROM public.stores`)).rows);
    expect(orders).toHaveLength(0);
  });
});
