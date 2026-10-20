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

function getApiKey(): string {
  const key = process.env.KLAVIYO_PRIVATE_API_KEY;
  if (!key) {
    throw new Error("Missing KLAVIYO_PRIVATE_API_KEY environment variable");
  }
  return key;
}

/**
 * One call to Klaviyo's API, resolving on any 2xx. Any other answer is logged
 * with Klaviyo's own body and thrown; the bodies of the calls made here are
 * never read, since nothing is read back.
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
  });

  if (!response.ok) {
    const answer = await response.json().catch(() => ({}));
    console.error(
      "Klaviyo API error:",
      response.status,
      response.statusText,
      JSON.stringify(answer),
    );
    const detail: unknown = answer?.errors?.[0]?.detail;
    throw new Error(
      typeof detail === "string" && detail !== ""
        ? detail
        : `Klaviyo API error: ${response.status} ${response.statusText}`,
    );
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
