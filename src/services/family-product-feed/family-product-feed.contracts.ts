import { z } from "zod";
import { Constants } from "@/types";
import { attendanceStatus } from "@/services/gedu-sessions/gedu-sessions.contracts";

/**
 * Wire contract for `get_my_family_product_feed` — everything a family
 * club/camp/event page renders for ONE (participant x product) enrollment.
 *
 * The RPC returns a JSONB document, which the type generator can only see as
 * `Json`, so this schema — written from the function body, most recently
 * widened with the per-session photos — is the structure. A db test parses real
 * Postgres output through it in CI, so
 * the two cannot drift apart quietly: a changed key fails the parse loudly
 * instead of arriving as `undefined` three components later.
 *
 * **This schema is also a privacy assertion, and that is its second job.** The
 * document deliberately has no place to put a `gedu_note` of any scope, no
 * roster, no other child's attendance, no parent email, no `material_url` and
 * no completeness/owed state. The RPC never selects those columns — that is
 * where the guarantee actually lives — but a schema that cannot *represent*
 * them means a future widening of the SQL has to be a visible, deliberate edit
 * here too, rather than a field that quietly starts flowing through.
 *
 * **Every object here is `.strict()`, and that is what makes the paragraph
 * above true rather than merely intended.** A non-strict zod object *ignores*
 * an unknown key: add `gedu_note` to the RPC's session builder and a permissive
 * schema parses it happily, strips it, and reports nothing — the widening
 * reaches CI as a silent no-op and the "deliberate edit here too" never
 * happens. Strict turns that into a parse failure, and because the db test
 * parses real Postgres output through these schemas in CI, the failure lands on
 * the change that caused it. The cost is that adding a field to the RPC now
 * *requires* adding it here in the same commit, which is exactly the friction
 * the privacy line is asking for. Nested objects get it too: strict does not
 * recurse, so a root-only `.strict()` would leave every inner shape — the ones
 * that would actually carry a leaked field — wide open.
 */

/*
 * The next two shapes are byte-identical to their twins in the gedu session
 * contracts, and they are duplicated ON PURPOSE rather than shared.
 *
 * The line this file draws is between a *vocabulary* and a *document shape*.
 * `attendanceStatus` above is imported, because it is a vocabulary: its members
 * must match a single CHECK constraint in the database, so a second copy would
 * be a second source of truth for one fact and could only ever drift into being
 * wrong. These two are document shapes. Each feed RPC builds its own JSONB, and
 * the whole privacy argument for this contract — stated above — is that
 * widening what a family may receive has to be a visible, deliberate edit *in
 * this file*. Importing the object shapes would hand that decision to whoever
 * next edits the staff contract, where a widening would look local while
 * silently flowing through to families. The two documents are allowed to
 * diverge; that they agree today is not a reason to fuse them.
 *
 * If they ever have to move in lockstep, that is a signal the underlying
 * columns changed, and both files should be edited in the same change.
 */

const productTranslationSummary = z
  .object({
    locale: z.string(),
    name: z.string(),
    description: z.string(),
  })
  .strict();

const scheduleSlotSummary = z
  .object({
    weekday: z.number(),
    start_time: z.string(),
    duration_minutes: z.number(),
  })
  .strict();

/**
 * A person named to the family: an id and a first name, and nothing else.
 *
 * Used for both whoever holds the seat and the gedus who teach the group. A
 * family is being told who they are with, which is a first name's worth of
 * information — no surname, no email, no verification state.
 *
 * `first_name` is non-null because the column is (`profiles.first_name NOT
 * NULL`, with a length CHECK on top).
 */
export const familyFeedPerson = z
  .object({
    id: z.string(),
    first_name: z.string(),
  })
  .strict();

/**
 * One photo on a family-facing session card.
 *
 * Byte-identical to the gedu document's image shape and **not imported from
 * it**, on the same terms as the two duplicated shapes above: a vocabulary is
 * shared, a document shape is not. What a family may receive has to be a
 * visible edit in this file, and `created_by` — safeguarding audit that gates
 * nothing and renders nowhere — is exactly the field `.strict()` is here to
 * refuse.
 *
 * The id is the whole address (the object is `<id>.jpg`, derived by helper, not
 * stored) and the dimensions are what the gallery's geometry is arithmetic
 * from, so nothing reflows as an image decodes.
 */
export const familyFeedSessionImage = z
  .object({
    id: z.string(),
    width: z.number(),
    height: z.number(),
  })
  .strict();

/**
 * One stored session, as a family may see it.
 *
 * The gedu twin of this shape carries `gedu_note`, the audit columns and a
 * sparse attendance map over the whole roster. This one carries the report and
 * ONE attendance answer — the named participant's own — which is what makes
 * another child's mark structurally unreachable rather than merely unrendered.
 *
 * **`attendance: null` is unmarked, and that is a third state, not "absent".**
 * Nobody answered for this child on this date. The enum cannot yet distinguish
 * a planned absence from an unexcused one, which is why the family surfaces
 * word the negative case neutrally.
 *
 * There is no derived-occurrence machinery in here on purpose: the RPC returns
 * the stored rows and the client merges them over occurrences it projects from
 * the schedule, so the calendar math happens in one place rather than twice in
 * two languages.
 */
export const familyFeedSession = z
  .object({
    id: z.string(),
    /** Product-local calendar date, `YYYY-MM-DD`. The row's real identity. */
    session_date: z.string(),
    /** Snapshot of the scheduled instants, taken at materialization. */
    starts_at: z.string(),
    ends_at: z.string(),
    /** The family-facing write-up (markdown). `null` when none was written. */
    report: z.string().nullable(),
    /**
     * Who last edited this session, and their first name — the pair behind the
     * attribution chip on a report card. Null together when nothing has stamped
     * the row; a consumer wants BOTH halves before it names anybody.
     *
     * **This is the session's last editor, not the report's author, and the
     * imprecision is accepted rather than overlooked.** `updated_by` is stamped
     * by every recorded touch of the session: materializing the row, saving
     * either written field, and each attendance mark or unmark. So a gedu who
     * only corrected a tick is named on a write-up somebody else typed. In
     * practice the gedu who touches one part of a session touches all of it,
     * and a dedicated per-field author column was judged not worth the schema
     * for that edge — the chip claims "last edited by", which is what this
     * answers. Do not close the gap by quietly adding a report-author column.
     *
     * **A family may read this, and that is a decision rather than a leak.**
     * The document already names every gedu assigned to the group by id and
     * first name; this is the same quantum of information about the same kind
     * of person. It travels per session instead of being resolved against
     * `gedus` below because the two sets genuinely differ — a session's editor
     * may have left the group since — which would leave the oldest reports
     * unsigned. Nothing else of the staff row comes with it: no `created_by`,
     * no `gedu_note`, and `.strict()` above is what keeps that true.
     */
    updated_by: z.string().nullable(),
    updated_by_first_name: z.string().nullable(),
    /** Oldest first, `(created_at, id)` — the display order on every surface. */
    images: z.array(familyFeedSessionImage),
    attendance: attendanceStatus.nullable(),
  })
  .strict();

/**
 * The site, on in-person products. `null` on anything remote.
 *
 * A remote municipality club carries a `location_id` too (a municipality, by
 * CHECK), so the RPC gates this on `is_remote = false` rather than on the
 * location being present — otherwise a club with no building would render an
 * address panel.
 *
 * The gedu-only site note (`site_staff_details.notes`) has no field here; the
 * RPC does not join that table at all.
 */
export const familyFeedSite = z
  .object({
    location_id: z.string(),
    name: z.string(),
    address: z.string().nullable(),
    public_note: z.string().nullable(),
  })
  .strict();

/** Everything a family product page renders for one enrollment. */
export const familyProductFeed = z
  .object({
    /**
     * Whoever holds the seat this page is about — a child, or the parent
     * themselves on a for-parents product. The page is participant-scoped and
     * reachable by URL, so it cannot rely on having been opened from a
     * dashboard card that already knew the name.
     *
     * **Spelled for the participant since 00174**, when a parent first became
     * able to occupy a seat: a key called `gamer` carrying a parent's own name
     * would have been the wire telling every reader the wrong thing about who
     * this page is for.
     */
    participant: familyFeedPerson,
    product: z
      .object({
        id: z.string(),
        product_type: z.enum(Constants.public.Enums.product_type),
        timezone: z.string(),
        /** Bare calendar dates — UTC-pinned, never re-anchored to a viewer zone. */
        start_date: z.string().nullable(),
        end_date: z.string().nullable(),
        is_remote: z.boolean(),
        /** The product's names live here; `products` has no name column. */
        translations: z.array(productTranslationSummary),
        schedule_slots: z.array(scheduleSlotSummary),
      })
      // Strict here as well as at the root: `material_url` is a product-level
      // field, so this is the object a staff leak would actually land in.
      .strict(),
    /**
     * The group's family-facing half. `id` travels because the voice-room href
     * and the feed's entry keys are built from it; `gedu_note` has no field.
     */
    group: z
      .object({
        id: z.string(),
        name: z.string(),
        public_note: z.string().nullable(),
      })
      // Likewise: `gedu_note` is a group-level column sitting one key away from
      // `public_note`, which makes this the easiest of all of them to widen.
      .strict(),
    site: familyFeedSite.nullable(),
    /** Who teaches this group. Ordered by first name. */
    gedus: z.array(familyFeedPerson),
    /**
     * The group's FULL stored history, newest first — including sessions from
     * before this participant enrolled, and rows the schedule no longer
     * projects.
     *
     * There is no paging and none should be added. The client projects past
     * occurrences from the schedule and merges these rows onto them, so a
     * partial fetch would render older sessions that *do* have reports as
     * though they had none — wrong, not merely short. One JSONB document is
     * also one PostgREST row, so it is immune to the `max_rows` ceiling that
     * truncates table selects.
     */
    sessions: z.array(familyFeedSession),
  })
  .strict();

export type FamilyProductFeed = z.infer<typeof familyProductFeed>;
export type FamilyFeedSession = z.infer<typeof familyFeedSession>;
export type FamilyFeedSessionImage = z.infer<typeof familyFeedSessionImage>;
export type FamilyFeedSite = z.infer<typeof familyFeedSite>;
export type FamilyFeedPerson = z.infer<typeof familyFeedPerson>;
