/**
 * UTM attribution — where a family came from when they created an account.
 *
 * A marketing link carries up to five standard UTM parameters
 * (`/roblox?utm_source=lynx&utm_medium=email&utm_campaign=lynx-summer-a`, plus
 * `utm_content` and `utm_term` where the link's maker set them). The
 * proxy reads and sanitises them. Under marketing consent it keeps them in the
 * first-party `sog_attribution` cookie, which holds the latest tag this browser
 * arrived with for 30 days, so it survives the full reload of a sign-up or
 * sign-in and the end of the visit. Without consent yet, the proxy hands them
 * to the root layout on the `x-utm` request header and a client context
 * provider holds them for the document's life, for the consent banner to write
 * the cookie if marketing is accepted. Every server route that stores
 * attribution reads the cookie off its own request. At registration the values
 * travel in the new user's auth metadata and the profile-creation trigger
 * writes them to `profiles.utm_source`, `profiles.utm_medium`,
 * `profiles.utm_campaign`, `profiles.utm_content` and `profiles.utm_term`.
 * Those columns are first touch for the account, since they are written once;
 * the cookie is last touch.
 *
 * Values are invented ad hoc by whoever makes the link; there is no registry of
 * valid ones, and validating against one was considered and turned down.
 * Whoever reads this data filters for the values they issued, so junk rows are
 * noise they never query.
 *
 * **The transport has a byte budget and drops rather than truncates.** The
 * serialised value is capped at `UTM_HEADER_MAX_LENGTH`; over that, the proxy
 * sets no header and no cookie, and the visit carries no attribution. See that
 * constant for why a per-field cap is not enough on its own and why dropping is
 * the only safe answer.
 *
 * **The partner convention: a campaign issued to or for a partner is prefixed
 * with the partner's slug and a hyphen** — `lynx-summer-a`, `rblx-launch`. This
 * cannot be retrofitted, because the value is immutable on a profile once
 * written, and it is the only thing that lets a partner's campaigns be picked
 * out of the set without a hand-kept mapping. The sanitiser does not enforce
 * it, but for Lynx it is load-bearing: the partner API's `/campaigns` counts
 * only campaigns carrying the `lynx-` prefix, so a link issued without it is
 * never counted.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS LOAD-BEARING FOR THE LEGAL POSITION
 * ---------------------------------------------------------------------------
 *
 * Each of these looks like an arbitrary limitation from the inside, so they are
 * written down here, next to the module both ends of the feature import.
 * Changing any one of them is not a refactor — it needs a fresh legal review
 * before it ships.
 *
 *  1. **Reading the value off the URL is unavoidable, and it happens before any
 *     consent is given.** An earlier version of this comment claimed the
 *     opposite of what is true: that keeping the value off the visitor's device
 *     kept the processing out of ePrivacy scope. It does not. EDPB *Guidelines
 *     2/2023 on the technical scope of Art. 5(3)* §3.1 treats a URL tracking
 *     parameter as engaging Art 5(3) on two independent limbs — ¶50 reads
 *     distributing the tracked link as storage "at the very least through the
 *     caching mechanism of the client-side software", and ¶51 reads appending
 *     the parameter as "an instruction to the terminal equipment to send back
 *     the targeted information". Article 5(3) is storage *or* access, so
 *     nothing about where we keep the value answers it, and moving the read
 *     server-side does not either: the proxy reading the query string **is**
 *     the ¶51 access, and it happens on the landing request, before a banner
 *     could have been answered. So nothing here claims the read is covered by
 *     consent. What the banner decides for this feature is what happens after
 *     the read: whether the tag is kept on the device, and whether it is
 *     stored (point 2).
 *  2. **The tag is kept on the device, and stored at account creation, only
 *     when the visitor's consent cookie carries marketing consent.** Counsel has
 *     answered, on both
 *     sides: SOG's in August 2026 and Lynx's on 2026-09-14 both read the UTM
 *     parameters on a landing link as tracking that needs consent, and Lynx's
 *     places it under **marketing** consent rather than analytics. So a parent
 *     who rejected the banner, or chose analytics only, or never answered it,
 *     creates an account with all five columns NULL — a partner's numbers
 *     cover the families who agreed to be counted, not every family, and that
 *     is the accepted cost.
 *
 *     What is gated is the **write**, not the read. The values still ride the
 *     visit in memory, because by point 1 the read has already happened on the
 *     landing request, before any answer could exist; persisting them is the
 *     part consent can still decide. The gate on a stored value is
 *     {@link utmMetadataForConsent}, which is the only exported way to build
 *     the signup metadata, and it is applied **on the server**, from the
 *     consent cookie the request itself carried — never from a flag a client
 *     sends, since a client can send whatever it likes.
 *
 *     **What is stored on the device.** Under marketing consent, and only
 *     then, the browser holds a first-party cookie, `sog_attribution`, carrying
 *     the five values of the latest tagged link for 30 days. It is not
 *     httpOnly, because the banner writes it from client code, so scripts in
 *     the page can read it. The proxy writes it when a landing request already
 *     carries the consent; the banner writes it from the in-memory tag when
 *     marketing is accepted mid-visit. A later tagged link overwrites it, and
 *     a link with no tag leaves it. Withdrawing marketing deletes it with the
 *     advertising cookies, and a document where marketing is not granted
 *     deletes it on mount. A refusal never writes it. The server gate above
 *     still applies when it is read, so a cookie that outlived its consent
 *     stores nothing.
 *
 *     **The same gate covers every other write of them.** A landing page's
 *     email sign-up passes them to Klaviyo as profile properties, through
 *     {@link utmMetadataForConsent} and the request's own consent cookie,
 *     exactly as a registration stores them. The Klaviyo account sync copies
 *     only what is stored on the parent's profile, so it carries a value
 *     exactly when this gate let one be written, and never reads the visit.
 *
 *     **Rows written before this change are untouched.** Nothing is
 *     re-examined, cleared or backfilled; the ruling decides what is written
 *     from now on.
 *  3. **Gamer accounts never carry a value.** Reporting treats a gamer and
 *     their parent as one family unit, so a join through the existing parent
 *     relationship answers "which campaign brought this family" without copying
 *     a marketing attribute onto a child's record. Gamer rows keep all five
 *     columns NULL by construction: the gamer-creation route passes only name
 *     fields in metadata. Nor does a signed-in gamer's browsing write the
 *     attribution cookie: the proxy and the banner both skip it for a gamer, or
 *     for a session whose role could not be read. A cookie a parent left on a
 *     shared device stays where it is, and no route a gamer can reach reads it.
 *  4. **The values are write-once.** There is deliberately no UPDATE grant on
 *     any of the five columns, so nobody but `service_role` can alter or clear
 *     them after account creation — an admin included, since an admin is also
 *     the `authenticated` DB role. That is what lets us refuse a client-side
 *     write path.
 *  5. **A stored value may be used to segment parents and tailor the
 *     marketing sent to them.** The Klaviyo account sync sends it alongside the
 *     parent's family, purchases and the page they set out from at signup, and
 *     the privacy policy says so: the tag is collected to tailor the emails we
 *     send, and it reaches Klaviyo with the rest of the account's profile. That
 *     disclosure and point 2's gate are what the use rests on, so a value
 *     written without marketing consent is never one this use can reach.
 *  6. **It never decides what anyone is offered or charged inside Sogverse.**
 *     Tailoring is choosing which marketing a parent receives; a price, a
 *     seat, an eligibility or a page's content that varied with the tag would
 *     be a different use, undisclosed, and point 7's problem besides. Device
 *     and browsing data never join it: the sync sends what a parent did in
 *     their account, not how they moved through the site.
 *  7. **Labels, not credentials.** The moment a campaign value confers access, a
 *     discount or priority, it stops being a label and becomes a credential — a
 *     different thing legally, and a worse thing to have travelling in public
 *     links that get forwarded and screenshotted.
 */

// The consent module is pure string work with no imports, so it is as safe in
// the proxy as this file is: the proxy is not a Node runtime.
import { cookieValueFromHeader, type ConsentState } from "./consent";

/**
 * The five attribution fields in the order a campaign link spells them, for
 * every place that walks them, so no loop can quietly skip one.
 */
export const UTM_FIELDS = ["source", "medium", "campaign", "content", "term"] as const;

/** One attribution field, named as it is everywhere but the query string. */
export type UtmField = (typeof UTM_FIELDS)[number];

/** The five query params a marketing link carries, keyed by the field they fill. */
export const UTM_QUERY_PARAMS = {
  source: "utm_source",
  medium: "utm_medium",
  campaign: "utm_campaign",
  content: "utm_content",
  term: "utm_term",
} as const satisfies Record<UtmField, string>;

/** The raw, unsanitised fields a consent gate may be handed. */
export type UtmInput = Partial<Record<UtmField, string>>;

/**
 * The request header the proxy sets for the root layout to read. A root layout
 * cannot receive `searchParams` (only pages can) and `useSearchParams()` in a
 * client provider at the root would put the whole app under a `<Suspense>`
 * boundary whose *fallback* is what gets prerendered — so the header is the
 * mechanism.
 *
 * **One header carrying a `URLSearchParams` string**, not five headers holding
 * raw values. A sanitised value may legitimately contain anything but a control
 * character — a Meta macro expands to an ad name with spaces and accents in it
 * — and a raw non-ASCII header value is not something every hop between the
 * proxy and the layout is obliged to carry intact. Percent-encoding through
 * `URLSearchParams` makes the transport ASCII by construction, and one header
 * keeps the five fields arriving or not arriving together.
 */
export const UTM_HEADER = "x-utm";

/**
 * The most bytes the serialised header value may run to before the proxy
 * declines to set it at all.
 *
 * Five sanitised fields cap at 200 code points each, but percent-encoding is
 * what actually decides the length: a campaign of 200 astral-plane characters
 * expands to roughly 2,400 bytes on its own, and two of those would already push
 * one header past the ~4 KB per-header ceiling every proxy and serverless runtime
 * in the path enforces in its own way — some by rejecting the request, some by
 * truncating the value, some by dropping the header. A request that 502s
 * because of a query string a stranger controls is a denial-of-service with no
 * upside, so the budget is enforced here, where we can choose what happens.
 *
 * **Over budget means the header is not set — attribution is dropped, never
 * truncated.** A truncated campaign is a *different* campaign, and would
 * attribute a family to an outreach that did not bring them, which is the same
 * reasoning that makes `sanitiseUtmValue` refuse rather than shorten.
 *
 * 2048 is comfortably above anything a real link produces and comfortably below
 * every ceiling in the path. A long Meta ad name expands to a few hundred bytes,
 * and even all five fields at their full 200 plain-ASCII characters serialise to
 * about 1,050 — the budget only bites on values dense with heavily encoded
 * characters, which no real link carries.
 */
export const UTM_HEADER_MAX_LENGTH = 2048;

/**
 * The first-party cookie that keeps the latest tag this browser arrived with.
 * Its value is exactly what {@link serialiseUtm} produced, so it is held to the
 * same budget, and it is read back through {@link utmFromCookieHeader}.
 */
export const UTM_COOKIE_NAME = "sog_attribution";

/**
 * Thirty days, in seconds. A tag older than that no longer says what brought
 * somebody here.
 */
export const UTM_COOKIE_MAX_AGE_SECONDS = 30 * 24 * 60 * 60;

/**
 * Attributes for the proxy's write, matching what `setCookie` writes in the
 * browser so the two land on one cookie. Host-only, which is what the
 * `deleteCookie` sweep expects. Not httpOnly: the banner has to write it from
 * client code. `secure` follows the environment, as the app's other server
 * writes do.
 */
export function utmCookieOptions() {
  return {
    path: "/",
    maxAge: UTM_COOKIE_MAX_AGE_SECONDS,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    httpOnly: false,
  } as const;
}

/** The five fields, each present or explicitly absent. */
export interface UtmAttribution {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  content: string | null;
  term: string | null;
}

/** Build an attribution by resolving each field in turn. */
function mapUtmFields(resolve: (field: UtmField) => string | null): UtmAttribution {
  return {
    source: resolve("source"),
    medium: resolve("medium"),
    campaign: resolve("campaign"),
    content: resolve("content"),
    term: resolve("term"),
  };
}

/** Nothing at all — the common case, and the shape every absent path returns. */
export const NO_UTM_ATTRIBUTION: UtmAttribution = {
  source: null,
  medium: null,
  campaign: null,
  content: null,
  term: null,
};

/** Attribution is present when at least one of the five fields survived. */
export function hasUtmAttribution(utm: UtmAttribution): boolean {
  return UTM_FIELDS.some((field) => utm[field] !== null);
}

/**
 * Characters no stored value may contain, anywhere: the Unicode `Cc` category
 * (C0 `U+0000`–`U+001F`, `U+007F`, and C1 `U+0080`–`U+009F`). A newline inside a
 * campaign name breaks the CSV row it is later exported in, and a control
 * character in a value we did not author has no legitimate meaning.
 */
const UTM_CONTROL_CHARACTER = /\p{Cc}/u;

/**
 * The characters a spreadsheet reads as the start of a formula. A cell opening
 * with any of them executes when the file is opened, which is why they are
 * refused outright rather than escaped: these values reach Lynx in a CSV export
 * **we do not control**, so there is no downstream escaping we can rely on, and
 * an unattributed account is strictly better than a payload in a partner's
 * spreadsheet.
 *
 * Tab and carriage return are on the list as belt and braces, not because
 * anything needs them: both are control characters, so the rule above already
 * refuses a value containing one anywhere, on both sides — `[[:cntrl:]]` in the
 * trigger and the five column CHECKs, `\p{Cc}` here. The SQL copy names them in
 * its own lead-character list for the same redundant-by-design reason. Neither
 * entry is reachable, and both are kept because a lead-character rule that
 * silently depends on a *different* rule catching two of its members is one
 * edit away from being wrong.
 *
 * The accepted cost: a campaign genuinely named `-summer` cannot be stored. Name
 * it `summer` instead.
 */
const UTM_FORMULA_LEAD = /^[=+\-@\t\r]/;

/** The longest value we will store. Long enough for an expanded Meta ad name. */
const UTM_MAX_LENGTH = 200;

/**
 * Normalise one raw UTM value, or refuse it.
 *
 * Trims, then tests. **Case is preserved deliberately** — Vercel reports UTM
 * values case-sensitively, so folding here would make our per-account numbers
 * disagree with the traffic numbers they are read beside, and `Summer_Sale`
 * would silently merge into `summer_sale` on our side only. Everything else
 * that is not a control character or a formula lead is accepted verbatim:
 * spaces, dots, plus signs, uppercase, accents, and whatever a Meta or TikTok
 * macro expanded to.
 *
 * **Takes a scalar, never an array, and collapsing a repeated param is the
 * caller's job.** `URLSearchParams.getAll()` returns an array for the ordinary
 * single case too (`["lynx"]`), so a sanitiser that nulled every array input
 * would null *everything* and the feature would silently never work. Do not
 * copy the shape `resolveInternalPath` uses for the same problem — it takes the
 * *first* entry, which is right for a redirect target (there is a sensible
 * fallback) and wrong for an attribution value (there is not).
 *
 * A failed value returns `null` — never a partial or truncated one. A truncated
 * campaign is a different campaign, and would attribute a family to an outreach
 * that did not bring them.
 *
 * The same four rules are mirrored in the profile-creation trigger and, as a
 * backstop, in the five column CHECKs. Three deliberate divergences, every one
 * of them fail-closed on the database side:
 *
 *  1. The trigger's `btrim` strips spaces only, where `String.trim()` strips the
 *     full Unicode whitespace set — so a tab-padded value degrades to NULL in
 *     the database instead of being accepted.
 *  2. The trigger tests `[[:cntrl:]]` against the **untrimmed** raw value, where
 *     this tests the trimmed one. Unreachable through the app, since a value
 *     carrying a control character anywhere is refused here before it could
 *     reach a route: it only matters for a hypothetical direct write, and it
 *     refuses more than this does.
 *  3. The length comparison below counts code points, matching `char_length()`,
 *     rather than UTF-16 code units.
 *
 * Pure string and regex work only, no Node APIs — the proxy runs this and is not
 * a Node runtime.
 */
export function sanitiseUtmValue(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  // `String.length` is never below the code-point count, so a value short by
  // code units is short by characters too and the second count never runs.
  if (trimmed.length > UTM_MAX_LENGTH && Array.from(trimmed).length > UTM_MAX_LENGTH) {
    return null;
  }
  if (UTM_CONTROL_CHARACTER.test(trimmed)) return null;
  if (UTM_FORMULA_LEAD.test(trimmed)) return null;
  return trimmed;
}

/**
 * Read the five params off a landing URL's query string.
 *
 * `.getAll()` rather than `.get()`: a repeated `?utm_campaign=a&utm_campaign=b`
 * is not a campaign and must resolve to absent for that field, and `.get()`
 * would silently hand back the first value — which is how
 * `?utm_campaign=good&utm_campaign=<junk>` would become a stored `good`. The
 * fields are independent, so a repeated `utm_source` nulls the source and
 * leaves a well-formed campaign standing.
 */
export function readUtmFromSearchParams(params: URLSearchParams): UtmAttribution {
  const readOne = (param: string): string | null => {
    const values = params.getAll(param);
    return values.length === 1 ? sanitiseUtmValue(values[0]) : null;
  };

  return mapUtmFields((field) => readOne(UTM_QUERY_PARAMS[field]));
}

/**
 * The `x-utm` header and `sog_attribution` cookie value for an attribution, or
 * `null` when there is nothing to send. Only the fields that survived appear, so
 * a value that is present is always a value carrying something.
 *
 * Returns `null` too when the encoded value would exceed
 * {@link UTM_HEADER_MAX_LENGTH} — the whole attribution is dropped rather than
 * cut down, for the reason stated there. The check lives here rather than at
 * the one call site so no future caller can serialise past the budget.
 *
 * The length is measured on the percent-encoded string, which is ASCII by
 * construction, so code units, code points and bytes are all the same number.
 */
export function serialiseUtm(utm: UtmAttribution): string | null {
  if (!hasUtmAttribution(utm)) return null;

  const params = new URLSearchParams();
  for (const field of UTM_FIELDS) {
    const value = utm[field];
    if (value !== null) params.set(field, value);
  }
  const encoded = params.toString();
  return encoded.length > UTM_HEADER_MAX_LENGTH ? null : encoded;
}

/**
 * The signup-metadata object a registration route would hand to
 * `admin.auth.admin.createUser`, built from (unsanitised) attribution values.
 *
 * **Not exported, and that is the mechanism.** Every caller goes through
 * {@link utmMetadataForConsent}, so there is no way to build this payload
 * without stating what the visitor consented to — the consent gate cannot be
 * forgotten at a call site because no call site can reach this function.
 *
 * **A field that does not survive is omitted entirely, not sent as null**, so
 * the column simply stays NULL and the metadata a future reader inspects says
 * only what was actually true. The keys are the query-param names deliberately:
 * one vocabulary from the link a family clicked, through the metadata, to the
 * column, so nobody has to hold a translation in their head at any hop.
 *
 * Lives here rather than in either route because both routes need it and both
 * feed the same trigger; a second copy is how the two would come to disagree
 * about a key name, which fails silently with the column always NULL.
 */
function buildUtmMetadata(utm: UtmInput | undefined): Record<string, string> {
  const metadata: Record<string, string> = {};
  if (utm === undefined) return metadata;

  for (const field of UTM_FIELDS) {
    const value = sanitiseUtmValue(utm[field]);
    if (value !== null) metadata[UTM_QUERY_PARAMS[field]] = value;
  }

  return metadata;
}

/**
 * The signup metadata for a registration, **or nothing at all when the visitor
 * did not consent to marketing**.
 *
 * The one exported way to build the payload, and the single greppable home of
 * the rule in point 2 of this module's header: the five `profiles.utm_*`
 * columns are written at account creation only for a visitor whose stored
 * consent answer grants the marketing purpose. Anything else — no cookie at
 * all, a cookie from a superseded version of the question, a refusal, or
 * analytics-only — produces an empty object, every key is omitted, and the
 * columns stay NULL.
 *
 * **Takes the parsed answer, not the raw header**, so this module stays free of
 * any cookie handling and the caller keeps one obligation it cannot fake: read
 * the cookie off the request it is answering, server-side
 * (`parseConsentCookieHeader`), rather than believe a field in the body.
 *
 * `null` is every "no answer we can act on" collapsed into one, exactly as the
 * consent parser returns it, and it is refused like a refusal — an unanswered
 * banner is not consent.
 */
export function utmMetadataForConsent(
  consent: ConsentState | null,
  utm: UtmInput | undefined,
): Record<string, string> {
  if (consent?.marketing !== true) return {};
  return buildUtmMetadata(utm);
}

/**
 * An attribution as {@link UtmInput}: every field that is present, every absent
 * one omitted.
 */
export function utmRegistrationBody(utm: UtmAttribution): UtmInput {
  const body: UtmInput = {};
  for (const field of UTM_FIELDS) {
    const value = utm[field];
    if (value !== null) body[field] = value;
  }
  return body;
}

/**
 * Read a serialised value back: the `x-utm` header on the server side of the
 * layout, and the decoded attribution cookie.
 *
 * Re-sanitises every field rather than trusting the string it was handed. The
 * proxy deletes any incoming `x-utm` before setting its own, so a forged header
 * cannot reach here, though a cookie is the browser's to edit — and running the
 * sanitiser again is what makes "the value always came through our own
 * sanitiser" a fact about this code rather than a fact about the call order of
 * two files.
 *
 * `.getAll()` and a repeated key nulls that field, exactly as on the query-string
 * side. Serialising never produces a repeat, so this only ever fires on a value
 * that did not come from `serialiseUtm` — which is the case the re-sanitise
 * exists for, and it should behave the same way at both ends rather than
 * quietly taking the first entry here and refusing it there.
 */
export function parseUtmHeader(raw: string | null | undefined): UtmAttribution {
  if (typeof raw !== "string" || raw.length === 0) return NO_UTM_ATTRIBUTION;

  const params = new URLSearchParams(raw);
  const readOne = (key: string): string | null => {
    const values = params.getAll(key);
    return values.length === 1 ? sanitiseUtmValue(values[0]) : null;
  };

  return mapUtmFields(readOne);
}

/**
 * The attribution a request's `Cookie` header carries, for a server route to
 * pass through {@link utmMetadataForConsent} with that same request's consent:
 * a cookie outliving its consent reads as nothing there. `{}` for a header
 * without the cookie, and for a value that is not percent-encoded text, which
 * only a hand-edited cookie can be.
 *
 * Both writers percent-encode the serialised value once more on its way into
 * the cookie, so it is decoded here before it is parsed.
 */
export function utmFromCookieHeader(cookieHeader: string | null): UtmInput {
  const raw = cookieValueFromHeader(cookieHeader, UTM_COOKIE_NAME);
  if (raw === undefined) return {};
  try {
    return utmRegistrationBody(parseUtmHeader(decodeURIComponent(raw)));
  } catch {
    return {};
  }
}
