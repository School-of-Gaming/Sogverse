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

/**
 * **Documents that are only ever required together.**
 *
 * A programme publishes its terms and its privacy policy as one set: a product
 * that asks a family to accept one of them and not the other is a state nobody
 * wants and nothing downstream can make sense of. The public panel already
 * treats a product's whole requirement set as one consent act; a bundle is the
 * same fact stated at the other end, so an admin cannot compose a half-set in
 * the first place.
 *
 * **It is a UI grouping and nothing more.** The wire shape is unchanged — the
 * write RPC still takes the individual slugs, and the database still records one
 * acceptance row per document against its own version — because per-document
 * rows are what a legal question about a specific text is answered from. What
 * the bundle removes is a *choice* the product owner never had, not a
 * distinction the record needs.
 */
export interface ConsentDocumentBundle {
  /** Stable identity for React keys and tests. Never stored anywhere. */
  id: string;
  /**
   * Key under the `consentDocuments.bundles` message namespace, named the same
   * way and for the same reason as a document's own `nameKey`. It *names* the
   * set — an admin-facing label — which is why it lives beside the document
   * names in a namespace `tlh` serves in English.
   */
  labelKey: "robloxProgramme";
  /**
   * Key under the `productDetail.signupPanel.consents.bundles` message
   * namespace: the sentence a parent actually ticks.
   *
   * **Deliberately a second key rather than a reuse of `labelKey`**, even
   * though the two spell the same word today. They index different namespaces
   * governed by different rules: a label that names a document is served in
   * English under `tlh` (a link label has to call a document what the document
   * calls itself), while this is ordinary product copy and is written in
   * Klingon like every other sentence on the panel — with the English document
   * names sitting inside its tags. Collapsing them into one key would put the
   * sentence inside the English-under-Klingon carve-out and delete the joke.
   */
  sentenceKey: "robloxProgramme";
  /**
   * The named rich-text tags the sentence carries, each mapped to the document
   * that tag links to.
   *
   * **This is why a bundle is the panel's unit and not just the admin form's.**
   * The sentence is the consent, so the documents are named *inside* it and each
   * name is its own link — which means the sentence has to be authored per
   * bundle, per locale, with a fixed set of tags this map can fill in. No
   * variadic list formatting, and every locale writes a natural sentence rather
   * than a stub with a list bolted under it.
   *
   * The values are exactly this bundle's `slugs`; the reading order is the
   * sentence's, so this map's own order says nothing. A unit test pins the two
   * against each other, because a tag pointed at a slug outside the bundle
   * would link a parent to a document their tick does not cover.
   */
  sentenceTags: Readonly<Record<string, string>>;
  /** The documents, in the order they should be read. */
  slugs: readonly string[];
}

export const CONSENT_DOCUMENT_BUNDLES: readonly ConsentDocumentBundle[] = [
  {
    id: "roblox-programme",
    labelKey: "robloxProgramme",
    sentenceKey: "robloxProgramme",
    sentenceTags: {
      terms: "roblox-programme-terms",
      privacy: "roblox-privacy-policy",
    },
    slugs: ["roblox-programme-terms", "roblox-privacy-policy"],
  },
];

/** Every slug that belongs to some bundle. */
const BUNDLED_SLUGS: ReadonlySet<string> = new Set(
  CONSENT_DOCUMENT_BUNDLES.flatMap((bundle) => bundle.slugs),
);

/**
 * True when this slug is offered through a bundle rather than on its own.
 *
 * The admin form uses it to decide which documents still need an individual
 * row: a slug in a bundle already has one, and offering it twice would be
 * offering the split the bundle exists to prevent.
 */
export function isBundledConsentSlug(slug: string): boolean {
  return BUNDLED_SLUGS.has(slug);
}

/**
 * The set as it should be stored: any bundle the set touches, whole.
 *
 * The admin form's toggle is already all-or-nothing, so this only ever changes
 * a set that arrived half-formed — from before the bundle existed, or written
 * by hand. It completes rather than trims because the form has already told the
 * admin the bundle is required (its row ticks on any member), and a save must
 * write what the screen says; trimming would also mean an unrelated edit
 * silently dropping a legal condition the product really carries.
 *
 * Applied where the write payload is built rather than where the form loads, so
 * hydration stays an honest picture of what is stored and the healing happens
 * at the moment the admin actually commits.
 */
export function completeConsentBundles(slugs: readonly string[]): string[] {
  const complete = new Set(slugs);
  for (const bundle of CONSENT_DOCUMENT_BUNDLES) {
    if (!bundle.slugs.some((slug) => complete.has(slug))) continue;
    for (const slug of bundle.slugs) complete.add(slug);
  }
  return [...complete];
}

/**
 * One line of a product's requirement set: either a bundle, named as the unit
 * it is, or a single document that belongs to no bundle.
 *
 * The same rows serve two readers, which is the point of having one function
 * produce them: the admin details page states what a product requires, and the
 * public signup panel offers one tickable row per line. A bundle is therefore
 * the unit at both ends — an admin attaches one, a parent agrees to one — and
 * neither surface can invent a grouping the other does not have.
 */
export type RequiredConsentDisplayRow =
  | { kind: "bundle"; key: string; bundle: ConsentDocumentBundle }
  | { kind: "document"; key: string; slug: string };

/**
 * A product's stored requirement set, as rows.
 *
 * Bundles collapse to one line each — the same unit the form offers, so what an
 * admin picked, what the details page reports back and what a parent ticks are
 * the same thing — and anything left over is listed on its own, whether it is a
 * document with no bundle or a slug this deploy cannot even name. Nothing is
 * dropped: a set is still fully described by its rows, which is what makes this
 * safe to render in place of the raw list.
 *
 * A bundle appears when ANY of its documents is stored, matching the form's own
 * reading of a half-set — the product does require the programme's documents,
 * and the form heals the missing half on its next save.
 *
 * **A `document` row has no sentence and no link, so it is a fallback and not a
 * shape to design toward.** A bundle is what carries an authored sentence and
 * the links inside it; a document standing outside every bundle can only be
 * offered as its raw slug beside the generic sentence. Today that means exactly
 * the drift case — a slug the database knows and this deploy does not — because
 * every document `CONSENT_DOCUMENTS` names belongs to a bundle. A new document
 * that a parent should be able to *read* before ticking wants a bundle of its
 * own with a sentence to match, not a loose entry.
 */
export function describeRequiredConsents(
  slugs: readonly string[],
): RequiredConsentDisplayRow[] {
  const stored = new Set(slugs);
  const rows: RequiredConsentDisplayRow[] = [];
  const covered = new Set<string>();
  for (const bundle of CONSENT_DOCUMENT_BUNDLES) {
    if (!bundle.slugs.some((slug) => stored.has(slug))) continue;
    rows.push({ kind: "bundle", key: bundle.id, bundle });
    for (const slug of bundle.slugs) covered.add(slug);
  }
  for (const slug of slugs) {
    if (covered.has(slug)) continue;
    rows.push({ kind: "document", key: slug, slug });
  }
  return rows;
}

/**
 * Which of a product's required slugs one row actually accounts for.
 *
 * The signup panel stamps each tick with this, so an agreement survives exactly
 * as long as the thing it was given for. A bundle row's sentence names every
 * document in the bundle whatever the product stores, but what the tick *sends*
 * is only the stored half — so a requirement set that grows under a long-open
 * tab has to drop that row's tick, while leaving the ticks on rows nothing
 * happened to. Stamping the whole requirement set instead would clear every row
 * whenever any of them changed, which is a rule about the wrong thing.
 *
 * A row nothing requires yields an empty list, which no row this function is
 * handed can be: `describeRequiredConsents` only emits a bundle row when the
 * product stores at least one of its documents.
 */
export function consentRowSlugs(
  row: RequiredConsentDisplayRow,
  required: readonly string[],
): string[] {
  if (row.kind === "document") return [row.slug];
  const stored = new Set(required);
  return row.bundle.slugs.filter((slug) => stored.has(slug));
}
