// Builds supabase/apply/passo-3-equipe-cardapio-protecoes.sql from the
// migrations 0009 onward, for people who apply the database by pasting into
// the Supabase SQL Editor instead of using the CLI.
//
//   node scripts/build-apply-bundle.mjs          # writes the file
//   node scripts/build-apply-bundle.mjs --check  # exits 1 if the file is stale
//
// Steps 1 and 2 (migrations 0001-0008) were written by hand, with their own
// guards, and are not touched by this script.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const migrationsDir = path.join(root, "supabase/migrations");
export const STEP3_FILE = path.join(root, "supabase/apply/passo-3-equipe-cardapio-protecoes.sql");
const FIRST_MIGRATION = 9;

export function buildStep3() {
  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => /^\d{4}_.+\.sql$/.test(f) && Number(f.slice(0, 4)) >= FIRST_MIGRATION)
    .sort();
  const first = files[0].slice(0, 4);
  const last = files.at(-1).slice(0, 4);
  const header = [
    `-- BENIT · PASSO 3 de 3 · migrations ${first} a ${last}`,
    "-- Rode SOMENTE depois dos passos 1 e 2. Cole TUDO no SQL Editor do Supabase e clique em Run.",
    "-- Pode ser repetido: todas as instruções são idempotentes.",
    "-- Arquivo gerado por scripts/build-apply-bundle.mjs. Não edite à mão: mude a migration e gere de novo.",
    "DO $guard$",
    "BEGIN",
    "    IF to_regclass('public.coupons') IS NULL THEN",
    "        RAISE EXCEPTION 'BENIT: rode antes os passos 1 e 2 (a tabela coupons ainda não existe).';",
    "    END IF;",
    "END",
    "$guard$;",
    "",
  ].join("\n");
  const body = files
    .map((f) => `\n-- >>>>>>>>>> ${f}\n${fs.readFileSync(path.join(migrationsDir, f), "utf8").replace(/\r\n/g, "\n").trimEnd()}\n`)
    .join("");
  return header + body;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const next = buildStep3();
  if (process.argv.includes("--check")) {
    const current = fs.existsSync(STEP3_FILE) ? fs.readFileSync(STEP3_FILE, "utf8").replace(/\r\n/g, "\n") : "";
    if (current !== next) {
      console.error("supabase/apply/passo-3 está desatualizado. Rode: node scripts/build-apply-bundle.mjs");
      process.exit(1);
    }
    console.log("passo-3 em dia.");
  } else {
    fs.writeFileSync(STEP3_FILE, next);
    console.log(`Gerado ${path.relative(root, STEP3_FILE)}`);
  }
}
