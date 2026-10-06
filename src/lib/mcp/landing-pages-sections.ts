import { z } from "zod-v4";
import { describeMarkdownSubset } from "@/lib/authored-markdown-subset";
import {
  LANDING_EMAIL_PATTERN,
  LANDING_ICONS,
  LANDING_ID_PATTERN,
  LANDING_IMAGE_SIDES,
  LANDING_SECTION_TYPES,
  LANDING_SECTIONS,
  landingStructureProblem,
  missingInLandingVersion,
  type LandingSection,
  type LandingSectionOf,
  type LandingSectionType,
} from "@/lib/landing-pages/sections";

/*
 * The landing page sections as an AI app writes them. The section registry
 * (`src/lib/landing-pages/sections/`) is zod 3, which the MCP SDK cannot turn
 * into the JSON Schema an AI app reads, so each type's shared fields and words
 * are declared again here in `zod-v4` — in an exhaustive record, so a type
 * added to the registry fails type-check here until the tools can write it. A
 * unit test runs both declarations over one set of samples and requires the
 * same answer from each, so the two cannot drift.
 *
 * One deliberate difference: here a section's id and an item's id may be left
 * out. A section or item sent without one is new, and the tool gives it a
 * fresh id before the registry's own schema checks the structure.
 */

// ---------------------------------------------------------------------------
// Fields
// ---------------------------------------------------------------------------

/** An id inside a page's structure, as the registry's `landingId` reads it. */
const landingId = z
  .string()
  .trim()
  .toLowerCase()
  .regex(LANDING_ID_PATTERN, "Not an id");

const sectionId = landingId
  .optional()
  .describe(
    "The section's id. Keep it on every section the page already has; leave it out for a new section, which is given one.",
  );

const itemId = landingId
  .optional()
  .describe("The item's id. Keep it on every existing item; leave it out for a new one.");

const pictureId = landingId.describe(
  "A picture's catalogue id: a landing page picture entry, as list_landing_images returns it.",
);

const buttonTarget = z
  .discriminatedUnion("kind", [
    z.strictObject({
      kind: z.literal("internal"),
      path: z
        .string()
        .trim()
        .regex(/^\/(?!\/)/, "A site path starts with a single /")
        .describe(
          "A page of this site by its path without a language prefix, e.g. /shop/<product id>; readers are taken to it in their own language.",
        ),
    }),
    z.strictObject({
      kind: z.literal("external"),
      url: z
        .string()
        .trim()
        .url("Not a web address")
        .regex(/^https?:\/\//, "A web address starts with http:// or https://")
        .describe("Another site's http(s) address. Uncommon: prefer a page of this site."),
    }),
    z.strictObject({
      kind: z.literal("email"),
      to: z
        .string()
        .trim()
        .regex(LANDING_EMAIL_PATTERN, "Not an email address")
        .describe(
          "The one email address the button opens a message to, e.g. info@example.com. Its subject line, if any, is a word written per language (emailSubject).",
        ),
    }),
  ])
  .describe("Where the button leads: a page of this site, another site, or an email.");

/** Items whose ids, where given, are distinct. */
function distinctGivenIds(items: readonly { id?: string }[]): boolean {
  const given = items.flatMap((item) => (item.id === undefined ? [] : [item.id]));
  return new Set(given).size === given.length;
}

const plainText = z.string().trim().optional();
const markdownText = z.string().trim().optional();

const eyebrow = plainText.describe("A short label above the heading. Optional.");

const emailSubject = plainText.describe(
  "The subject line of the email the button opens, when its target is an email address. Optional; other buttons ignore it.",
);

/** The words of each item of a section, keyed by the item's id. */
function itemWords<Shape extends z.ZodRawShape>(shape: Shape, what: string) {
  return z
    .record(z.string(), z.strictObject(shape))
    .optional()
    .describe(`Each ${what}'s words, keyed by the ${what}'s id from the structure.`);
}

// ---------------------------------------------------------------------------
// The record
// ---------------------------------------------------------------------------

/** What the tools know about one section type. */
interface McpLandingSection<Type extends LandingSectionType> {
  /** What the section is and how it reads, for the AI app. */
  readonly about: string;
  /** The section in the page's structure: `type`, its shared fields and an optional id. */
  readonly structure: z.ZodObject;
  /** The section's words in one language. */
  readonly text: z.ZodObject;
  /**
   * A section of this type with every optional shared field left out, then
   * each optional shared field alone, so the required-text rule is described
   * by running the rule itself.
   */
  readonly ruleSamples: {
    readonly minimal: LandingSectionOf<Type>;
    readonly withOptional: Readonly<Record<string, LandingSectionOf<Type>>>;
  };
  /** The section's item ids, for checking the keys of its words. */
  readonly itemIds: (section: LandingSectionOf<Type>) => {
    readonly key: "items" | "alts";
    readonly ids: readonly string[];
  } | null;
}

/** Placeholders the rule descriptions read as words. */
const ANY_ID = "00000000-0000-4000-8000-000000000000";
const ITEM = "<item id>";
const PICTURE = "<picture id>";


export const MCP_LANDING_SECTIONS: {
  readonly [Type in LandingSectionType]: McpLandingSection<Type>;
} = {
  hero: {
    about:
      "The page's opening: the headline is the page's only H1, with an optional line under it, an optional picture and an optional button. Every page has exactly one, first. Its picture is also the page's link preview, the image shown wherever the page is shared, with its alt text; a hero without one shares the site-wide card. A partner's logo in it (Roblox's, Lynx's) is a new placement of their mark, which needs that partner's sign-off first.",
    structure: z.strictObject({
      id: sectionId,
      type: z.literal("hero"),
      imageId: pictureId.optional(),
      button: buttonTarget.optional(),
    }),
    text: z.strictObject({
      eyebrow,
      headline: plainText.describe("The page's headline, its only H1."),
      subline: plainText.describe("A line under the headline. Optional."),
      buttonLabel: plainText.describe("The button's words."),
      emailSubject,
      imageAlt: plainText.describe("The picture's alt text."),
    }),
    ruleSamples: {
      minimal: { id: ANY_ID, type: "hero" },
      withOptional: {
        imageId: { id: ANY_ID, type: "hero", imageId: ANY_ID },
        button: { id: ANY_ID, type: "hero", button: { kind: "internal", path: "/" } },
      },
    },
    itemIds: () => null,
  },
  text: {
    about: `A heading and a body, with an optional picture beside them on the side imageSide names (${LANDING_IMAGE_SIDES.join(" or ")}).`,
    structure: z.strictObject({
      id: sectionId,
      type: z.literal("text"),
      imageId: pictureId.optional(),
      imageSide: z
        .enum(LANDING_IMAGE_SIDES)
        .describe("Which side of the words the picture sits on: start is the reading side."),
    }),
    text: z.strictObject({
      eyebrow,
      heading: plainText.describe("The section's heading."),
      body: markdownText.describe(
        `The section's body: markdown limited to ${describeMarkdownSubset("landing")}.`,
      ),
      imageAlt: plainText.describe("The picture's alt text."),
    }),
    ruleSamples: {
      minimal: { id: ANY_ID, type: "text", imageSide: "start" },
      withOptional: {
        imageId: { id: ANY_ID, type: "text", imageSide: "start", imageId: ANY_ID },
      },
    },
    itemIds: () => null,
  },
  image: {
    about:
      "One to four pictures side by side, with an optional heading and caption. Each picture is an item with an id of its own, and its alt text is keyed by that item id, never by the catalogue id.",
    structure: z.strictObject({
      id: sectionId,
      type: z.literal("image"),
      images: z
        .array(z.strictObject({ id: itemId, imageId: pictureId }))
        .min(1, "An image section shows at least one picture")
        .max(4, "An image section shows at most four pictures")
        .refine(distinctGivenIds, "Two pictures share an id")
        .describe("The pictures, in order."),
    }),
    text: z.strictObject({
      eyebrow,
      heading: plainText.describe("The section's heading. Optional."),
      caption: plainText.describe("A caption under the pictures. Optional."),
      alts: z
        .record(z.string(), z.string().trim())
        .optional()
        .describe("Each picture's alt text, keyed by the picture item's id from the structure."),
    }),
    ruleSamples: {
      minimal: { id: ANY_ID, type: "image", images: [{ id: PICTURE, imageId: ANY_ID }] },
      withOptional: {},
    },
    itemIds: (section) => ({ key: "alts", ids: section.images.map((image) => image.id) }),
  },
  points: {
    about: `Two to six points, each an icon with a title and a short body. Icons: ${LANDING_ICONS.join(", ")}.`,
    structure: z.strictObject({
      id: sectionId,
      type: z.literal("points"),
      items: z
        .array(z.strictObject({ id: itemId, icon: z.enum(LANDING_ICONS) }))
        .min(2, "A points section has at least two points")
        .max(6, "A points section has at most six points")
        .refine(distinctGivenIds, "Two points share an id")
        .describe("The points, in order."),
    }),
    text: z.strictObject({
      eyebrow,
      heading: plainText.describe("The section's heading."),
      intro: plainText.describe("A line under the heading. Optional."),
      items: itemWords(
        {
          title: plainText.describe("The point's title."),
          body: plainText.describe("The point's body, plain text."),
        },
        "point",
      ),
    }),
    ruleSamples: {
      minimal: { id: ANY_ID, type: "points", items: [{ id: ITEM, icon: "star" }] },
      withOptional: {},
    },
    itemIds: (section) => ({ key: "items", ids: section.items.map((item) => item.id) }),
  },
  steps: {
    about: "Two to six numbered steps, each a title and a short body.",
    structure: z.strictObject({
      id: sectionId,
      type: z.literal("steps"),
      items: z
        .array(z.strictObject({ id: itemId }))
        .min(2, "A steps section has at least two steps")
        .max(6, "A steps section has at most six steps")
        .refine(distinctGivenIds, "Two steps share an id")
        .describe("The steps, in order."),
    }),
    text: z.strictObject({
      eyebrow,
      heading: plainText.describe("The section's heading."),
      intro: plainText.describe("A line under the heading. Optional."),
      items: itemWords(
        {
          title: plainText.describe("The step's title."),
          body: plainText.describe("The step's body, plain text."),
        },
        "step",
      ),
    }),
    ruleSamples: {
      minimal: { id: ANY_ID, type: "steps", items: [{ id: ITEM }] },
      withOptional: {},
    },
    itemIds: (section) => ({ key: "items", ids: section.items.map((item) => item.id) }),
  },
  faq: {
    about:
      "One to twenty questions and answers. Search engines read it as the page's FAQ, so write real questions a reader asks.",
    structure: z.strictObject({
      id: sectionId,
      type: z.literal("faq"),
      items: z
        .array(z.strictObject({ id: itemId }))
        .min(1, "A questions section has at least one question")
        .max(20, "A questions section has at most twenty questions")
        .refine(distinctGivenIds, "Two questions share an id")
        .describe("The questions, in order."),
    }),
    text: z.strictObject({
      eyebrow,
      heading: plainText.describe("The section's heading."),
      items: itemWords(
        {
          question: plainText.describe("The question."),
          answer: markdownText.describe(
            `The answer: markdown limited to ${describeMarkdownSubset("landing")}.`,
          ),
        },
        "question",
      ),
    }),
    ruleSamples: {
      minimal: { id: ANY_ID, type: "faq", items: [{ id: ITEM }] },
      withOptional: {},
    },
    itemIds: (section) => ({ key: "items", ids: section.items.map((item) => item.id) }),
  },
  cta: {
    about: "A closing ask: a heading, an optional line and a button.",
    structure: z.strictObject({
      id: sectionId,
      type: z.literal("cta"),
      button: buttonTarget,
    }),
    text: z.strictObject({
      eyebrow,
      heading: plainText.describe("The section's heading."),
      body: plainText.describe("A line under the heading, plain text. Optional."),
      buttonLabel: plainText.describe("The button's words."),
      emailSubject,
    }),
    ruleSamples: {
      minimal: { id: ANY_ID, type: "cta", button: { kind: "internal", path: "/" } },
      withOptional: {},
    },
    itemIds: () => null,
  },
};

// ---------------------------------------------------------------------------
// Inputs built from the record
// ---------------------------------------------------------------------------

const { hero, ...afterHero } = MCP_LANDING_SECTIONS;
const others = Object.values(afterHero);

/**
 * A page's structure as an AI app writes it: each section by its type's
 * schema. The arrangement rule (one hero, first; distinct ids) is the
 * registry's, checked by the tool once new sections have their ids.
 */
export const mcpLandingStructure = z
  .array(
    z.discriminatedUnion("type", [
      hero.structure,
      ...others.map((section) => section.structure),
    ]),
  )
  .describe(
    "The page's sections in order. Each section's words are written per language with save_landing_page_text, keyed by the section's id.",
  );

/** One language's words for every section, as an AI app writes them. */
export const mcpSectionTexts = z
  .record(
    z.string(),
    z.union([hero.text, ...others.map((section) => section.text)]),
  )
  .describe(
    "This language's words for the page's sections, keyed by section id; each entry holds the fields of its section's type. Items' words are keyed by the item ids, and an image section's alt texts by its picture item ids.",
  );

// ---------------------------------------------------------------------------
// Ids for new sections and items
// ---------------------------------------------------------------------------

/** An object's own field, whatever its shape. */
function fieldOf(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null) return undefined;
  return Object.getOwnPropertyDescriptor(value, key)?.value;
}

/**
 * The structure with a fresh id on every section and item sent without one.
 * The answer is still unchecked: the registry's own schema reads it next.
 */
export function withIds(sections: readonly unknown[], newId: () => string): unknown[] {
  const identified = (value: unknown): unknown =>
    typeof value === "object" && value !== null && !Array.isArray(value)
      ? { ...value, id: fieldOf(value, "id") ?? newId() }
      : value;
  return sections.map((section) => {
    const filled = identified(section);
    if (typeof filled !== "object" || filled === null) return filled;
    const lists = ["items", "images"].flatMap((key) => {
      const list = fieldOf(filled, key);
      return Array.isArray(list) ? [[key, list.map(identified)] as const] : [];
    });
    return { ...filled, ...Object.fromEntries(lists) };
  });
}

// ---------------------------------------------------------------------------
// The manual
// ---------------------------------------------------------------------------

/** The paths one section lacks with no words at all, by the registry's rule. */
function requiredPaths(section: LandingSection): string[] {
  const prefix = `sections.${section.id}.`;
  return missingInLandingVersion([section], {
    title: "t",
    summary: "s",
    slug: "s",
    sectionTexts: {},
  }).map((path) => path.slice(prefix.length));
}

/**
 * The required-text rule of one type, in words, read off the rule itself: the
 * fields a bare section of the type needs, then each one an optional shared
 * field adds.
 */
export function describeRequiredWords(type: LandingSectionType): string {
  const { minimal, withOptional } = MCP_LANDING_SECTIONS[type].ruleSamples;
  const always = requiredPaths(minimal);
  const conditional = Object.entries(withOptional).flatMap(([field, sample]) =>
    requiredPaths(sample)
      .filter((path) => !always.includes(path))
      .map((path) => `${path} when ${field} is set`),
  );
  return [...always, ...conditional].join("; ");
}

/** What the arrangement rule refuses, from the rule itself. */
const STRUCTURE_RULES = [
  landingStructureProblem([{ id: "a", type: "text" }]),
  landingStructureProblem([
    { id: "a", type: "hero" },
    { id: "b", type: "hero" },
  ]),
]
  .filter((rule) => rule !== null)
  .join("; ");

/** Every section type, what it is, and which of its words are required. */
export const SECTIONS_MANUAL = [
  `${STRUCTURE_RULES}; the other sections follow in any order and number.`,
  ...LANDING_SECTION_TYPES.map(
    (type) =>
      `- ${type} (${LANDING_SECTIONS[type].label}): ${MCP_LANDING_SECTIONS[type].about} Required words in every language: ${describeRequiredWords(type)}.`,
  ),
  `In those paths ${ITEM} is each item's id and ${PICTURE} each picture item's id. Every section also takes an optional eyebrow.`,
].join("\n");
