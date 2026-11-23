/**
 * Who is expected to run one session, derived from the group's assignments and
 * that date's substitution requests.
 *
 * **The rule is one sentence, and it is the whole module:** *a gedu is expected
 * at (group, date) iff they hold no non-withdrawn request for it, and they are
 * either assigned to the group at that session or hold a `substituted` request
 * for it.* The SQL says the same thing in a predicate; this is its TypeScript
 * twin, and the two are meant to be read against each other — a behaviour the
 * DB suite tests and this module does not is a divergence, not a
 * simplification. Do not write a third.
 *
 * **"Assigned at that session"** is an assignment period containing the
 * session's start instant: `startedAt <= start < endedAt`, an open end for a
 * period still current. A gedu taken off a group keeps the sessions that
 * started while they held it, and a replacement gets only the ones after; a
 * role change ends one period and starts another, so each session is staffed
 * in the role of the period it fell in; and the gap between a removal and a
 * later re-add belongs to neither period.
 *
 * That one sentence already answers the awkward cases, which is why nothing here
 * special-cases them:
 *
 * - **The chain.** A sub who files their own request is absent by the first
 *   half, whatever the second half says about them — so A → B → C leaves only C,
 *   and B's request going open again leaves the seat empty rather than handing it
 *   back to anybody.
 * - **A cleared substitution.** The request is `open`, so its sub holds no substituted
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
 * question about now, so it belongs to the caller that already holds a clock.
 * Requests are matched by equality between product-local `YYYY-MM-DD` strings,
 * and assignment periods by the session's start instant, which the caller
 * hands in. The inputs are structural on purpose — the service maps its zod output
 * onto them — so nothing here depends on the generated database types.
 */

/** The pay class an assignment or a substitution carries. */
export type GeduAssignmentRole = "primary" | "assistant";

/**
 * One assignment period on the group, as the feeds list them — ended ones
 * included, because a past session belongs to whoever held the group then.
 */
export interface StaffingAssignment {
  id: string;
  firstName: string;
  role: GeduAssignmentRole;
  /** When the period began; a session starting at this instant is inside it. */
  startedAt: Date;
  /** When it ended, or `null` while it is current; this instant is outside it. */
  endedAt: Date | null;
}

/** Whoever a request names: the absent gedu, or their sub. */
export interface StaffingPerson {
  id: string;
  firstName: string;
}

/**
 * A stored substitution request, as the feeds' `substitutions` list carries it.
 *
 * The list is the whole group's, unbounded, so `sessionDate` is what scopes a
 * row to the session being derived; a caller hands the same array to every entry
 * and this module picks out the date it was asked about.
 */
export interface SubstitutionRequestInput {
  id: string;
  /** Product-local `YYYY-MM-DD`, the session's own key. */
  sessionDate: string;
  requestedBy: StaffingPerson;
  /** The role the absent gedu held when they filed — not their sub's. */
  role: GeduAssignmentRole;
  status: "open" | "substituted" | "withdrawn";
  substituteId: StaffingPerson | null;
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
export type LiveSubstitutionRequestStatus = "open" | "substituted";

/** One live request on this date, in the shape a card renders it. */
export interface SubstitutionRequestState {
  id: string;
  status: LiveSubstitutionRequestStatus;
  requestedBy: StaffingPerson;
  role: GeduAssignmentRole;
  /** The sub, on a `substituted` request; `null` while it is open. */
  substituteId: StaffingPerson | null;
  /** Offers waiting, or `null` where the reader is not told. */
  offerCount: number | null;
  /** Whether the viewer filed this one — the Withdraw action's gate. */
  isViewers: boolean;
}

export interface SessionStaffing {
  /** Primaries first, then assistants; stable within each. */
  expected: ExpectedGedu[];
  /** Every non-withdrawn request on this date, in the same stable order. */
  requests: SubstitutionRequestState[];
  /**
   * Whether the viewer is one of `expected` — what gates the "I can't make this
   * session" action. `false` with no viewer, which is the honest answer for the
   * admin shell and the preview scenes alike.
   */
  viewerIsExpected: boolean;
  /**
   * Whether the staffing was derived for a signed-in gedu at all. `false` on the
   * admin shell and the preview scenes, which is what tells "the viewer is not
   * expected" apart from "there is no viewer to be expected".
   */
  hasViewer: boolean;
  /**
   * The viewer's own live request for this date, or `null`. Carries the status
   * line and the Withdraw action; a viewer holding one can never also be
   * expected, so the two fields are never both set.
   */
  viewerRequest: SubstitutionRequestState | null;
  /**
   * Whether the viewer may write this session up — its register, its report
   * and note, its photos. `true` wherever the viewer holds the group outright,
   * and with no viewer at all; on a {@link ViewerTemporarySeat}, every session
   * where a live substitution writes group-wide, else only the seat's dates.
   */
  viewerMayWrite: boolean;
  /**
   * Whether the viewer may send this session's report to the families. `true`
   * wherever the viewer holds the group outright, and with no viewer at all; on
   * a {@link ViewerTemporarySeat}, only the seat's dates, whatever it writes.
   */
  viewerMaySend: boolean;
}

/**
 * What a reader holding the group through a **temporary seat** may reach — a
 * substitute, or a gedu taken off the group whose window is still open — as the
 * workspace document states it. A reader who holds the group outright has none.
 *
 * This is the second question the module answers, and it has a different
 * source from the first: *who is expected* is derived here from the periods and
 * the requests, while *what the viewer's seat reaches* is the database's answer,
 * handed in whole, because the window behind it has exactly one definition and
 * it is in SQL.
 */
export interface ViewerTemporarySeat {
  /** A live substitution on the group writes every session of it. */
  writesEverySession: boolean;
  /** Product-local `YYYY-MM-DD` — the sessions the seat holds. */
  sessionDates: ReadonlySet<string>;
}

/**
 * The staffing of a session nobody is assigned to and nobody has filed against
 * — what {@link deriveSessionStaffing} answers for an empty group.
 *
 * It exists because every feed entry carries a staffing and a fixture that is
 * not *about* staffing still has to hand over one that is true. Frozen and
 * shared rather than rebuilt per call site: it is a constant, and a mutable
 * literal handed to a hundred entries is a shared array waiting to be pushed to.
 */
export const NO_SESSION_STAFFING: Readonly<SessionStaffing> = Object.freeze({
  expected: [],
  requests: [],
  viewerIsExpected: false,
  hasViewer: false,
  viewerRequest: null,
  viewerMayWrite: true,
  viewerMaySend: true,
});

export interface SessionStaffingArgs {
  /** The group's assignment periods, ended ones included, in any order. */
  gedus: readonly StaffingAssignment[];
  /** The group's substitution requests, any date, any status, in any order. */
  requests: readonly SubstitutionRequestInput[];
  /** Product-local `YYYY-MM-DD` — the session being staffed. */
  sessionDate: string;
  /**
   * The session's start instant — the stored row's snapshot where there is one,
   * else the plan's — which picks the assignment periods that staff it.
   */
  sessionStartsAt: Date;
  /** The signed-in gedu, where there is one. */
  viewerId?: string | null;
  /**
   * The viewer's temporary seat on the group, or `null` (the default) where
   * they hold it outright or there is no viewer — every session is theirs.
   */
  viewerSeat?: ViewerTemporarySeat | null;
}

/**
 * The staffing of one (group, date): who is expected, what is outstanding, and
 * what the viewer may do about it.
 */
export function deriveSessionStaffing(
  args: SessionStaffingArgs,
): SessionStaffing {
  const {
    gedus,
    requests,
    sessionDate,
    sessionStartsAt,
    viewerId = null,
    viewerSeat = null,
  } = args;

  const live = requests.filter(
    (request) =>
      request.sessionDate === sessionDate && request.status !== "withdrawn",
  );

  // The first half of the sentence, and it is applied to everybody: an absent
  // gedu is absent whether their seat came from an assignment or from a substitution,
  // which is what makes the chain fall out rather than needing a walk.
  const absent = new Set(live.map((request) => request.requestedBy.id));

  const expected = new Map<string, ExpectedGedu>();
  for (const gedu of gedus) {
    if (!heldAt(gedu, sessionStartsAt)) continue;
    if (absent.has(gedu.id)) continue;
    expected.set(gedu.id, {
      id: gedu.id,
      firstName: gedu.firstName,
      role: gedu.role,
    });
  }
  for (const request of live) {
    const sub = request.status === "substituted" ? request.substituteId : null;
    if (sub === null || absent.has(sub.id)) continue;
    // Assignments were laid down first and are not overwritten: where a gedu is
    // both assigned and substituting somebody on the same group — only an admin edit
    // produces it — the assignment supplies the role, the same way the SQL
    // predicate resolves it. Two substitutions by one person cannot arise (the *may
    // substitution* guard refuses anyone already expected), and if one ever did, the
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
    hasViewer: viewerId !== null,
    viewerRequest: states.find((state) => state.isViewers) ?? null,
    ...viewerSessionReach(viewerSeat, sessionDate),
  };
}

/**
 * What the viewer's seat lets them do on one session: write it up, and send
 * it. A seat holding the group outright reaches both on every session; a
 * temporary seat sends only on its own dates, and writes on them too unless a
 * live substitution writes every session — the same answer
 * `gedu_writes_group_session` and the report claim give in SQL.
 */
function viewerSessionReach(
  seat: ViewerTemporarySeat | null,
  sessionDate: string,
): Pick<SessionStaffing, "viewerMayWrite" | "viewerMaySend"> {
  if (seat === null) return { viewerMayWrite: true, viewerMaySend: true };
  const held = seat.sessionDates.has(sessionDate);
  return {
    viewerMayWrite: seat.writesEverySession || held,
    viewerMaySend: held,
  };
}

/**
 * Whether an assignment period contains the instant: `startedAt <= at <
 * endedAt`, an open end for a current period. The SQL twin is
 * `group_assignments_at`.
 */
function heldAt(period: StaffingAssignment, at: Date): boolean {
  const instant = at.getTime();
  return (
    period.startedAt.getTime() <= instant &&
    (period.endedAt === null || instant < period.endedAt.getTime())
  );
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
export function holdsLiveSubstitutionRequest(
  requests: readonly SubstitutionRequestInput[],
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

/**
 * One request as a card states it. Exported for the Substitutions page's "Your
 * requests", which draws the same panel as a session card from the gedu's own
 * live requests and must read them exactly as the derivation does.
 */
export function toRequestState(
  request: SubstitutionRequestInput,
  viewerId: string | null,
): SubstitutionRequestState {
  // `substituted` is the only status that names a sub, so an open request renders
  // `null` even if a stale `substitute_id` ever rode along on the row.
  const substituted = request.status === "substituted";
  return {
    id: request.id,
    status: substituted ? "substituted" : "open",
    requestedBy: request.requestedBy,
    role: request.role,
    substituteId: substituted ? request.substituteId : null,
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
  a: SubstitutionRequestState,
  b: SubstitutionRequestState,
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
