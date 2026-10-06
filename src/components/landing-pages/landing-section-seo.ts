import type {
  LandingSection,
  LandingSectionOf,
  LandingSectionTexts,
  LandingSectionType,
} from "@/lib/landing-pages/sections";
import {
  landingSectionText,
  written,
  type LandingSectionByType,
  type LandingTextByType,
  type LandingTextOf,
} from "./landing-section-types";
import type { LocalizedLandingPage } from "@/services/landing-pages/landing-pages.contracts";
import { markdownToPlainText } from "./markdown-plain-text";

/**
 * **What each section type contributes beyond its markup**: its share of the
 * page's structured data. Exhaustive over the section types, so a type added
 * to the registry fails type-check here until it has said what it contributes
 * — "nothing" being an answer it has to give.
 *
 * It reads the same words the renderer paints, so the structured data never
 * states what the page does not show.
 */

/**
 * One piece of a page's structured data, as a section contributes it; the
 * page's JSON-LD builder folds the pieces into its one node.
 *
 * - `image` — the picture the page leads with (the hero's), with its alt text
 *   in the version's language.
 * - `question` — one question and its answer, as plain text; any question
 *   makes the page a `FAQPage`.
 */
export type LandingStructuredPart =
  | { kind: "image"; imageId: string; alt: string | null }
  | { kind: "question"; question: string; answer: string };

interface LandingSectionSeo<Type extends LandingSectionType> {
  structuredData: (
    section: LandingSectionOf<Type>,
    text: LandingTextOf<Type>,
  ) => LandingStructuredPart[];
}

const none = (): LandingStructuredPart[] => [];

/** Item words, by item id, as the text schemas key them. */
type ItemWords<Entry> = Record<string, Entry> | undefined;

function itemEntry<Entry extends object>(
  items: ItemWords<Entry>,
  id: string,
): Partial<Entry> {
  const entry: Entry | undefined = items?.[id];
  return entry ?? {};
}

export const LANDING_SECTION_SEO: {
  [Type in LandingSectionType]: LandingSectionSeo<Type>;
} = {
  hero: {
    structuredData: (section, text) =>
      section.imageId === undefined
        ? []
        : [{ kind: "image", imageId: section.imageId, alt: written(text.imageAlt) }],
  },
  text: {
    structuredData: none,
  },
  image: {
    structuredData: none,
  },
  points: {
    structuredData: none,
  },
  steps: {
    structuredData: none,
  },
  faq: {
    structuredData: (section, text) =>
      section.items.flatMap((item) => {
        const entry = itemEntry(text.items, item.id);
        const question = written(entry.question);
        const answer = written(markdownToPlainText(entry.answer ?? ""));
        return question === null || answer === null
          ? []
          : [{ kind: "question" as const, question, answer }];
      }),
  },
  cta: {
    structuredData: none,
  },
};

function structuredDataOf<Type extends LandingSectionType>(
  type: Type,
  section: LandingSectionByType[Type],
  text: LandingTextByType[Type],
): LandingStructuredPart[] {
  return LANDING_SECTION_SEO[type].structuredData(section, text);
}

/** Every section's structured-data contribution, in page order. */
export function landingStructuredParts(
  sections: readonly LandingSection[],
  texts: LandingSectionTexts,
): LandingStructuredPart[] {
  return sections.flatMap((section) =>
    structuredDataOf(section.type, section, landingSectionText(texts, section.id)),
  );
}

/**
 * The picture a live page leads with — the hero's — as its stored path and
 * alt text, or null when the hero has none. The page's structured data and
 * its link preview both name this one picture, so they cannot disagree. A
 * picture with no path is treated as none: the database derives the paths
 * and unlinks a removed picture, so it should not arise, and naming no
 * picture is the safe answer if it does.
 */
export function landingLeadPicture(
  page: LocalizedLandingPage,
): { path: string; alt: string | null } | null {
  const part = landingStructuredParts(page.sections, page.sectionTexts).find(
    (candidate) => candidate.kind === "image",
  );
  if (part === undefined || !Object.hasOwn(page.imagePaths, part.imageId)) return null;
  return { path: page.imagePaths[part.imageId], alt: part.alt };
}
