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
 * How the whole run is stated.
 *
 * `series` is one `VEVENT` per weekly slot carrying an `RRULE` — the compact
 * form, and the one a client can keep in step with a schedule change by
 * re-sending a single event. `occurrences` is one `VEVENT` per session in the
 * horizon, which is what a client that expands rules badly is compared against.
 *
 * **The shape is part of a UID's identity and must not change between an
 * invitation and its update.** A series states two events for a two-slot club;
 * the same club as occurrences states two dozen. A client answers a changed set
 * of UIDs by deleting what it had and creating what it was sent, which is
 * exactly the in-place update this tool exists to watch happen.
 */
export const INVITATION_SHAPES = ["series", "occurrences"] as const;
export type InvitationShape = (typeof INVITATION_SHAPES)[number];

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
