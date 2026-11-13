import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";
import { buildStep3, STEP3_FILE } from "../../scripts/build-apply-bundle.mjs";

const SHIM = `
  CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
  CREATE SCHEMA auth; CREATE SCHEMA extensions; CREATE SCHEMA storage; CREATE SCHEMA realtime;
  CREATE TABLE auth.users (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), email TEXT, raw_user_meta_data JSONB DEFAULT '{}', invited_at TIMESTAMPTZ, last_sign_in_at TIMESTAMPTZ);
  CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  CREATE FUNCTION extensions.unaccent(TEXT) RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$ SELECT $1 $$;
  CREATE TABLE storage.buckets (id TEXT PRIMARY KEY, name TEXT, public BOOLEAN, file_size_limit BIGINT, allowed_mime_types TEXT[]);
  CREATE TABLE storage.objects (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id TEXT, name TEXT);
  CREATE FUNCTION realtime.send(JSONB, TEXT, TEXT, BOOLEAN) RETURNS VOID LANGUAGE sql AS $$ SELECT $$;
`;

const load = (f: string) =>
  readFileSync(path.resolve(__dirname, "../../supabase/apply", f), "utf8")
    .replace(/CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;/g, "")
    .replace(/CREATE EXTENSION IF NOT EXISTS "pgcrypto";/g, "");

const STEP3 = path.basename(STEP3_FILE);

/**
 * The SQL Editor bundles (supabase/apply) must run as single executions: the
 * editor sends each paste as one multi-statement query, i.e. one implicit
 * transaction. Step 1 ends with the enum ALTER; step 2 is the first to use the
 * new value; step 3 carries everything from migration 0009 on.
 */
it("SQL Editor bundles apply cleanly in three runs", async () => {
  const db = new PGlite();
  await db.exec(SHIM);

  // Step 3 refuses to run on a database that is not ready for it.
  await expect(db.exec(load(STEP3))).rejects.toThrow(/rode antes os passos 1 e 2/);

  await expect(db.exec(load("passo-1-base.sql"))).resolves.toBeTruthy();
  await expect(db.exec(load("passo-2-checkout-pagamentos.sql"))).resolves.toBeTruthy();
  await expect(db.exec(load(STEP3))).resolves.toBeTruthy();

  const { rows } = await db.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM pg_tables WHERE schemaname = 'public'`);
  expect(rows[0].n).toBe(23);

  // Steps 2 and 3 are re-runnable; step 1 refuses to run over an upgraded database.
  await expect(db.exec(load("passo-2-checkout-pagamentos.sql"))).resolves.toBeTruthy();
  await expect(db.exec(load(STEP3))).resolves.toBeTruthy();
  await expect(db.exec(load("passo-1-base.sql"))).rejects.toThrow(/já está atualizado/);

  const legacy = await db.query<{ n: number }>(`SELECT COUNT(*)::int AS n FROM pg_proc WHERE proname = 'create_order_atomic' AND pronargs = 12`);
  expect(legacy.rows[0].n).toBe(0);

  const added = await db.query<{ proname: string }>(
    `SELECT proname FROM pg_proc WHERE pronamespace = 'public'::regnamespace AND proname = ANY($1) ORDER BY proname`,
    [["add_team_member", "consume_rate_limit", "list_team_members", "remove_team_member", "reorder_catalog", "update_team_member_role"]]
  );
  expect(added.rows).toHaveLength(6);
}, 120_000);

it("the step 3 bundle is in sync with the migrations it is generated from", () => {
  const onDisk = readFileSync(STEP3_FILE, "utf8").replace(/\r\n/g, "\n");
  expect(onDisk, "run: node scripts/build-apply-bundle.mjs").toBe(buildStep3());
});
