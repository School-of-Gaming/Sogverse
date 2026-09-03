/**
 * The knobs an invitation carries, as plain value lists.
 *
 * A module of its own, with no imports at all, because both ends read it: the
 * card builds its selects from these and the wire contract derives its enums
 * from them, so neither can offer a value the other refuses. Keeping them out
 * of the builder is what lets the client import them without dragging the
 * occurrence walk and the `.ics` writer into the browser bundle.
 */

/**
 * How the one calendar object writes its schedule.
 *
 * Both shapes emit exactly **one** `VEVENT` under **one** `UID` — a seat is one
 * thing on a family's calendar, and RFC 5546 gives an iTIP message one calendar
 * object to describe. What differs is how that object states the sessions:
 *
 * - `series` — an `RRULE`. The compact form, and the only one whose meaning
 *   extends past the horizon we enumerate, so it is the shape an open-ended
 *   club wants. A rule carries **one** clock face, so it can only state a
 *   schedule whose slots all start at the same time and run the same length;
 *   `canStateAsRule` below is that test, and the builder refuses the shape when
 *   it fails.
 * - `occurrences` — `RDATE`, every remaining session in the horizon listed by
 *   date. It can state any schedule, including slots at different times of day,
 *   and it is what a client that expands rules badly is compared against. Its
 *   weakness is the opposite one: it stops at the horizon, and mixed session
 *   *lengths* force `VALUE=PERIOD` entries, which clients support unevenly.
 *
 * **The shape is not part of the object's identity, and changing it between an
 * invitation and its update is safe** — one participation is one `UID` either
 * way, so an update re-states the same object in a different notation and a
 * client applies it in place. That is the whole reason the object is one.
 */
export const INVITATION_SHAPES = ["series", "occurrences"] as const;
export type InvitationShape = (typeof INVITATION_SHAPES)[number];

/**
 * Whether a weekly `RRULE` can state this schedule at all.
 *
 * A rule has one `DTSTART` and one `DURATION`, and `BYDAY` only says *which
 * weekdays* — so a club at 16:30 on Tuesday and 17:30 on Thursday, or a camp
 * whose Friday runs an hour shorter, is not something a single rule can
 * express. There is no partial answer: the alternative is the explicit list.
 *
 * **Both ends read this one function** — the builder refuses the shape with it,
 * and the card disables the option with it against the sandbox document it
 * already holds — so the offer and the refusal cannot come to disagree. It
 * takes the two fields that decide the answer rather than a slot type, which is
 * what lets the browser call it without importing the schedule schema.
 *
 * An empty schedule is vacuously statable: it has no sessions at all, and
 * "there is nothing to invite anybody to" is the more accurate refusal, which
 * the occurrence count reaches first.
 */
export function canStateAsRule(
  slots: readonly { startTime: string; durationMinutes: number }[],
): boolean {
  // Guarded on the length rather than on the element: indexed access is typed
  // as always-present here, so an `=== undefined` check would read as a test
  // the compiler has already refused to make.
  if (slots.length === 0) return true;
  const first = slots[0];
  return slots.every(
    (slot) =>
      slot.startTime === first.startTime &&
      slot.durationMinutes === first.durationMinutes,
  );
}

/** Minutes before the start a single `VALARM` fires, or no alarm at all. */
export const INVITATION_REMINDERS = ["none", "15", "60", "1440"] as const;
export type InvitationReminder = (typeof INVITATION_REMINDERS)[number];

/**
 * Which of the two mail experiences is being compared.
 *
 * `request` is a real iTIP invitation: an organizer, an attendee, and a client
 * that offers Yes / Maybe / No. `publish` is the same sessions as a plain "add
 * this to your calendar" object with nobody being asked anything — no RSVP, and
 * so no reply for us to fail to receive.
 */
export const INVITATION_METHOD_OPTIONS = ["request", "publish"] as const;
export type InvitationMethodOption = (typeof INVITATION_METHOD_OPTIONS)[number];

/** What the card asks the route to do. */
export const INVITATION_ACTIONS = ["send", "update", "cancel"] as const;
export type InvitationAction = (typeof INVITATION_ACTIONS)[number];

/** The `METHOD` an emitted calendar states, and what the SMTP part is typed as. */
export const INVITATION_METHODS = ["REQUEST", "CANCEL", "PUBLISH"] as const;
export type InvitationMethod = (typeof INVITATION_METHODS)[number];

/** Minutes for a reminder value, or `null` when no alarm is wanted. */
export function reminderMinutes(reminder: InvitationReminder): number | null {
  return reminder === "none" ? null : Number(reminder);
}

/** The `METHOD` a `send` or an `update` states, given the chosen experience. */
export function methodFor(option: InvitationMethodOption): InvitationMethod {
  return option === "publish" ? "PUBLISH" : "REQUEST";
}
