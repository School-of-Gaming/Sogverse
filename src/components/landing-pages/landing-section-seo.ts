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
 * page's structured data, and its words as plain text. Exhaustive over the
 * section types, so a type added to the registry fails type-check here until
 * it has said what it contributes — "nothing" being an answer it has to give.
 *
 * Both read the same words the renderer paints, so the structured data never
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
  /** The section's words in reading order, one paragraph per entry. */
  plainText: (section: LandingSectionOf<Type>, text: LandingTextOf<Type>) => string[];
}

const none = (): LandingStructuredPart[] => [];

/** The written entries of `values`, in order. */
function lines(...values: (string | undefined)[]): string[] {
  return values.flatMap((value) => written(value) ?? []);
}

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
    plainText: (_section, text) => lines(text.eyebrow, text.headline, text.subline),
  },
  text: {
    structuredData: none,
    plainText: (_section, text) => [
      ...lines(text.eyebrow, text.heading),
      ...lines(markdownToPlainText(text.body ?? "")),
    ],
  },
  image: {
    structuredData: none,
    plainText: (_section, text) => lines(text.eyebrow, text.heading, text.caption),
  },
  points: {
    structuredData: none,
    plainText: (section, text) => [
      ...lines(text.eyebrow, text.heading, text.intro),
      ...section.items.flatMap((item) => {
        const { title, body } = itemEntry(text.items, item.id);
        return lines(title, body);
      }),
    ],
  },
  steps: {
    structuredData: none,
    plainText: (section, text) => [
      ...lines(text.eyebrow, text.heading, text.intro),
      ...section.items.flatMap((item, index) => {
        const { title, body } = itemEntry(text.items, item.id);
        const heading = written(title);
        return [
          ...(heading === null ? [] : [`${index + 1}. ${heading}`]),
          ...lines(body),
        ];
      }),
    ],
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
    plainText: (section, text) => [
      ...lines(text.eyebrow, text.heading),
      ...section.items.flatMap((item) => {
        const { question, answer } = itemEntry(text.items, item.id);
        return lines(question, markdownToPlainText(answer ?? ""));
      }),
    ],
  },
  cta: {
    structuredData: none,
    plainText: (_section, text) => lines(text.eyebrow, text.heading, text.body),
  },
};

function structuredDataOf<Type extends LandingSectionType>(
  type: Type,
  section: LandingSectionByType[Type],
  text: LandingTextByType[Type],
): LandingStructuredPart[] {
  return LANDING_SECTION_SEO[type].structuredData(section, text);
}

function plainTextOf<Type extends LandingSectionType>(
  type: Type,
  section: LandingSectionByType[Type],
  text: LandingTextByType[Type],
): string[] {
  return LANDING_SECTION_SEO[type].plainText(section, text);
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

/** The page's words as plain text, section by section, paragraphs blank-line separated. */
export function landingPagePlainText(
  sections: readonly LandingSection[],
  texts: LandingSectionTexts,
): string {
  return sections
    .flatMap((section) =>
      plainTextOf(section.type, section, landingSectionText(texts, section.id)),
    )
    .join("\n\n");
}
