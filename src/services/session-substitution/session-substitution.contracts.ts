import { z } from "zod";
import { Constants } from "@/types";

/**
 * Wire contracts for session substitutions — "I can't make this session", the offers
 * that answer it, and the sub an admin seats.
 *
 * Every function behind these is `SECURITY DEFINER` returning `jsonb`, which
 * the type generator can only see as `Json`, so the schemas here are the
 * structure. They are written from the function bodies in the migration that
 * defines them, and the db tests parse real RPC output through these same
 * schemas in CI — so Postgres and TypeScript cannot drift apart quietly.
 */

/** The pay class an assignment or a substitution carries. */
export const geduAssignmentRole = z.enum(
  Constants.public.Enums.gedu_assignment_role,
);

/** Why the absent gedu cannot be there. Admin-visible only. */
export const substitutionReason = z.enum(Constants.public.Enums.substitution_reason);

/** `open` → `substituted` (an admin seated a sub) or `withdrawn` (history). */
export const substitutionRequestStatus = z.enum(
  Constants.public.Enums.substitution_request_status,
);

/**
 * How long a reason note may be, and the code-side twin of the cap the writers
 * apply.
 *
 * The database trims the note and nulls it when empty — and **refuses** one
 * longer than this, by a CHECK on the column rather than by truncating it. That
 * is why the dialog counts against the same number: a gedu is stopped before
 * they write a sentence the save would throw away, and a client that let one
 * through would get a `check_violation` and no row. Two copies of one bound,
 * and this comment is the reason they have to move together.
 */
export const SUBSTITUTION_REASON_NOTE_MAX_LENGTH = 500;

/**
 * **One substitution request, in the one shape every surface reads it in.**
 *
 * Every write returns this document and both staff feeds' `substitutions` arrays are
 * built from it, because the database builds all of them from a single
 * function. A second schema here would be a second description of that one
 * function, and the two would disagree the first time a field was added.
 *
 * Three things are keyed to the **caller** rather than to the RPC, and the
 * document keeps one shape either way — the keys are always present, emitted as
 * JSON null where the reader is not entitled to them, so no consumer branches
 * on which keys arrived:
 *
 * - `reason` / `reason_note` travel for an admin only. A `sick` category is
 *   health-related data about a contractor, and the gedu feed is served to
 *   admins too (the admin group page renders the gedu workspace's body), so the
 *   flag is the caller's role rather than a property of the read.
 * - `offer_count` travels for an admin and for the requester on their own
 *   request. How many colleagues volunteered for somebody else's absence is not
 *   a third party's business, and offerers never learn who else offered. `null`
 *   is therefore "not disclosed", which is a different fact from zero.
 * - `requested_by` / `requested_by_first_name` — **who is absent** — travel for
 *   an admin, for the requester themselves, and for staff on the group, whose
 *   session card draws a staffing line naming them. They do **not** travel to a
 *   volunteer answering the pool: see {@link anonymousSubstitutionRequestDocument}.
 *
 * This schema is the **named** shape, used everywhere the requester is
 * disclosed, and it is deliberately strict about it: `requested_by_first_name`
 * is non-null because the requester is a `NOT NULL` column under an
 * `ON DELETE RESTRICT` foreign key, so the profile behind it cannot go — a
 * parse failure here would mean that invariant stopped holding, which is worth
 * failing loudly over. `substitute_first_name` is null exactly when
 * `substitute_id` is; the pair travels together.
 */
export const substitutionRequestDocument = z.object({
  id: z.string(),
  group_id: z.string(),
  /** Product-local calendar date, `YYYY-MM-DD`. The seat's real identity. */
  session_date: z.string(),
  /** The role being substituted — the absent gedu's, never their sub's. */
  role: geduAssignmentRole,
  status: substitutionRequestStatus,
  created_at: z.string(),
  requested_by: z.string(),
  requested_by_first_name: z.string(),
  substitute_id: z.string().nullable(),
  substitute_first_name: z.string().nullable(),
  approved_at: z.string().nullable(),
  /** Whether the caller is the absent gedu — the Withdraw action's gate. */
  is_requester: z.boolean(),
  offer_count: z.number().nullable(),
  reason: substitutionReason.nullable(),
  reason_note: z.string().nullable(),
});

export type SubstitutionRequestDocument = z.infer<typeof substitutionRequestDocument>;

/**
 * **The same document with the absent gedu withheld** — what the two offer RPCs
 * return to the gedu who answered the pool.
 *
 * Volunteering must not be a way to learn who is off sick. The pool list never
 * names the absent gedu, and before this the offer that followed it did: the
 * write returned the full document, so one button-press unmasked the person the
 * list had deliberately left out — and withdrawing an offer the caller never
 * made did the same without writing anything at all (the database now refuses
 * that outright).
 *
 * A second schema rather than a nullable field on the first, because the two
 * documents are read by different surfaces and the difference is worth being a
 * type: everything that renders a requester's name reads the named shape and
 * keeps its guarantee, while the offer mutations — whose callers use the result
 * for nothing but invalidation — say in their return type that the name is not
 * theirs to have. The keys are still present and still null, exactly as every
 * other withheld field on this document is.
 */
export const anonymousSubstitutionRequestDocument = substitutionRequestDocument.extend({
  requested_by: z.string().nullable(),
  requested_by_first_name: z.string().nullable(),
});

export type AnonymousSubstitutionRequestDocument = z.infer<
  typeof anonymousSubstitutionRequestDocument
>;

/** One recurring slot, as the pool list emits it for the client's calendar walk. */
const substitutionScheduleSlot = z.object({
  weekday: z.number(),
  start_time: z.string(),
  duration_minutes: z.number(),
});

/** One product name and teaser, in one locale. */
const substitutionProductTranslation = z.object({
  locale: z.string(),
  name: z.string(),
  description: z.string(),
});

/**
 * One line of the pool — an open request this gedu could actually take.
 *
 * **The absent gedu is not named, and neither is their reason.** Naming them
 * half-reveals a private reason (everybody knows who is off sick), and the seat
 * being substituted belongs to the group rather than to a person the volunteer
 * needs to know about. What a volunteer decides on is the session: when it is,
 * where, what it is about, which language, and what the role pays.
 *
 * **No instants travel.** The read emits the date plus the product's slots and
 * timezone, exactly as both session feeds do, and the client owns the calendar
 * math — there is one schedule expansion in this codebase and it is not in SQL.
 *
 * `fee_cents` is the fee for *this* role, and null where the product has not
 * set one. Null is a blank field rather than a volunteer session: nothing flags
 * it, which is the existing treatment of a missing assistant fee.
 */
export const openSubstitutionRequest = z.object({
  request_id: z.string(),
  group_id: z.string(),
  group_name: z.string(),
  session_date: z.string(),
  role: geduAssignmentRole,
  fee_cents: z.number().nullable(),
  /** Whether the caller has already offered — the button's two states. */
  has_offered: z.boolean(),
  product: z.object({
    id: z.string(),
    product_type: z.enum(Constants.public.Enums.product_type),
    topic: z.enum(Constants.public.Enums.product_topic),
    spoken_language_code: z.enum(Constants.public.Enums.spoken_language),
    timezone: z.string(),
    is_remote: z.boolean(),
    start_date: z.string().nullable(),
    end_date: z.string().nullable(),
    /** The venue, on in-person products only; null on anything remote. */
    site_name: z.string().nullable(),
    translations: z.array(substitutionProductTranslation),
    schedule_slots: z.array(substitutionScheduleSlot),
  }),
});

export type OpenSubstitutionRequest = z.infer<typeof openSubstitutionRequest>;

export const openSubstitutionRequests = z.array(openSubstitutionRequest);

/**
 * One gedu on a group, with the role they hold — the staffing derivation's
 * first input, and the shape both staff feeds emit it in.
 *
 * First name only, exactly as every other staff list on those surfaces: a
 * workspace names colleagues, it does not carry their records.
 */
export const sessionStaffGedu = z.object({
  id: z.string(),
  first_name: z.string(),
  role: geduAssignmentRole,
});

export type SessionStaffGedu = z.infer<typeof sessionStaffGedu>;
