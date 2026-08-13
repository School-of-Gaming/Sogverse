/**
 * Exports every product's long description and converts it to the markdown that
 * replaces it, ready to be restored after the column changes type.
 *
 *   npx tsx scripts/export-long-descriptions.tsx --target=staging    ./out
 *   npx tsx scripts/export-long-descriptions.tsx --target=production ./out
 *
 * Both arguments are required and neither has a default. There is no sensible
 * default target — the two databases hold different copy, and a script that
 * guesses is a script that exports the wrong one — and the output directory is
 * named so two runs cannot silently overwrite each other's evidence.
 *
 * ## Why this exists
 *
 * The migration that turns `product_translations.long_description` from a jsonb
 * block array into a `text` column **clears it**. That is deliberate: this
 * repo's CI applies migrations to production before the new build is promoted,
 * so a migration that converted the data in place would hand converted values
 * to the old reader on a live public page. Clearing sidesteps it, because an
 * absent long description is an ordinary supported state that every page
 * already renders correctly — and the copy comes back afterwards, from here.
 *
 * The whole procedure, in order, is in docs/long-description-markdown-release.md.
 * The one thing to know before running this: **the export has to be taken
 * immediately before the release.** It is a point-in-time snapshot, and an
 * admin editing a description after the export would have that edit silently
 * overwritten by the restore.
 *
 * ## What it writes
 *
 * Two files in the output directory, both stamped with the target and the time:
 *
 *   - `long-descriptions.snapshot.json` — every exported row exactly as the
 *     database held it, alongside the markdown it converted to. This is the
 *     pre-conversion content preserved outside the database, and it is what you
 *     read if a restored description ever looks wrong.
 *   - `long-descriptions.restore.sql` — the restore, one UPDATE per row keyed on
 *     `product_id` and `locale`, in a transaction that asserts the expected
 *     number of rows ended up carrying a description.
 *
 * ## What it verifies before writing anything
 *
 * Every converted value goes through the pre-flight beside this file: the
 * rendered words and the headings have to match the source blocks. One failure
 * and nothing is written at all — a surprise in copy nobody has read is exactly
 * what this is for, and a half-written restore is worse than none. What that
 * check does and does not cover is written out where it lives.
 *
 * ## It only reads
 *
 * No statement here writes to any database. The restore is run deliberately,
 * by a person, through psql — that separation is the point, and it is what
 * makes running this against production safe.
 */

import fs from "fs";
import path from "path";

import { createClient } from "@supabase/supabase-js";

import { longDescriptionToMarkdown } from "@/lib/products/long-description-to-markdown";
import { parseLongDescription } from "@/types";
import type { Json } from "@/types";
import {
  preflightFailure,
  restoreSql,
  type ConvertedRow,
} from "./lib/long-description-export";

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

/** Load `.env.local` without clobbering anything the shell already exported. */
function loadEnvLocal(): void {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    if (key in process.env) continue;
    process.env[key] = trimmed.slice(eqIndex + 1).trim();
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing ${name} — set it in the shell or in .env.local`);
    process.exit(1);
  }
  return value;
}

const TARGETS = ["staging", "production"] as const;
type Target = (typeof TARGETS)[number];

/**
 * Which project each target names. The plain `SUPABASE_*` keys are staging and
 * the `SUPABASE_PROD_*` ones are production; naming both here rather than
 * letting `.env.local` decide is what makes the `--target` argument mean
 * something.
 */
function credentialsFor(target: Target): { url: string; key: string } {
  const ref = requireEnv(
    target === "production"
      ? "SUPABASE_PROD_PROJECT_REF"
      : "SUPABASE_PROJECT_REF",
  );
  const key = requireEnv(
    target === "production"
      ? "SUPABASE_PROD_SERVICE_ROLE_KEY"
      : "SUPABASE_SERVICE_ROLE_KEY",
  );
  return { url: `https://${ref}.supabase.co`, key };
}

// ---------------------------------------------------------------------------
// Reading the rows
// ---------------------------------------------------------------------------

/**
 * A translation row as it stands **before** the migration.
 *
 * Typed here rather than taken from `database.types.ts`, and the client below
 * is deliberately ungenericised: the generated types describe the column as it
 * will be *after* the migration (`text`), while this script runs before it and
 * reads the jsonb block array. Borrowing the generated type would describe the
 * wrong database.
 */
interface StoredRow {
  product_id: string;
  locale: string;
  long_description: Json | null;
}

async function readRows(target: Target): Promise<StoredRow[]> {
  const { url, key } = credentialsFor(target);
  const client = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error, count } = await client
    .from("product_translations")
    .select("product_id, locale, long_description", { count: "exact" })
    .not("long_description", "is", null)
    .order("product_id", { ascending: true })
    .order("locale", { ascending: true });
  if (error) throw new Error(`Read failed: ${error.message}`);
  const rows = (data ?? []) as StoredRow[];
  // PostgREST enforces its max_rows cap by truncating, not erroring, and a
  // capped response is indistinguishable from a complete one. An export that
  // silently missed rows would let the migration clear copy the restore never
  // saw, so a short read is a refusal, not a warning.
  if (count !== null && rows.length !== count) {
    throw new Error(
      `Read returned ${rows.length} of ${count} rows — the response was truncated. Nothing has been written.`,
    );
  }
  return rows;
}

// ---------------------------------------------------------------------------

interface SnapshotRow extends ConvertedRow {
  /** The value exactly as the database held it. */
  stored: Json;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const targetArg = args.find((a) => a.startsWith("--target="));
  const outDir = args.find((a) => !a.startsWith("--"));
  const target = TARGETS.find((t) => targetArg === `--target=${t}`);

  if (target === undefined || outDir === undefined) {
    console.error(
      "Usage: npx tsx scripts/export-long-descriptions.tsx --target=staging|production <output-dir>",
    );
    console.error(
      "Both are required. There is no default target: the two databases hold different copy.",
    );
    process.exit(1);
  }

  loadEnvLocal();
  const at = new Date().toISOString();
  const { url } = credentialsFor(target);

  console.log("");
  console.log(`Target:  ${target} (${url})`);
  console.log(`Output:  ${path.resolve(outDir)}`);
  console.log(`Taken:   ${at}`);
  console.log("");

  const rows = await readRows(target);
  const converted: SnapshotRow[] = [];
  const failures: string[] = [];

  for (const row of rows) {
    const blocks = parseLongDescription(row.long_description);
    const markdown = longDescriptionToMarkdown(blocks, 1);
    const where = `${row.product_id} / ${row.locale}`;

    if (markdown.trim() === "") {
      // A stored value holding no readable block at all. Not a conversion
      // failure — there is nothing to restore — so it is reported and skipped
      // rather than written as an empty string the column would refuse.
      console.log(`  skip  ${where} — no readable text in the stored value`);
      continue;
    }

    const failure = preflightFailure(blocks, markdown);
    if (failure !== null) {
      failures.push(`  ${where}: ${failure}`);
      continue;
    }

    converted.push({
      product_id: row.product_id,
      locale: row.locale,
      stored: row.long_description,
      markdown,
    });
    console.log(
      `  ok    ${where} — ${blocks.length} block(s), ${markdown.length} chars of markdown`,
    );
  }

  console.log("");

  // Failures set the exit code and return rather than calling process.exit:
  // the Supabase client keeps a socket open, and tearing the process down
  // under it turns a clear message into a libuv assertion the reader has to
  // scroll past.
  if (failures.length > 0) {
    console.error(
      `${failures.length} row(s) failed the pre-flight. Nothing has been written.`,
    );
    console.error("");
    for (const failure of failures) console.error(failure);
    process.exitCode = 1;
    return;
  }

  if (converted.length === 0) {
    console.error("No rows to export — nothing has been written.");
    process.exitCode = 1;
    return;
  }

  fs.mkdirSync(outDir, { recursive: true });
  const snapshotPath = path.join(outDir, "long-descriptions.snapshot.json");
  const restorePath = path.join(outDir, "long-descriptions.restore.sql");

  fs.writeFileSync(
    snapshotPath,
    `${JSON.stringify({ target, exportedAt: at, rows: converted }, null, 2)}\n`,
  );
  fs.writeFileSync(restorePath, restoreSql(converted, target, at));

  console.log(`${converted.length} row(s) exported and converted.`);
  console.log(`  ${snapshotPath}`);
  console.log(`  ${restorePath}`);
  console.log("");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
