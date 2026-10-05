import { z } from "zod";
import { ctaSection } from "./cta";
import { faqSection } from "./faq";
import { heroSection } from "./hero";
import { imageSection } from "./image";
import { pointsSection } from "./points";
import { stepsSection } from "./steps";
import { textSection } from "./text";
import { fieldOf, type LandingMarkdownField, type TextReading } from "./shared";

/**
 * The landing page section registry: every section type, its schemas, its
 * label, its required-text rule and which of its words are markdown, one
 * module per type.
 *
 * Every other concern that varies by type — the public renderer, the admin
 * editor, the SEO contribution, the MCP schema — keeps its own exhaustive
 * `Record<LandingSectionType, …>`, so a type added here fails type-check
 * everywhere it is not yet handled.
 *
 * A page's structure is an ordered list of sections, shared by every
 * language; each section's words are per language, keyed by the section's id.
 * The required-text rule lives here and once more in SQL
 * (`landing_version_missing`), which the publish function's completeness
 * check reads; a DB test holds the two equal.
 */

export const LANDING_SECTION_TYPES = [
  "hero",
  "text",
  "image",
  "points",
  "steps",
  "faq",
  "cta",
] as const;

export type LandingSectionType = (typeof LANDING_SECTION_TYPES)[number];

export const LANDING_SECTIONS = {
  hero: heroSection,
  text: textSection,
  image: imageSection,
  points: pointsSection,
  steps: stepsSection,
  faq: faqSection,
  cta: ctaSection,
} as const satisfies { [Type in LandingSectionType]: { type: Type } };

/** One section of a page's structure: `id`, `type` and its shared fields. */
export const landingSection = z.discriminatedUnion("type", [
  heroSection.section,
  textSection.section,
  imageSection.section,
  pointsSection.section,
  stepsSection.section,
  faqSection.section,
  ctaSection.section,
]);

export type LandingSection = z.output<typeof landingSection>;
export type LandingSectionInput = z.input<typeof landingSection>;
export type LandingSectionOf<Type extends LandingSectionType> = Extract<
  LandingSection,
  { type: Type }
>;

/** One section's words in one language, whichever type it is. */
export type LandingSectionText = {
  [Type in LandingSectionType]: z.output<(typeof LANDING_SECTIONS)[Type]["text"]>;
}[LandingSectionType];

/** One language's words for every section, by section id. */
export type LandingSectionTexts = Record<string, LandingSectionText>;

/**
 * What is wrong with a structure's arrangement, or null: the hero comes
 * first and there is only the one, and no two sections share an id. The SQL
 * structure check (`landing_sections_problem`) holds the same rules.
 */
export function landingStructureProblem(
  sections: readonly { id: string; type: LandingSectionType }[],
): string | null {
  if (sections[0]?.type !== "hero") return "A page starts with its hero section";
  if (sections.filter((section) => section.type === "hero").length !== 1) {
    return "A page has exactly one hero section";
  }
  if (new Set(sections.map((section) => section.id)).size !== sections.length) {
    return "Two sections share an id";
  }
  return null;
}

/** A page's whole structure, its arrangement rules included. */
export const landingSections = z
  .array(landingSection)
  .superRefine((sections, context) => {
    const problem = landingStructureProblem(sections);
    if (problem !== null) context.addIssue({ code: "custom", message: problem });
  });

/**
 * The schema of one language's section texts for a given structure: an
 * object keyed by the structure's section ids, each entry its type's text
 * schema. A key naming no section of the structure is refused, as the
 * database refuses it.
 */
export function landingSectionTextsSchema(
  sections: readonly LandingSection[],
): z.ZodType<LandingSectionTexts, z.ZodTypeDef, unknown> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const section of sections) {
    shape[section.id] = LANDING_SECTIONS[section.type].text.optional();
  }
  return z
    .object(shape)
    .strict()
    .transform((texts) => {
      const kept: LandingSectionTexts = {};
      for (const section of sections) {
        const parsed = LANDING_SECTIONS[section.type].text.safeParse(texts[section.id]);
        if (texts[section.id] !== undefined && parsed.success) {
          kept[section.id] = parsed.data;
        }
      }
      return kept;
    });
}

/** The required text fields one section lacks, as paths within the section. */
function missingInSection(section: LandingSection, text: TextReading): string[] {
  switch (section.type) {
    case "hero":
      return heroSection.missingText(section, text);
    case "text":
      return textSection.missingText(section, text);
    case "image":
      return imageSection.missingText(section, text);
    case "points":
      return pointsSection.missingText(section, text);
    case "steps":
      return stepsSection.missingText(section, text);
    case "faq":
      return faqSection.missingText(section, text);
    case "cta":
      return ctaSection.missingText(section, text);
  }
}

/** A version as the required-text rule reads it. */
export interface LandingVersionReading {
  title: string;
  summary: string;
  slug: string;
  /** Whatever is stored, read field by field. */
  sectionTexts: Readonly<Record<string, unknown>>;
}

function readingOf(value: unknown): TextReading {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value))
    : {};
}

/**
 * What one language version still needs before publishing takes it, given the
 * page's structure: `title`, `summary`, `slug`, then per section in order
 * `sections.<id>.<field>` (`.items.<item id>.<field>`, `.alts.<picture id>`).
 * Empty means complete. The SQL half answers the same list for the same input.
 */
export function missingInLandingVersion(
  sections: readonly LandingSection[],
  version: LandingVersionReading,
): string[] {
  const missing: string[] = [];
  if (!/\S/.test(version.title)) missing.push("title");
  if (!/\S/.test(version.summary)) missing.push("summary");
  if (!/\S/.test(version.slug)) missing.push("slug");
  for (const section of sections) {
    const text = readingOf(
      Object.getOwnPropertyDescriptor(version.sectionTexts, section.id)?.value,
    );
    for (const path of missingInSection(section, text)) {
      missing.push(`sections.${section.id}.${path}`);
    }
  }
  return missing;
}

/**
 * Whether a path within a section of this type (`body`, `items.<id>.answer`)
 * names one of its authored-markdown fields.
 */
export function isLandingMarkdownPath(type: LandingSectionType, path: string): boolean {
  const fields: readonly LandingMarkdownField[] = LANDING_SECTIONS[type].markdownFields;
  const parts = path.split(".");
  return fields.some((spec) =>
    "items" in spec
      ? parts.length === 3 && parts[0] === spec.items && parts[2] === spec.field
      : parts.length === 1 && parts[0] === spec.field,
  );
}

/**
 * Every authored-markdown value one section's words hold, with its path within
 * the section — whatever shape the words are, a value that is not a string
 * simply skipped.
 */
export function landingMarkdownValues(
  type: LandingSectionType,
  text: unknown,
): { path: string; value: string }[] {
  const fields: readonly LandingMarkdownField[] = LANDING_SECTIONS[type].markdownFields;
  return fields.flatMap((spec) => {
    if (!("items" in spec)) {
      const value = fieldOf(text, spec.field);
      return typeof value === "string" ? [{ path: spec.field, value }] : [];
    }
    const items = fieldOf(text, spec.items);
    const entries: [string, unknown][] =
      typeof items === "object" && items !== null && !Array.isArray(items)
        ? Object.entries(items)
        : [];
    return entries.flatMap(([id, item]) => {
      const value = fieldOf(item, spec.field);
      return typeof value === "string"
        ? [{ path: `${spec.items}.${id}.${spec.field}`, value }]
        : [];
    });
  });
}

export { ctaSection } from "./cta";
export { faqSection } from "./faq";
export { heroSection } from "./hero";
export { imageSection } from "./image";
export { LANDING_ICONS, pointsSection, type LandingIcon } from "./points";
export { stepsSection } from "./steps";
export { LANDING_IMAGE_SIDES, textSection } from "./text";
export {
  buttonTarget,
  isWritten,
  LANDING_ID_PATTERN,
  landingId,
  type ButtonTarget,
  type LandingMarkdownField,
  type LandingSectionDefinition,
} from "./shared";
