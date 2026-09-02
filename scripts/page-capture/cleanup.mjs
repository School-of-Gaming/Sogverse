/**
 * Delete everything one seed run created, and prove it is gone.
 *
 *   node scripts/page-capture/cleanup.mjs [--state seed-state.json]
 *   node scripts/page-capture/cleanup.mjs --users <id,id> --products <id,id>
 *
 * Normally it reads `seed-state.json` and removes exactly what that run made.
 * The explicit-ids form is the recovery path a failed seed prints for itself,
 * for the case where the state file was never written.
 *
 * ## It deletes only what it is told about
 *
 * There is no "sweep everything TEMP-prefixed" mode, and there should not be:
 * a capture fleet from someone else's run — or from an earlier run whose
 * screenshots are still being looked at — is indistinguishable from yours by
 * prefix alone. Ids come from a state file or from the command line, never from
 * a pattern match.
 *
 * ## What cascades and what does not
 *
 * Two deletes cover the whole fleet. Removing the product cascades to its
 * groups, and through them to sessions, attendance, chat channels and the
 * gedu's assignment; it also cascades to the participations on it. Removing an
 * auth user cascades to its profile and through that to every extension row —
 * gamer/gedu/customer profiles, the parent-child links, the game accounts.
 *
 * The product goes first. Nothing requires it to, but a participation row
 * outliving its product for a moment reads better in a log than the reverse.
 *
 * The product delete is the one write in this tool with no RPC behind it: the
 * database offers no `delete_product`, so it is a service-role DELETE on the
 * table, which is the only door there is.
 */

import { existsSync, readFileSync, unlinkSync } from "node:fs";
import {
  argOf,
  assertStaging,
  deleteAuthUser,
  hasFlag,
  loadEnvLocal,
  log,
  resolveStatePath,
  supabaseClient,
} from "./lib.mjs";

loadEnvLocal();
const { url, serviceKey, ref } = assertStaging();

const STATE_PATH = resolveStatePath("state", argOf("state"));
const KEEP_STATE = hasFlag("keep-state");

const service = supabaseClient({ url, key: serviceKey });

function idList(flag) {
  return (argOf(flag, "") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s && s !== "-");
}

let authUserIds = idList("users");
let productIds = idList("products");
let usedStateFile = false;
let runId = null;

if (authUserIds.length === 0 && productIds.length === 0) {
  if (!existsSync(STATE_PATH)) {
    console.error(
      `\n  No seed state at ${STATE_PATH}, and no --users / --products given.` +
        `\n  Nothing to clean up.\n`,
    );
    process.exit(1);
  }
  const state = JSON.parse(readFileSync(STATE_PATH, "utf8"));
  authUserIds = state.cleanup.authUserIds;
  productIds = state.cleanup.productIds;
  runId = state.runId;
  usedStateFile = true;

  // A state file naming a different project than the one the guard just cleared
  // means the environment moved between seed and cleanup. Deleting ids from
  // one project against another is at best a no-op and at worst a hit on rows
  // that happen to share an id, so stop rather than guess.
  if (state.supabase?.ref && state.supabase.ref !== ref) {
    console.error(
      `\n  REFUSING TO RUN\n  Seed state was written against project ` +
        `${state.supabase.ref}, but .env.local now points at ${ref}.\n`,
    );
    process.exit(1);
  }
}

console.log(`\nPage-capture cleanup → staging (${ref})`);
if (runId) console.log(`Run id: ${runId}`);
console.log(`  ${productIds.length} product(s), ${authUserIds.length} auth user(s)\n`);

const removed = { products: [], authUsers: [] };
const failed = [];

log.step("Deleting products");
for (const id of productIds) {
  try {
    // Participations go FIRST, in their own statement, and this is not tidiness.
    //
    // Deleting a participation fires the trigger that recomputes the product's
    // cached seat counts, and that recompute INSERTs a `product_seat_counts`
    // row. Inside a single `DELETE FROM products`, the participations are
    // removed by cascade while the product row is on its way out — so the
    // trigger tries to insert a counts row pointing at a product that will not
    // exist by the end of the statement, and the whole delete fails on that
    // table's foreign key. Removing the participations in a statement of their
    // own lets the recompute land against a product that is still there; the
    // counts row it writes is then carried off by the product's own cascade.
    await service.remove("participations", `product_id=eq.${id}`);
    await service.remove("products", `id=eq.${id}`);
    removed.products.push(id);
    log.ok(`product ${id}`);
  } catch (err) {
    failed.push(`product ${id}: ${err.message}`);
    log.warn(`product ${id}: ${err.message}`);
  }
}

log.step("Deleting auth users");
for (const id of authUserIds) {
  try {
    await deleteAuthUser(service, id);
    removed.authUsers.push(id);
    log.ok(`auth user ${id}`);
  } catch (err) {
    // A 404 means it is already gone, which is the outcome we wanted — and for
    // the gamers it is the *expected* one. Deleting the parent cascades the
    // parent-child link, and an AFTER DELETE trigger on that link deletes the
    // now-orphaned gamer's auth user. So by the time this loop reaches them,
    // the children of a deleted parent are already gone by design.
    if (err.status === 404) {
      removed.authUsers.push(id);
      log.ok(`auth user ${id} (already gone)`);
    } else {
      failed.push(`auth user ${id}: ${err.message}`);
      log.warn(`auth user ${id}: ${err.message}`);
    }
  }
}

// -- Verify ------------------------------------------------------------------
//
// Read back rather than trust the deletes. A DELETE that matched nothing is a
// 204 exactly like one that matched everything, so the only way to know the
// fleet is gone is to go and look for it.
log.step("Verifying");

const stragglers = [];

for (const id of productIds) {
  const rows = await service.select("products", `id=eq.${id}&select=id`);
  if (rows.length > 0) stragglers.push(`product ${id} still exists`);
}
for (const id of authUserIds) {
  const rows = await service.select("profiles", `id=eq.${id}&select=id,email,role`);
  if (rows.length > 0) stragglers.push(`profile ${id} (${rows[0].email}) still exists`);
}
// The rows that hang off a product by cascade. If any of these survived, the
// cascade did not fire and the fleet is only half gone.
for (const id of productIds) {
  const groups = await service.select("product_groups", `product_id=eq.${id}&select=id`);
  const parts = await service.select("participations", `product_id=eq.${id}&select=id`);
  if (groups.length > 0) stragglers.push(`${groups.length} group(s) left on product ${id}`);
  if (parts.length > 0) stragglers.push(`${parts.length} participation(s) left on product ${id}`);
}

console.log("");
if (stragglers.length === 0 && failed.length === 0) {
  console.log(
    `  Clean. Removed ${removed.products.length} product(s) and ` +
      `${removed.authUsers.length} auth user(s); nothing left behind.\n`,
  );
  if (usedStateFile && !KEEP_STATE) {
    unlinkSync(STATE_PATH);
    console.log(`  Removed ${STATE_PATH} — it describes a fleet that no longer exists.\n`);
  }
} else {
  console.error(`  NOT clean:`);
  for (const f of failed) console.error(`    ! ${f}`);
  for (const s of stragglers) console.error(`    ! ${s}`);
  console.error(
    `\n  The state file is kept so this can be re-run.` +
      `\n  Re-run:  node scripts/page-capture/cleanup.mjs --state ${STATE_PATH}\n`,
  );
  process.exitCode = 1;
}
