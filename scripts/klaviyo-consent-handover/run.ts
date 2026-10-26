/**
 * Hands School of Gaming's own email marketing consent over to Klaviyo: every
 * parent whose current `school_of_gaming` consent in `marketing_consents` is
 * granted is subscribed to email marketing in Klaviyo, so the answer survives
 * the deploy that deletes those rows. It runs before that deploy, while the
 * rows still exist; the procedure is "Before the first deploy" in
 * `src/lib/klaviyo-sync/CLAUDE.md`.
 *
 * Dry run unless told otherwise — reads the database and Klaviyo, writes
 * nothing, and prints what an apply would do:
 *
 *   npx tsx scripts/klaviyo-consent-handover/run.ts                   # staging, dry run
 *   npx tsx scripts/klaviyo-consent-handover/run.ts --prod            # prod, dry run
 *   npx tsx scripts/klaviyo-consent-handover/run.ts --prod --apply    # prod, writes
 *
 * **Klaviyo's word wins.** A parent whose Klaviyo profile has unsubscribed or
 * is suppressed is skipped and counted, never subscribed again; one already
 * subscribed is not written to. That is also what makes it safe to re-run.
 * Each one subscribed gets the profile the sync would find (external id,
 * address, names, locale, `Sogverse Account`, `Sogverse Environment`), then a
 * subscription with no list, under the custom source
 * `Sogverse account (consent given before the Klaviyo sync)`, as a historical
 * import stamped with when the parent consented — which subscribes at once,
 * with no confirmation mail.
 *
 * ## Where the keys come from
 *
 * `.env.local`, read directly rather than through Next.js. The plain
 * `SUPABASE_*` keys are **staging**; prod lives under `SUPABASE_PROD_*`, chosen
 * by `--prod` so the target is visible in the command and in the banner. One
 * Klaviyo account holds both environments, so `KLAVIYO_PRIVATE_API_KEY` is
 * the same either way, and `--prod` also decides `Sogverse Environment`.
 *
 * Prints counts and, for a failure, the parent's profile id with Klaviyo's
 * error label — never an address or a name. Writes nothing to disk. Exits
 * non-zero when any parent failed.
 */
import fs from "fs";
import { registerHooks } from "module";
import path from "path";

import { createClient } from "@supabase/supabase-js";

// The installed `@types/node` is Node 20's, which predates `registerHooks`
// (Node 22.15); the runtime has it. Only the part used here is declared.
declare module "module" {
  interface ResolvedModule {
    url: string;
  }
  function registerHooks(hooks: {
    resolve: (
      specifier: string,
      context: object,
      nextResolve: (specifier: string, context: object) => ResolvedModule,
    ) => ResolvedModule;
  }): void;
}

// `src/lib/klaviyo.ts` is marked `server-only`, a package Next resolves for
// its server bundles and nothing else installs. Resolved to the same empty
// module Next's server build uses, the client imports here unchanged — which
// is why it, and everything importing it, is loaded below with `import()`.
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === "server-only") {
      return nextResolve("next/dist/compiled/server-only/empty.js", context);
    }
    return nextResolve(specifier, context);
  },
});

const PAGE = 1000;
const ID_CHUNK = 100;

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

async function main() {
  const isProd = process.argv.includes("--prod");
  const apply = process.argv.includes("--apply");

  const env = loadEnvLocal();
  const ref = require_(env, isProd ? "SUPABASE_PROD_PROJECT_REF" : "SUPABASE_PROJECT_REF");
  const key = require_(
    env,
    isProd ? "SUPABASE_PROD_SERVICE_ROLE_KEY" : "SUPABASE_SERVICE_ROLE_KEY",
  );
  process.env.KLAVIYO_PRIVATE_API_KEY = require_(env, "KLAVIYO_PRIVATE_API_KEY");
  const environment = isProd ? "production" : "staging";

  console.log(`project     : ${isProd ? "PROD" : "staging"} (${ref})`);
  console.log(`environment : Sogverse Environment = ${environment}`);
  console.log(`mode        : ${apply ? "APPLY (writing to Klaviyo)" : "dry run"}\n`);

  const klaviyo = await import("@/lib/klaviyo");
  const { consentRows, consentedParents, grantEvents, handOver } = await import("./handover");

  // Untyped on purpose: the generated types follow this branch's schema, where
  // `school_of_gaming` is no longer a consent type, while the database read
  // still holds it until the deploy. Every row is parsed instead.
  const supabase = createClient(`https://${ref}.supabase.co`, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("marketing_consents")
      .select("customer_id, updated_at, profiles!inner(email, first_name, last_name, locale)")
      .eq("consent_type", "school_of_gaming")
      .eq("granted", true)
      .eq("profiles.role", "customer")
      .order("customer_id")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(`Reading marketing_consents failed: ${error.message}`);
    const page: unknown = data;
    rows.push(...consentRows.parse(page));
    if (data.length < PAGE) break;
  }

  const events = [];
  const ids = rows.map((row) => row.customer_id);
  for (let i = 0; i < ids.length; i += ID_CHUNK) {
    const chunk = ids.slice(i, i + ID_CHUNK);
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase
        .from("marketing_consent_events")
        .select("customer_id, source, created_at")
        .in("customer_id", chunk)
        .eq("consent_type", "school_of_gaming")
        .eq("granted", true)
        .order("id")
        .range(from, from + PAGE - 1);
      if (error) throw new Error(`Reading marketing_consent_events failed: ${error.message}`);
      const page: unknown = data;
      events.push(...grantEvents.parse(page));
      if (data.length < PAGE) break;
    }
  }

  const parents = consentedParents(rows, events);
  console.log(`parents with a granted School of Gaming consent: ${parents.length}\n`);

  const result = await handOver(
    parents,
    {
      findEmailMarketing: klaviyo.findKlaviyoEmailMarketing,
      upsertProfile: klaviyo.upsertKlaviyoProfile,
      subscribe: klaviyo.subscribeKlaviyoProfile,
      sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    },
    { apply, environment },
  );

  console.log(`${apply ? "subscribed" : "to subscribe"}           : ${result.subscribe}`);
  for (const [source, count] of Object.entries(result.bySource).sort()) {
    console.log(`  consent given at ${source}: ${count}`);
  }
  console.log(`already subscribed     : ${result.alreadySubscribed}`);
  console.log(`skipped (unsubscribed) : ${result.unsubscribed}`);
  console.log(`errors                 : ${result.errors.length}`);
  for (const { profileId, error } of result.errors) {
    console.log(`  ${profileId}: ${error}`);
  }
  if (!apply) console.log("\nDry run: nothing was written. Re-run with --apply to write.");
  if (result.errors.length > 0) process.exit(1);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
