/**
 * Who is expected to run one session, derived from the group's assignments and
 * that date's cover requests.
 *
 * **The rule is one sentence, and it is the whole module:** *a gedu is expected
 * at (group, date) iff they hold no non-withdrawn request for it, and they are
 * either assigned to the group or hold a `covered` request for it.* The SQL says
 * the same thing in a predicate; this is its TypeScript twin, and the two are
 * meant to be read against each other — a behaviour the DB suite tests and this
 * module does not is a divergence, not a simplification.
 *
 * That one sentence already answers the awkward cases, which is why nothing here
 * special-cases them:
 *
 * - **The chain.** A sub who files their own request is absent by the first
 *   half, whatever the second half says about them — so A → B → C leaves only C,
 *   and B's request going open again leaves the seat empty rather than handing it
 *   back to anybody.
 * - **A cleared cover.** The request is `open`, so its sub holds no covered
 *   request and its requester still holds a live one: nobody is expected for that
 *   seat, which is exactly what puts the session back in the queue.
 * - **A withdrawn request.** It is absent from the derivation entirely, so the
 *   requester falls back to their assignment and is expected again.
 *
 * **Two questions, two sources.** This derivation answers *who is expected*; the
 * request rows answer *who did which job, in which role, for whom*. The second is
 * not recomputed from the first — the states below carry the rows through, so a
 * card can render a status line and an action from the same call that told it the
 * staffing.
 *
 * Pure and clock-free: `unfilled` (an open request whose date has passed) is a
 * question about now, so it belongs to the caller that already holds a clock, and
 * every date comparison here is an equality between product-local `YYYY-MM-DD`
 * strings. The inputs are structural on purpose — the service maps its zod output
 * onto them — so nothing here depends on the generated database types.
 */

/** The pay class an assignment or a cover carries. */
export type GeduAssignmentRole = "primary" | "assistant";

/** A gedu assigned to the group, as the feeds list them. */
export interface StaffingAssignment {
  id: string;
  firstName: string;
  role: GeduAssignmentRole;
}

/** Whoever a request names: the absent gedu, or their sub. */
export interface StaffingPerson {
  id: string;
  firstName: string;
}

/**
 * A stored cover request, as the feeds' `covers` list carries it.
 *
 * The list is the whole group's, unbounded, so `sessionDate` is what scopes a
 * row to the session being derived; a caller hands the same array to every entry
 * and this module picks out the date it was asked about.
 */
export interface CoverRequestInput {
  id: string;
  /** Product-local `YYYY-MM-DD`, the session's own key. */
  sessionDate: string;
  requestedBy: StaffingPerson;
  /** The role the absent gedu held when they filed — not their sub's. */
  role: GeduAssignmentRole;
  status: "open" | "covered" | "withdrawn";
  coveredBy: StaffingPerson | null;
  /**
   * How many gedus have offered, where the reader is allowed to know: the
   * requester on their own request, and an admin on any. `null` or absent is
   * "not disclosed", which is why the status below carries it through rather
   * than defaulting it to zero — nobody offering and nobody being told are
   * different facts.
   */
  offerCount?: number | null;
  /**
   * Whether the caller is the requester, as the gedu feed's document states it.
   * Read only when {@link SessionStaffingArgs.viewerId} is not supplied; an id
   * is the stronger answer and wins wherever both are present.
   */
  isMine?: boolean;
}

/** A gedu the session expects, with the role they will be paid for. */
export interface ExpectedGedu {
  id: string;
  firstName: string;
  role: GeduAssignmentRole;
}

/** A withdrawn request is history; only these two states render. */
export type LiveCoverRequestStatus = "open" | "covered";

/** One live request on this date, in the shape a card renders it. */
export interface CoverRequestState {
  id: string;
  status: LiveCoverRequestStatus;
  requestedBy: StaffingPerson;
  role: GeduAssignmentRole;
  /** The sub, on a `covered` request; `null` while it is open. */
  coveredBy: StaffingPerson | null;
  /** Offers waiting, or `null` where the reader is not told. */
  offerCount: number | null;
  /** Whether the viewer filed this one — the Withdraw action's gate. */
  isViewers: boolean;
}

export interface SessionStaffing {
  /** Primaries first, then assistants; stable within each. */
  expected: ExpectedGedu[];
  /** Every non-withdrawn request on this date, in the same stable order. */
  requests: CoverRequestState[];
  /**
   * Whether the viewer is one of `expected` — what gates the "I can't make this
   * session" action. `false` with no viewer, which is the honest answer for the
   * admin shell and the preview scenes alike.
   */
  viewerIsExpected: boolean;
  /**
   * The viewer's own live request for this date, or `null`. Carries the status
   * line and the Withdraw action; a viewer holding one can never also be
   * expected, so the two fields are never both set.
   */
  viewerRequest: CoverRequestState | null;
}

export interface SessionStaffingArgs {
  /** The group's assignments, with roles, in any order. */
  gedus: readonly StaffingAssignment[];
  /** The group's cover requests, any date, any status, in any order. */
  requests: readonly CoverRequestInput[];
  /** Product-local `YYYY-MM-DD` — the session being staffed. */
  sessionDate: string;
  /** The signed-in gedu, where there is one. */
  viewerId?: string | null;
}

/**
 * The staffing of one (group, date): who is expected, what is outstanding, and
 * what the viewer may do about it.
 */
export function deriveSessionStaffing(
  args: SessionStaffingArgs,
): SessionStaffing {
  const { gedus, requests, sessionDate, viewerId = null } = args;

  const live = requests.filter(
    (request) =>
      request.sessionDate === sessionDate && request.status !== "withdrawn",
  );

  // The first half of the sentence, and it is applied to everybody: an absent
  // gedu is absent whether their seat came from an assignment or from a cover,
  // which is what makes the chain fall out rather than needing a walk.
  const absent = new Set(live.map((request) => request.requestedBy.id));

  const expected = new Map<string, ExpectedGedu>();
  for (const gedu of gedus) {
    if (absent.has(gedu.id)) continue;
    expected.set(gedu.id, {
      id: gedu.id,
      firstName: gedu.firstName,
      role: gedu.role,
    });
  }
  for (const request of live) {
    const sub = request.status === "covered" ? request.coveredBy : null;
    if (sub === null || absent.has(sub.id)) continue;
    // Assignments were laid down first and are not overwritten: where a gedu is
    // both assigned and covering somebody on the same group — only an admin edit
    // produces it — the assignment supplies the role, the same way the SQL
    // predicate resolves it. Two covers by one person cannot arise (the *may
    // cover* guard refuses anyone already expected), and if one ever did, the
    // first is kept rather than the seat being doubled.
    if (expected.has(sub.id)) continue;
    expected.set(sub.id, {
      id: sub.id,
      firstName: sub.firstName,
      role: request.role,
    });
  }

  const states = live
    .map((request) => toRequestState(request, viewerId))
    .sort(compareRequestStates);

  const expectedList = [...expected.values()].sort(compareExpected);

  return {
    expected: expectedList,
    requests: states,
    viewerIsExpected:
      viewerId !== null && expectedList.some((gedu) => gedu.id === viewerId),
    viewerRequest: states.find((state) => state.isViewers) ?? null,
  };
}

/**
 * Whether this gedu holds a non-withdrawn request on this date — the half of the
 * derivation that stands on its own.
 *
 * It is what the owed-work computation asks: a session on a date the viewer has
 * a live request for is not their work outstanding, whoever ends up running it.
 * Exported rather than re-derived there so the rule has one home, which is what
 * the assignment-summaries RPC's comment asks of its TypeScript twin.
 */
export function holdsLiveCoverRequest(
  requests: readonly CoverRequestInput[],
  sessionDate: string,
  geduId: string,
): boolean {
  return requests.some(
    (request) =>
      request.sessionDate === sessionDate &&
      request.status !== "withdrawn" &&
      request.requestedBy.id === geduId,
  );
}

function toRequestState(
  request: CoverRequestInput,
  viewerId: string | null,
): CoverRequestState {
  // `covered` is the only status that names a sub, so an open request renders
  // `null` even if a stale `covered_by` ever rode along on the row.
  const covered = request.status === "covered";
  return {
    id: request.id,
    status: covered ? "covered" : "open",
    requestedBy: request.requestedBy,
    role: request.role,
    coveredBy: covered ? request.coveredBy : null,
    offerCount: request.offerCount ?? null,
    isViewers:
      viewerId !== null
        ? request.requestedBy.id === viewerId
        : (request.isMine ?? false),
  };
}

/**
 * Primaries before assistants, then by first name, then by id.
 *
 * The tie-breaks matter more than the sort does: two gedus of one group share a
 * first name often enough, and an order that fell back to whatever the RPC
 * returned would let a re-fetch reshuffle a staffing line under the reader. The
 * name comparison is by code unit rather than by locale, because SSR and the
 * first client render have to agree on it and they do not share an ICU build —
 * a staffing line is a handful of names, not an alphabetical index.
 */
function compareExpected(a: ExpectedGedu, b: ExpectedGedu): number {
  return (
    compareRoles(a.role, b.role) ||
    compareStrings(a.firstName, b.firstName) ||
    compareStrings(a.id, b.id)
  );
}

/** The same key, read off the absent gedu each request is filed for. */
function compareRequestStates(
  a: CoverRequestState,
  b: CoverRequestState,
): number {
  return (
    compareRoles(a.role, b.role) ||
    compareStrings(a.requestedBy.firstName, b.requestedBy.firstName) ||
    compareStrings(a.id, b.id)
  );
}

function compareRoles(a: GeduAssignmentRole, b: GeduAssignmentRole): number {
  if (a === b) return 0;
  return a === "primary" ? -1 : 1;
}

function compareStrings(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}
