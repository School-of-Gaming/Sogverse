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
 * - `image` — the picture the page leads with (the hero's).
 * - `question` — one question and its answer, as plain text; any question
 *   makes the page a `FAQPage`.
 */
export type LandingStructuredPart =
  | { kind: "image"; imageId: string }
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
    structuredData: (section) =>
      section.imageId === undefined ? [] : [{ kind: "image", imageId: section.imageId }],
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
