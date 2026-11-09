import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, it } from "vitest";
import { createTestDb } from "./harness";

/**
 * Runs the original hand-written SQL verification script (supabase/tests)
 * against the full migration chain, so the pre-existing invariants
 * (RLS on, public projection, option rules, last-unit concurrency, reversal)
 * keep holding after 0004–0007.
 */
it("supabase/tests/verify_rls_and_invariants.sql passes on the new schema", async () => {
  const db = await createTestDb();
  const script = readFileSync(path.resolve(__dirname, "../../supabase/tests/verify_rls_and_invariants.sql"), "utf8");
  await expect(db.exec(script)).resolves.toBeTruthy();
}, 120_000);
