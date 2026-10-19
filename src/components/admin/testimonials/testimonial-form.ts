import type { SupportedLocale } from "@/lib/constants/locales";
import {
  NO_RICH_BODIES,
  checkLocaleDrafts,
  draftsToSave,
  newLocaleTabs,
  openLocaleTabs,
  sameLocaleDrafts,
  type LocaleTabState,
} from "@/lib/i18n/locale-tabs";
import {
  hasQuotationMarks,
  type AdminTestimonial,
  type TestimonialInput,
} from "@/services/testimonials/testimonials.contracts";

/** One language's words as typed — untrimmed, so nothing moves under the cursor. */
export interface TestimonialVersionDraft {
  from: string;
  quote: string;
}

export const EMPTY_VERSION: TestimonialVersionDraft = { from: "", quote: "" };

/**
 * The editor's state: the shared per-locale tab set, a version in each. A
 * testimonial has nothing beside its versions, so there is no other field.
 */
export interface TestimonialForm {
  tabs: LocaleTabState<TestimonialVersionDraft>;
}

/** A new testimonial opens on one tab, in the admin's own UI locale. */
export function emptyTestimonialForm(uiLocale: SupportedLocale): TestimonialForm {
  return { tabs: newLocaleTabs(uiLocale, EMPTY_VERSION) };
}

/**
 * The testimonial's content rule: a version a reader can be shown says whom
 * it is from and has its quote, with no quotation marks around the quote. The
 * save refuses any written tab short of it.
 */
export function isCompleteTestimonialVersion(version: TestimonialVersionDraft): boolean {
  return (
    version.from.trim() !== "" &&
    version.quote.trim() !== "" &&
    !hasQuotationMarks(version.quote)
  );
}

/** Nothing written into a new testimonial's form yet: leaving it loses nothing. */
export function isBlankTestimonialForm(form: TestimonialForm): boolean {
  return draftsToSave(form.tabs.drafts).length === 0;
}

function savedVersions(
  testimonial: AdminTestimonial,
): LocaleTabState<TestimonialVersionDraft>["drafts"] {
  const versions: LocaleTabState<TestimonialVersionDraft>["drafts"] = {};
  for (const { locale, from, quote } of testimonial.versions) {
    // exact-locale: each saved version fills the tab of its own locale
    versions[locale] = { from, quote };
  }
  return versions;
}

/** A saved testimonial as the editor opens it, on the tab a reader of the admin's locale would be shown. */
export function testimonialFormFromSaved(
  testimonial: AdminTestimonial,
  uiLocale: SupportedLocale,
): TestimonialForm {
  return { tabs: openLocaleTabs(savedVersions(testimonial), uiLocale, EMPTY_VERSION) };
}

/**
 * Why a save cannot go ahead, before it is tried — each a refusal the
 * database would otherwise make:
 *
 * - `noVersion` — no language written at all.
 * - `quoted` — a language whose quote starts or ends with a quotation mark.
 * - `incomplete` — a language missing whom it is from or its quote.
 */
export type TestimonialSaveBlocker =
  | { kind: "noVersion" }
  | { kind: "quoted"; locale: SupportedLocale }
  | { kind: "incomplete"; locale: SupportedLocale };

export function testimonialSaveBlocker(form: TestimonialForm): TestimonialSaveBlocker | null {
  const problem = checkLocaleDrafts(form.tabs.drafts, isCompleteTestimonialVersion);
  if (problem === null) return null;
  if (problem.kind === "none") return { kind: "noVersion" };
  const draft = form.tabs.drafts[problem.locale] ?? EMPTY_VERSION;
  return hasQuotationMarks(draft.quote)
    ? { kind: "quoted", locale: problem.locale }
    : { kind: "incomplete", locale: problem.locale };
}

/** What a save sends: the whole version set, blank tabs left out. */
export function testimonialInputFromForm(form: TestimonialForm): TestimonialInput {
  return {
    versions: draftsToSave(form.tabs.drafts).map(({ locale, draft }) => ({
      locale,
      from: draft.from.trim(),
      quote: draft.quote.trim(),
    })),
  };
}

/** Whether the form holds exactly what is saved, by the shared per-locale comparison. */
export function sameAsSaved(form: TestimonialForm, testimonial: AdminTestimonial): boolean {
  return sameLocaleDrafts(form.tabs.drafts, savedVersions(testimonial), NO_RICH_BODIES);
}
