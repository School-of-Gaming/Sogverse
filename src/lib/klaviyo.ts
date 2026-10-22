import "server-only";

/*
 * **Klaviyo, written to and never read from.** Klaviyo holds the newsletter
 * list a landing page's email sign-up joins; Sogverse sends it a profile and a
 * subscription and keeps nothing of either. Every call is an idempotent
 * upsert, so a caller that failed part-way can simply be retried.
 */

const KLAVIYO_API_BASE = "https://a.klaviyo.com/api";

/**
 * The API revision every call is pinned to. Klaviyo versions its API by date
 * and answers each call in the shape of the revision it names, so a newer
 * revision is adopted on purpose, by changing this one value.
 */
export const KLAVIYO_REVISION = "2026-10-15";

/** The JSON:API media type Klaviyo's endpoints take and answer in. */
const JSON_API = "application/vnd.api+json";

/**
 * Five seconds per call, then give up: a visitor's pending button is waiting
 * on the answer, and a hung Klaviyo would otherwise hold it until the
 * platform's own limit.
 */
const REQUEST_TIMEOUT_MS = 5_000;

function getApiKey(): string {
  const key = process.env.KLAVIYO_PRIVATE_API_KEY;
  if (!key) {
    throw new Error("Missing KLAVIYO_PRIVATE_API_KEY environment variable");
  }
  return key;
}

/**
 * Each error's `code` and `title` from a Klaviyo error body — stable labels,
 * never the visitor's words. Its `detail`, `source` and `meta` are free text
 * that can quote the address it refused, so they are never read.
 */
function errorLabels(answer: unknown): string[] {
  const errors = isRecord(answer) ? answer.errors : undefined;
  if (!Array.isArray(errors)) return [];
  return errors.map((error: unknown) => `${label(error, "code")}: ${label(error, "title")}`);
}

function label(error: unknown, name: "code" | "title"): string {
  const value = isRecord(error) ? error[name] : undefined;
  return typeof value === "string" ? value : "?";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * One call to Klaviyo's API, resolving on any 2xx, and aborted after
 * `REQUEST_TIMEOUT_MS`. Any other answer is logged as its HTTP status and each
 * error's code and title — nothing Klaviyo writes in free text — and thrown as
 * a fixed message naming the call and the status. The bodies of the calls made
 * here are never otherwise read, since nothing is read back.
 */
async function klaviyoPost(path: string, body: unknown): Promise<void> {
  const response = await fetch(`${KLAVIYO_API_BASE}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Klaviyo-API-Key ${getApiKey()}`,
      revision: KLAVIYO_REVISION,
      "Content-Type": JSON_API,
      Accept: JSON_API,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    const answer: unknown = await response.json().catch(() => null);
    console.error("Klaviyo API error:", path, response.status, errorLabels(answer).join("; "));
    throw new Error(`Klaviyo ${path} answered ${response.status}`);
  }
}

interface KlaviyoProfile {
  email: string;
  /** Sent only when given: an omitted attribute leaves the stored one as it is. */
  firstName?: string;
  lastName?: string;
  /** The language the reader signed up in, as Klaviyo's own `locale` attribute. */
  locale: string;
  /** Custom profile properties, merged into the profile's own. */
  properties: Record<string, string>;
}

/**
 * Create the profile for `email`, or update the one Klaviyo already holds
 * (201 and 200, alike here). It sets attributes only — subscribing is a
 * separate call — and leaves every attribute it is not sent untouched.
 */
export async function upsertKlaviyoProfile(profile: KlaviyoProfile): Promise<void> {
  await klaviyoPost("/profile-import", {
    data: {
      type: "profile",
      attributes: {
        email: profile.email,
        ...(profile.firstName === undefined ? {} : { first_name: profile.firstName }),
        ...(profile.lastName === undefined ? {} : { last_name: profile.lastName }),
        locale: profile.locale,
        properties: profile.properties,
      },
    },
  });
}

interface KlaviyoListSubscription {
  email: string;
  listId: string;
  /** Recorded on the consent record: where the reader gave it. */
  customSource: string;
}

/**
 * Subscribe `email` to email marketing and to the list. Klaviyo queues the job
 * and answers 202. On a single opt-in list the address is subscribed at once
 * with no confirmation mail, and an address that had unsubscribed is
 * subscribed again: the call lifts its suppression.
 */
export async function subscribeKlaviyoProfile(
  subscription: KlaviyoListSubscription,
): Promise<void> {
  await klaviyoPost("/profile-subscription-bulk-create-jobs", {
    data: {
      type: "profile-subscription-bulk-create-job",
      attributes: {
        custom_source: subscription.customSource,
        profiles: {
          data: [
            {
              type: "profile",
              attributes: {
                email: subscription.email,
                subscriptions: { email: { marketing: { consent: "SUBSCRIBED" } } },
              },
            },
          ],
        },
      },
      relationships: {
        list: { data: { type: "list", id: subscription.listId } },
      },
    },
  });
}
