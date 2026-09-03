/**
 * UTM attribution — where a family came from when they created an account.
 *
 * A marketing link carries the three standard UTM parameters
 * (`/roblox?utm_source=lynx&utm_medium=email&utm_campaign=lynx-summer-a`). The
 * proxy reads and sanitises them, hands them to the root layout on the `x-utm`
 * request header, and a client context provider holds them for the rest of the
 * visit so they survive browsing the whole site as client-side navigation. At
 * registration they travel in the new user's auth metadata and the
 * profile-creation trigger writes them to `profiles.utm_source`,
 * `profiles.utm_medium` and `profiles.utm_campaign`.
 *
 * Values are invented ad hoc by whoever makes the link; there is no registry of
 * valid ones, and validating against one was considered and turned down.
 * Whoever reads this data filters for the values they issued, so junk rows are
 * noise they never query.
 *
 * **The partner convention: a campaign issued to or for a partner is prefixed
 * with the partner's slug and a hyphen** — `lynx-summer-a`, `rblx-launch`. This
 * cannot be retrofitted, because the value is immutable on a profile once
 * written, and it is the only thing that lets a partner's campaigns be picked
 * out of the set without a hand-kept mapping. It is documentation, not a rule
 * the sanitiser enforces.
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
 *     could have been answered. So this module claims nothing about consent.
 *     What the cookie-consent banner governs is the *browser scripts* — the
 *     analytics and marketing pixels that load in the page — and that is a
 *     separate mechanism from this one.
 *  2. **The stored value is written at account creation regardless of what the
 *     visitor answered on the banner.** That is the owner's decision (2026-09-03)
 *     and it is **pending counsel**: it is the one question in this area still
 *     out, and it decides whether a partner's numbers are complete or
 *     systematically biased. Until counsel answers, this is the behaviour, and
 *     the write-once design below is what keeps a service-role null path
 *     available if the answer changes — nulling a column nobody but
 *     `service_role` can write is a single statement, where unwinding a
 *     client-writable one is not.
 *  3. **Gamer accounts never carry a value.** Reporting treats a gamer and
 *     their parent as one family unit, so a join through the existing parent
 *     relationship answers "which campaign brought this family" without copying
 *     a marketing attribute onto a child's record. Gamer rows keep all three
 *     columns NULL by construction: the gamer-creation route passes only name
 *     fields in metadata.
 *  4. **The values are write-once.** There is deliberately no UPDATE grant on
 *     any of the three columns, so nobody but `service_role` can alter or clear
 *     them after account creation — an admin included, since an admin is also
 *     the `authenticated` DB role. That is what lets us refuse a client-side
 *     write path.
 *  5. **They are never used for profiling, or to decide what anyone is shown,
 *     offered or charged.**
 *  6. **They are never combined with behavioural, device or journey data.**
 *  7. **Labels, not credentials.** The moment a campaign value confers access, a
 *     discount or priority, it stops being a label and becomes a credential — a
 *     different thing legally, and a worse thing to have travelling in public
 *     links that get forwarded and screenshotted.
 */

/** The three query params a marketing link carries, keyed by the field they fill. */
export const UTM_QUERY_PARAMS = {
  source: "utm_source",
  medium: "utm_medium",
  campaign: "utm_campaign",
} as const;

/**
 * The request header the proxy sets for the root layout to read. A root layout
 * cannot receive `searchParams` (only pages can) and `useSearchParams()` in a
 * client provider at the root would put the whole app under a `<Suspense>`
 * boundary whose *fallback* is what gets prerendered — so the header is the
 * mechanism.
 *
 * **One header carrying a `URLSearchParams` string**, not three headers holding
 * raw values. A sanitised value may legitimately contain anything but a control
 * character — a Meta macro expands to an ad name with spaces and accents in it
 * — and a raw non-ASCII header value is not something every hop between the
 * proxy and the layout is obliged to carry intact. Percent-encoding through
 * `URLSearchParams` makes the transport ASCII by construction, and one header
 * keeps the three fields arriving or not arriving together.
 */
export const UTM_HEADER = "x-utm";

/** The three fields, each present or explicitly absent. */
export interface UtmAttribution {
  source: string | null;
  medium: string | null;
  campaign: string | null;
}

/** Nothing at all — the common case, and the shape every absent path returns. */
export const NO_UTM_ATTRIBUTION: UtmAttribution = {
  source: null,
  medium: null,
  campaign: null,
};

/** Attribution is present when at least one of the three fields survived. */
export function hasUtmAttribution(utm: UtmAttribution): boolean {
  return utm.source !== null || utm.medium !== null || utm.campaign !== null;
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
 * spreadsheet. Tab and carriage return are on the list for the same reason —
 * they are stripped by `String.trim()` here, but the trigger's `btrim` strips
 * spaces only, so a tab-led value is a shape the SQL copy of this rule really
 * does have to refuse.
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
 * backstop, in the three column CHECKs. Two deliberate divergences, both
 * fail-closed here: the trigger's `btrim` strips spaces only, where
 * `String.trim()` strips the full Unicode whitespace set, so a tab-padded value
 * degrades to NULL in the database instead of being accepted; and the length
 * comparison below counts code points, matching `char_length()`, rather than
 * UTF-16 code units.
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
 * Read the three params off a landing URL's query string.
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

  return {
    source: readOne(UTM_QUERY_PARAMS.source),
    medium: readOne(UTM_QUERY_PARAMS.medium),
    campaign: readOne(UTM_QUERY_PARAMS.campaign),
  };
}

/**
 * The `x-utm` header value for an attribution, or `null` when there is nothing
 * to send. Only the fields that survived appear, so a header that is present is
 * always a header carrying something.
 */
export function serialiseUtm(utm: UtmAttribution): string | null {
  if (!hasUtmAttribution(utm)) return null;

  const params = new URLSearchParams();
  if (utm.source !== null) params.set("source", utm.source);
  if (utm.medium !== null) params.set("medium", utm.medium);
  if (utm.campaign !== null) params.set("campaign", utm.campaign);
  return params.toString();
}

/**
 * The signup-metadata object a registration route hands to
 * `admin.auth.admin.createUser`, built from the (unsanitised) values a
 * registration body carried.
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
export function buildUtmMetadata(utm: {
  source?: string;
  medium?: string;
  campaign?: string;
} | undefined): Record<string, string> {
  const metadata: Record<string, string> = {};
  if (utm === undefined) return metadata;

  const source = sanitiseUtmValue(utm.source);
  if (source !== null) metadata[UTM_QUERY_PARAMS.source] = source;
  const medium = sanitiseUtmValue(utm.medium);
  if (medium !== null) metadata[UTM_QUERY_PARAMS.medium] = medium;
  const campaign = sanitiseUtmValue(utm.campaign);
  if (campaign !== null) metadata[UTM_QUERY_PARAMS.campaign] = campaign;

  return metadata;
}

/**
 * Read the header back on the server side of the layout.
 *
 * Re-sanitises every field rather than trusting the string it was handed. The
 * proxy deletes any incoming `x-utm` before setting its own, so a forged value
 * cannot reach here — but running the sanitiser again is what makes "the value
 * always came through our own sanitiser" a fact about this code rather than a
 * fact about the call order of two files.
 */
export function parseUtmHeader(raw: string | null | undefined): UtmAttribution {
  if (typeof raw !== "string" || raw.length === 0) return NO_UTM_ATTRIBUTION;

  const params = new URLSearchParams(raw);
  return {
    source: sanitiseUtmValue(params.get("source")),
    medium: sanitiseUtmValue(params.get("medium")),
    campaign: sanitiseUtmValue(params.get("campaign")),
  };
}
