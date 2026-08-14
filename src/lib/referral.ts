/**
 * Referral attribution — where a family came from when they created an account.
 *
 * A marketing link carries `?ref=<code>` (e.g. `/roblox?ref=paris-nord`). The
 * proxy reads and sanitises it, hands it to the root layout on the
 * `x-referral-code` request header, and a client context provider holds it for
 * the rest of the visit so it survives browsing the whole site as client-side
 * navigation. At registration it travels in the new user's auth metadata and the
 * profile-creation trigger writes it to `profiles.referral_code`.
 *
 * Codes are invented ad hoc by whoever makes the link; there is no registry of
 * valid ones, and validating against one was considered and turned down.
 * Whoever reads this data filters for the codes they issued, so junk rows are
 * noise they never query.
 *
 * ---------------------------------------------------------------------------
 * THE SIX CONSTRAINTS THAT ARE LOAD-BEARING FOR THE LEGAL POSITION
 * ---------------------------------------------------------------------------
 *
 * Every one of these was chosen partly to keep this processing lawful *without*
 * a consent banner. Each looks like an arbitrary limitation from the inside, so
 * they are written down here, next to the module both ends of the feature
 * import. Changing any one of them is not a refactor — it needs a fresh legal
 * review before it ships.
 *
 *  1. **Nothing carrying this value is written to the user's device** — no
 *     cookie, no `localStorage`, no `sessionStorage`, ever. Device storage puts
 *     this processing into ePrivacy scope and requires a consent banner for
 *     every visitor to the site. "Attribution gets lost on reload" is not a bug,
 *     and `sessionStorage` is not a harmless middle ground: it is tab-scoped and
 *     dies on tab close, but it is still storage on the user's device and
 *     triggers exactly the same rule as a cookie. (The auth, locale and timezone
 *     cookies the site already sets are strictly-necessary or functional and are
 *     exempt; a marketing provenance code would not be. The distinction is the
 *     purpose, not the mechanism.)
 *  2. **Gamer accounts never carry a code.** Reporting treats a gamer and their
 *     parent as one family unit, so a join through the existing parent
 *     relationship answers "which group brought this family" without copying a
 *     marketing attribute onto a child's record. Gamer rows keep
 *     `referral_code` NULL by construction: the gamer-creation route passes only
 *     name fields in metadata.
 *  3. **The value is write-once.** There is deliberately no UPDATE grant on the
 *     column, so nobody but `service_role` can alter or clear it after account
 *     creation — an admin included, since an admin is also the `authenticated`
 *     DB role. That is what lets us refuse a client-side write path.
 *  4. **It is never used for profiling, or to decide what anyone is shown,
 *     offered or charged.**
 *  5. **It is never combined with behavioural, device or journey data.**
 *  6. **Codes label, they do not grant.** The moment one confers access, a
 *     discount or priority, it stops being a label and becomes a credential — a
 *     different thing legally, and a worse thing to have travelling in public
 *     links that get forwarded and screenshotted.
 */

/** The query param marketing links carry. */
export const REFERRAL_QUERY_PARAM = "ref";

/**
 * The request header the proxy sets for the root layout to read. A root layout
 * cannot receive `searchParams` (only pages can) and `useSearchParams()` in a
 * client provider at the root would put the whole app under a `<Suspense>`
 * boundary whose *fallback* is what gets prerendered — so the header is the
 * mechanism.
 */
export const REFERRAL_CODE_HEADER = "x-referral-code";

/**
 * The one format a referral code may take, mirrored by the
 * `profiles_referral_code_format` CHECK and by the profile-creation trigger's
 * own sanitising. Lowercase letters, digits, `-` and `_`, 1–64 characters.
 */
const REFERRAL_CODE_PATTERN = /^[a-z0-9_-]{1,64}$/;

/**
 * Normalise a raw `?ref=` value, or refuse it.
 *
 * Trims, lowercases, then tests — in that order. Testing before normalising
 * would fail `Paris-Nord` against a lowercase-only pattern and throw away a real
 * code; trimming matters because a hand-authored flyer link or an email client
 * can add a trailing space.
 *
 * **Takes a scalar, never an array, and collapsing a repeated param is the
 * caller's job.** `URLSearchParams.getAll()` returns an array for the ordinary
 * single case too (`["paris-nord"]`), so a sanitiser that nulled every array
 * input would null *everything* and the feature would silently never work. The
 * caller decides: exactly one value is a candidate, anything else is not a code.
 * Do not copy the shape `resolveInternalPath` uses for the same problem — it
 * takes the *first* entry, which is right for a redirect target (there is a
 * sensible fallback) and wrong for a referral code (there is not).
 *
 * A failed value returns `null` — never a partial or truncated one. Sanitising
 * here is not about data quality: an unsanitised string from a stranger is being
 * written to a family's profile row, and referral data is exactly the kind of
 * thing that gets exported to a spreadsheet, where a value beginning with `=` is
 * a formula that executes when the file is opened.
 *
 * Pure string and regex work only, no Node APIs — the proxy runs this and is not
 * a Node runtime.
 */
export function sanitiseReferralCode(raw: string | null | undefined): string | null {
  if (typeof raw !== "string") return null;
  const normalised = raw.trim().toLowerCase();
  return REFERRAL_CODE_PATTERN.test(normalised) ? normalised : null;
}
