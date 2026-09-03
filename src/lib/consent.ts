/**
 * Cookie consent: the stored answer, and what each answer switches on.
 *
 * Isomorphic and React-free on purpose — the server reads the same cookie the
 * browser writes (`consent.server.ts` is the thin `cookies()` wrapper), and the
 * register API route has to read a decision without mounting anything.
 *
 * **Two purposes, three answers.** `analytics` covers Vercel Web Analytics and
 * Speed Insights; `marketing` covers the Meta and TikTok pixels. Marketing
 * without analytics is deliberately not offered — it would be a fourth button
 * answering a question nobody asks, and the two ad pixels already report a
 * superset of what the analytics pair does.
 */

/** The cookie that remembers the answer. Named like `sog_pin_verified`. */
export const CONSENT_COOKIE_NAME = "sog_consent";

/**
 * The shape version stored in the cookie's `v` field.
 *
 * A cookie carrying any other version is treated as *unanswered*, so the banner
 * asks again. That is the point of storing it: the day the purposes change, an
 * answer given to the old question is not an answer to the new one, and
 * silently re-using it would be consent we never collected.
 *
 * **The advertising platforms are named in the privacy policy, not in the
 * strip** — the policy is where recipients are identified and it is the thing
 * carrying a last-updated date. So adding one is a policy edit *plus* a bump
 * here: a new recipient is a new consent, and everyone who answered the old
 * question is asked again.
 */
export const CONSENT_VERSION = 1;

/**
 * Six months, in seconds.
 *
 * The CNIL's guidance is that the choice — consent *or* refusal — is kept no
 * longer than six months, after which the question may be put again. Keeping a
 * refusal is the half people forget: without it, a visitor who said no is asked
 * again on their next visit, which is how a banner becomes a nag.
 */
export const CONSENT_MAX_AGE_SECONDS = 180 * 24 * 60 * 60;

/**
 * A short-lived marker cookie saying "the thing that just happened was a
 * registration", read once by the marketing pixels and then deleted.
 *
 * It exists because the conversion happens on the server (the register route)
 * and has to be reported by a script in the browser, on whatever page the
 * browser lands on next. The route sets it only when the request's consent
 * cookie already says marketing is allowed, so an un-consented registration
 * leaves no marker at all rather than one nothing is allowed to read.
 */
export const CONVERSION_COOKIE_NAME = "sog_conversion";

/** The one value `sog_conversion` can carry today. */
export const REGISTRATION_CONVERSION = "registration";

/**
 * Five minutes. Long enough to survive the redirect out of registration and
 * the page load that follows it, short enough that a marker nobody read cannot
 * attach itself to some unrelated visit tomorrow.
 */
export const CONVERSION_COOKIE_MAX_AGE_SECONDS = 300;

/**
 * The cookies Meta's and TikTok's pixels set, cleared when a granted purpose is
 * taken away again. Not ours, which is exactly why they are named here: a
 * script that has already run keeps whatever it wrote until something removes
 * it.
 *
 * `_fbp` and `_fbc` are Meta's browser and click identifiers; `_ttp` is
 * TikTok's, and `_tt_enable_cookie` is the flag its library reads to decide
 * whether it may write `_ttp` at all — leaving that one behind is how a
 * withdrawal quietly re-arms itself on the next visit.
 */
export const PIXEL_COOKIE_NAMES = [
  "_fbp",
  "_fbc",
  "_ttp",
  "_tt_enable_cookie",
] as const;

/**
 * Whether `pathname` sits under any of `prefixes`.
 *
 * A plain prefix test, not an exact-or-slash one, and deliberately: this only
 * ever decides whether an optional third-party script is *withheld*, so a
 * prefix that catches one route too many withholds a pixel that would have been
 * allowed, and a stricter test that catches one too few loads a script on a
 * surface somebody meant to keep clear. Between those two, over-matching is the
 * error to make.
 */
export function matchesPathPrefix(
  pathname: string,
  prefixes: readonly string[],
): boolean {
  return prefixes.some((prefix) => pathname.startsWith(prefix));
}

/** The three buttons, in the order the banner offers them. */
export type ConsentChoice =
  | "reject_all"
  | "analytics_only"
  | "analytics_and_marketing";

/** What a stored answer says, once parsed. */
export interface ConsentState {
  /** Vercel Web Analytics and Speed Insights. */
  analytics: boolean;
  /** The Meta and TikTok pixels. */
  marketing: boolean;
  /** When the answer was given, ISO-8601. Stored so a refusal can age out. */
  decidedAt: string;
}

/** The purposes each button grants. */
export function purposesForChoice(
  choice: ConsentChoice,
): Pick<ConsentState, "analytics" | "marketing"> {
  switch (choice) {
    case "reject_all":
      return { analytics: false, marketing: false };
    case "analytics_only":
      return { analytics: true, marketing: false };
    case "analytics_and_marketing":
      return { analytics: true, marketing: true };
  }
}

/** Builds the state a choice made *now* stores. */
export function consentForChoice(
  choice: ConsentChoice,
  decidedAt: Date = new Date(),
): ConsentState {
  return { ...purposesForChoice(choice), decidedAt: decidedAt.toISOString() };
}

/**
 * True when `next` takes away a purpose `previous` had granted.
 *
 * The asymmetry this names is the whole reason the caller reloads: granting a
 * purpose is enough to mount the scripts it covers, but revoking one cannot
 * unload a script that has already run. Only a fresh document can.
 *
 * No previous answer means nothing was ever granted, so nothing can be
 * withdrawn.
 */
export function isWithdrawal(
  previous: ConsentState | null,
  next: ConsentState,
): boolean {
  if (!previous) return false;
  return (
    (previous.analytics && !next.analytics) ||
    (previous.marketing && !next.marketing)
  );
}

/** The cookie's wire shape. Short keys — this rides on every request. */
interface ConsentCookiePayload {
  v: number;
  at: string;
  analytics: boolean;
  marketing: boolean;
}

/**
 * The JSON written into the cookie. The caller URL-encodes it — both
 * `setCookie` and Next's `cookies()` already handle that end of the round
 * trip.
 */
export function serialiseConsent(state: ConsentState): string {
  const payload: ConsentCookiePayload = {
    v: CONSENT_VERSION,
    at: state.decidedAt,
    analytics: state.analytics,
    marketing: state.marketing,
  };
  return JSON.stringify(payload);
}

function isConsentPayload(value: unknown): value is ConsentCookiePayload {
  if (typeof value !== "object" || value === null) return false;
  return (
    "v" in value &&
    typeof value.v === "number" &&
    "at" in value &&
    typeof value.at === "string" &&
    "analytics" in value &&
    typeof value.analytics === "boolean" &&
    "marketing" in value &&
    typeof value.marketing === "boolean"
  );
}

/**
 * Reads a stored answer, or `null` for *no answer we can act on* — which is
 * every failure mode collapsed into one: no cookie, a cookie from a different
 * version of the question, something that is not our JSON, or JSON missing a
 * field. All of them mean the same thing to every caller (ask again, run
 * nothing), so none of them is worth telling apart.
 *
 * Tolerates a still-encoded value as well as a decoded one. Both readers we
 * have decode already, but a cookie is user-supplied text and a `%7B` reaching
 * `JSON.parse` would read as a *refusal* rather than as a parse failure — the
 * one wrong answer that is not obviously wrong.
 */
export function parseConsentCookie(
  raw: string | undefined,
): ConsentState | null {
  if (!raw) return null;
  let text = raw;
  if (text.includes("%")) {
    try {
      text = decodeURIComponent(text);
    } catch {
      return null;
    }
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isConsentPayload(parsed)) return null;
  if (parsed.v !== CONSENT_VERSION) return null;
  return {
    analytics: parsed.analytics,
    marketing: parsed.marketing,
    decidedAt: parsed.at,
  };
}

/**
 * The stored answer, read out of a raw `Cookie` request header.
 *
 * For a route handler that receives a plain `Request` rather than a
 * `NextRequest` — the shape `defineRoute` hands its handlers — and so has no
 * parsed cookie jar of its own. Everything about *interpreting* the value stays
 * in `parseConsentCookie`; this only finds it.
 */
export function parseConsentCookieHeader(
  header: string | null,
): ConsentState | null {
  if (!header) return null;
  for (const pair of header.split(";")) {
    const separator = pair.indexOf("=");
    if (separator === -1) continue;
    if (pair.slice(0, separator).trim() !== CONSENT_COOKIE_NAME) continue;
    return parseConsentCookie(pair.slice(separator + 1).trim());
  }
  return null;
}
