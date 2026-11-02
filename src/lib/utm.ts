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
 * **The same path keeps the ad platforms' click ids.** A Meta ad appends
 * `fbclid` to the link and a Reddit ad `rdt_cid`. Each vendor's own pixel turns
 * its id into a click cookie of its own (`_fbc`, `_rdt_cid`), but only if the
 * pixel loads while the id is still in the address bar, and ours loads only
 * after marketing consent, on a marketing page with a clean query — so a parent
 * who accepts the banner a few pages later never gets one. So the proxy reads
 * each platform's id beside the tag, stamped with the landing time, and the
 * cookie keeps it on the same terms as the tag. The servers' conversion reports
 * fall back to it when the vendor's own click cookie is missing, and send each
 * platform only its own id. A click id is never stored anywhere else: not on
 * the account, not on a booking, not in Klaviyo.
 *
 * **What a landing replaces.** The cookie holds parts, and a landing replaces
 * only the parts it carries: the five tag fields are one part (a tagged link
 * replaces the whole tag, as before, and a link with no tag leaves it), and
 * each platform's click id is a part of its own (a link carrying a new `fbclid`
 * replaces the stored one, and leaves the Reddit id alone) — the same rule
 * Meta's own `_fbc` follows. A link carrying nothing writes nothing. Every part
 * carries its landing time and is read as absent 30 days after it, so a later
 * write that renews the cookie never extends an older part's life.
 *
 * A platform is added by naming it and its query param in
 * {@link CLICK_ID_QUERY_PARAMS} (the compiler holds the two together), and a
 * reporter that reads it. Google's `gclid` is not kept: no server report reads
 * it, and keeping an id nothing reads is storage without a purpose.
 *
 * Values are invented ad hoc by whoever makes the link; there is no registry of
 * valid ones, and validating against one was considered and turned down.
 * Whoever reads this data filters for the values they issued, so junk rows are
 * noise they never query.
 *
 * **The transport has a byte budget and drops rather than truncates.** The
 * serialised value is capped at `UTM_HEADER_MAX_LENGTH`; a tag over that sets
 * no header and no cookie, and the visit carries no attribution. The cookie
 * has a cap of its own, `UTM_COOKIE_MAX_LENGTH`, measured as it is written. See
 * those constants for why a per-field cap is not enough on its own, why
 * dropping is the only safe answer, and why a click id is what gives way when
 * the two have to share the room.
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
 *     the five values of the latest tagged link, and the latest Meta and Reddit
 *     click ids, each with the time it landed and each for 30 days from then.
 *     It is not httpOnly, because the banner writes it from client code, so
 *     scripts in the page can read it. The proxy writes it when a landing
 *     request already carries the consent; the banner writes it from the
 *     in-memory values when marketing is accepted mid-visit. A later tagged
 *     link overwrites the tag, a later click id from one platform overwrites
 *     that platform's, and a link carrying neither leaves the cookie alone.
 *     Withdrawing marketing deletes it with the advertising cookies, and a
 *     document where marketing is not granted deletes it on mount. A refusal
 *     never writes it. The server gate above still applies when it is read,
 *     so a cookie that outlived its consent stores nothing and reports
 *     nothing.
 *
 *     **The click ids are newer than the rulings above, and not covered by
 *     them.** Counsel ruled on the UTM parameters; keeping a platform's click
 *     id under the same gate, for that platform's conversion report, is an
 *     extension of this design that has not yet had a legal review of its own.
 *     It rides every constraint in this list exactly as the tag does, and
 *     point 8 states the one that is its own.
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
 *     shared device stays where it is. The booking and waitlist routes that
 *     read it are role-gated; the public newsletter sign-up has no session to
 *     check, so a gamer on a shared device could send a parent's tag with the
 *     address typed there.
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
 *  8. **A click id goes back to the platform that issued it, and nowhere
 *     else.** It is read off the cookie only by that platform's server
 *     conversion report, under the request's own marketing consent, and is
 *     what the vendor's own click cookie would have carried had its pixel been
 *     loaded in time. It is never written to an account, a booking or Klaviyo,
 *     never shown, and never sent to another platform: the Meta id reaches
 *     only Meta, the Reddit id only Reddit.
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
 * keeps the five fields arriving or not arriving together. The click ids ride
 * the same header, in the same format the cookie keeps
 * ({@link serialiseAttribution}).
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
 *
 * **The click ids share the budget, and they are what gives way.** The tag is
 * measured first, on its own, exactly as it always was: over budget, nothing is
 * sent. Each click id is then added only if the whole still fits, and one that
 * does not is dropped while the tag stands — so however long an `fbclid` runs,
 * it can never cost a parent their tag. The cost runs the other way only for a
 * tag already near the budget, which no real link produces. A click id is
 * plain ASCII from a short alphabet that percent-encoding leaves as it is, so
 * at its cap ({@link sanitiseClickId}) with its key and landing time it costs
 * a little over 420 bytes, and two of them beside a full plain-ASCII tag still
 * fit — in the cookie too, where encoding the separators costs a few bytes
 * more. Raising the budget to make room for them instead would only move it
 * closer to the ceilings it exists to keep clear of, which did not move.
 */
export const UTM_HEADER_MAX_LENGTH = 2048;

/**
 * The first-party cookie that keeps the latest tag and click ids this browser
 * arrived with. Built by {@link attributionCookieAfterLanding}, and read back
 * through {@link utmFromCookieHeader} and {@link clickIdFromCookieHeader}.
 */
export const UTM_COOKIE_NAME = "sog_attribution";

/**
 * The most bytes the cookie's value may run to as it goes on the wire.
 *
 * {@link UTM_HEADER_MAX_LENGTH} does not cover it: both writers percent-encode
 * the serialised value once more, so a value inside that budget can reach about
 * 4 KB. The cookie then rides every request for 30 days beside the session's own
 * chunks, and a stranger's crafted link could hold that browser past a header
 * limit for a month. Over this budget the tag is dropped rather than truncated,
 * for the reason the header's is, and a cookie already there stands. The click
 * ids give way to the tag here exactly as they do in the header.
 */
export const UTM_COOKIE_MAX_LENGTH = 2048;

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
 * The ad platforms whose own click id the cookie keeps, for every place that
 * walks them.
 */
const CLICK_ID_PLATFORMS = ["meta", "reddit"] as const;

/** One platform whose click id is kept. */
export type ClickIdPlatform = (typeof CLICK_ID_PLATFORMS)[number];

/**
 * The query param each platform's ads append to a link — and the key the id
 * travels under in the header and the cookie, so one name follows it from the
 * link to the report.
 */
export const CLICK_ID_QUERY_PARAMS = {
  meta: "fbclid",
  reddit: "rdt_cid",
} as const satisfies Record<ClickIdPlatform, string>;

/** A platform's click id, and when the link carrying it was landed on, in ms. */
export interface ClickId {
  id: string;
  landedAt: number;
}

/** Each platform's click id, where one was kept. */
export type ClickIds = Partial<Record<ClickIdPlatform, ClickId>>;

/**
 * Everything one landing carried, or one cookie keeps: the tag, when it
 * landed, and each platform's click id.
 */
export interface Attribution {
  utm: UtmAttribution;
  /**
   * When the tag landed, in ms. `null` where there is no tag — and on a tag kept
   * by a cookie written before landing times were recorded, which reads like
   * any other until its own 30 days run out but is never carried into a new
   * write, because a rewrite would renew a life nobody can measure.
   */
  utmLandedAt: number | null;
  clickIds: ClickIds;
}

/** Nothing at all. */
export const NO_ATTRIBUTION: Attribution = {
  utm: NO_UTM_ATTRIBUTION,
  utmLandedAt: null,
  clickIds: {},
};

/**
 * The longest click id kept. Meta's `fbclid` has grown over the years, from
 * ids of about 60 characters to ones carrying an `_aem_` suffix that run to a
 * couple of hundred, and neither vendor publishes a maximum — so the cap leaves
 * room for another round of growth while keeping the budget arithmetic on
 * {@link UTM_HEADER_MAX_LENGTH} true. An id over it is dropped, never cut,
 * since a shortened id names no click.
 */
const CLICK_ID_MAX_LENGTH = 400;

/**
 * The whole of what a click id may be: letters, digits, `_` and `-`, which is
 * every id either platform issues. Nothing in it needs percent-encoding, so its
 * size in the header and the cookie is its length; and neither `.` (the
 * separator from its landing time) nor anything a spreadsheet or a header could
 * misread can appear.
 */
const CLICK_ID_PATTERN = new RegExp(`^[A-Za-z0-9_-]{1,${CLICK_ID_MAX_LENGTH}}$`);

/**
 * One raw click id, or `null` when it is not one. **Never trimmed, folded or
 * shortened**: both platforms match the id byte for byte, and Meta says in as
 * many words not to modify it, so an id that does not pass as it stands is
 * refused.
 */
export function sanitiseClickId(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  return CLICK_ID_PATTERN.test(raw) ? raw : null;
}

/** A landing time as it is written: a positive integer of milliseconds. */
const LANDED_AT_PATTERN = /^[1-9][0-9]{0,15}$/;

/**
 * How far in the future a landing time may sit and still be read. Landing times
 * are stamped by the proxy's clock and read by the layout's, or the browser's,
 * which are different machines, so an honest stamp can be a little ahead.
 */
const LANDED_AT_CLOCK_SKEW_MS = 5 * 60 * 1000;

/**
 * Whether a part that landed at `landedAt` is still kept at `now`: not further
 * in the future than {@link LANDED_AT_CLOCK_SKEW_MS}, which only a hand-edited
 * cookie could claim, and not older than the cookie's own lifetime, which a
 * later write renewing the cookie must not extend.
 */
function isFresh(landedAt: number, now: number): boolean {
  return (
    landedAt <= now + LANDED_AT_CLOCK_SKEW_MS &&
    now - landedAt < UTM_COOKIE_MAX_AGE_SECONDS * 1000
  );
}

/**
 * Read everything a landing URL carries: the tag ({@link readUtmFromSearchParams})
 * and each platform's click id, all stamped with `now` as their landing time.
 *
 * A repeated click-id param is no click id, for the reason a repeated UTM param
 * is no value.
 */
export function readAttributionFromSearchParams(
  params: URLSearchParams,
  now: number,
): Attribution {
  const utm = readUtmFromSearchParams(params);
  const clickIds: ClickIds = {};
  for (const platform of CLICK_ID_PLATFORMS) {
    const values = params.getAll(CLICK_ID_QUERY_PARAMS[platform]);
    const id = values.length === 1 ? sanitiseClickId(values[0]) : null;
    if (id !== null) clickIds[platform] = { id, landedAt: now };
  }
  return { utm, utmLandedAt: hasUtmAttribution(utm) ? now : null, clickIds };
}

/** The key the tag's landing time travels under. */
const UTM_LANDED_AT_KEY = "at";

/**
 * Serialise an attribution within a budget, measured by `measure`: the tag
 * first, all or nothing, then each click id into whatever room is left — the
 * order {@link UTM_HEADER_MAX_LENGTH} reasons out. `null` when nothing is left
 * to send, which includes a tag over the budget.
 *
 * The click ids are written as `<landing ms>.<id>`, the order Meta's own `fbc`
 * keeps them in; the id cannot contain a `.`, so the split back is unambiguous.
 */
function serialiseWithin(
  attribution: Attribution,
  measure: (serialised: string) => number,
  max: number,
): string | null {
  const params = new URLSearchParams();
  if (hasUtmAttribution(attribution.utm)) {
    for (const field of UTM_FIELDS) {
      const value = attribution.utm[field];
      if (value !== null) params.set(field, value);
    }
    if (attribution.utmLandedAt !== null) {
      params.set(UTM_LANDED_AT_KEY, String(attribution.utmLandedAt));
    }
    if (measure(params.toString()) > max) return null;
  }
  for (const platform of CLICK_ID_PLATFORMS) {
    const clickId = attribution.clickIds[platform];
    if (clickId === undefined) continue;
    const key = CLICK_ID_QUERY_PARAMS[platform];
    params.set(key, `${clickId.landedAt}.${clickId.id}`);
    if (measure(params.toString()) > max) params.delete(key);
  }
  const serialised = params.toString();
  return serialised.length === 0 ? null : serialised;
}

/**
 * The `x-utm` header value for a landing, or `null` when there is nothing to
 * send. Only what survived appears, so a value that is present is always a
 * value carrying something.
 *
 * Within {@link UTM_HEADER_MAX_LENGTH}: a tag over it is dropped whole rather
 * than cut down, and takes the click ids with it; a click id that does not fit
 * beside the tag is dropped alone. The check lives here rather than at the one
 * call site so no future caller can serialise past the budget.
 *
 * The length is measured on the percent-encoded string, which is ASCII by
 * construction, so code units, code points and bytes are all the same number.
 */
export function serialiseAttribution(attribution: Attribution): string | null {
  return serialiseWithin(attribution, (serialised) => serialised.length, UTM_HEADER_MAX_LENGTH);
}

/**
 * Whether a landing carried anything the cookie keeps. A landing carrying
 * nothing writes nothing, so what is already kept stands.
 */
function carriesAttribution(attribution: Attribution): boolean {
  return (
    hasUtmAttribution(attribution.utm) ||
    CLICK_ID_PLATFORMS.some((platform) => attribution.clickIds[platform] !== undefined)
  );
}

/**
 * The value to hand a cookie writer after a landing, or `null` when no cookie
 * should be written: the landing carried nothing, or its tag would not fit
 * within {@link UTM_COOKIE_MAX_LENGTH} once the writer has encoded it. Either
 * way the cookie already there stands.
 *
 * **Merged with what the cookie already keeps**, part by part: the landing's
 * tag replaces the stored one, or the stored one stays; each platform's click
 * id from the landing replaces that platform's, and the others stay — unless
 * it is the id already kept, which keeps its first landing time, as Meta's own
 * `_fbc` does, so a reload never extends its life. A part past its 30 days is
 * gone before the merge, and a stored tag with no landing
 * time is not carried into the new value (see {@link Attribution}).
 *
 * Both writers call it with the `Cookie` header they can see — the proxy its
 * request's, the banner the document's — because both can meet a cookie:
 * the proxy on any returning visitor, the banner when another tab wrote one
 * while this document waited for an answer.
 */
export function attributionCookieAfterLanding(
  cookieHeader: string | null,
  landing: Attribution,
  now: number,
): string | null {
  if (!carriesAttribution(landing)) return null;
  const stored = storedAttribution(cookieHeader, now);
  const tag = hasUtmAttribution(landing.utm)
    ? landing
    : stored.utmLandedAt !== null
      ? stored
      : NO_ATTRIBUTION;
  const clickIds: ClickIds = { ...stored.clickIds };
  for (const platform of CLICK_ID_PLATFORMS) {
    const landed = landing.clickIds[platform];
    if (landed !== undefined && landed.id !== stored.clickIds[platform]?.id) {
      clickIds[platform] = landed;
    }
  }
  return serialiseWithin(
    {
      utm: tag.utm,
      utmLandedAt: tag.utmLandedAt,
      clickIds,
    },
    (serialised) => encodeURIComponent(serialised).length,
    UTM_COOKIE_MAX_LENGTH,
  );
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
 * A parsed attribution as the {@link UtmInput} a consent gate takes: every field
 * that is present, every absent one omitted.
 */
export function utmInputFromAttribution(utm: UtmAttribution): UtmInput {
  const input: UtmInput = {};
  for (const field of UTM_FIELDS) {
    const value = utm[field];
    if (value !== null) input[field] = value;
  }
  return input;
}

/**
 * Read a serialised value back: the `x-utm` header on the server side of the
 * layout, and the decoded attribution cookie. A part past its 30 days at `now`
 * reads as absent.
 *
 * Re-sanitises every field rather than trusting the string it was handed. The
 * proxy deletes any incoming `x-utm` before setting its own, so a forged header
 * cannot reach here, though a cookie is the browser's to edit — and running the
 * sanitisers again is what makes "the value always came through our own
 * sanitiser" a fact about this code rather than a fact about the call order of
 * two files.
 *
 * `.getAll()` and a repeated key nulls that field, exactly as on the query-string
 * side. Serialising never produces a repeat, so this only ever fires on a value
 * that did not come from this module — which is the case the re-sanitise
 * exists for, and it should behave the same way at both ends rather than
 * quietly taking the first entry here and refusing it there.
 *
 * A tag whose landing time is present but unreadable or stale is no tag. One
 * with no landing time at all is read as it stands: only a cookie written
 * before landing times were recorded carries one, and its own Max-Age still
 * bounds it.
 */
export function parseAttribution(raw: string | null | undefined, now: number): Attribution {
  if (typeof raw !== "string" || raw.length === 0) return NO_ATTRIBUTION;

  const params = new URLSearchParams(raw);
  const readOne = (key: string): string | null => {
    const values = params.getAll(key);
    return values.length === 1 ? values[0] : null;
  };
  const readLandedAt = (value: string): number | null => {
    if (!LANDED_AT_PATTERN.test(value)) return null;
    const landedAt = Number(value);
    return isFresh(landedAt, now) ? landedAt : null;
  };

  const utm = mapUtmFields((field) => sanitiseUtmValue(readOne(field)));
  const rawUtmLandedAt = readOne(UTM_LANDED_AT_KEY);
  const utmLandedAt = rawUtmLandedAt === null ? null : readLandedAt(rawUtmLandedAt);
  const tagKept = hasUtmAttribution(utm) && (rawUtmLandedAt === null || utmLandedAt !== null);

  const clickIds: ClickIds = {};
  for (const platform of CLICK_ID_PLATFORMS) {
    const value = readOne(CLICK_ID_QUERY_PARAMS[platform]);
    const separator = value?.indexOf(".") ?? -1;
    if (value === null || separator === -1) continue;
    const landedAt = readLandedAt(value.slice(0, separator));
    const id = sanitiseClickId(value.slice(separator + 1));
    if (landedAt !== null && id !== null) clickIds[platform] = { id, landedAt };
  }

  return {
    utm: tagKept ? utm : NO_UTM_ATTRIBUTION,
    utmLandedAt: tagKept ? utmLandedAt : null,
    clickIds,
  };
}

/**
 * What the attribution cookie in a `Cookie` header keeps at `now`, or
 * {@link NO_ATTRIBUTION} for a header without the cookie and for a value that
 * is not percent-encoded text, which only a hand-edited cookie can be.
 *
 * Both writers percent-encode the serialised value once more on its way into
 * the cookie, so it is decoded here before it is parsed. **Nothing here checks
 * consent**: every reader does, off the same request, before it uses a value.
 */
function storedAttribution(cookieHeader: string | null, now: number): Attribution {
  const raw = cookieValueFromHeader(cookieHeader, UTM_COOKIE_NAME);
  if (raw === undefined) return NO_ATTRIBUTION;
  try {
    return parseAttribution(decodeURIComponent(raw), now);
  } catch {
    return NO_ATTRIBUTION;
  }
}

/**
 * The tag a request's `Cookie` header carries, for a server route to pass
 * through {@link utmMetadataForConsent} with that same request's consent: a
 * cookie outliving its consent reads as nothing there. `{}` when the cookie
 * keeps no tag. The click ids beside it are never part of this, so nothing
 * that stores attribution can store one.
 */
export function utmFromCookieHeader(cookieHeader: string | null): UtmInput {
  return utmInputFromAttribution(storedAttribution(cookieHeader, Date.now()).utm);
}

/**
 * One platform's click id from a request's `Cookie` header, or `null`, for
 * that platform's conversion report and no one else's. The report checks the
 * same request's marketing consent before it reads this.
 */
export function clickIdFromCookieHeader(
  cookieHeader: string | null,
  platform: ClickIdPlatform,
): ClickId | null {
  return storedAttribution(cookieHeader, Date.now()).clickIds[platform] ?? null;
}
