import { z } from "zod-v4";
import { describeMarkdownSubset } from "@/lib/authored-markdown-subset";
import {
  IMAGE_SECTION_MAX_PICTURES,
  LANDING_EMAIL_PATTERN,
  LANDING_ICONS,
  LANDING_ID_PATTERN,
  LANDING_IMAGE_SIDES,
  LANDING_SECTION_BACKGROUNDS,
  LANDING_SECTION_TYPES,
  LANDING_SECTIONS,
  LANDING_STICKY_SIDES,
  LANDING_STICKY_TYPES,
  LANDING_TESTIMONIAL_ARRANGEMENTS,
  LANDING_TESTIMONIAL_SLOTS,
  landingStructureProblem,
  missingInLandingVersion,
  type LandingSection,
  type LandingSectionOf,
  type LandingSectionType,
} from "@/lib/landing-pages/sections";
import {
  LANDING_PICTURE_SHAPES,
  describeLandingPictureShapes,
  type LandingPictureShape,
} from "@/lib/landing-pages/picture-shapes";

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
  "A picture's catalogue id: a landing page picture entry of a shape the section takes, as list_landing_images returns it.",
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

/**
 * The background every section but the hero takes, spread into each of their
 * structures as the registry spreads its own.
 */
const backgroundField = {
  background: z
    .enum(LANDING_SECTION_BACKGROUNDS)
    .default("default")
    .describe(
      "The ground the section sits on: default, the page's own, or card, a band of the card colour across the full width of the screen that sets the section apart. Adjacent card sections share one band and read as one related group, so give card to two or more neighbours to group them, and keep sections that are not related apart with a default one between. Left out, default.",
    ),
};

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

/** Each arrangement with what it looks like, for the AI app. */
const ARRANGEMENT_LOOKS: { readonly [Arrangement in keyof typeof LANDING_TESTIMONIAL_SLOTS]: string } = {
  feature: "one large centred quote, as under the home page's hero",
  pair: "two quotes side by side, as on About",
  row: "three quotes in a row, as the home page's and About's \"What parents tell us\"",
  showcase: "About's whole arrangement: one large quote, then two side by side, then three in a row, in that reading order",
};

const ARRANGEMENTS = LANDING_TESTIMONIAL_ARRANGEMENTS.map(
  (arrangement) =>
    `${arrangement} (exactly ${LANDING_TESTIMONIAL_SLOTS[arrangement]}: ${ARRANGEMENT_LOOKS[arrangement]})`,
).join("; ");

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
      ...backgroundField,
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
      minimal: { id: ANY_ID, type: "text", background: "default", imageSide: "start" },
      withOptional: {
        imageId: { id: ANY_ID, type: "text", background: "default", imageSide: "start", imageId: ANY_ID },
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
      ...backgroundField,
      images: z
        .array(z.strictObject({ id: itemId, imageId: pictureId }))
        .min(1, "An image section shows at least one picture")
        .max(IMAGE_SECTION_MAX_PICTURES, "An image section shows at most four pictures")
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
      minimal: { id: ANY_ID, type: "image", background: "default", images: [{ id: PICTURE, imageId: ANY_ID }] },
      withOptional: {},
    },
    itemIds: (section) => ({ key: "alts", ids: section.images.map((image) => image.id) }),
  },
  points: {
    about: `Two to six points, each an icon with a title and a short body. Icons: ${LANDING_ICONS.join(", ")}.`,
    structure: z.strictObject({
      id: sectionId,
      type: z.literal("points"),
      ...backgroundField,
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
      minimal: { id: ANY_ID, type: "points", background: "default", items: [{ id: ITEM, icon: "star" }] },
      withOptional: {},
    },
    itemIds: (section) => ({ key: "items", ids: section.items.map((item) => item.id) }),
  },
  steps: {
    about: "Two to six numbered steps, each a title and a short body.",
    structure: z.strictObject({
      id: sectionId,
      type: z.literal("steps"),
      ...backgroundField,
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
      minimal: { id: ANY_ID, type: "steps", background: "default", items: [{ id: ITEM }] },
      withOptional: {},
    },
    itemIds: (section) => ({ key: "items", ids: section.items.map((item) => item.id) }),
  },
  testimonials: {
    about: `Testimonials from School of Gaming's store, placed by id and laid out by arrangement: ${ARRANGEMENTS}. testimonialIds lists exactly as many as the arrangement shows, each once, in reading order; a different count is refused. The ids come from list_testimonials, and an id no testimonial has is refused when the structure is saved. The testimonials' words — whom each is from and the quote, in every language — live in the store, never in the page: they are not written here and cannot be, readers see the store's current words on the live page straight away whenever a testimonial is edited, and each reader gets the testimonial's version in their language, else English, else the first written. A testimonial is real words from a real parent, gamer or gedu that the admin supplies: never invent one, and only create one with create_testimonial from words the admin gives you. To take a quote off this page, save the structure with this section changed — another testimonial in its place, another arrangement, or the section removed; testimonials themselves are never deleted. The eyebrow, heading and intro are optional words, never required.`,
    structure: z.strictObject({
      id: sectionId,
      type: z.literal("testimonials"),
      ...backgroundField,
      arrangement: z
        .enum(LANDING_TESTIMONIAL_ARRANGEMENTS)
        .describe(`How the testimonials are laid out, and so how many: ${ARRANGEMENTS}.`),
      testimonialIds: z
        .array(landingId.describe("A testimonial's id, as list_testimonials returns it."))
        .refine(
          (ids) => new Set(ids).size === ids.length,
          "A testimonials section names each testimonial once",
        )
        .describe("The testimonials, in reading order: exactly as many as the arrangement shows."),
    }),
    text: z.strictObject({
      eyebrow,
      heading: plainText.describe("The section's heading. Optional."),
      intro: plainText.describe("A line under the heading. Optional."),
    }),
    ruleSamples: {
      minimal: { id: ANY_ID, type: "testimonials", background: "default", arrangement: "feature", testimonialIds: [ANY_ID] },
      withOptional: {},
    },
    itemIds: () => null,
  },
  products: {
    about:
      "Products of any type — clubs, municipality clubs, camps and events — each drawn as the shop's own card — name, schedule, ages, price, seats and whether registration is open, all live — in a carousel, in the order picked, each card linking to the product's page (a municipality club's is under its town's schools page). Pick at least one, each once; there is no maximum, but a handful reads best. Find them with list_products: a product it reports as listed is drawn. Picks go stale every term: a product that has ended or is unlisted is simply not drawn, and a section with none of its picks listed is not drawn at all, so readers never see a stale card. get_landing_page reports each products section's picks under productPicks — shown or not, and why not — so check it and swap in next term's products when a term ends. A pick no product has is refused when the structure is saved. The heading, eyebrow and intro are optional words, never required.",
    structure: z.strictObject({
      id: sectionId,
      type: z.literal("products"),
      ...backgroundField,
      productIds: z
        .array(landingId.describe("A product's id, as list_products returns it."))
        .min(1, "A products section picks at least one product")
        .refine(
          (ids) => new Set(ids).size === ids.length,
          "A products section names each product once",
        )
        .describe("The picked products, in the order their cards are shown."),
    }),
    text: z.strictObject({
      eyebrow,
      heading: plainText.describe("The section's heading. Optional."),
      intro: plainText.describe("A line under the heading. Optional."),
    }),
    ruleSamples: {
      minimal: { id: ANY_ID, type: "products", background: "default", productIds: [ANY_ID] },
      withOptional: {},
    },
    itemIds: () => null,
  },
  guide: {
    about:
      "A guide from School of Gaming's store — a PDF with one file per language — offered for download, with a heading, an optional description and an optional cover picture. Readers who are signed in download the file in their own language, else English, else the earliest language that has one, in Sogverse's language order; a signed-out reader sees the section and is asked to create an account first. The guide's files live in the store, never in the page: choose one by its id from list_guides, or upload a new guide or another language's file with open_guide_uploader, then place it here. An id no guide has is refused when the structure is saved. To take a guide off this page, save the structure without this section; guides themselves are never deleted.",
    structure: z.strictObject({
      id: sectionId,
      type: z.literal("guide"),
      ...backgroundField,
      guideId: landingId.describe("The guide's id, as list_guides returns it."),
      imageId: pictureId.optional(),
    }),
    text: z.strictObject({
      eyebrow,
      heading: plainText.describe("The section's heading."),
      description: plainText.describe("A line or two on what the guide holds, plain text. Optional."),
      imageAlt: plainText.describe("The cover picture's alt text."),
    }),
    ruleSamples: {
      minimal: { id: ANY_ID, type: "guide", background: "default", guideId: ANY_ID },
      withOptional: {
        imageId: { id: ANY_ID, type: "guide", background: "default", guideId: ANY_ID, imageId: ANY_ID },
      },
    },
    itemIds: () => null,
  },
  faq: {
    about:
      "One to twenty questions and answers. Search engines read it as the page's FAQ, so write real questions a reader asks.",
    structure: z.strictObject({
      id: sectionId,
      type: z.literal("faq"),
      ...backgroundField,
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
            `The answer: markdown limited to ${describeMarkdownSubset("landing-faq")}. No headings: the question is the answer's heading.`,
          ),
        },
        "question",
      ),
    }),
    ruleSamples: {
      minimal: { id: ANY_ID, type: "faq", background: "default", items: [{ id: ITEM }] },
      withOptional: {},
    },
    itemIds: (section) => ({ key: "items", ids: section.items.map((item) => item.id) }),
  },
  subscribe: {
    about:
      "An email sign-up form: a reader leaves their email address, and their first and last name if they like, to join School of Gaming's newsletter. The form's field labels, its consent sentence and what it says after a sign-up are the site's own, in the reader's language; the page writes only the heading, an optional intro line and the button's words, which should say why a reader would sign up from this page. The reader is on the list as soon as they sign up, with no confirmation email. The list is the same for every page, so the section has no other field but its background.",
    structure: z.strictObject({
      id: sectionId,
      type: z.literal("subscribe"),
      ...backgroundField,
    }),
    text: z.strictObject({
      eyebrow,
      heading: plainText.describe("The section's heading."),
      intro: plainText.describe("A line under the heading, plain text. Optional."),
      buttonLabel: plainText.describe("The submit button's words."),
    }),
    ruleSamples: {
      minimal: { id: ANY_ID, type: "subscribe", background: "default" },
      withOptional: {},
    },
    itemIds: () => null,
  },
  cta: {
    about: "A closing ask: a heading, an optional line and a button.",
    structure: z.strictObject({
      id: sectionId,
      type: z.literal("cta"),
      ...backgroundField,
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
      minimal: { id: ANY_ID, type: "cta", background: "default", button: { kind: "internal", path: "/" } },
      withOptional: {},
    },
    itemIds: () => null,
  },
};

// ---------------------------------------------------------------------------
// Inputs built from the record
// ---------------------------------------------------------------------------

/** The types that may be sticky, by their names as the tools write them. */
const STICKY_TYPES = LANDING_STICKY_TYPES.map(
  (type) => `${type} (${LANDING_SECTIONS[type].label})`,
).join(", ");

/** How a sticky section is drawn, for the AI app. */
export const STICKY_MANUAL = `A page may mark a section sticky, by giving it sticky: ${LANDING_STICKY_SIDES.join(" or ")}; only these types may be: ${STICKY_TYPES}. A page has at most one sticky section on each side, so two at most, one left and one right. On wide screens (1536px and wider) a sticky section leaves the flow of the page and stands as a narrow card in the page's margin on its side, pinned under the site header as the reader scrolls. Every other section keeps its full width where the screen allows: with one card, the sections stay in the page's centre and move away from the card only as far as the screen requires; with a card on each side, they stay centred and are narrower until the screen is about 1870px wide. On narrower screens, phones included, the sticky sections are drawn at the bottom of the page, after the last section, in the order they have in the list. Otherwise where a sticky section sits in the list makes no difference to where it is drawn; removing the section, or leaving sticky out, unmarks it. A sticky section is drawn as a card of its own and never on a band, wherever it sits, so its background makes no difference. In the card its words are start-aligned under a smaller heading, and its button, form or download spans the card's width; a guide's cover picture runs across the card's top. A sticky guide readers cannot be offered draws no card, as a guide in the flow draws nothing.`;

/**
 * The shared field every section takes, as the registry's `stickyField`; the
 * structure rule then refuses it on a type that may not be sticky, with a
 * sentence naming the types that may.
 */
const sticky = {
  sticky: z
    .enum(LANDING_STICKY_SIDES)
    .optional()
    .describe(
      `Makes this a sticky section, its card on this side on wide screens; at most one section per side. Only for ${STICKY_TYPES}; leave it out on every other section.`,
    ),
};

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
      hero.structure.extend(sticky),
      ...others.map((section) => section.structure.extend(sticky)),
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
 * field adds — or "none" for a type that requires no words.
 */
export function describeRequiredWords(type: LandingSectionType): string {
  const { minimal, withOptional } = MCP_LANDING_SECTIONS[type].ruleSamples;
  const always = requiredPaths(minimal);
  const conditional = Object.entries(withOptional).flatMap(([field, sample]) =>
    requiredPaths(sample)
      .filter((path) => !always.includes(path))
      .map((path) => `${path} when ${field} is set`),
  );
  const required = [...always, ...conditional];
  return required.length === 0 ? "none" : required.join("; ");
}

/** What the arrangement rule refuses, from the rule itself. */
const STRUCTURE_RULES = [
  landingStructureProblem([{ id: "a", type: "text" }]),
  landingStructureProblem([
    { id: "a", type: "hero" },
    { id: "b", type: "hero" },
  ]),
  ...LANDING_STICKY_TYPES.slice(0, 1).map((type) =>
    landingStructureProblem([
      { id: "a", type: "hero" },
      { id: "b", type, sticky: "left" },
      { id: "c", type, sticky: "left" },
    ]),
  ),
]
  .filter((rule) => rule !== null)
  .join("; ");

/** The shapes a type's pictures may be, in words, from the registry; nothing for a type without pictures. */
function describePictureShapes(type: LandingSectionType): string {
  const shapes: readonly LandingPictureShape[] = LANDING_SECTIONS[type].pictureShapes;
  if (shapes.length === 0) return "";
  const which = describeLandingPictureShapes(shapes);
  if (type === "image") return ` Its pictures may be ${which}, all one shape.`;
  return shapes.length === LANDING_PICTURE_SHAPES.length
    ? ` Its picture may be ${which}.`
    : ` Its picture must be ${which}.`;
}

/** Every section type, what it is, and which of its words are required. */
export const SECTIONS_MANUAL = [
  `${STRUCTURE_RULES}; the other sections follow in any order and number.`,
  ...LANDING_SECTION_TYPES.map(
    (type) =>
      `- ${type} (${LANDING_SECTIONS[type].label}): ${MCP_LANDING_SECTIONS[type].about}${describePictureShapes(type)} Required words in every language: ${describeRequiredWords(type)}.`,
  ),
  `In those paths ${ITEM} is each item's id and ${PICTURE} each picture item's id. Every section also takes an optional eyebrow.`,
  `Every section but the hero takes a background in its structure, shared by every language: ${LANDING_SECTION_BACKGROUNDS.join(" or ")}, default when left out. card sets the section on a full-width band; adjacent card sections share one band and read as one related group. The hero takes no background.`,
  STICKY_MANUAL,
].join("\n");
