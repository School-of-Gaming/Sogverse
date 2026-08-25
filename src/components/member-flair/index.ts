/**
 * Member flair — the small staff-only marks a Gedu reads off a roster before
 * they read a single name.
 *
 * Two pieces sit here because they answer the same question from two
 * directions: *what do I need to know about this person before the session
 * starts?* The newcomer badge answers it from the join date, fading out over a
 * member's first month; the note dot and its dialog answer it from whatever a
 * Gedu wrote down last time. Neither is ever rendered on a family surface — the
 * data feeding them comes from staff-scoped reads, so a parent's page has
 * nothing to pass and the gate needs no viewer prop.
 */

export { NewcomerBadge } from "./NewcomerBadge";
export { GamerNoteDot } from "./GamerNoteDot";
export { GamerNoteDialog, GAMER_NOTE_MAX_LENGTH } from "./GamerNoteDialog";
export { newcomerPresence, NEWCOMER_WINDOW_DAYS } from "./newcomer";
export type { NewcomerPresence } from "./newcomer";
