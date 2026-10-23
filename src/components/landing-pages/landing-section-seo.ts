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
import type {
  LandingPicture,
  LocalizedLandingPage,
} from "@/services/landing-pages/landing-pages.contracts";
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
 * - `products` — the products a section promotes, by id in its order; the
 *   page lists those the shop lists, each pointing at its page, and repeats
 *   none of a product's own markup, which stays on the product's page.
 */
export type LandingStructuredPart =
  | { kind: "image"; imageId: string; alt: string | null }
  | { kind: "question"; question: string; answer: string }
  | { kind: "products"; sectionId: string; productIds: readonly string[] };

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
  // Testimonials contribute nothing: review markup a site writes about itself
  // earns no rich result, and the quotes are the page's own words to a reader.
  testimonials: {
    structuredData: none,
  },
  products: {
    structuredData: (section) => [
      { kind: "products", sectionId: section.id, productIds: section.productIds },
    ],
  },
  // A guide contributes nothing. Describing it as a document would name a file
  // a crawler cannot fetch — it downloads only for a signed-in reader — and
  // earns no rich result; its heading and line are already the page's words.
  guide: {
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
  subscribe: {
    structuredData: none,
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
 * A picture a copy names — from a section or a version's share picture — as
 * the copy carries it. Every one is there: the database derives a copy's
 * pictures from everything it names, in the same row write, refuses an entry
 * that is gone, and unlinks a removed one from the copy in the removal's own
 * write, and each read takes the copy and its pictures in one statement. So a
 * missing one is a broken invariant, and throws rather than paint a page short
 * of a picture.
 */
export function landingCopyPicture(
  pictures: Readonly<Record<string, LandingPicture>>,
  imageId: string,
): LandingPicture {
  if (!Object.hasOwn(pictures, imageId)) {
    throw new Error(`The copy names the picture ${imageId} and carries no path for it`);
  }
  return pictures[imageId];
}

/**
 * The picture a live page leads with — the hero's — as its stored path and
 * purpose and its alt text, or null when the hero has none. A hero's picture
 * is wide, which the database keeps true. The page's structured data names
 * this picture, and so does its link preview unless the shown version sets
 * a share picture of its own (`landingShareCard`).
 */
export function landingLeadPicture(
  page: Pick<LocalizedLandingPage, "sections" | "sectionTexts" | "pictures">,
): (LandingPicture & { alt: string | null }) | null {
  const part = landingStructuredParts(page.sections, page.sectionTexts).find(
    (candidate) => candidate.kind === "image",
  );
  if (part === undefined) return null;
  return { ...landingCopyPicture(page.pictures, part.imageId), alt: part.alt };
}

/**
 * The path of the picture a live page leads with, read from its structure
 * alone — for a list, which carries no words and so no alt text. The same
 * picture `landingLeadPicture` names.
 */
export function landingLeadPicturePath(
  page: Pick<LocalizedLandingPage, "sections" | "pictures">,
): string | null {
  return landingLeadPicture({ ...page, sectionTexts: {} })?.path ?? null;
}
