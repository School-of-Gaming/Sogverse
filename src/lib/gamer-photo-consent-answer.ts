import type { GamerPhotoConsent, GamerPhotoConsentType } from "@/types";

/**
 * **What is on file about one child and one photo consent — and nothing about
 * whether anyone ever asked.**
 *
 * Three surfaces read these rows and none of them may draw a distinction the
 * database happens to carry: a parent's toggle on the manage-gamer page, the
 * child's own read-only sentence in their settings, and the admin's card. An
 * absent row means the question was never put to a parent; a stored
 * `granted = false` means it was put and answered no. Those are different facts
 * and they license exactly the same behaviour — the child stays out of the
 * photographs — so every surface collapses them here rather than each one
 * remembering to write `?? false` at the end of its own lookup.
 *
 * Kept as a plain function over the rows rather than folded into the query
 * hook, because the rows reach these surfaces three different ways: a client
 * read on the parent's page, a server read threaded into the settings body as a
 * prop, and a client read on the admin page. One collapse, wherever the rows
 * came from.
 */
export function isGamerPhotoConsentGranted(
  rows: readonly GamerPhotoConsent[] | undefined,
  consentType: GamerPhotoConsentType,
): boolean {
  return findGamerPhotoConsentRow(rows, consentType)?.granted ?? false;
}

/**
 * The stored row itself, for the one reader that needs more than the answer.
 *
 * The admin card shows *when* a parent last moved the toggle, which only a real
 * row carries — and the absence of that date is what tells an admin, without a
 * second label, that the difference above exists at all. Everyone else wants
 * the collapse and should call the function above instead.
 *
 * `undefined` rows (an unresolved or failed read) answer `undefined` rather
 * than throwing: a caller that has not got the rows yet is asking a question
 * with no answer, and that is a state to render, not an error.
 *
 * **Looked up through a keyed collection rather than by `===`**, for the same
 * reason the registry's membership test is written over a `Set`:
 * `gamer_photo_consent_type` has exactly one member today, so a comparison
 * between two of its values is one the compiler can already answer and the
 * linter rightly refuses an always-true condition. A `Map` keyed at the enum
 * asks the question honestly now, and goes on asking it honestly on the day a
 * second partner joins the enum — rather than turning back into a comparison
 * somebody has to notice.
 */
export function findGamerPhotoConsentRow(
  rows: readonly GamerPhotoConsent[] | undefined,
  consentType: GamerPhotoConsentType,
): GamerPhotoConsent | undefined {
  const byType = new Map<GamerPhotoConsentType, GamerPhotoConsent>(
    (rows ?? []).map((row) => [row.consent_type, row]),
  );
  return byType.get(consentType);
}
