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

/**
 * A gedu's answer to a request: `offer` ("I can") or `decline` ("I cannot").
 * One per (request, gedu), and the two replace each other freely until an
 * admin approves somebody — declining after offering is how an offer is taken
 * back.
 */
export const substitutionOfferResponse = z.enum(
  Constants.public.Enums.substitution_offer_response,
);

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
 * **The same document with the absent gedu withheld** — what the offer and the
 * decline return to the gedu who answered the pool.
 *
 * Volunteering must not be a way to learn who is off sick. The pool list never
 * names the absent gedu, and before this the offer that followed it did: the
 * write returned the full document, so one button-press unmasked the person the
 * list had deliberately left out — and taking back an offer the caller never
 * made did the same without writing anything at all. A decline from somebody
 * the request could not have been asked of, holding no answer on it, is
 * refused outright for the same reason.
 *
 * A second schema rather than a nullable field on the first, because the two
 * documents are read by different surfaces and the difference is worth being a
 * type: everything that renders a requester's name reads the named shape and
 * keeps its guarantee, while the two answer mutations — whose callers use the result
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

/** One recurring slot, product-local wall clock, for the client's calendar walk. */
const sessionScheduleSlot = z.object({
  weekday: z.number(),
  start_time: z.string(),
  duration_minutes: z.number(),
});

/** One product name and teaser, in one locale. */
const sessionProductTranslation = z.object({
  locale: z.string(),
  name: z.string(),
  description: z.string(),
});

/**
 * **The session's product, in the one shape every substitution surface reads it
 * in** — the gedus' pool, the admin Substitutions page, and the gedu's seat read
 * that draws a sub's own card on My SOG.
 *
 * The database builds all three from a single function, so this is the one
 * schema for it: a fact about the session added there and here reaches every
 * reader at once, and no surface is left unable to say whether a session is
 * online or where it is. It describes the product and nothing about a person —
 * who is absent, why, and what the role pays travel beside it, under each
 * read's own rules.
 *
 * **No instants travel.** It hands over the slots and the timezone, exactly as
 * both session feeds do, and the client owns the calendar math.
 */
export const sessionProductDocument = z.object({
  id: z.string(),
  product_type: z.enum(Constants.public.Enums.product_type),
  /**
   * Null when untagged. With the type, what the session's required gedu
   * qualifications are read from.
   */
  tag: z.enum(Constants.public.Enums.product_tag).nullable(),
  topic: z.enum(Constants.public.Enums.product_topic),
  spoken_language_code: z.enum(Constants.public.Enums.spoken_language),
  timezone: z.string(),
  is_remote: z.boolean(),
  start_date: z.string().nullable(),
  end_date: z.string().nullable(),
  /** The venue, on in-person products only; null on anything remote. */
  site_name: z.string().nullable(),
  translations: z.array(sessionProductTranslation),
  schedule_slots: z.array(sessionScheduleSlot),
});

export type SessionProductDocument = z.infer<typeof sessionProductDocument>;

/**
 * **One of the caller's own live requests** — the request document as its
 * requester reads it, plus the session it is on: the group's name and the
 * product shell every substitution surface describes a session from.
 *
 * Live means not withdrawn and dated today or later in the product's zone,
 * which is the very condition the filing write refuses a second filing on, so
 * a session whose `(group_id, session_date)` is here is one the write would
 * refuse: the absence picker shows it disabled and the Discord bot leaves it
 * out. The same rows are the Substitutions page's "Your requests" cards. The
 * documents are the requester's own reading, so the named schema holds — the
 * requester is always disclosed to themselves, and the offer count travels.
 */
export const liveSubstitutionRequest = substitutionRequestDocument.extend({
  group_name: z.string(),
  product: sessionProductDocument,
  /**
   * Whether the session is cancelled. Its request is still live — the filing
   * write refuses a second one there, so the picker still disables it — but a
   * surface describing requests hides it, as the pool and the admin page do: a
   * session that is not happening needs no cover.
   */
  session_cancelled: z.boolean(),
});

export type LiveSubstitutionRequest = z.infer<typeof liveSubstitutionRequest>;

/** Every one of them, soonest date first. */
export const liveSubstitutionRequests = z.array(liveSubstitutionRequest);

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
  /**
   * The caller's own answer, or null before they have given one — the card's
   * three states. A request the caller declined stays in the pool, so they can
   * still offer.
   */
  my_response: substitutionOfferResponse.nullable(),
  product: sessionProductDocument,
});

export type OpenSubstitutionRequest = z.infer<typeof openSubstitutionRequest>;

export const openSubstitutionRequests = z.array(openSubstitutionRequest);

/**
 * One gedu who has offered to stand in, on the admin queue.
 *
 * **Their name and nothing else.** It carried the certification queue's two
 * standings — `certified` and the criminal-record stamp — so the page could
 * draw the same chips; both are gone, and the reason is about the data rather
 * than the design. An uncertified gedu cannot hold an offer: the database's
 * *may substitute* predicate requires certification and guards every path that
 * creates one, approval re-asks it under the request's lock, and the
 * office-arranged write asks it too. So "certified" was true by construction,
 * and the one case a chip could have caught — somebody de-certified *after*
 * offering — is refused at approval, in words, on the row. The extract stamp is
 * children's-safety data about a contractor, and a surface that does not act on
 * it is not handed it.
 *
 * Who else offered is never shown to an offerer; this list exists on the admin
 * document alone.
 */
export const adminSubstitutionOffer = z.object({
  id: z.string(),
  gedu_id: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  /** When this answer was last given — an offer made, or re-made after a decline. */
  responded_at: z.string(),
});

export type AdminSubstitutionOffer = z.infer<typeof adminSubstitutionOffer>;

/**
 * One gedu who has said they cannot stand in, on the admin queue. Named so the
 * office knows whom asking again is pointless; carries no id of its own because
 * nothing on the admin page acts on a decline.
 */
export const adminSubstitutionDecline = z.object({
  gedu_id: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  responded_at: z.string(),
});

export type AdminSubstitutionDecline = z.infer<typeof adminSubstitutionDecline>;

/**
 * What every row of the admin document carries, open or substituted: which
 * session, whose seat, and why they are away.
 *
 * **A request whose date has passed drops out on its own.** An open one is
 * *unfilled* by then — a derived state rather than a stored one, so nothing
 * sweeps and no clock runs — and a past substitution is history the group's
 * own page carries.
 *
 * **The whole reason travels here, category and note**, and this is the one
 * surface it was collected for — everywhere else it is admin-only or absent.
 *
 * An **orphaned** request is still in this list, deliberately: an admin moving
 * the schedule's weekday after a request was filed leaves a date the schedule
 * no longer projects. The read orders by date and never by a derived instant,
 * so such a row arrives like any other and an admin can clear it.
 */
const adminSubstitutionRequestBase = z.object({
  id: z.string(),
  group_id: z.string(),
  group_name: z.string(),
  /** Product-local calendar date, `YYYY-MM-DD`. */
  session_date: z.string(),
  /** The role being substituted — the absent gedu's, and what it is paid as. */
  role: geduAssignmentRole,
  reason: substitutionReason.nullable(),
  reason_note: z.string().nullable(),
  created_at: z.string(),
  requested_by: z.string(),
  requested_by_first_name: z.string(),
  requested_by_last_name: z.string(),
  /**
   * The session's product. Its slots ride on the **request's** own product, so
   * the only absence they can carry is "no slot names this weekday" — the
   * orphaned request, which a row renders as a bare date.
   */
  product: sessionProductDocument,
  /** Answers of `offer` only, in the order they were given. */
  offers: z.array(adminSubstitutionOffer),
  /** Answers of `decline`, in the order they were given. */
  declines: z.array(adminSubstitutionDecline),
});

/**
 * A request nobody has been seated on yet, dated today or later in the
 * product's own timezone — the queue the office still has to staff. The
 * substitute and approver keys are present and null.
 */
const openAdminSubstitutionRequest = adminSubstitutionRequestBase.extend({
  status: z.literal("open"),
  substitute_id: z.null(),
  substitute_first_name: z.null(),
  substitute_last_name: z.null(),
  approved_at: z.null(),
  approved_by: z.null(),
  approved_by_first_name: z.null(),
  approved_by_last_name: z.null(),
});

/**
 * A request an admin has already seated a substitute on, dated today or later
 * — what an admin checks to see who they picked and who picked them.
 *
 * Every field here is non-null because the table's state CHECK sets the
 * substitute, the approver and the approval instant together on every
 * substituted row, and neither profile can be deleted out from under it; a
 * parse failure would mean that invariant stopped holding. `offers` and
 * `declines` are always empty: the approval answered them.
 */
const substitutedAdminSubstitutionRequest = adminSubstitutionRequestBase.extend({
  status: z.literal("substituted"),
  substitute_id: z.string(),
  substitute_first_name: z.string(),
  substitute_last_name: z.string(),
  approved_at: z.string(),
  approved_by: z.string(),
  approved_by_first_name: z.string(),
  approved_by_last_name: z.string(),
});

/**
 * One row of the admin Substitutions document, told apart by `status` — the
 * page splits the one read into its two sections.
 */
export const adminSubstitutionRequest = z.discriminatedUnion("status", [
  openAdminSubstitutionRequest,
  substitutedAdminSubstitutionRequest,
]);

export type AdminSubstitutionRequest = z.infer<typeof adminSubstitutionRequest>;

export type OpenAdminSubstitutionRequest = z.infer<
  typeof openAdminSubstitutionRequest
>;

export type SubstitutedAdminSubstitutionRequest = z.infer<
  typeof substitutedAdminSubstitutionRequest
>;

/**
 * The whole document `get_admin_substitution_requests` returns — a bare array
 * of open and substituted requests together, exactly as the gedu's own pool
 * read returns one array.
 */
export const adminSubstitutionRequests = z.array(adminSubstitutionRequest);

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
