/**
 * Merges the Klaviyo profiles the parent sync split in two.
 *
 * A dormant Eventbrite integration had already put many parents in Klaviyo,
 * under their address and Eventbrite's numeric external id. The parent sync
 * then created a second profile for the same address under the Sogverse
 * profile id, so those parents exist twice. This one-off finds every
 * registered parent whose address Klaviyo holds more than once and merges the
 * extra profiles into the one the sync owns.
 *
 *   npx tsx scripts/merge-klaviyo-duplicate-parents.ts            # dry run: report only
 *   npx tsx scripts/merge-klaviyo-duplicate-parents.ts --apply    # queue the merges
 *
 * ## What it reads and what it writes
 *
 * The registered parents — `customer` rows with `registration_completed_at`
 * set, the population the sync writes — come from the **prod** database,
 * read-only, through the prod service key in `.env.local`. Klaviyo is asked
 * for every profile holding each parent's address. Nothing is written
 * anywhere but Klaviyo, and only with `--apply`.
 *
 * The output carries Sogverse profile ids and Klaviyo profile ids only — no
 * address and no name — so it can be pasted anywhere.
 *
 * ## The merge
 *
 * Klaviyo's Profile Merge (`POST /api/profile-merge`) takes one destination
 * and exactly one source per call. The destination keeps its id, and wins any
 * property both hold; the source's events, list memberships and properties
 * the destination lacks move to it; the source is then deleted. The call only
 * queues the work (201), so each run ends by re-reading the parents it merged
 * after a short wait and reporting any that still show more than one profile.
 * A re-run is the real confirmation: it finds only what is still split.
 *
 * The destination is always the profile whose external id is the Sogverse
 * profile id — the one the sync finds and updates. Anything else is skipped
 * and reported, never guessed at:
 *
 * - no profile for the address carries the parent's Sogverse id;
 * - more than one does;
 * - another profile carries a different Sogverse-shaped (uuid) external id,
 *   which would be a second Sogverse account, not an Eventbrite leftover;
 * - another profile carries an external id that is neither empty nor
 *   Eventbrite's all-digits shape;
 * - Klaviyo answers more profiles than one page holds;
 * - a source's email marketing standing is stricter than the destination's:
 *   it is `UNSUBSCRIBED` while the destination is not, or it is suppressed
 *   while the destination is not.
 *
 * ## Consent
 *
 * How Klaviyo reconciles two profiles' email marketing consent on a merge is
 * not confirmed: the destination may simply win, as it does for properties.
 * A merge could then undo an unsubscribe or a suppression the source carried,
 * so any parent whose merged result could be more permissive than a source is
 * skipped and left for a person to look at. Equal standings merge, and so does
 * a source less strict than the destination, whose own standing is then the
 * stricter one either way. The report prints each profile's standing —
 * consent, whether it can receive email marketing, whether it is suppressed —
 * beside its id.
 *
 * ## Pacing
 *
 * Get Profiles allows 75/s burst and 750/min steady; Profile Merge 10/s burst
 * and 150/min steady. Calls are spaced to stay under the steady limits, and a
 * 429 waits out its `Retry-After` and tries again.
 */
import fs from "fs";
import path from "path";

import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/types";

const KLAVIYO_API_BASE = "https://a.klaviyo.com/api";
/** The revision the app's own client is pinned to (`src/lib/klaviyo.ts`). */
const KLAVIYO_REVISION = "2026-10-15";
const JSON_API = "application/vnd.api+json";

/** Spacing under each endpoint's steady limit (750/min and 150/min). */
const PROFILES_GET_SPACING_MS = 100;
const PROFILE_MERGE_SPACING_MS = 500;
/** How long the merges get to finish before this run re-reads them. */
const VERIFY_DELAY_MS = 60_000;
const MAX_429_RETRIES = 8;
const PAGE_SIZE = 100;
const DB_PAGE_SIZE = 1000;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EVENTBRITE_ID = /^\d+$/;

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
    values[trimmed.slice(0, eqIndex).trim()] = trimmed
      .slice(eqIndex + 1)
      .trim();
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
// Klaviyo
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Each error's code and title — never `detail`, which can quote the address. */
function errorLabels(answer: unknown): string {
  const errors = isRecord(answer) ? answer.errors : undefined;
  if (!Array.isArray(errors)) return "";
  return errors
    .map((error: unknown) => {
      const code =
        isRecord(error) && typeof error.code === "string" ? error.code : "?";
      const title =
        isRecord(error) && typeof error.title === "string" ? error.title : "?";
      return `${code}: ${title}`;
    })
    .join("; ");
}

class Klaviyo {
  private readonly lastCallAt = new Map<string, number>();

  constructor(private readonly apiKey: string) {}

  /** Waits until `spacingMs` has passed since the last call to this endpoint. */
  private async pace(endpoint: string, spacingMs: number): Promise<void> {
    const wait = (this.lastCallAt.get(endpoint) ?? 0) + spacingMs - Date.now();
    if (wait > 0) await sleep(wait);
    this.lastCallAt.set(endpoint, Date.now());
  }

  async call(
    method: "GET" | "POST",
    endpoint: string,
    query: string,
    spacingMs: number,
    body?: unknown,
  ): Promise<unknown> {
    for (let attempt = 0; ; attempt += 1) {
      await this.pace(endpoint, spacingMs);
      const response = await fetch(`${KLAVIYO_API_BASE}${endpoint}${query}`, {
        method,
        headers: {
          Authorization: `Klaviyo-API-Key ${this.apiKey}`,
          revision: KLAVIYO_REVISION,
          Accept: JSON_API,
          ...(body === undefined ? {} : { "Content-Type": JSON_API }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(30_000),
      });

      if (response.status === 429 && attempt < MAX_429_RETRIES) {
        const retryAfter = Number(response.headers.get("retry-after"));
        const waitMs =
          Number.isFinite(retryAfter) && retryAfter > 0
            ? retryAfter * 1000
            : 5_000;
        console.log(
          `  429 on ${endpoint}; waiting ${Math.round(waitMs / 1000)}s`,
        );
        await sleep(waitMs);
        continue;
      }

      const text = await response.text().catch(() => "");
      let answer: unknown = null;
      try {
        answer = text === "" ? null : (JSON.parse(text) as unknown);
      } catch {
        answer = null;
      }
      if (!response.ok) {
        const labels = errorLabels(answer);
        throw new Error(
          `Klaviyo ${method} ${endpoint} answered ${response.status}` +
            (labels === "" ? "" : ` (${labels})`),
        );
      }
      return answer;
    }
  }

  /** Every profile holding the address, or null when more than one page answers. */
  async profilesByEmail(email: string): Promise<KlaviyoProfile[] | null> {
    const filter = encodeURIComponent(`equals(email,"${email}")`);
    const answer = await this.call(
      "GET",
      "/profiles",
      `?filter=${filter}&fields[profile]=external_id,subscriptions` +
        `&additional-fields[profile]=subscriptions&page[size]=${PAGE_SIZE}`,
      PROFILES_GET_SPACING_MS,
    );
    const links =
      isRecord(answer) && isRecord(answer.links) ? answer.links : {};
    if (typeof links.next === "string" && links.next !== "") return null;

    const data =
      isRecord(answer) && Array.isArray(answer.data) ? answer.data : [];
    return data.map((entry: unknown) => {
      if (!isRecord(entry) || typeof entry.id !== "string") {
        throw new Error("Klaviyo answered a profile with no id");
      }
      const attributes = isRecord(entry.attributes) ? entry.attributes : {};
      const externalId = attributes.external_id;
      return {
        id: entry.id,
        externalId:
          typeof externalId === "string" && externalId !== ""
            ? externalId
            : null,
        marketing: emailMarketing(attributes.subscriptions),
      };
    });
  }

  /** Queues one merge of `sourceId` into `destinationId` (201). */
  async merge(destinationId: string, sourceId: string): Promise<void> {
    await this.call("POST", "/profile-merge", "", PROFILE_MERGE_SPACING_MS, {
      data: {
        type: "profile-merge",
        id: destinationId,
        relationships: {
          profiles: { data: [{ type: "profile", id: sourceId }] },
        },
      },
    });
  }
}

interface EmailMarketing {
  /** `SUBSCRIBED`, `UNSUBSCRIBED` or `NEVER_SUBSCRIBED`; null when Klaviyo gave none. */
  consent: string | null;
  canReceive: boolean | null;
  suppressed: boolean;
}

interface KlaviyoProfile {
  id: string;
  externalId: string | null;
  marketing: EmailMarketing;
}

/** The email marketing standing out of a profile's `subscriptions` attribute. */
function emailMarketing(subscriptions: unknown): EmailMarketing {
  const email = isRecord(subscriptions) ? subscriptions.email : undefined;
  const marketing = isRecord(email) ? email.marketing : undefined;
  if (!isRecord(marketing)) {
    return { consent: null, canReceive: null, suppressed: false };
  }
  const {
    consent,
    can_receive_email_marketing: canReceive,
    suppression,
  } = marketing;
  return {
    consent: typeof consent === "string" ? consent : null,
    canReceive: typeof canReceive === "boolean" ? canReceive : null,
    suppressed: Array.isArray(suppression) && suppression.length > 0,
  };
}

/** A profile's id with its standing, for the report: no address, no name. */
function describeProfile(profile: KlaviyoProfile): string {
  const { consent, canReceive, suppressed } = profile.marketing;
  const receives = canReceive === null ? "?" : canReceive ? "yes" : "no";
  return (
    `${profile.id} (${consent ?? "NO CONSENT"}, can receive ${receives}, ` +
    `suppressed ${suppressed ? "yes" : "no"})`
  );
}

/**
 * Whether merging `source` into `destination` could leave the merged profile
 * more permissive than `source` was.
 */
function wouldLoosen(
  source: EmailMarketing,
  destination: EmailMarketing,
): boolean {
  const unsubscribed = (standing: EmailMarketing) =>
    standing.consent === "UNSUBSCRIBED";
  return (
    (unsubscribed(source) && !unsubscribed(destination)) ||
    (source.suppressed && !destination.suppressed)
  );
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

interface Parent {
  id: string;
  email: string;
}

type Verdict =
  | { kind: "single" }
  | { kind: "absent" }
  | { kind: "split"; destination: KlaviyoProfile; sources: KlaviyoProfile[] }
  | { kind: "skip"; reason: string; profiles: KlaviyoProfile[] };

function classify(parent: Parent, profiles: KlaviyoProfile[] | null): Verdict {
  if (profiles === null) {
    return {
      kind: "skip",
      reason: "more profiles than one page",
      profiles: [],
    };
  }
  if (profiles.length === 0) return { kind: "absent" };
  if (profiles.length === 1) return { kind: "single" };

  const ours = profiles.filter((profile) => profile.externalId === parent.id);
  if (ours.length === 0) {
    return {
      kind: "skip",
      reason: "no profile carries the Sogverse id",
      profiles,
    };
  }
  if (ours.length > 1) {
    return {
      kind: "skip",
      reason: "several profiles carry the Sogverse id",
      profiles,
    };
  }

  const others = profiles.filter((profile) => profile.externalId !== parent.id);
  for (const other of others) {
    if (other.externalId === null) continue;
    if (UUID.test(other.externalId)) {
      return {
        kind: "skip",
        reason: "another profile carries a different uuid",
        profiles,
      };
    }
    if (!EVENTBRITE_ID.test(other.externalId)) {
      return {
        kind: "skip",
        reason: "another profile carries an unrecognised external id",
        profiles,
      };
    }
  }
  const [destination] = ours;
  if (
    others.some((other) => wouldLoosen(other.marketing, destination.marketing))
  ) {
    return {
      kind: "skip",
      reason:
        "a source is unsubscribed or suppressed where the destination is not",
      profiles,
    };
  }
  return { kind: "split", destination, sources: others };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function readParents(env: Record<string, string>): Promise<Parent[]> {
  const ref = require_(env, "SUPABASE_PROD_PROJECT_REF");
  const key = require_(env, "SUPABASE_PROD_SERVICE_ROLE_KEY");
  const db = createClient<Database>(`https://${ref}.supabase.co`, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const parents: Parent[] = [];
  for (let from = 0; ; from += DB_PAGE_SIZE) {
    const { data, error } = await db
      .from("profiles")
      .select("id, email")
      .eq("role", "customer")
      .not("registration_completed_at", "is", null)
      .order("id")
      .range(from, from + DB_PAGE_SIZE - 1);
    if (error) throw new Error(`reading parents failed: ${error.message}`);
    parents.push(...data);
    if (data.length < DB_PAGE_SIZE) return parents;
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  const env = loadEnvLocal();
  const klaviyo = new Klaviyo(require_(env, "KLAVIYO_PRIVATE_API_KEY"));

  console.log("database : PROD (read-only)");
  console.log(
    `mode     : ${apply ? "APPLY (queueing merges in Klaviyo)" : "dry run"}\n`,
  );

  const parents = await readParents(env);
  console.log(`registered parents: ${parents.length}`);

  const counts = { single: 0, absent: 0, split: 0, skip: 0 };
  const splits: (Parent & {
    destination: KlaviyoProfile;
    sources: KlaviyoProfile[];
  })[] = [];
  const skips: { id: string; reason: string; profiles: KlaviyoProfile[] }[] =
    [];

  for (const [index, parent] of parents.entries()) {
    if (index > 0 && index % 200 === 0)
      console.log(`  checked ${index}/${parents.length}`);
    const verdict = classify(
      parent,
      await klaviyo.profilesByEmail(parent.email),
    );
    counts[verdict.kind] += 1;
    if (verdict.kind === "split") {
      splits.push({
        ...parent,
        destination: verdict.destination,
        sources: verdict.sources,
      });
    } else if (verdict.kind === "skip") {
      skips.push({
        id: parent.id,
        reason: verdict.reason,
        profiles: verdict.profiles,
      });
    }
  }

  console.log("\n--- counts ---");
  console.log(`  one profile           : ${counts.single}`);
  console.log(`  no profile            : ${counts.absent}`);
  console.log(`  split, will merge     : ${counts.split}`);
  console.log(`  skipped, needs a look : ${counts.skip}`);

  if (splits.length > 0) {
    console.log("\n--- split (sogverse id: destination <- sources) ---");
    for (const split of splits) {
      console.log(
        `  ${split.id}: ${describeProfile(split.destination)} <- ` +
          split.sources.map(describeProfile).join(", "),
      );
    }
  }
  if (skips.length > 0) {
    console.log(
      "\n--- skipped (sogverse id: reason [klaviyo profiles]) ---",
    );
    for (const skip of skips) {
      console.log(
        `  ${skip.id}: ${skip.reason} ` +
          `[${skip.profiles.map(describeProfile).join(", ")}]`,
      );
    }
  }

  if (!apply) {
    console.log("\nDry run — re-run with --apply to queue the merges.");
    return;
  }
  if (splits.length === 0) {
    console.log("\nNothing to merge.");
    return;
  }

  console.log("\n--- merging ---");
  const failed: string[] = [];
  for (const split of splits) {
    for (const source of split.sources) {
      try {
        await klaviyo.merge(split.destination.id, source.id);
        console.log(
          `  queued ${split.id}: ${split.destination.id} <- ${source.id}`,
        );
      } catch (error: unknown) {
        failed.push(split.id);
        console.log(
          `  FAILED ${split.id}: ${split.destination.id} <- ${source.id}: ` +
            (error instanceof Error ? error.message : String(error)),
        );
      }
    }
  }

  console.log(
    `\nwaiting ${VERIFY_DELAY_MS / 1000}s for Klaviyo to run the merges...`,
  );
  await sleep(VERIFY_DELAY_MS);

  const stillSplit: string[] = [];
  for (const split of splits) {
    const profiles = await klaviyo.profilesByEmail(split.email);
    if (
      profiles === null ||
      profiles.length !== 1 ||
      profiles[0].id !== split.destination.id
    ) {
      stillSplit.push(split.id);
    }
  }

  console.log("\n--- result ---");
  console.log(
    `  merges queued     : ${splits.reduce((n, s) => n + s.sources.length, 0) - failed.length}`,
  );
  console.log(`  merge calls failed: ${failed.length}`);
  console.log(
    `  confirmed merged  : ${splits.length - stillSplit.length}/${splits.length}`,
  );
  if (stillSplit.length > 0) {
    console.log("  not yet one profile (still queued, or failed):");
    for (const id of stillSplit) console.log(`    ${id}`);
    console.log(
      "  Re-run the dry run in a few minutes; it lists only what is still split.",
    );
  }
}

main().catch((error: unknown) => {
  console.error(
    `\nFAILED: ${error instanceof Error ? error.message : String(error)}`,
  );
  // exitCode rather than exit(): exiting while the Supabase client still holds
  // handles trips a libuv assertion on Windows.
  process.exitCode = 1;
});
