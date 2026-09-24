/**
 * Cookie consent: the stored answer, and what each answer switches on.
 *
 * Isomorphic and React-free on purpose — the server reads the same cookie the
 * browser writes (`consent.server.ts` is the thin `cookies()` wrapper), and the
 * register API route has to read a decision without mounting anything.
 *
 * **Two purposes, three answers.** `analytics` covers Vercel Web Analytics and
 * Speed Insights, which count visits without a cookie and without an
 * identifier; `marketing` covers the Meta Pixel in the browser, the conversions
 * our servers report to Meta, and the Tag Manager container, which mints a
 * persistent client id and carries advertising tags. Marketing without
 * analytics is deliberately not offered — it would be a fourth button answering
 * a question nobody asks, and the advertising side already reports a superset
 * of what the analytics pair does.
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
 * **What forces a bump is the question changing, never who the answer reaches.**
 * The strip asks about *purposes* and names no platform — it says the
 * advertising platforms we work with — while the privacy policy carries the
 * dated list of recipients. So a purpose added, a purpose withdrawn, or a
 * purpose that comes to cover something a reader would not have taken it to
 * cover is a different question, an answer to the old one is not an answer to
 * it, and everyone is asked again. A further recipient *inside* a purpose that
 * already covers it is a policy edit alone: the sentence the visitor agreed to
 * is unchanged, and re-asking would put the banner back up to collect the same
 * answer to the same words.
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
 * The name prefixes the advertising scripts write their cookies under, cleared
 * when a granted purpose is taken away again. Not ours, which is exactly why
 * they are named here: a script that has already run keeps whatever it wrote
 * until something removes it.
 *
 * Meta's three are whole names. `_fbp` is the browser identifier the library
 * mints for this device, `_fbc` records the ad click that brought the visitor
 * here, and `_fbleid` is the lead-event id it writes after reporting one. All
 * three are also what a server-side report reads back off a later request, so
 * leaving one behind is how a withdrawal keeps identifying the same browser to
 * Meta from our own side.
 *
 * Google's are the reason this is a list of prefixes rather than of names. The
 * analytics client id lives in `_ga`, but the session state beside it lives in
 * `_ga_<property id>` — a name that depends on which property the container is
 * configured against and is therefore unknowable here. `_gid` is the day-scoped
 * visitor id, and `_gcl_` covers the conversion linker's family, the ad click
 * this device arrived on among them. Nothing we set ourselves begins with any
 * of these.
 */
export const ADVERTISING_COOKIE_PREFIXES = [
  "_fbp",
  "_fbc",
  "_fbleid",
  "_ga",
  "_gid",
  "_gcl_",
] as const;

/**
 * The cookies an advertising script actually left on this document, read out of
 * a `document.cookie` string.
 *
 * Reading the names back rather than expiring a fixed list is what the
 * per-property Google names force, and it costs nothing: a cookie set on the
 * registrable domain is readable from a page on a subdomain, so a withdrawal
 * sees the whole set from wherever it happens. Takes the string rather than
 * reaching for `document`, which keeps this module isomorphic and the rule
 * testable.
 */
export function advertisingCookieNames(cookies: string): string[] {
  const doomed: string[] = [];
  for (const pair of cookies.split(";")) {
    const separator = pair.indexOf("=");
    const name = (separator === -1 ? pair : pair.slice(0, separator)).trim();
    if (name === "") continue;
    if (!ADVERTISING_COOKIE_PREFIXES.some((prefix) => name.startsWith(prefix))) {
      continue;
    }
    doomed.push(name);
  }
  return doomed;
}

/**
 * What Meta's library keeps in `localStorage`, removed on withdrawal beside the
 * cookies above.
 *
 * Easy to miss, and the reason it matters is that it is *not* a cookie: clearing
 * `_fbp` while `multiFbc` still holds the click ids, and the library's own
 * `fbevents^$…` and `pixel_mutex:…` entries still hold its state, leaves the
 * device re-identifiable the moment the pixel is allowed to run again. The
 * prefixes are matched rather than listed because the library appends a pixel id
 * and a purpose to each key.
 */
const PIXEL_STORAGE_KEYS = ["multiFbc"] as const;
const PIXEL_STORAGE_PREFIXES = ["fbevents^$", "pixel_mutex:"] as const;

/**
 * Remove everything Meta's library has stored in the given `Storage`.
 *
 * Takes the storage rather than reaching for `window`, which keeps it testable
 * and keeps this module isomorphic. The caller owns the failure: reading
 * `window.localStorage` throws outright where site data is blocked, so the one
 * call site wraps both the access and this call.
 */
export function clearPixelStorage(storage: Storage): void {
  const doomed: string[] = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (key === null) continue;
    if (
      (PIXEL_STORAGE_KEYS as readonly string[]).includes(key) ||
      PIXEL_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))
    ) {
      doomed.push(key);
    }
  }
  // Collected first, removed after: removing while walking the index shifts
  // every key after it down one and skips the next match.
  for (const key of doomed) storage.removeItem(key);
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
  /**
   * The Meta Pixel, the conversions our servers report to Meta, and the Tag
   * Manager container.
   */
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
 * One cookie's raw value, found in a raw `Cookie` request header.
 *
 * For a route handler that receives a plain `Request` rather than a
 * `NextRequest` — the shape `defineRoute` hands its handlers — and so has no
 * parsed cookie jar of its own. It matches on the whole name rather than by
 * substring, which is the case a `header.includes(name)` gets wrong: a cookie
 * whose name merely ends with the one being looked for.
 *
 * The value comes back exactly as it was sent, undecoded — a caller that knows
 * what it is holding decides that. `undefined` for a header without it.
 */
export function cookieValueFromHeader(
  header: string | null,
  name: string,
): string | undefined {
  if (!header) return undefined;
  for (const pair of header.split(";")) {
    const separator = pair.indexOf("=");
    if (separator === -1) continue;
    if (pair.slice(0, separator).trim() !== name) continue;
    return pair.slice(separator + 1).trim();
  }
  return undefined;
}

/**
 * The stored answer, read out of a raw `Cookie` request header. Everything about
 * *interpreting* the value stays in `parseConsentCookie`; the helper above only
 * finds it.
 */
export function parseConsentCookieHeader(
  header: string | null,
): ConsentState | null {
  return parseConsentCookie(cookieValueFromHeader(header, CONSENT_COOKIE_NAME));
}
