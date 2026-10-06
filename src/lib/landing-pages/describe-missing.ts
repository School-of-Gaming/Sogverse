import {
  LANDING_SECTIONS,
  type LandingSection,
  type LandingSectionType,
} from "./sections";

/**
 * **Missing words, in an admin's terms.** `missingInLandingVersion` names what
 * a language version still needs as paths keyed by ids
 * (`sections.<section id>.items.<item id>.question`), which the SQL half and
 * the publish check share and so cannot change. This reads one such path
 * against the page's structure and says it the way an admin counts: sections
 * and items numbered from one, a section by its type's label.
 *
 * Pure: no React and no service import, so the admin UI and the MCP tools
 * read it alike.
 */

export interface MissingWordsDescription {
  /** The path as `missingInLandingVersion` gave it, unchanged. */
  path: string;
  /** The section's position in the structure, from one; absent for a version-level field. */
  sectionNumber?: number;
  /** The section's type; absent for a version-level field. */
  sectionType?: LandingSectionType;
  /** The item's or picture's position within its section, from one, when the path names one. */
  itemNumber?: number;
  /** The field the path ends in: `headline`, `question`, `alt`, `title`. */
  field: string;
  /** The path as an English sentence fragment for an admin or an AI app. */
  text: string;
}

/**
 * How a section is named wherever an admin or an AI app reads a section
 * number: `section 3 (Questions and answers)`, numbered from one.
 */
export function landingSectionName(number: number, type: LandingSectionType): string {
  return `section ${number} (${LANDING_SECTIONS[type].label})`;
}

/** What one item of a section is called, for the types that have items. */
const ITEM_NOUN: { readonly [Type in LandingSectionType]: string | null } = {
  hero: null,
  text: null,
  image: "picture",
  points: "point",
  steps: "step",
  faq: "question",
  cta: null,
};

/** A version's own fields, as an admin says them. */
const VERSION_FIELD_WORDS: Readonly<Record<string, string>> = {
  title: "The page's title",
  summary: "The page's summary",
  slug: "The page's address (slug)",
};

/** The fields a section or an item can be missing, as an admin says them. */
const FIELD_WORDS: Readonly<Record<string, string>> = {
  headline: "the headline",
  heading: "the heading",
  body: "the body",
  buttonLabel: "the button's label",
  imageAlt: "the picture's alt text",
  alt: "the alt text",
  question: "the question",
  answer: "the answer",
};

/** What one item of a section of this type is called, or null when it has none. */
export function landingItemNoun(type: LandingSectionType): string | null {
  return ITEM_NOUN[type];
}

const fieldWords = (field: string): string => FIELD_WORDS[field] ?? `the ${field}`;

const capitalised = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1);

/** One missing-words path, read against the structure the version belongs to. */
export function describeMissingWords(
  path: string,
  sections: readonly LandingSection[],
): MissingWordsDescription {
  const parts = path.split(".");
  if (parts[0] !== "sections" || parts.length < 3) {
    const field = parts[parts.length - 1];
    return { path, field, text: VERSION_FIELD_WORDS[field] ?? capitalised(fieldWords(field)) };
  }

  const [, sectionId, ...rest] = parts;
  const index = sections.findIndex((section) => section.id === sectionId);
  const field = rest[rest.length - 1];
  if (index === -1) {
    // A structure other than the one the path was read from: nothing to number.
    return { path, field, text: `A section no longer on the page: ${fieldWords(field)}` };
  }

  const section = sections[index];
  const sectionNumber = index + 1;
  const name = capitalised(landingSectionName(sectionNumber, section.type));
  const base = { path, sectionNumber, sectionType: section.type };

  // `alts.<picture item id>` and `items.<item id>.<field>`.
  if (rest.length >= 2 && (rest[0] === "alts" || rest[0] === "items")) {
    const itemId = rest[1];
    const itemField = rest[0] === "alts" ? "alt" : (rest[2] ?? field);
    const position = itemIdsOf(section).indexOf(itemId);
    const noun = landingItemNoun(section.type) ?? "item";
    if (position === -1) {
      return { ...base, field: itemField, text: `${name}, an item no longer in it: ${fieldWords(itemField)}` };
    }
    const itemNumber = position + 1;
    return {
      ...base,
      itemNumber,
      field: itemField,
      text: `${name}, ${noun} ${itemNumber}: ${fieldWords(itemField)}`,
    };
  }

  return { ...base, field, text: `${name}: ${fieldWords(field)}` };
}

/** The ids of a section's items or pictures, in order. */
function itemIdsOf(section: LandingSection): string[] {
  switch (section.type) {
    case "image":
      return section.images.map((image) => image.id);
    case "points":
    case "steps":
    case "faq":
      return section.items.map((item) => item.id);
    case "hero":
    case "text":
    case "cta":
      return [];
  }
}
