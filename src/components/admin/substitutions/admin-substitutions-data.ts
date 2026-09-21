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
 * One gedu who has volunteered to substitute at a session, and the two
 * standings an admin weighs before seating them.
 *
 * They are the certification queue's two standings in the certification
 * queue's own shape, deliberately: an admin choosing a sub is asking what they
 * ask when certifying somebody, and a second vocabulary for "certified" and
 * "extract recorded" would be a second thing to keep in step. Neither gates the
 * action — the database has already refused anybody who may not substitute — so
 * both inform and nothing here is disabled by them.
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
  certified: boolean;
  /**
   * When an admin recorded seeing this offerer's criminal record extract,
   * already formatted as a calendar date in the viewer's zone — or `null` where
   * none has been recorded. Pre-formatted for the reason the certification
   * queue's twin is: it is an `Intl` product rather than translated copy.
   */
  criminalRecordCheckOn: string | null;
}

/**
 * What both halves of the page say about the session a request is against.
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
 * `startsAt: null`, rendering as the bare date with no urgency claimed. That is
 * the case this page exists to tolerate: it orders by date and never by a
 * derived instant.
 */
interface SubstitutionSession {
  groupId: string;
  groupName: string;
  /** The product's name in the reader's locale — never truncated, as on a card. */
  productName: string;
  productType: ProductType;
  /** The session's product-local calendar date, already formatted. */
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
  /** The role being substituted — the absent gedu's, and what the sub is paid as. */
  role: GeduAssignmentRole;
  reason: SubstitutionReason | null;
  reasonNote: string | null;
  /** The absent gedu's account id — the identicon's input, so a real UUID. */
  requesterId: string;
  /** `null` where the account carries no name; the row words the stand-in. */
  requesterName: string | null;
  /** The group's own admin page — where a request with no offers is dealt with. */
  groupHref: AppHref;
}

/**
 * One open request, sorted soonest-first and carrying what makes that sort
 * legible.
 *
 * `startsAt` is the instant the session begins, and it is here rather than
 * pre-phrased because how long away that is has to be *said* — "in 3 hours",
 * "tomorrow" — and the phrasing is the reader's locale's, which only a
 * formatter in the component has. `null` is the orphan: no occurrence, no
 * claim about when it starts, and no urgency.
 */
export interface SubstitutionRequest extends SubstitutionSession {
  id: string;
  startsAt: Date | null;
  /**
   * The session begins within a day, and the row says so more loudly.
   *
   * Decided here rather than in the row because it is a fact about the page's
   * pinned `now` and the session's own start, and a component recomputing it
   * from the same two values would be a second definition of "soon".
   */
  urgent: boolean;
  /** As delivered: the read orders by date then product, and so does the list. */
  offers: readonly SubstitutionOffer[];
}

/**
 * One request the office has already settled, within the fortnight behind the
 * queue.
 *
 * It answers "who stood in on Tuesday?", which has no other home: an approved
 * request leaves the queue, and the only surface still naming its substitute is
 * the group's own page, which an admin has to already know the group to reach.
 *
 * **`substituteId` is what says which of the two outcomes this was.** The
 * database pairs them exactly — a withdrawn request cannot carry a sub, by the
 * table's own CHECK, and a substituted one always does — so a null substitute
 * *is* "nobody had to stand in after all", and the row needs no second field to
 * say so. `substituteName` may be null beside a present id, which is only the
 * ordinary unnamed account and is worded by the row.
 */
export interface ResolvedSubstitution extends SubstitutionSession {
  id: string;
  substituteId: string | null;
  substituteName: string | null;
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
  /** What the last fortnight came to, newest session first. */
  recent: readonly ResolvedSubstitution[];
}
