/**
 * Member flair — the small marks a Gedu reads off a roster before they read a
 * single name, and the dialog behind them.
 *
 * Two pieces sit here because they answer the same question from two
 * directions: *what do I need to know about this person before the session
 * starts?* The newcomer badge answers it from the join date, draining a
 * four-pip meter across a member's first month; the flair button and its dialog
 * answer it from whatever staff wrote down last time.
 *
 * **The dialog is the one place where that stops being purely staff-facing.**
 * It holds two halves with two audiences: the private note, which no family
 * ever sees, and the member's creations, which their own family reads on their
 * product page. The badge and the button's own data still come from
 * staff-scoped reads, so a parent's page has nothing to pass and the gate needs
 * no viewer prop — but the dialog states each half's audience in words, because
 * "staff-only" is no longer true of everything inside it.
 */

export { NewcomerBadge } from "./NewcomerBadge";
export { GamerFlairButton } from "./GamerFlairButton";
export { GamerFlairDialog, GAMER_NOTE_MAX_LENGTH } from "./GamerFlairDialog";
export {
  newcomerDaysIn,
  showsNewcomerBadge,
  NEWCOMER_WINDOW_DAYS,
} from "./newcomer";
