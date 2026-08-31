import { z } from "zod";
import { Constants } from "@/types";
import { NORMALIZE_IMAGE_ERROR_CODES } from "@/lib/images/normalize-image";

/**
 * Wire contracts for the gedu session-feed RPCs.
 *
 * Both reads return a JSONB document, which the type generator can only see as
 * `Json`, so these schemas — written from the function bodies in the migration
 * that defines them — are the structure. The db tests parse real RPC output
 * through the same schemas in CI, so Postgres and TypeScript cannot drift apart
 * quietly: a changed key fails the parse loudly instead of arriving as
 * `undefined` three components later.
 */

/**
 * The attendance vocabulary, and the code-side twin of the `status` CHECK on
 * `session_attendance`.
 *
 * A tuple rather than a Postgres enum because `late` and `excused` are expected
 * additions: widening a CHECK is a one-line migration, while widening an enum
 * reaches into every generated type that names it. The trade is that the two
 * lists have to be changed together — which is what this comment is for, and
 * what the db test that writes every member of this tuple through the RPC
 * proves.
 *
 * **`undefined` is the third state and it is not in here.** A roster member
 * with no mark is *unanswered*, never absent, and it is represented by the
 * absence of a key rather than by a value.
 */
export const SUPPORTED_ATTENDANCE_STATUSES = ["present", "absent"] as const;

export type AttendanceStatus = (typeof SUPPORTED_ATTENDANCE_STATUSES)[number];

export const attendanceStatus = z.enum(SUPPORTED_ATTENDANCE_STATUSES);

const productTranslationSummary = z.object({
  locale: z.string(),
  name: z.string(),
  description: z.string(),
});

/**
 * One recurring slot in the product's schedule, as both session-feed reads emit
 * it and as the client's calendar walk consumes it.
 *
 * Exported because the admin product read (00200) returns the same three fields
 * for the same reason — its feed is built by the same merge, over the same
 * shape. One schema rather than two so a change to what a slot carries cannot
 * land on one surface and not the other.
 */
export const scheduleSlotSummary = z.object({
  weekday: z.number(),
  start_time: z.string(),
  duration_minutes: z.number(),
});

/**
 * One participant on the group's roster, as the workspace needs them.
 *
 * `parent_email` was declared **non-null** here as a deliberate tightening: a
 * gamer account is created by a parent who signed up with an email, so for a
 * child the link always exists, and a parse that fails loudly beat a roster row
 * silently rendering a blank address into a mail client.
 *
 * 00173 ended that invariant rather than broke it. A seat may now be held by an
 * adult, who has no linked parent at all, so the RPC emits null here for them
 * and their own address in `participant_email` instead. Exactly one of the two
 * fields is populated on any row, and both consumers of this one — the roster
 * cell and the copy-all-addresses affordance — already treat a missing address
 * as "no address", so the relaxation costs no caller a `?? ""`.
 */
export const geduFeedRosterEntry = z.object({
  participant_id: z.string(),
  first_name: z.string(),
  /** When they joined the group — the feed uses it for nothing else. */
  signed_up_at: z.string(),
  /**
   * The child-shaped facts, null together on an adult seat: an adult has no
   * `gamer_profiles` row and no linked game account on either platform. The row
   * renders that as a deliberate absence rather than as missing data.
   */
  date_of_birth: z.string().nullable(),
  gender: z.enum(Constants.public.Enums.gender_type).nullable(),
  minecraft_username: z.string().nullable(),
  /** Present only once a username has been resolved against Mojang. */
  minecraft_uuid: z.string().nullable(),
  /**
   * The Roblox pair (00195), on the same terms as the Minecraft one above and
   * independent of it — a child may have given one handle, both, or neither,
   * and which one the roster draws is decided by the product's topic (which
   * this document does not carry; the page takes it from the assigned-product
   * RPC).
   *
   * The account id is a **number**: Roblox's key is an int64 in a `bigint`
   * column where Mojang's is a dashed UUID in a text one. Present only once a
   * server-side lookup confirmed the account, which is the whole of "verified".
   */
  roblox_username: z.string().nullable(),
  roblox_user_id: z.number().nullable(),
  parent_email: z.string().nullable(),
  /**
   * The seat-holder's own address — emitted for an adult participant and null
   * for every child row, where `parent_email` is the contact instead. A gamer's
   * profile email is the synthetic `@gamer.sogverse.internal` handle, so "the
   * participant's email, whoever they are" would put a non-mailbox in front of
   * a gedu; the RPC decides which of the two fields a row gets, and exactly one
   * of them is ever populated.
   */
  participant_email: z.string().nullable(),
  /**
   * The staff-only flair (00203), emitted for every roster row — note or no
   * note, stamp or no stamp — and in deliberate parity with the assigned-product
   * RPC's roster, because this is the copy the page renders.
   *
   * `group_joined_at` answers a different question from `signed_up_at` above it:
   * that one is when the seat was taken on the **product**, this one is when it
   * entered **this group**, and a member moved between two groups of one product
   * has a fresh second and an unchanged first. It travels unconditionally
   * because a timestamp is a *fact* while the clubs-only newcomer rule is a
   * *presentation* rule the client applies through `showsNewcomerBadge` — so
   * null here means the seat predates the column (there was deliberately no
   * backfill), never "not a club".
   *
   * `note` is the (group, member) staff note, null when no row exists — the
   * absence of a row is what "no note" means everywhere.
   * `note_updated_by_first_name` is null alongside a note only when the editor's
   * account is gone (`updated_by` is ON DELETE SET NULL), and the surface then
   * shows the note with no editor line.
   */
  group_joined_at: z.string().nullable(),
  note: z.string().nullable(),
  note_updated_by_first_name: z.string().nullable(),
});

/**
 * One photo attached to a session's report, as the gedu document carries it.
 *
 * Three fields and no fourth. The id is the whole address: the object it names
 * is `<id>.jpg` in the public bucket, derived by the URL helper rather than
 * stored, and the id is also the React key and the argument the remove control
 * sends. The dimensions are here because every renderer — the app gallery and
 * the report email alike — sizes its boxes by **arithmetic from these**, never
 * by measuring, which is what lets server HTML and first client paint agree and
 * keeps a mail laying out correctly with every image blocked.
 *
 * `created_by` is deliberately absent: it is safeguarding audit that answers
 * "who put this here", it gates nothing, and nothing renders it — the same
 * treatment `report_emailed_by` gets on the session row above.
 */
export const sessionImageSummary = z.object({
  id: z.string(),
  width: z.number(),
  height: z.number(),
});

export type SessionImageSummary = z.infer<typeof sessionImageSummary>;

/**
 * One stored session row.
 *
 * `attendance` is the sparse per-gamer map exactly as stored — a roster id
 * missing from it is unmarked, which is the state a present-list cannot
 * express.
 *
 * Two reserved booleans stood here until 00151, parsed so the shape mirrored
 * the table. They belonged to a cancellation/substitution flow that was cut
 * from the gedu UI and is not being built, so the columns were dropped rather
 * than left advertising a feature that does not exist.
 */
export const geduFeedSession = z.object({
  id: z.string(),
  /** Product-local calendar date, `YYYY-MM-DD`. The row's real identity. */
  session_date: z.string(),
  /** Snapshot of the scheduled instants, taken at materialization. */
  starts_at: z.string(),
  ends_at: z.string(),
  report: z.string().nullable(),
  gedu_note: z.string().nullable(),
  created_at: z.string(),
  updated_at: z.string(),
  created_by: z.string().nullable(),
  updated_by: z.string().nullable(),
  /**
   * The first name behind `updated_by`, so a card can sign itself without a
   * second lookup. Null when nothing has stamped the row, and null with
   * `updated_by` set only if the profile has gone (the FK is ON DELETE SET
   * NULL, so that pairing is unreachable today) — a consumer wants BOTH halves
   * before it names anybody.
   *
   * **This is the session's last editor, not the report's author, and the
   * imprecision is accepted rather than overlooked.** `updated_by` is stamped
   * by every recorded touch: materializing the row, saving either written
   * field, and each attendance mark or unmark. So a gedu who only corrected a
   * tick, or edited the private staff note, is named on a write-up somebody
   * else typed. In practice the gedu who touches one part of a session touches
   * all of it, and a dedicated per-field author column was judged not worth the
   * schema for that edge — so the chip claims "last edited by", which is
   * exactly what this answers. Do not close the gap by quietly adding a
   * report-author column.
   */
  updated_by_first_name: z.string().nullable(),
  /**
   * When this session's report was emailed to the group's families, and null
   * until it has been. The card reads it twice over: it is what replaces the
   * **Send to parents** button with the permanent sent line, and it is the
   * third thing a session owes (see `geduAssignmentSummary` below).
   *
   * Its audit partner `report_emailed_by` is deliberately **not** on the wire.
   * Nothing renders who pressed the button — the card's author chip is
   * `updated_by_first_name` above — so the column stays in the database.
   */
  report_emailed_at: z.string().nullable(),
  /**
   * The session's photos, oldest first — ordered `(created_at, id)` by the RPC,
   * which is the display order on every surface. An empty array when there are
   * none, never a missing key or a null, so the gallery has one shape to
   * handle.
   *
   * **This key was added to the gedu document in place**, and could be, because
   * the schemas in this file are tolerant of unknown keys: the app still
   * deployed during a release window ignores a key it does not know. The family
   * document's schema is `.strict()` at every level, so the same widening there
   * needed a versioned RPC instead.
   */
  images: z.array(sessionImageSummary),
  attendance: z.record(z.string(), attendanceStatus),
});

/** The venue, on in-person products. `null` on anything remote. */
export const geduFeedSite = z.object({
  location_id: z.string(),
  name: z.string(),
  address: z.string().nullable(),
  public_note: z.string().nullable(),
  gedu_note: z.string().nullable(),
});

/**
 * Everything the group workspace renders for one group.
 *
 * There is no derived occurrence list in here on purpose: the RPC returns data
 * and TypeScript does the calendar math, so the merge of stored rows over
 * projected occurrences happens in one place on the client rather than twice in
 * two languages.
 */
export const geduGroupFeed = z.object({
  product: z.object({
    id: z.string(),
    product_type: z.enum(Constants.public.Enums.product_type),
    timezone: z.string(),
    start_date: z.string().nullable(),
    end_date: z.string().nullable(),
    is_remote: z.boolean(),
    /** Gedu/admin-only lesson material. Never rendered to a family. */
    material_url: z.string().nullable(),
    translations: z.array(productTranslationSummary),
    schedule_slots: z.array(scheduleSlotSummary),
  }),
  group: z.object({
    id: z.string(),
    name: z.string(),
    public_note: z.string().nullable(),
    gedu_note: z.string().nullable(),
  }),
  site: geduFeedSite.nullable(),
  roster: z.array(geduFeedRosterEntry),
  sessions: z.array(geduFeedSession),
});

export type GeduGroupFeed = z.infer<typeof geduGroupFeed>;
export type GeduFeedSession = z.infer<typeof geduFeedSession>;
export type GeduFeedRosterEntry = z.infer<typeof geduFeedRosterEntry>;
export type GeduFeedSite = z.infer<typeof geduFeedSite>;

/**
 * One dashboard card's worth of assignment facts.
 *
 * `attention_count` is computed server-side against the same holiday-blind
 * weekday expansion the client uses, floored at `max(product start, epoch)`, and
 * counts a finished session until **all three** parts are in: every current
 * roster member marked, a non-empty report written, and that report emailed to
 * the families. The dashboard deliberately never fetches a feed to derive it —
 * a page of cards would otherwise be a page of history downloads.
 *
 * **This derivation exists twice and the two must agree** — here in SQL for the
 * badge, and in TypeScript in the gedu feed's entry-state module for the card.
 * A change to either half is a change to both, in the same commit, or the badge
 * counts a session the card calls finished.
 */
export const geduAssignmentSummary = z.object({
  product_id: z.string(),
  group_id: z.string(),
  group_name: z.string(),
  /** Active participations in THIS group, not across the product. */
  group_participant_count: z.number(),
  /** The venue name on in-person products; `null` when there is no building. */
  site_name: z.string().nullable(),
  attention_count: z.number(),
});

export const geduAssignmentSummaries = z.array(geduAssignmentSummary);

export type GeduAssignmentSummary = z.infer<typeof geduAssignmentSummary>;

/** What `set_group_session_notes` hands back — the row as it now stands. */
export const groupSessionNotesResult = z.object({
  id: z.string(),
  group_id: z.string(),
  session_date: z.string(),
  starts_at: z.string(),
  ends_at: z.string(),
  report: z.string().nullable(),
  gedu_note: z.string().nullable(),
});

/**
 * What `record_attendance` hands back for one mark. A `null` status is the
 * revert-to-unmarked answer, and it means the row was deleted rather than
 * stored with an empty value.
 */
export const attendanceMarkResult = z.object({
  session_id: z.string(),
  participant_id: z.string(),
  status: attendanceStatus.nullable(),
});

/** What `set_group_notes` hands back. */
export const groupNotesResult = z.object({
  id: z.string(),
  public_note: z.string().nullable(),
  gedu_note: z.string().nullable(),
});

/**
 * What `set_site_notes` hands back.
 *
 * `address` is a **read-back, never an input.** The RPC does not accept an
 * address and never writes one — the venue address belongs to the location
 * record and is an admin's to edit — so what comes back here is whatever was
 * already stored, echoed so a caller can see the current value without a second
 * round trip. It used to be a parameter, and that let a gedu's note save quietly
 * revert an admin's correction with a stale cached copy.
 */
export const siteNotesResult = z.object({
  location_id: z.string(),
  address: z.string().nullable(),
  public_note: z.string().nullable(),
  gedu_note: z.string().nullable(),
});

// ---------------------------------------------------------------------------
// Emailing a session report to the families
// ---------------------------------------------------------------------------

/**
 * The two SQLSTATEs `claim_group_session_report_email` refuses with, beside the
 * `42501` every gedu RPC raises when the caller does not teach the group.
 *
 * They are **codes rather than messages** because the route turns each into a
 * different answer, and a message is not a contract — a reworded `RAISE` would
 * silently reclassify a refusal. Both are in Postgres's application-defined
 * range and are declared here so the route matches a named value; the migration
 * that raises them names this file in return.
 */
export const SESSION_REPORT_NO_REPORT_SQLSTATE = "P0021";

/** @see SESSION_REPORT_NO_REPORT_SQLSTATE */
export const SESSION_REPORT_ALREADY_SENT_SQLSTATE = "P0022";

/**
 * What `claim_group_session_report_email` hands back once the send is claimed.
 *
 * The claim is the **first** write of the send, not a record of one: it stamps
 * the row and returns it, and only then does the route compose a single mail.
 * So the `report` here is what the route mails — read back from what the claim
 * committed rather than taken from the request — and `report_emailed_at` is the
 * timestamp a total failure would release the claim against.
 *
 * Non-nullable `report` is the deliberate tightening: the RPC refuses with
 * `SESSION_REPORT_NO_REPORT_SQLSTATE` when the report is empty after trimming,
 * so a row that got this far has one. A parse failure here would mean that
 * guard stopped holding, which is exactly the thing worth failing loudly over.
 */
export const sessionReportEmailClaim = z.object({
  id: z.string(),
  group_id: z.string(),
  session_date: z.string(),
  starts_at: z.string(),
  ends_at: z.string(),
  report: z.string(),
  report_emailed_at: z.string(),
});

export type SessionReportEmailClaim = z.infer<typeof sessionReportEmailClaim>;

/**
 * Request body of `POST /api/gedu/sessions/email-report`.
 *
 * The session is named by (group, date) rather than by row id, exactly as every
 * other write on this surface names it: session rows are lazily materialized,
 * so the id is not something a caller reliably holds, while the pair is the
 * row's real identity and carries a unique constraint. Nothing else travels —
 * who to mail and what to say are both resolved server-side from the claim.
 */
export const emailSessionReportBody = z.object({
  groupId: z.string().uuid(),
  /**
   * The product-local calendar date, `YYYY-MM-DD`. A bare date with no zone and
   * no clock face: which instants it covers is the session row's business, and
   * re-anchoring it to anybody's timezone here would move it a day.
   */
  sessionDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "sessionDate must be a YYYY-MM-DD date"),
});

export type EmailSessionReportBody = z.infer<typeof emailSessionReportBody>;

/**
 * Response body of `POST /api/gedu/sessions/email-report` — the tally of one
 * fan-out, counted in **participations**, which is the same unit the confirm
 * dialog counts in so the two cannot disagree.
 *
 * `skipped` is a seat with no address to mail (neither a linked parent nor an
 * adult holding their own seat). It is counted rather than treated as a failure
 * because nothing went wrong with the send — there was nobody to send to — and
 * the staff copy is how that gap reaches a human.
 *
 * A `200` carrying `failed > 0` is a **partial** success and the claim stands:
 * the families who received the mail must not receive it twice. A fan-out where
 * every send failed is not this shape at all — it releases the claim and answers
 * an error, because nobody received anything and the gedu may retry.
 */
export const emailSessionReportResponse = z.object({
  sent: z.number().int().nonnegative(),
  failed: z.number().int().nonnegative(),
  skipped: z.number().int().nonnegative(),
});

export type EmailSessionReportResponse = z.infer<
  typeof emailSessionReportResponse
>;

// ---------------------------------------------------------------------------
// Session-report photos
// ---------------------------------------------------------------------------

/**
 * **How many photos one report may carry — the single point of control.**
 *
 * Nothing else in the system holds this number: the route passes it to the
 * insert RPC as a parameter, the RPC enforces it under the session row's lock,
 * and the editor hides its add affordance once a session holds this many. So
 * raising the cap is this one line and no migration. SQL keeps only a hard
 * sanity ceiling of 24, which exists so a buggy caller cannot ask for something
 * absurd — the two numbers are not derived from one another and are not meant
 * to be.
 */
export const SESSION_PHOTO_CAP = 5;

/**
 * The file input's `accept` list — and the reason the mainline iPhone path
 * needs no code at all.
 *
 * iOS Safari transcodes a photo-library pick to JPEG on its way through an
 * input whose accept list excludes HEIC, so naming only web formats here is
 * what makes an iPhone photo arrive decodable. Raw HEIC still comes in by the
 * side doors (a Files-app pick, a macOS drag-drop) and is refused by the
 * route's magic-byte check with copy the gedu can act on; there is deliberately
 * no decode shim.
 *
 * It is an `accept` attribute value, not a validation list. Nothing trusts it:
 * the browser re-encodes every pick to JPEG and the route verifies the bytes.
 */
export const SESSION_PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";

/**
 * The upload's byte cap — a generous 3 MB against a normalized output that
 * should be well under 1 MB.
 *
 * It is a bound on something already normalized rather than a limit on what a
 * gedu may pick, which is why it can be this loose: a 4K screenshot is a few
 * hundred KB by the time it leaves the browser. Anything near this figure means
 * the client-side pass did not run, and the route refuses rather than rescues.
 */
export const SESSION_PHOTO_MAX_BYTES = 3 * 1024 * 1024;

/**
 * The longest edge the browser downscales to, and the JPEG quality it
 * re-encodes at. Passed explicitly into the normalization pass — that module
 * carries fallbacks so it can be exercised alone, but these are the values the
 * product uses and the place they are changed.
 */
export const SESSION_PHOTO_MAX_EDGE = 2048;

/** @see SESSION_PHOTO_MAX_EDGE */
export const SESSION_PHOTO_JPEG_QUALITY = 0.8;

/**
 * The plausibility bound on the dimensions a client claims, and the code-side
 * twin of the table's CHECK.
 *
 * **Deliberately looser than the edge cap above, and not derived from it.** The
 * client normalizes to ~2048 px; this is a sanity bound on a *claimed* number,
 * not a restatement of a *derived* one. What it defends is layout arithmetic —
 * the stored dimensions are what the gallery and the email size their boxes
 * from — and the uploader is an assigned staff member, so the worst an
 * implausible value produces is a mis-sized box in that group's own mail. The
 * route checks it so the refusal is a stable code rather than a raw 23514, and
 * the CHECK still stands behind that.
 */
export const SESSION_PHOTO_MAX_DIMENSION = 4096;

/**
 * The SQLSTATE `add_group_session_image` refuses with when the session already
 * holds its cap, beside the `42501` every gedu RPC raises for a group the
 * caller does not teach.
 *
 * A code of its own because the UI answers it differently from every other
 * refusal — "remove one first", not "that did not work" — and because a
 * message is not a contract: a reworded `RAISE` must not be able to reclassify
 * it. Declared here so the route matches a named value; the migration that
 * raises it names this file in return.
 */
export const SESSION_PHOTO_CAP_REACHED_SQLSTATE = "P0023";

/**
 * **One vocabulary of refusals, wherever they arise.**
 *
 * A photo upload can fail in the browser (the decoder refuses a raw HEIC, a
 * canvas encode fails) or at the route (the bytes are not a JPEG, they are over
 * the cap, the session is full). The gedu does not care which side answered —
 * they care what to do next — so both halves travel as members of ONE union
 * that the UI resolves with `t()`. The two client codes are absorbed from the
 * normalization module rather than restated, so there is no second spelling of
 * `decodeFailed` to keep in step.
 *
 * These are **keys, not copy**: nothing renders `err.message`, and a route's
 * own English is written for a log.
 *
 * - `decodeFailed` / `encodeFailed` — the browser pass, before any upload.
 * - `notJpeg` — the magic-byte check refused the bytes. The raw-HEIC door, and
 *   the one refusal whose copy tells the gedu to convert and try again.
 * - `tooLarge` — over {@link SESSION_PHOTO_MAX_BYTES}.
 * - `badDimensions` — the claimed width/height are missing or outside
 *   {@link SESSION_PHOTO_MAX_DIMENSION}.
 * - `capReached` — the session already holds {@link SESSION_PHOTO_CAP} photos.
 *   Reachable despite the editor hiding its add control, because two tabs can
 *   race and the RPC is what actually decides.
 * - `notAllowed` — not this caller's group, or not a role that may attach.
 * - `uploadFailed` — everything else: storage refused the object, the
 *   compensation ran, or the session date turned out not to be writable. One
 *   code because the gedu's next move is the same for all of them — try again.
 */
export const SESSION_PHOTO_ERROR_CODES = [
  ...NORMALIZE_IMAGE_ERROR_CODES,
  "notJpeg",
  "tooLarge",
  "badDimensions",
  "capReached",
  "notAllowed",
  "uploadFailed",
] as const;

export type SessionPhotoErrorCode = (typeof SESSION_PHOTO_ERROR_CODES)[number];

/**
 * Narrow an error's `code` to the union above.
 *
 * A route's code arrives as an untyped string off the wire, and a UI that
 * looked it up blindly would render a missing translation key on the one path
 * where something already went wrong. Anything unrecognized falls back to
 * `uploadFailed` at the call site.
 */
export function isSessionPhotoErrorCode(
  value: unknown,
): value is SessionPhotoErrorCode {
  return (
    typeof value === "string" &&
    (SESSION_PHOTO_ERROR_CODES as readonly string[]).includes(value)
  );
}

/**
 * The non-file half of `POST /api/gedu/sessions/images`'s multipart form.
 *
 * The file travels beside these as a `File`; everything here arrives as a form
 * string, which is why the two numbers coerce. The session is named by (group,
 * date) rather than by row id, exactly as every other write on this surface
 * names it — session rows are lazily materialized, so the id is not something a
 * caller reliably holds, while the pair is the row's real identity.
 *
 * The dimensions are the CLIENT'S claim about the JPEG it just encoded, and
 * they are **trusted after this bound check**. There is no server-side SOF
 * parser: it would defend a cosmetic outcome against an already-assigned staff
 * member with ~30 lines of hand-rolled binary parsing and no precedent in this
 * repo.
 */
export const addSessionImageFields = z.object({
  groupId: z.string().uuid(),
  /** The product-local calendar date, `YYYY-MM-DD`. A bare date, no zone. */
  sessionDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "sessionDate must be a YYYY-MM-DD date"),
  width: z.coerce
    .number()
    .int()
    .positive()
    .max(SESSION_PHOTO_MAX_DIMENSION),
  height: z.coerce
    .number()
    .int()
    .positive()
    .max(SESSION_PHOTO_MAX_DIMENSION),
});

export type AddSessionImageFields = z.infer<typeof addSessionImageFields>;

/**
 * What the upload answers: the new row's id, and nothing else.
 *
 * The id is the whole of what the caller does not already know — it names the
 * object that was just stored, so the URL follows from it by helper. The width,
 * the height and the session are values the caller just sent.
 */
export const addSessionImageResponse = z.object({ id: z.string().uuid() });

export type AddSessionImageResponse = z.infer<typeof addSessionImageResponse>;

/**
 * The dynamic segment of `DELETE /api/gedu/sessions/images/[id]`.
 *
 * The photo id is the whole request: the RPC resolves the group from the row
 * itself, and that resolution is the authorization.
 */
export const deleteSessionImageParams = z.object({ id: z.string().uuid() });
