import { beforeAll, describe, expect, it } from "vitest";
import { as, createTestDb, rpc, seed, type Db, type Fixture } from "./harness";

let db: Db;
let fx: Fixture;

const TABLES = ["stores", "products", "orders", "customers", "memberships", "profiles", "payments", "coupons", "delivery_zones", "store_business_hours", "stock_movements", "rate_limit_buckets", "store_payment_accounts"];

beforeAll(async () => {
  db = await createTestDb();
  fx = await seed(db);
}, 120_000);

describe("least privilege: anonymous visitors", () => {
  it("have no privilege on any table or sequence of the public schema", async () => {
    const { rows } = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM information_schema.role_table_grants WHERE table_schema = 'public' AND grantee = 'anon'`
    );
    expect(rows[0].n).toBe(0);
    for (const table of TABLES) {
      await expect(as(db, "anon", null, (tx) => tx.query(`SELECT 1 FROM public.${table} LIMIT 1`)), table).rejects.toThrow(/permission denied/);
    }
  });

  it("a table created later is closed to anonymous visitors by default", async () => {
    await db.exec(`CREATE TABLE public.future_feature (id INT PRIMARY KEY)`);
    await expect(as(db, "anon", null, (tx) => tx.query(`SELECT 1 FROM public.future_feature`))).rejects.toThrow(/permission denied/);
    await db.exec(`DROP TABLE public.future_feature`);
  });

  it("can call exactly the four public RPCs and nothing else", async () => {
    const { rows } = await db.query<{ proname: string }>(
      `SELECT DISTINCT p.proname FROM pg_proc p WHERE p.pronamespace = 'public'::regnamespace AND has_function_privilege('anon', p.oid, 'execute') ORDER BY 1`
    );
    expect(rows.map((r) => r.proname)).toEqual(["create_order_atomic", "get_public_menu_by_slug", "get_public_order_by_token", "quote_checkout"]);
  });

  it("the public menu and the checkout still work without table privileges", async () => {
    const menu = await as(db, "anon", null, (tx) => rpc<{ store: { slug: string }; products: unknown[] }>(tx, "get_public_menu_by_slug", { p_slug: fx.storeSlug }));
    expect(menu.store.slug).toBe(fx.storeSlug);
    expect(menu.products.length).toBeGreaterThan(0);

    const quote = await as(db, "anon", null, (tx) =>
      rpc<{ total_cents: number }>(tx, "quote_checkout", { p_slug: fx.storeSlug, p_items: [{ product_id: fx.sodaId, quantity: 4 }], p_fulfillment_type: "PICKUP" })
    );
    expect(quote.total_cents).toBe(3200);

    const order = await as(db, "anon", null, (tx) =>
      rpc<{ status: string; public_token: string }>(tx, "create_order_atomic", {
        p_store_id: fx.storeId,
        p_source: "DIGITAL_MENU",
        p_fulfillment_type: "PICKUP",
        p_customer_name: "Cliente Teste",
        p_customer_phone: "(11) 95555-1234",
        p_items: [{ product_id: fx.sodaId, quantity: 4 }],
        p_payment_method: "CASH",
      })
    );
    expect(order.status).toBe("NEW");
  });
});

describe("least privilege: signed-in members", () => {
  it("cannot TRUNCATE (which would ignore RLS)", async () => {
    for (const table of ["orders", "products", "customers"]) {
      await expect(as(db, "authenticated", fx.ownerId, (tx) => tx.exec(`TRUNCATE public.${table} CASCADE`)), table).rejects.toThrow(/permission denied/);
    }
  });

  it("still read and write their own store through RLS, triggers included", async () => {
    const updated = await as(db, "authenticated", fx.ownerId, async (tx) => {
      // Fires handle_updated_at and guard_store_money_settings.
      await tx.query(`UPDATE public.stores SET description = 'Nova descrição' WHERE id = $1`, [fx.storeId]);
      return (await tx.query<{ description: string }>(`SELECT description FROM public.stores WHERE id = $1`, [fx.storeId])).rows[0];
    });
    expect(updated.description).toBe("Nova descrição");

    // Fires handle_delivery_zone_normalize, which calls normalize_text as the manager.
    const zone = await as(db, "authenticated", fx.ownerId, async (tx) =>
      (await tx.query<{ neighborhoods: string[] }>(`INSERT INTO public.delivery_zones (store_id, name, neighborhoods, fee_cents) VALUES ($1, 'Zona Sul', ARRAY['Vila Mariana'], 900) RETURNING neighborhoods`, [fx.storeId])).rows[0]
    );
    expect(zone.neighborhoods).toEqual(["Vila Mariana"]);
  });
});

describe("policies after the cleanup", () => {
  it("members read hours, zones and coupons; only owner/manager write them", async () => {
    for (const table of ["store_business_hours", "delivery_zones", "coupons"]) {
      const { rows } = await db.query<{ cmd: string; n: number }>(
        `SELECT cmd, count(*)::int AS n FROM pg_policies WHERE schemaname = 'public' AND tablename = $1 GROUP BY cmd ORDER BY cmd`,
        [table]
      );
      // Exactly one policy per command: no overlapping permissive policies.
      expect(rows, table).toEqual([
        { cmd: "DELETE", n: 1 },
        { cmd: "INSERT", n: 1 },
        { cmd: "SELECT", n: 1 },
        { cmd: "UPDATE", n: 1 },
      ]);
    }

    const kitchenReads = await as(db, "authenticated", fx.kitchenId, async (tx) => (await tx.query(`SELECT id FROM public.delivery_zones WHERE store_id = $1`, [fx.storeId])).rows);
    expect(kitchenReads.length).toBeGreaterThan(0);

    await expect(
      as(db, "authenticated", fx.kitchenId, (tx) => tx.query(`INSERT INTO public.delivery_zones (store_id, name, neighborhoods, fee_cents) VALUES ($1, 'Invasora', ARRAY['X'], 0)`, [fx.storeId]))
    ).rejects.toThrow(/row-level security/);
    const kitchenUpdate = await as(db, "authenticated", fx.kitchenId, async (tx) => (await tx.query(`UPDATE public.coupons SET value = 99 WHERE store_id = $1 RETURNING id`, [fx.storeId])).rows);
    expect(kitchenUpdate).toHaveLength(0);
    const kitchenDelete = await as(db, "authenticated", fx.kitchenId, async (tx) => (await tx.query(`DELETE FROM public.delivery_zones WHERE store_id = $1 RETURNING id`, [fx.storeId])).rows);
    expect(kitchenDelete).toHaveLength(0);

    const ownerUpdate = await as(db, "authenticated", fx.ownerId, async (tx) => (await tx.query(`UPDATE public.coupons SET value = 15 WHERE store_id = $1 RETURNING id`, [fx.storeId])).rows);
    expect(ownerUpdate).toHaveLength(1);
  });

  it("another tenant sees nothing of this store's hours, zones, coupons or people", async () => {
    const rows = await as(db, "authenticated", fx.outsiderId, async (tx) => ({
      zones: (await tx.query(`SELECT id FROM public.delivery_zones WHERE store_id = $1`, [fx.storeId])).rows.length,
      coupons: (await tx.query(`SELECT id FROM public.coupons WHERE store_id = $1`, [fx.storeId])).rows.length,
      memberships: (await tx.query(`SELECT id FROM public.memberships WHERE organization_id = $1`, [fx.orgId])).rows.length,
      organizations: (await tx.query(`SELECT id FROM public.organizations WHERE id = $1`, [fx.orgId])).rows.length,
      profiles: (await tx.query(`SELECT id FROM public.profiles`)).rows.length,
    }));
    expect(rows).toEqual({ zones: 0, coupons: 0, memberships: 0, organizations: 0, profiles: 1 });
  });

  it("the rewritten policies keep their rules: own profile only, and no self-promotion to platform admin", async () => {
    const own = await as(db, "authenticated", fx.kitchenId, async (tx) => (await tx.query<{ id: string }>(`SELECT id FROM public.profiles`)).rows);
    expect(own.map((r) => r.id)).toEqual([fx.kitchenId]);
    // Only name and phone are writable; the admin flag and the e-mail are not.
    for (const column of ["is_platform_admin = true", "email = 'outro@a.com'"]) {
      await expect(as(db, "authenticated", fx.kitchenId, (tx) => tx.query(`UPDATE public.profiles SET ${column} WHERE id = $1`, [fx.kitchenId])), column).rejects.toThrow(/permission denied/);
    }
    // Updating the own profile used to fail with "infinite recursion detected in policy".
    const renamed = await as(db, "authenticated", fx.kitchenId, async (tx) => (await tx.query(`UPDATE public.profiles SET full_name = 'Cozinha A', phone = '11977770000' WHERE id = $1 RETURNING id`, [fx.kitchenId])).rows);
    expect(renamed).toHaveLength(1);
    // ...and never someone else's.
    const other = await as(db, "authenticated", fx.kitchenId, async (tx) => (await tx.query(`UPDATE public.profiles SET full_name = 'Invadido' WHERE id = $1 RETURNING id`, [fx.ownerId])).rows);
    expect(other).toHaveLength(0);
    await expect(as(db, "authenticated", fx.kitchenId, (tx) => tx.query(`DELETE FROM public.profiles WHERE id = $1`, [fx.kitchenId]))).rejects.toThrow(/permission denied/);
    // Nobody can insert a membership for themself in someone else's organization.
    await expect(
      as(db, "authenticated", fx.outsiderId, (tx) => tx.query(`INSERT INTO public.memberships (organization_id, user_id, role) VALUES ($1, $2, 'OWNER')`, [fx.orgId, fx.outsiderId]))
    ).rejects.toThrow(/row-level security/);
  });

  it("no policy calls auth.uid() per row any more", async () => {
    const { rows } = await db.query<{ policyname: string }>(
      `SELECT policyname FROM pg_policies WHERE schemaname = 'public'
       AND (coalesce(qual, '') ~ 'auth\\.uid\\(\\)' OR coalesce(with_check, '') ~ 'auth\\.uid\\(\\)')
       AND NOT (coalesce(qual, '') || coalesce(with_check, '')) ~* 'select auth\\.uid\\(\\)'`
    );
    expect(rows).toEqual([]);
  });
});
