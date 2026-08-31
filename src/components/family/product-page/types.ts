/**
 * Shape of the **family product page** — the page a parent (or, in a lighter
 * variant, the gamer themselves) opens from their dashboard for one enrollment.
 *
 * **The page is participant-scoped**: one page per (participant × product),
 * titled by the product and attributed to whoever holds the seat — a child on
 * most of them, and the reader themselves on a for-parents product, where the
 * attribution turns into the second person rather than naming them at
 * themselves. Attendance is per-participant, and every feature queued behind
 * this one — planned absences, per-participant notes, a line to the gedu — is
 * per-participant too. A product-scoped page would have had to grow a person
 * selector the moment the second of those landed.
 *
 * **These types are the privacy boundary, and that is their main job.** The
 * gedu's feed entry carries a staff note, the whole group's attendance map and
 * an `owed` flag; the family's carries a report, one participant's mark, and
 * the first name of whoever last edited the session — which is the same quantum
 * of information the page already gives for every gedu on the group, and is the
 * only staff-shaped thing on it. Narrowing the *type* rather than filtering in
 * a component is
 * what makes
 * "never render staff notes or another child's attendance on a family surface" a
 * compile-time fact instead of a rule somebody has to remember. Anything that
 * would have to be stripped on the way in has no field to be stripped from.
 *
 * **The separation is structural on the component side too.** This module builds
 * its feed out of the shared session-feed module, which contains no staff-note
 * component, no attendance roster and no editor at all — so a family page cannot
 * import one by reaching for a neighbouring export. The workspace's own module
 * is never imported from anywhere under `components/family/`, and that is the
 * invariant worth keeping rather than a habit worth following.
 *
 * Presentation types, deliberately independent of any table: the feed mixes
 * sessions that have a stored record with occurrences that only exist as an
 * *absence*, exactly as the gedu's does. Whoever feeds the page reconciles the
 * schedule against the stored records and emits one entry per occurrence.
 */

import type { AttendanceMark, SessionPhoto } from "@/components/session-feed";

interface FamilySessionEntryBase {
  /**
   * Stable key for the occurrence — not necessarily a stored row id, since an
   * unrecorded occurrence has no row behind it.
   */
  id: string;
  /** Absolute instant the session starts; rendered in the viewer's zone. */
  startsAt: Date;
  /** Absolute instant the session ends; rendered in the viewer's zone. */
  endsAt: Date;
  /**
   * The gedu who last touched this session, from the stored row's audit column
   * — `null` on an occurrence with no row behind it, and `null` too when the
   * row has never been stamped or the person behind the stamp is gone.
   *
   * **It is the session's last editor, not the report's author, and the
   * imprecision is accepted rather than overlooked.** The column is stamped by
   * every recorded touch: materializing the row, saving either written field,
   * and each attendance mark or unmark. So a gedu who only corrected a tick is
   * named beside a write-up somebody else typed. In practice the gedu who
   * touches one part of a session touches all of it, and a per-field author
   * column was judged not worth the schema for that edge — which is why the
   * field is called *last edited by* rather than *author*. Do not close the gap
   * by quietly adding a report-author column; that is a product decision, not a
   * refactor.
   *
   * **It is carried on both kinds** because a plan written before a session and
   * a write-up written after it are the same field at two moments. What renders
   * it is narrower than what carries it: the chip appears only on a card that
   * actually has a report, so a session with an editor and nothing written
   * shows no attribution at all.
   */
  lastEditedBy: FamilyProductGedu | null;
  /**
   * The photos attached to this session, oldest first — empty when there are
   * none, never a missing field, so a renderer has one shape to handle.
   *
   * **They are content, and they are the family's half of the report.** A gedu
   * attaches them to document what happened, and the card draws them under the
   * write-up on both feeds through the same shared gallery — which is also why
   * the type is the shared component one rather than anything of this module's:
   * the staff document and the family document carry the same three fields, and
   * a locally-declared shape both satisfy is what lets one gallery serve two
   * surfaces across the privacy zone.
   *
   * **Carried on both kinds**, because one future entry can be the session
   * *in progress* — the hour a gedu is standing in with something worth
   * photographing in front of them — and a family reading that card should see
   * what has already been attached to it. An occurrence with no stored row
   * behind it has none.
   *
   * It says nothing about attendance and nothing about whether a report is
   * owed: a session with photos and no write-up is still a session with no
   * write-up. What it *does* change is the shape of the row — a past session
   * with photos has something to show, so it renders as a card rather than as
   * the quiet dashed line.
   */
  images: readonly SessionPhoto[];
}

/**
 * A session still ahead of this family.
 *
 * It carries the report field and nothing else, for the same reason the gedu's
 * future entry does: a report written before a session and one written after it
 * are the same field at two moments. Most future sessions have nothing on them
 * and render as a dated row.
 */
export interface FamilyFutureSessionEntry extends FamilySessionEntryBase {
  kind: "future";
  /**
   * What the gedu has said in advance about this one, as markdown. `null` —
   * the common case — renders a bare dated row.
   */
  report: string | null;
}

/**
 * A session that has already happened, as this one participant's family sees
 * it.
 *
 * **There is no `no_record` kind here, and its absence is deliberate.** The
 * gedu's feed distinguishes a pre-epoch occurrence from a recent unwritten one
 * because the enforcement epoch decides what a gedu is *owed for* — which is a
 * staff-workflow fact and means nothing to a parent. To a family both are the
 * same thing: a session that ran with nothing written down about it. So a past
 * entry with no report and no mark renders as the quiet placeholder line, and
 * the epoch never reaches this surface at all.
 */
export interface FamilyPastSessionEntry extends FamilySessionEntryBase {
  kind: "past";
  /** The gedu's write-up for the families, as markdown. `null` = unwritten. */
  report: string | null;
  /**
   * What was recorded about **this participant**, or `null` when nobody marked
   * them.
   *
   * Three states, and only two of them render. `null` shows nothing at all: an
   * unmarked session is a gap in the gedu's paperwork, not information about a
   * child, and a family reading "unmarked" would reasonably take it as a claim
   * about their kid rather than about the register.
   *
   * The group's marks are not here and there is no shape for them to arrive in.
   */
  attendance: AttendanceMark | null;
}

/**
 * One occurrence in a family's feed. Two kinds, because the only question a
 * family surface asks about a session is which side of now it is on.
 */
export type FamilySessionEntry =
  | FamilyFutureSessionEntry
  | FamilyPastSessionEntry;

/**
 * The venue an in-person product runs at, as a family may read it.
 *
 * **The public half only.** The site record also carries a staff note (door
 * codes, who locks up, where the key is signed out) and this type has nowhere
 * to put it.
 */
export interface FamilyProductVenue {
  name: string;
  /** Street address, or `null` when the venue record has none. */
  address: string | null;
  /** The venue note written for families. `null` = nothing standing to say. */
  publicNote: string | null;
}

/** One gedu, as a first-name chip. The id seeds their identicon. */
export interface FamilyProductGedu {
  /** Real UUID — the identicon is hashed out of its hex bytes. */
  id: string;
  firstName: string;
}
