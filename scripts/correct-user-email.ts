/**
 * Corrects a user's email address by hand — the signup typo case.
 *
 * There is no email-change flow in the app (`profiles.email` carries no UPDATE
 * grant for `authenticated`, so not even an admin session can write it), which
 * makes this a recurring hand operation. The runbook is
 * `docs/runbooks/correct-user-email.md`; this script is the mechanism that
 * keeps the two writes in step.
 *
 * Report-only unless told otherwise:
 *
 *   npx tsx scripts/correct-user-email.ts --user <uuid> --email <new>          # staging, report
 *   npx tsx scripts/correct-user-email.ts --user <uuid> --email <new> --prod   # prod, report
 *   npx tsx scripts/correct-user-email.ts --user <uuid> --email <new> --prod --apply
 *
 * ## Why a script rather than two commands
 *
 * The operation is two writes that must not drift apart, and each half has a
 * trap that is invisible until someone hits it later:
 *
 * 1. **Auth, via the Admin API.** `auth.identities.email` is a GENERATED column
 *    over `identity_data->>'email'`, so a raw `UPDATE auth.users SET email` in
 *    psql leaves the identity pointing at the old address — sign-in keeps
 *    working on the *old* email and the change looks like it worked. The Admin
 *    API moves `auth.users` and `auth.identities` together. This script
 *    therefore reads the identity back and fails loudly if it did not move.
 * 2. **`public.profiles`.** Nothing syncs it; the signup trigger copies the
 *    address on INSERT only. `service_role` does hold UPDATE on the column, so
 *    both writes happen here and the psql step the runbook used to require is
 *    gone.
 *
 * Auth goes **first**, because it is the only write that enforces uniqueness
 * and so the only one that can legitimately fail. If it fails, `profiles` has
 * not been touched and there is nothing to unwind.
 *
 * ## Where the keys come from
 *
 * `.env.local`, read directly rather than through Next.js. The plain
 * `SUPABASE_*` keys are **staging**; prod lives under `SUPABASE_PROD_*`. The
 * project is chosen by `--prod` rather than by which shell exported what, so
 * the target is visible in the command that ran and in the banner printed
 * before any work.
 *
 * Note the keys are new-format (`sb_secret_…`). They authenticate through
 * `supabase-js` but are rejected by hand-rolled REST calls against
 * `/rest/v1/` and `/auth/v1/` — see the runbook.
 *
 * ## What it refuses
 *
 * A target address already held by a *different* auth user. That is the
 * duplicate-account case, not a typo: the address cannot be freed without
 * deciding what happens to the other account's data, which is a judgement call
 * this script will not make for you. It names the blocking user and stops.
 */
import fs from "fs";
import path from "path";

import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient, User } from "@supabase/supabase-js";

import type { Database } from "@/types";

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

function loadEnvLocal(): Record<string, string> {
  const values: Record<string, string> = {};
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) {
    console.error("No .env.local found — run this from the repo root.");
    process.exit(1);
  }
  for (const line of fs.readFileSync(envPath, "utf-8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    values[trimmed.slice(0, eqIndex).trim()] = trimmed.slice(eqIndex + 1).trim();
  }
  return values;
}

function require_(values: Record<string, string>, name: string): string {
  const value = values[name];
  if (!value) {
    console.error(`Missing ${name} in .env.local`);
    process.exit(1);
  }
  return value;
}

// ---------------------------------------------------------------------------
// Arguments
// ---------------------------------------------------------------------------

interface Args {
  userId: string;
  newEmail: string;
  isProd: boolean;
  apply: boolean;
}

function flagValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function parseArgs(): Args {
  const userId = flagValue("--user");
  const newEmail = flagValue("--email");

  if (!userId || !newEmail) {
    console.error(
      "Usage: npx tsx scripts/correct-user-email.ts --user <uuid> --email <new> [--prod] [--apply]",
    );
    process.exit(1);
  }

  // Cheap sanity check. The address is about to become someone's login, and a
  // stray quote or trailing comma from a copy-paste is the realistic mistake.
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) {
    console.error(`"${newEmail}" does not look like an email address.`);
    process.exit(1);
  }

  return {
    userId,
    newEmail,
    isProd: process.argv.includes("--prod"),
    apply: process.argv.includes("--apply"),
  };
}

// ---------------------------------------------------------------------------
// The two writes
// ---------------------------------------------------------------------------

/**
 * The email as `auth.identities` sees it — the half a raw SQL update silently
 * leaves behind. `identity_data` is loosely typed by the SDK, so read it
 * defensively rather than asserting a shape onto it.
 */
function identityEmails(user: User): string[] {
  return (user.identities ?? [])
    .map((identity) => identity.identity_data?.["email"])
    .filter((email): email is string => typeof email === "string");
}

async function findConflict(
  admin: SupabaseClient<Database>,
  email: string,
  selfId: string,
): Promise<User | null> {
  // listUsers pages; the address is unique in auth, so one match is the most
  // there can be, but scan rather than trust the first page's ordering.
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`listUsers failed: ${error.message}`);
    if (data.users.length === 0) return null;
    const hit = data.users.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase() && u.id !== selfId,
    );
    if (hit) return hit;
    if (data.users.length < 200) return null;
    page += 1;
  }
}

async function main() {
  const { userId, newEmail, isProd, apply } = parseArgs();

  const env = loadEnvLocal();
  const ref = require_(env, isProd ? "SUPABASE_PROD_PROJECT_REF" : "SUPABASE_PROJECT_REF");
  const key = require_(
    env,
    isProd ? "SUPABASE_PROD_SERVICE_ROLE_KEY" : "SUPABASE_SERVICE_ROLE_KEY",
  );

  console.log(`project : ${isProd ? "PROD" : "staging"} (${ref})`);
  console.log(`user    : ${userId}`);
  console.log(`target  : ${newEmail}`);
  console.log(`mode    : ${apply ? "APPLY (writing)" : "report only"}\n`);

  const admin = createClient<Database>(`https://${ref}.supabase.co`, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: found, error: readError } = await admin.auth.admin.getUserById(userId);
  if (readError) {
    throw new Error(`No such auth user ${userId}: ${readError.message}`);
  }
  const user = found.user;

  const { data: profile } = await admin
    .from("profiles")
    .select("email, first_name, last_name, role")
    .eq("id", userId)
    .maybeSingle();

  console.log("--- current ---");
  console.log(`  name            : ${profile?.first_name ?? "?"} ${profile?.last_name ?? ""}`);
  console.log(`  role            : ${profile?.role ?? "?"}`);
  console.log(`  auth.users      : ${user.email}`);
  console.log(`  auth.identities : ${identityEmails(user).join(", ") || "(none)"}`);
  console.log(`  profiles        : ${profile?.email ?? "(no profile row)"}`);
  console.log();

  if (user.email?.toLowerCase() === newEmail.toLowerCase()) {
    console.log("auth.users already holds the target address.");
    if (profile && profile.email !== newEmail) {
      console.log("profiles is the half that is behind — it will be brought into line.");
    } else {
      console.log("Nothing to do.");
      return;
    }
  }

  const conflict = await findConflict(admin, newEmail, userId);
  if (conflict) {
    throw new Error(
      `REFUSING: ${newEmail} already belongs to auth user ${conflict.id}.\n` +
        "That is the duplicate-account case. Decide what happens to that account's data\n" +
        "first (see the runbook); this script will not free the address for you.",
    );
  }

  if (!apply) {
    console.log("Report only — re-run with --apply to write.");
    return;
  }

  // Auth first: the only write that enforces uniqueness, so the only one that
  // can legitimately fail. Leaves profiles untouched if it does.
  console.log("--- writing auth (Admin API) ---");
  const { data: updated, error: authError } = await admin.auth.admin.updateUserById(userId, {
    email: newEmail,
    email_confirm: true,
  });
  if (authError) {
    throw new Error(`auth write failed, profiles untouched: ${authError.message}`);
  }
  console.log(`  auth.users      : ${updated.user.email}`);

  // The trap, checked rather than trusted — but check it against a *fresh read*.
  // The update response carries the identities array as it was BEFORE the write,
  // so verifying against `updated.user` reports a failure on every successful
  // run (confirmed against staging: the row had moved while the payload said it
  // had not). Re-reading is the difference between a real check and a false one.
  const { data: reread, error: rereadError } = await admin.auth.admin.getUserById(userId);
  if (rereadError) {
    throw new Error(
      `auth write landed but could not be verified: ${rereadError.message}\n` +
        "Re-run this script to finish the job — it is safe to repeat.",
    );
  }
  const identities = identityEmails(reread.user);
  console.log(`  auth.identities : ${identities.join(", ") || "(none)"}`);
  if (!identities.some((email) => email.toLowerCase() === newEmail.toLowerCase())) {
    throw new Error(
      "auth.users moved but auth.identities did not. Sign-in will still answer to\n" +
        "the old address. Do not treat this as done — see the runbook.",
    );
  }

  console.log("\n--- writing profiles ---");
  const { error: profileError } = await admin
    .from("profiles")
    .update({ email: newEmail })
    .eq("id", userId);
  if (profileError) {
    throw new Error(
      `profiles write failed AFTER the auth write landed: ${profileError.message}\n` +
        "Re-run this script to finish the job — it is safe to repeat.",
    );
  }
  console.log(`  profiles        : ${newEmail}`);

  console.log("\nDone. Two follow-ons, both expected and needing no action:");
  console.log("  - profiles.email_verified_at is nulled by trg_reset_email_verification,");
  console.log("    and any outstanding verification link self-invalidates.");
  console.log("  - the password is untouched; worst case is one re-login.");
}

main().catch((error: unknown) => {
  console.error(`\nFAILED: ${error instanceof Error ? error.message : String(error)}`);
  // exitCode rather than exit(): calling exit() while the Supabase client still
  // holds handles trips a libuv assertion on Windows, which buries the message
  // above under a stack dump.
  process.exitCode = 1;
});
