/**
 * A migration's version, and how a generated migration is found again.
 *
 * A version is a `YYYYMMDDHHMMSS` timestamp, and the one that counts is the one
 * assigned when the branch lands — so a generator that re-emits a migration
 * months later cannot look its file up by version. It looks it up by the
 * descriptive half of the name, which is the stable half.
 *
 *   const file = migrationPath(MIGRATIONS_DIR, "seed_finland_postal_codes");
 *
 * Shared because four scripts mint or read versions — the two seed generators,
 * the reconciliation differ and the landing restamp — and a format that drifts
 * between them puts files on a database in an order nobody chose.
 */
import { readdirSync } from "node:fs";
import path from "node:path";

/** `YYYYMMDDHHMMSS` in UTC — the version format `supabase migration new` mints. */
export function stamp(millis = Date.now()) {
  return new Date(millis).toISOString().replace(/\D/g, "").slice(0, 14);
}

/**
 * Where a named migration already is, or the path a new one takes. Matched on
 * everything after the version, since the version is reassigned when the branch
 * lands and a regeneration months later still has to find the file it wrote.
 * Two files claiming one name is a question for a human, not something to pick
 * a winner from, so it throws rather than choosing.
 */
export function migrationPath(migrationsDir, name) {
  const existing = readdirSync(migrationsDir).filter(
    (file) => /^\d+_/.test(file) && file.slice(file.indexOf("_") + 1) === `${name}.sql`,
  );
  if (existing.length > 1) {
    throw new Error(`Two migrations are named ${name}: ${existing.join(", ")}.`);
  }
  return path.join(migrationsDir, existing[0] ?? `${stamp()}_${name}.sql`);
}
