import type {
  GeduAssignmentRole,
  ProductType,
  SubstitutionReason,
} from "@/types";
import type { AppHref } from "@/lib/constants/routes";

/**
 * Everything the Substitutions page body renders, already in the reader's
 * language and zone.
 *
 * The page's own module rather than the dashboard's, because the two documents
 * are two reads now: the queue left the dashboard when it got a sidebar entry
 * of its own, and a shape shared between them would be the one thing tying the
 * pages back together.
 */

/**
 * One gedu who has volunteered to substitute at a session — a name, and the ids
 * behind it.
 *
 * **No standings.** It carried `certified` and the criminal-record stamp so the
 * row could draw the certification queue's chips, and both are gone: the
 * database refuses an offer from anybody who may not substitute, certification
 * included, so a "certified" chip said something that was true by construction,
 * and an extract date is children's-safety data about a contractor that this
 * page does not act on. The one case the chips could have caught — an offerer
 * de-certified after offering — is refused at approval and read on the row.
 */
export interface SubstitutionOffer {
  /**
   * The **offer's** id, not the gedu's: it is what Approve posts, because the
   * approval is of one offer on one request rather than of a person.
   */
  id: string;
  /**
   * The offerer's account id. Real, because the identicon beside the name is
   * hashed out of its hex bytes.
   */
  geduId: string;
  /** `null` where the account carries no name; the row words the stand-in. */
  name: string | null;
}

/**
 * One session somebody cannot make, as either section of the page states it:
 * which session, how soon, whose seat and why — sorted soonest-first and
 * carrying what makes that sort legible.
 *
 * **The date is the product's and the clock face is the reader's**, and the two
 * are deliberately not resolved into one zone. The date is the request's own
 * key — (group, date, absent gedu) — and is what every other surface that names
 * this session states, so converting it would leave this page and the group
 * page disagreeing about which day is short-staffed. The time is a clock face,
 * and every clock face here is the viewer's, which is what the zone
 * abbreviation in the heading discloses. For a Helsinki admin reading Helsinki
 * products — the ordinary case, and the one the abbreviation stays `null` for —
 * there is nothing to reconcile.
 *
 * An **orphaned** request (an admin moved the schedule's weekday after it was
 * filed) resolves to no occurrence at all and carries `sessionTime: null` and
 * `startsAt: null`, rendering under its day with no time and no urgency
 * claimed. That is the case this page exists to tolerate: the read orders by
 * date and never by a derived instant.
 */
export interface SubstitutionSession {
  id: string;
  groupId: string;
  groupName: string;
  /** The product's name in the reader's locale — never truncated, as on a card. */
  productName: string;
  productType: ProductType;
  /**
   * The session's product-local calendar date, `YYYY-MM-DD` — what the list
   * groups by. Never derived from `startsAt`, so the orphan still has a day.
   */
  sessionDay: string;
  /** The same date, already formatted, for the approval dialog's sentence. */
  sessionDate: string;
  /**
   * When the session runs, as `HH:MM–HH:MM` in the **viewer's** zone — or
   * `null` where the product's schedule puts no slot on that weekday.
   *
   * Both ends, unlike a schedule chip, which states a start and keeps its
   * duration in a `title`. A chip sits in a grid of a hundred others where the
   * start is what places it; a queue row is a handful of sessions an admin is
   * finding somebody for, and how long they would be there is half of what
   * they are being asked.
   */
  sessionTime: string | null;
  /**
   * The instant the session begins, or `null` for the orphan.
   *
   * Here rather than pre-phrased because how long away it is has to be *said* —
   * "in 3 hours", "tomorrow" — and the phrasing is the reader's locale's, which
   * only a formatter in the component has.
   */
  startsAt: Date | null;
  /** The role being substituted — the absent gedu's, and what the sub is paid as. */
  role: GeduAssignmentRole;
  reason: SubstitutionReason | null;
  reasonNote: string | null;
  /** The absent gedu's account id — the identicon's input, so a real UUID. */
  requesterId: string;
  /** `null` where the account carries no name; the row words the stand-in. */
  requesterName: string | null;
  /**
   * The group's own admin page — where the whole session's staffing is in
   * view, and where a seated substitute is changed or cleared.
   */
  groupHref: AppHref;
}

/** One open request: the session, and who has volunteered to stand in. */
export interface SubstitutionRequest extends SubstitutionSession {
  /**
   * The session begins within a day and is still to staff, and the card says
   * so more loudly.
   *
   * Decided in the mapping rather than in the card because it is a fact about
   * the page's pinned `now` and the session's own start, and a component
   * recomputing it from the same two values would be a second definition of
   * "soon".
   */
  urgent: boolean;
  /** As delivered: the read orders by date then product, and so does the list. */
  offers: readonly SubstitutionOffer[];
}

/**
 * An admin's choice of substitute for one open request, made on its card from
 * the full list of gedus rather than from an offer.
 *
 * It carries the request whole because the request *is* the seat — its group,
 * its date and its absent gedu are the write's three keys — and the chosen
 * gedu's name because the preview's stand-in for the refetch has to say who
 * was seated. **It carries no reason**: the request already has one.
 */
export interface SeatSubstituteDraft {
  request: SubstitutionRequest;
  sub: { id: string; firstName: string; lastName: string };
}

/**
 * One upcoming session that already has a substitute: the session, who stands
 * in, and who seated them — what an admin reads to check they picked the right
 * person and to know whom to tell.
 */
export interface SubstitutedSession extends SubstitutionSession {
  /** The substitute's account id — the identicon's input, so a real UUID. */
  substituteId: string;
  /** `null` where the account carries no name; the card words the stand-in. */
  substituteName: string | null;
  /** When the approval landed — said as a relative phrase on the card. */
  approvedAt: Date;
  /** The approving admin's first name, which a profile always carries. */
  approverFirstName: string;
}

/** Everything the page body renders. */
export interface AdminSubstitutionsData {
  /**
   * The instant the page is "now" for — what every relative phrase on it is
   * measured against, and what decides which rows are urgent.
   */
  now: Date;
  /**
   * The viewer's short zone abbreviation, or `null` when every session on the
   * page is already authored in the viewer's own zone and nothing converted.
   */
  timeZoneAbbrev: string | null;
  /** Open requests, soonest session first. Empty is the all-clear. */
  open: readonly SubstitutionRequest[];
  /**
   * Upcoming sessions that already have a substitute, soonest first by the
   * same rule as `open`. Empty says no upcoming session has one.
   */
  substituted: readonly SubstitutedSession[];
}
