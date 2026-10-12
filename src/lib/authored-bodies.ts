/**
 * **How an untouched rich body comes back out of the editor**, so a form can
 * tell a real edit from the editor's own respelling.
 *
 * The rich editor writes markdown back in its one dialect, and reports the
 * document on its first transaction whether or not anything was typed — a
 * caret placed by a click is enough, and a body ending in a list or a heading
 * gains its trailing paragraph then. So a stored body in another spelling
 * arrives through `onChange` different from the stored one while meaning the
 * same. The record maps each body an editor was seeded with to the editor's
 * own serialisation of it; a body equal to the saved one, or to that
 * serialisation of it, is unchanged. Only the untouched document serialises
 * to that string, so a real edit still differs from both.
 *
 * The record is filled by the shared authored body editor and read by the
 * per-locale draft comparison (`@/lib/i18n/locale-tabs`). One record serves
 * one form, whose rich bodies share one use case.
 */
export interface AuthoredBodies {
  /** Each body an editor was seeded with → the editor's serialisation of it. */
  readonly serialised: ReadonlyMap<string, string>;
}

/** Whether `current` is still `saved`, compared trimmed, as a save stores it. */
export function sameAuthoredBody(
  current: string,
  saved: string,
  bodies: AuthoredBodies,
): boolean {
  const typed = current.trim();
  return typed === saved.trim() || typed === bodies.serialised.get(saved)?.trim();
}
