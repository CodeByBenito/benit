import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";

/**
 * Real Postgres (PGlite/WASM) with a minimal Supabase shim, so every migration
 * runs exactly as written and RLS/role behaviour is exercised for real:
 *  - roles anon / authenticated / service_role with Supabase default grants
 *  - auth.users + auth.uid() reading request.jwt.claim.sub (like PostgREST)
 *  - storage.buckets/objects, realtime.send (captured in realtime.sent)
 *  - extensions.unaccent (PGlite ships no contrib wrapper for it)
 */
const SHIM = `
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;

CREATE SCHEMA auth;
CREATE SCHEMA extensions;
CREATE SCHEMA storage;
CREATE SCHEMA realtime;

CREATE TABLE auth.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT,
  raw_user_meta_data JSONB DEFAULT '{}'::jsonb,
  invited_at TIMESTAMPTZ,
  last_sign_in_at TIMESTAMPTZ
);

CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$
  SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

CREATE FUNCTION extensions.unaccent(TEXT) RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT translate($1,
    'áàâãäåÁÀÂÃÄÅéèêëÉÈÊËíìîïÍÌÎÏóòôõöÓÒÔÕÖúùûüÚÙÛÜçÇñÑ',
    'aaaaaaAAAAAAeeeeEEEEiiiiIIIIoooooOOOOOuuuuUUUUcCnN')
$$;

CREATE TABLE storage.buckets (id TEXT PRIMARY KEY, name TEXT, public BOOLEAN);
CREATE TABLE storage.objects (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id TEXT, name TEXT);
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

CREATE TABLE realtime.sent (payload JSONB, event TEXT, topic TEXT, private BOOLEAN, at TIMESTAMPTZ DEFAULT now());
CREATE FUNCTION realtime.send(payload JSONB, event TEXT, topic TEXT, private BOOLEAN DEFAULT true) RETURNS VOID
LANGUAGE sql AS $$ INSERT INTO realtime.sent(payload, event, topic, private) VALUES ($1, $2, $3, $4) $$;

GRANT USAGE ON SCHEMA public, auth, extensions, storage TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth, extensions TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;
`;

const MIGRATIONS_DIR = path.resolve(__dirname, "../../supabase/migrations");

export type Db = PGlite;

export async function createTestDb(): Promise<Db> {
  const db = new PGlite();
  await db.exec(SHIM);
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8")
      .replace(/CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;/g, "-- unaccent provided by test shim")
      // gen_random_uuid() is core since PG13; PGlite ships no pgcrypto wrapper.
      .replace(/CREATE EXTENSION IF NOT EXISTS "pgcrypto";/g, "-- pgcrypto not needed");
    try {
      await db.exec(sql);
    } catch (error) {
      throw new Error(`Migration ${file} failed: ${(error as Error).message}`);
    }
  }
  return db;
}

type Role = "anon" | "authenticated" | "service_role" | "postgres";

/** Runs `fn` as an API role inside a transaction that is always rolled back. */
export async function as<T>(
  db: Db,
  role: Role,
  userId: string | null,
  fn: (tx: Pick<Db, "query" | "exec">) => Promise<T>
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [userId ?? ""]);
    if (role !== "postgres") await tx.exec(`SET LOCAL ROLE ${role}`);
    return fn(tx);
  });
}

export async function rpc<T = Record<string, unknown>>(
  tx: Pick<Db, "query">,
  fn: string,
  args: Record<string, unknown>
): Promise<T> {
  const keys = Object.keys(args);
  const params = keys.map((k, i) => `${k} => $${i + 1}`).join(", ");
  const values = keys.map((k) => {
    const v = args[k];
    return v !== null && typeof v === "object" ? JSON.stringify(v) : v;
  });
  const res = await tx.query<{ r: T }>(`SELECT public.${fn}(${params}) AS r`, values);
  return res.rows[0].r;
}

export interface Fixture {
  ownerId: string;
  kitchenId: string;
  outsiderId: string;
  orgId: string;
  storeId: string;
  storeSlug: string;
  otherStoreId: string;
  burgerId: string;
  friesId: string;
  sodaId: string;
  cheddarOptionId: string;
  addonsGroupId: string;
  zoneCentroId: string;
}

/** Seeds two tenants. Store A has products, a zone, a coupon; store B is a foreign tenant. */
export async function seed(db: Db): Promise<Fixture> {
  const q = async <T = Record<string, string>>(sql: string, params: unknown[] = []) =>
    (await db.query<T>(sql, params)).rows;

  const [owner] = await q<{ id: string }>(`INSERT INTO auth.users (email, raw_user_meta_data) VALUES ('dono@a.com', '{"full_name":"Dona A"}') RETURNING id`);
  const [kitchen] = await q<{ id: string }>(`INSERT INTO auth.users (email) VALUES ('cozinha@a.com') RETURNING id`);
  const [outsider] = await q<{ id: string }>(`INSERT INTO auth.users (email) VALUES ('dono@b.com') RETURNING id`);

  // `as` rolls back; onboarding must persist, so run it committed:
  const persistOnboard = async (userId: string, slug: string) =>
    db.transaction(async (tx) => {
      await tx.query(`SELECT set_config('request.jwt.claim.sub', $1, true)`, [userId]);
      await tx.exec(`SET LOCAL ROLE authenticated`);
      return rpc<{ organization_id: string; store_id: string }>(tx, "onboard_organization_and_store", {
        p_org_name: `Org ${slug}`,
        p_org_slug: `org-${slug}`,
        p_store_name: `Loja ${slug}`,
        p_store_slug: slug,
        p_whatsapp: "11999990000",
      });
    });

  const a = await persistOnboard(owner.id, "loja-a");
  const b = await persistOnboard(outsider.id, "loja-b");

  await q(`INSERT INTO public.memberships (organization_id, store_id, user_id, role) VALUES ($1, $2, $3, 'KITCHEN')`, [
    a.organization_id,
    a.store_id,
    kitchen.id,
  ]);

  const [cat] = await q<{ id: string }>(`INSERT INTO public.categories (store_id, name) VALUES ($1, 'Burgers') RETURNING id`, [a.store_id]);
  const [burger] = await q<{ id: string }>(
    `INSERT INTO public.products (store_id, category_id, name, price_cents, track_stock, stock_quantity) VALUES ($1, $2, 'Smash', 3000, true, 5) RETURNING id`,
    [a.store_id, cat.id]
  );
  const [fries] = await q<{ id: string }>(
    `INSERT INTO public.products (store_id, category_id, name, price_cents, track_stock, stock_quantity) VALUES ($1, $2, 'Batata', 1500, true, 1) RETURNING id`,
    [a.store_id, cat.id]
  );
  const [soda] = await q<{ id: string }>(
    `INSERT INTO public.products (store_id, category_id, name, price_cents, track_stock) VALUES ($1, $2, 'Refri', 800, false) RETURNING id`,
    [a.store_id, cat.id]
  );
  const [group] = await q<{ id: string }>(
    `INSERT INTO public.product_option_groups (store_id, product_id, name, min_select, max_select) VALUES ($1, $2, 'Adicionais', 0, 2) RETURNING id`,
    [a.store_id, burger.id]
  );
  const [cheddar] = await q<{ id: string }>(
    `INSERT INTO public.product_options (store_id, group_id, name, price_cents) VALUES ($1, $2, 'Cheddar', 500) RETURNING id`,
    [a.store_id, group.id]
  );
  const [zone] = await q<{ id: string }>(
    `INSERT INTO public.delivery_zones (store_id, name, neighborhoods, fee_cents, min_order_cents, eta_minutes)
     VALUES ($1, 'Centro', ARRAY['Centro', 'São João'], 700, 2500, 35) RETURNING id`,
    [a.store_id]
  );
  await q(
    `INSERT INTO public.coupons (store_id, code, kind, value, max_discount_cents, usage_limit, per_customer_limit)
     VALUES ($1, 'BEMVINDO10', 'PERCENT', 10, 1000, 2, 1)`,
    [a.store_id]
  );
  await q(`UPDATE public.stores SET offline_methods = ARRAY['CASH','CARD_ON_DELIVERY','PIX_MANUAL']::public.payment_method[], pix_key = 'pix@loja-a.com' WHERE id = $1`, [a.store_id]);

  return {
    ownerId: owner.id,
    kitchenId: kitchen.id,
    outsiderId: outsider.id,
    orgId: a.organization_id,
    storeId: a.store_id,
    storeSlug: "loja-a",
    otherStoreId: b.store_id,
    burgerId: burger.id,
    friesId: fries.id,
    sodaId: soda.id,
    cheddarOptionId: cheddar.id,
    addonsGroupId: group.id,
    zoneCentroId: zone.id,
  };
}

/** Connects a fake Mercado Pago account so online payments are allowed. */
export async function connectPaymentAccount(db: Db, storeId: string) {
  await db.query(
    `INSERT INTO public.store_payment_accounts (store_id, provider_user_id, public_key, access_token_enc) VALUES ($1, 'mp-user-1', 'TEST-public-key', 'v1.sealed')`,
    [storeId]
  );
  await db.query(`UPDATE public.stores SET online_payment_enabled = true WHERE id = $1`, [storeId]);
}
