import "server-only";

/*
 * **Klaviyo's API, the one client.** A landing page's email sign-up writes a
 * profile and a list subscription; the parent sync (`src/lib/klaviyo-sync/`)
 * keeps every parent's profile, list memberships and events up to date and
 * deletes the profile of a parent who is gone; a parent's own settings read and
 * change their email marketing standing. The sync's only read is finding a
 * profile's Klaviyo id by its external id, which it needs to update or delete
 * the profile it wrote. Every write is idempotent, so a caller that failed
 * part-way can simply be retried.
 *
 * The private key's scopes, all of them needed: Profiles read and write,
 * Lists write, Subscriptions write, Events write, Data Privacy write.
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
 * on the sign-up's answer, and a hung Klaviyo would otherwise hold it until
 * the platform's own limit. The sync shares it, since a call that has not
 * answered in five seconds is better retried from its outbox row.
 */
const REQUEST_TIMEOUT_MS = 5_000;

const KEY_VAR = "KLAVIYO_PRIVATE_API_KEY";

/** Whether this environment has a Klaviyo key at all. */
export function isKlaviyoConfigured(): boolean {
  return (process.env[KEY_VAR]?.trim() ?? "") !== "";
}

function getApiKey(): string {
  const key = process.env[KEY_VAR];
  if (!key) {
    throw new Error(`Missing ${KEY_VAR} environment variable`);
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
 * One call to Klaviyo's API, resolving on any 2xx with the answer's JSON body
 * (null for an empty one), and aborted after `REQUEST_TIMEOUT_MS`. Any other
 * answer — a 429 included, which the caller's retry handles like any other
 * failure — is logged as the path, its HTTP status and each error's code and
 * title, nothing Klaviyo writes in free text, and thrown as a fixed message
 * carrying the same. The path is logged without its query, which can carry
 * the id being looked up.
 */
async function klaviyoCall(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<unknown> {
  const response = await fetch(`${KLAVIYO_API_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Klaviyo-API-Key ${getApiKey()}`,
      revision: KLAVIYO_REVISION,
      Accept: JSON_API,
      ...(body === undefined ? {} : { "Content-Type": JSON_API }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  const route = path.split("?")[0];
  if (!response.ok) {
    const answer: unknown = await response.json().catch(() => null);
    const labels = errorLabels(answer).join("; ");
    console.error("Klaviyo API error:", route, response.status, labels);
    throw new Error(
      `Klaviyo ${route} answered ${response.status}${labels === "" ? "" : ` (${labels})`}`,
    );
  }
  const text = await response.text().catch(() => "");
  if (text === "") return null;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/** A custom property's value: what Klaviyo can store and segment on. */
export type KlaviyoPropertyValue =
  | string
  | number
  | boolean
  | null
  | readonly string[]
  | readonly number[]
  | readonly Readonly<Record<string, string | number | boolean | null>>[];

interface KlaviyoProfile {
  /** Klaviyo's own id: given, the profile it names is the one updated. */
  id?: string;
  email: string;
  /** Sogverse's id for the person; the key the sync finds the profile by. */
  externalId?: string;
  /** Sent only when given: an omitted attribute leaves the stored one as it is. */
  firstName?: string;
  lastName?: string;
  /** E.164; `null` clears the stored number, omitted leaves it. */
  phoneNumber?: string | null;
  /** The language the person reads us in, as Klaviyo's own `locale` attribute. */
  locale?: string;
  /** ISO 3166 country code; `null` clears it, omitted leaves it. */
  country?: string | null;
  /** Custom profile properties, merged into the profile's own; `null` clears one. */
  properties: Readonly<Record<string, KlaviyoPropertyValue>>;
}

/**
 * Create the profile, or update the one Klaviyo already holds (201 and 200,
 * alike here), and answer its Klaviyo id. With `id` the named profile is
 * updated, its address included; without, Klaviyo matches on the identifiers
 * sent. It sets attributes only — subscribing is a separate call — and leaves
 * every attribute it is not sent untouched.
 */
export async function upsertKlaviyoProfile(profile: KlaviyoProfile): Promise<string | null> {
  const answer = await klaviyoCall("POST", "/profile-import", {
    data: {
      type: "profile",
      ...(profile.id === undefined ? {} : { id: profile.id }),
      attributes: {
        email: profile.email,
        ...(profile.externalId === undefined ? {} : { external_id: profile.externalId }),
        ...(profile.firstName === undefined ? {} : { first_name: profile.firstName }),
        ...(profile.lastName === undefined ? {} : { last_name: profile.lastName }),
        ...(profile.phoneNumber === undefined ? {} : { phone_number: profile.phoneNumber }),
        ...(profile.locale === undefined ? {} : { locale: profile.locale }),
        ...(profile.country === undefined ? {} : { location: { country: profile.country } }),
        properties: profile.properties,
      },
    },
  });
  return dataId(answer);
}

function dataId(answer: unknown): string | null {
  const data = isRecord(answer) ? answer.data : undefined;
  const id = isRecord(data) ? data.id : undefined;
  return typeof id === "string" ? id : null;
}

/**
 * The Klaviyo id of the profile whose external id is `externalId`, or null
 * when Klaviyo holds none. The one read: what the sync wrote is found again
 * by the key it wrote it under.
 */
export async function findKlaviyoProfileIdByExternalId(
  externalId: string,
): Promise<string | null> {
  const filter = encodeURIComponent(`equals(external_id,"${externalId}")`);
  const answer = await klaviyoCall(
    "GET",
    `/profiles?filter=${filter}&fields[profile]=external_id&page[size]=1`,
  );
  const data = isRecord(answer) ? answer.data : undefined;
  if (!Array.isArray(data)) return null;
  const first: unknown = data[0];
  const id = isRecord(first) ? first.id : undefined;
  return typeof id === "string" ? id : null;
}

/** A profile's email marketing standing, as Klaviyo holds it. */
export interface KlaviyoEmailMarketing {
  profileId: string;
  /** The address the profile holds, to tell whether it is the one being subscribed. */
  email: string | null;
  /** `SUBSCRIBED`, `UNSUBSCRIBED` or `NEVER_SUBSCRIBED`. */
  consent: string | null;
  /**
   * Any global suppression — an unsubscribe, a bounce, an invalid address, a
   * spam complaint, a hand suppression. A subscribe call lifts some of these,
   * so a caller that must respect them has to read this first.
   */
  suppressed: boolean;
  /**
   * The custom source of the consent standing now — Klaviyo stores a
   * subscribe call's `custom_source` as the profile's `custom_method_detail`,
   * and a later subscription replaces it with its own. Null when none was given.
   */
  source: string | null;
}

/**
 * The email marketing standing of the profile with this external id or this
 * address, or null when Klaviyo holds none.
 */
export async function findKlaviyoEmailMarketing(
  by: { externalId: string } | { email: string },
): Promise<KlaviyoEmailMarketing | null> {
  const condition =
    "externalId" in by ? `equals(external_id,"${by.externalId}")` : `equals(email,"${by.email}")`;
  const answer = await klaviyoCall(
    "GET",
    `/profiles?filter=${encodeURIComponent(condition)}` +
      "&additional-fields[profile]=subscriptions&page[size]=1",
  );
  const data = isRecord(answer) ? answer.data : undefined;
  const first: unknown = Array.isArray(data) ? data[0] : undefined;
  if (!isRecord(first) || typeof first.id !== "string") return null;

  const attributes = isRecord(first.attributes) ? first.attributes : {};
  const subscriptions = isRecord(attributes.subscriptions) ? attributes.subscriptions : {};
  const email = isRecord(subscriptions.email) ? subscriptions.email : {};
  const marketing = isRecord(email.marketing) ? email.marketing : {};
  const suppression = Array.isArray(marketing.suppression) ? marketing.suppression : [];
  return {
    profileId: first.id,
    email: typeof attributes.email === "string" ? attributes.email : null,
    consent: typeof marketing.consent === "string" ? marketing.consent : null,
    suppressed: marketing.can_receive_email_marketing === false || suppression.length > 0,
    source:
      typeof marketing.custom_method_detail === "string" && marketing.custom_method_detail !== ""
        ? marketing.custom_method_detail
        : null,
  };
}

/**
 * Ask Klaviyo to delete a profile and everything it holds about it — events,
 * consent and list memberships included. Klaviyo queues the job (202) and
 * deletes it shortly after; asking twice is harmless.
 */
export async function requestKlaviyoProfileDeletion(profileId: string): Promise<void> {
  await klaviyoCall("POST", "/data-privacy-deletion-jobs", {
    data: {
      type: "data-privacy-deletion-job",
      attributes: {
        profile: { data: { type: "profile", id: profileId, attributes: {} } },
      },
    },
  });
}

/**
 * Add a profile to a list, by both their Klaviyo ids (204). Membership only:
 * it subscribes nobody, and adding a profile already on the list is a no-op,
 * so it is safe to repeat on every sync.
 */
export async function addKlaviyoProfileToList(listId: string, profileId: string): Promise<void> {
  await klaviyoCall("POST", `/lists/${encodeURIComponent(listId)}/relationships/profiles`, {
    data: [{ type: "profile", id: profileId }],
  });
}

export interface KlaviyoEvent {
  /** The metric's name, which Klaviyo creates on first use. */
  metric: string;
  /** Klaviyo records one event per (profile, metric, unique id): a resend is dropped. */
  uniqueId: string;
  /** When it happened, ISO 8601. */
  time: string;
  properties: Readonly<Record<string, KlaviyoPropertyValue>>;
}

/**
 * Record one event on a profile (202: validated and queued). Email and
 * external id together name the one profile it happened to.
 */
export async function createKlaviyoEvent(
  profile: { email: string; externalId: string },
  event: KlaviyoEvent,
): Promise<void> {
  await klaviyoCall("POST", "/events", {
    data: {
      type: "event",
      attributes: {
        properties: event.properties,
        time: event.time,
        unique_id: event.uniqueId,
        metric: { data: { type: "metric", attributes: { name: event.metric } } },
        profile: {
          data: {
            type: "profile",
            attributes: { email: profile.email, external_id: profile.externalId },
          },
        },
      },
    },
  });
}

interface KlaviyoMarketingSubscription {
  email: string;
  /** The list to join too; omitted, the profile is subscribed to email marketing alone. */
  listId?: string;
  /** Recorded on the consent record: where the person gave it. */
  customSource: string;
}

/**
 * Subscribe `email` to email marketing, and to the list when one is named.
 * Klaviyo queues the job and answers 202. On a single opt-in list the address
 * is subscribed at once with no confirmation mail, and an address that had
 * unsubscribed is subscribed again: the call lifts its suppression. With no
 * list, the Klaviyo account's default opt-in setting decides whether a
 * confirmation mail goes.
 */
export async function subscribeKlaviyoProfile(
  subscription: KlaviyoMarketingSubscription,
): Promise<void> {
  await klaviyoCall("POST", "/profile-subscription-bulk-create-jobs", {
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
                subscriptions: {
                  email: { marketing: { consent: "SUBSCRIBED" } },
                },
              },
            },
          ],
        },
      },
      ...(subscription.listId === undefined
        ? {}
        : { relationships: { list: { data: { type: "list", id: subscription.listId } } } }),
    },
  });
}

/**
 * Unsubscribe `email` from email marketing altogether — no list named, so the
 * unsubscribe is global. Klaviyo queues the job and answers 202; asking twice
 * is harmless.
 */
export async function unsubscribeKlaviyoProfile(email: string): Promise<void> {
  await klaviyoCall("POST", "/profile-subscription-bulk-delete-jobs", {
    data: {
      type: "profile-subscription-bulk-delete-job",
      attributes: {
        profiles: {
          data: [
            {
              type: "profile",
              attributes: {
                email,
                subscriptions: { email: { marketing: { consent: "UNSUBSCRIBED" } } },
              },
            },
          ],
        },
      },
    },
  });
}
