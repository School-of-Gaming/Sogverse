/**
 * The column lists every read in this feature names.
 *
 * There is no wire contract here because there is no route of its own: the
 * writes this feature makes already exist (`PATCH /api/admin/site-notes` for
 * the address and both notes, the admin location route for a rename), and every
 * read below runs on the caller's own client under the admin RLS policies. What
 * this module holds instead is the same thing `locations.contracts.ts` holds
 * for the tree — one place each select string is spelled, so a read cannot
 * quietly widen.
 *
 * Each is a **literal**, not a computed join of some key list: the Supabase
 * client infers a response's shape from the *type* of the select string, and a
 * string built at runtime widens to `string` and takes the whole row type with
 * it.
 */

/**
 * The member-visible half of a site: its street address and the note families
 * read. Not `*` — the row's timestamps answer nothing this surface asks, and
 * `location_id` is the filter the caller already supplied.
 */
export const SITE_DETAILS_COLUMNS = "address, notes";

/** The staff-only half: the note only gedus and admins ever see. */
export const SITE_STAFF_DETAILS_COLUMNS = "notes";

/**
 * A product connected to a site, as its row on the site page renders it: enough
 * to name it, badge it and link to the right admin surface, and nothing else.
 * The type is what picks the admin URL, so it cannot be dropped.
 */
export const SITE_PRODUCT_COLUMNS =
  "id, product_type, status, is_visible, product_translations(locale, name)";

/**
 * What the tally read asks for. The count is the whole answer, so the only
 * column that crosses the wire is the one the rows are grouped by — PostgREST
 * has no GROUP BY, so the grouping happens here over a set the page already
 * bounds.
 */
export const SITE_PRODUCT_TALLY_COLUMNS = "location_id";
