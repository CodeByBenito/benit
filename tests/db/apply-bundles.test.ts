import { readFileSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";

/**
 * The two SQL Editor bundles (supabase/apply) must run as two single
 * executions — the editor sends each paste as one multi-statement query,
 * i.e. one implicit transaction. Step 1 ends with the enum ALTER; step 2 is
 * the first to use the new value.
 */
it("SQL Editor bundles apply cleanly in two runs", async () => {
  const db = new PGlite();
  await db.exec(`
    CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA extensions; CREATE SCHEMA storage; CREATE SCHEMA realtime;
    CREATE TABLE auth.users (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), email TEXT, raw_user_meta_data JSONB DEFAULT '{}');
    CREATE FUNCTION auth.uid() RETURNS UUID LANGUAGE sql STABLE AS $$ SELECT NULLIF(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    CREATE FUNCTION extensions.unaccent(TEXT) RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$ SELECT $1 $$;
    CREATE TABLE storage.buckets (id TEXT PRIMARY KEY, name TEXT, public BOOLEAN);
    CREATE TABLE storage.objects (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id TEXT, name TEXT);
    CREATE FUNCTION realtime.send(JSONB, TEXT, TEXT, BOOLEAN) RETURNS VOID LANGUAGE sql AS $$ SELECT $$;
  `);
  const load = (f: string) =>
    readFileSync(path.resolve(__dirname, "../../supabase/apply", f), "utf8")
      .replace(/CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA extensions;/g, "")
      .replace(/CREATE EXTENSION IF NOT EXISTS "pgcrypto";/g, "");
  await expect(db.exec(load("passo-1-base.sql"))).resolves.toBeTruthy();
  await expect(db.exec(load("passo-2-checkout-pagamentos.sql"))).resolves.toBeTruthy();
  const { rows } = await db.query<{ n: number }>(
    `SELECT COUNT(*)::int AS n FROM pg_tables WHERE schemaname = 'public'`
  );
  expect(rows[0].n).toBe(22);
}, 120_000);
