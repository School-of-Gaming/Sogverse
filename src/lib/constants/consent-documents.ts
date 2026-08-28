import { ROUTES } from "./routes";

/**
 * **The consent-document registry, app side.**
 *
 * A product may require a parent to agree to specific published documents
 * before enrolling (migration 00210). The database owns the *set* — which slugs
 * exist, which versions have been published, which products point at which — and
 * this map owns the two things the database has no business knowing: where the
 * document is published on our own site, and which message key names it.
 *
 * **Rows arrive by migration and this map ships in the same deploy**, so a slug
 * the database knows about and this map does not is a defect in the change that
 * added it, never a runtime condition to design around. What the two readers do
 * about it differs, and the split is deliberate:
 *
 * - **Admin surfaces render the raw slug as the label.** Loud rather than
 *   broken: an admin picking requirements sees `roblox-something-new` sitting
 *   among properly-named documents and knows exactly what to report.
 * - **The public signup panel treats an unmapped slug as still REQUIRED.** It
 *   gates the CTA like any other, and offers the checkbox with the slug as its
 *   own label and no link to read. Dropping it would be the one unacceptable
 *   outcome — an enrolment let through without a legally required consent —
 *   whereas an ugly checkbox merely looks wrong, which is the direction to fail
 *   in.
 *
 * There is deliberately no version here. Which revision a parent agreed to is
 * resolved server-side at the moment of enrolment and stamped onto the
 * acceptance row; a version in the app bundle would be a second answer to that
 * question, stale the day a revision ships.
 */
export interface ConsentDocumentMeta {
  /**
   * Where the document is published. Opened in a NEW TAB from the signup
   * panel — deliberately, so the parent's half-filled enrolment panel survives
   * the reading.
   */
  href: string;
  /**
   * Key under the `consentDocuments.names` message namespace. Not the slug
   * itself: a hyphenated slug is a fine JSON key but a poor translator key, and
   * keeping the two apart means a slug can be renamed by migration without
   * touching five locale files.
   */
  nameKey: "robloxProgrammeTerms" | "robloxPrivacyPolicy";
}

/**
 * Every consent document the app knows how to name and link. Keyed by the slug
 * in `consent_documents.slug`.
 */
export const CONSENT_DOCUMENTS: Readonly<Record<string, ConsentDocumentMeta>> = {
  "roblox-programme-terms": {
    href: ROUTES.robloxTerms,
    nameKey: "robloxProgrammeTerms",
  },
  "roblox-privacy-policy": {
    href: ROUTES.robloxPrivacy,
    nameKey: "robloxPrivacyPolicy",
  },
};

/**
 * The metadata for a slug, or `null` when this deploy has never heard of it.
 *
 * Callers must handle the null — see the map's own doc comment for which way
 * each surface fails. A helper that invented a fallback here would take that
 * decision away from them and would take it wrongly for one of the two.
 */
export function consentDocumentMeta(slug: string): ConsentDocumentMeta | null {
  return CONSENT_DOCUMENTS[slug] ?? null;
}
