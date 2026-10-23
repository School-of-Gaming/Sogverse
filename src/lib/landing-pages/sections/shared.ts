import { z } from "zod";
import type { LandingPictureShape } from "../picture-shapes";
import type { MarkdownUseCase } from "@/lib/authored-markdown";

/**
 * What every landing section module builds on: the id shape, the button
 * target, the text field schemas and the one test of "written".
 *
 * Kept free of React and of any service import, so the registry can be read by
 * the renderer, the service, the SEO code and the MCP tools alike.
 */

/**
 * The one shape of an id inside a landing page's structure — a section's, an
 * item's, a picture's catalogue entry: a lowercase uuid. The database refuses
 * anything else, so input is trimmed and lowercased before it is checked.
 */
export const LANDING_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const landingId = z
  .string()
  .trim()
  .toLowerCase()
  .regex(LANDING_ID_PATTERN, "Not an id");

/**
 * The one shape of an email address a button may open: something@a.domain,
 * without spaces or the characters that would carry extra `mailto:` fields.
 * The SQL half (`landing_button_is_valid`) states the same pattern.
 */
export const LANDING_EMAIL_PATTERN = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z0-9.-]+$/;

/**
 * Where a section's button leads: a route of this site, without its locale
 * (`/shop/<id>`), rendered in the page's locale; uncommonly, another site's
 * http(s) address; or an email to one address. An email's subject line is a
 * word, written per language beside the button's label (`emailSubject`).
 */
export const buttonTarget = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("internal"),
      path: z
        .string()
        .trim()
        .regex(/^\/(?!\/)/, "A site path starts with a single /"),
    })
    .strict(),
  z
    .object({
      kind: z.literal("external"),
      url: z
        .string()
        .trim()
        .url("Not a web address")
        .regex(/^https?:\/\//, "A web address starts with http:// or https://"),
    })
    .strict(),
  z
    .object({
      kind: z.literal("email"),
      to: z
        .string()
        .trim()
        .regex(LANDING_EMAIL_PATTERN, "Not an email address"),
    })
    .strict(),
]);

export type ButtonTarget = z.infer<typeof buttonTarget>;

/**
 * The side of the page a sticky section's column takes on wide screens. The
 * SQL half (`landing_sections_problem`) states the same two.
 */
export const LANDING_STICKY_SIDES = ["left", "right"] as const;

export type LandingStickySide = (typeof LANDING_STICKY_SIDES)[number];

/**
 * The shared field every section takes, whatever its type: present, the
 * section is one of the page's sticky sections, on that side — at most one on
 * each side. Which types may carry it is each module's `sticky`, held by the
 * structure rule.
 */
export const stickyField = {
  sticky: z.enum(LANDING_STICKY_SIDES).optional(),
};

/**
 * The ground a section sits on: `default`, the page's own, or `card`, a band
 * of the card ground running the viewport's width. Every section type but the
 * hero takes one, by spreading `landingBackgroundField` into its schema, and
 * every one of them has one: a section without it is refused, here and by the
 * SQL half. Adjacent `card` sections share one band, which is how an admin
 * sets related sections apart as a group. The SQL half
 * (`landing_sections_problem`) holds the same values and refuses one on the
 * hero.
 */
export const LANDING_SECTION_BACKGROUNDS = ["default", "card"] as const;

export type LandingSectionBackground = (typeof LANDING_SECTION_BACKGROUNDS)[number];

/** The background field, spread into every non-hero section's schema. */
export const landingBackgroundField = {
  background: z.enum(LANDING_SECTION_BACKGROUNDS),
};

/** A plain-text field, unwritten while absent or blank. */
export const plainText = z.string().trim().optional();

/** An authored-markdown field, unwritten while absent or blank; its use case is its `markdownFields` entry's. */
export const markdownText = z.string().trim().optional();

/**
 * A section's text as the required-text rule reads it: whatever was stored,
 * read field by field, so the rule answers the same as its SQL half for any
 * input — a field that is not a string is simply unwritten.
 */
export type TextReading = Readonly<Record<string, unknown>>;

/**
 * Whether a text field is written: a string holding something other than
 * whitespace. The SQL half (`landing_text_is_written`) tests the same thing.
 */
export function isWritten(value: unknown): boolean {
  return typeof value === "string" && /\S/.test(value);
}

/** One nested entry of a text reading (`items.<id>`, `alts`), or an empty one. */
export function entryOf(value: unknown, key: string): TextReading {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }
  const entry: unknown = Object.getOwnPropertyDescriptor(value, key)?.value;
  return typeof entry === "object" && entry !== null && !Array.isArray(entry)
    ? Object.fromEntries(Object.entries(entry))
    : {};
}

/** One field of a nested text entry (`alts.<id>`), or undefined. */
export function fieldOf(value: unknown, key: string): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }
  return Object.getOwnPropertyDescriptor(value, key)?.value;
}

/** What one section type declares about itself. */
export interface LandingSectionDefinition<
  Type extends string,
  Section extends z.ZodTypeAny,
  Text extends z.ZodTypeAny,
> {
  readonly type: Type;
  /** The admin-facing name of the type. */
  readonly label: string;
  /**
   * Whether a section of this type may be one of the page's sticky sections:
   * on wide screens a sticky card in the page's gutter beside the other
   * sections, below that at the bottom of the page. Every section takes the
   * `sticky` shared field; the structure rule refuses it on a type that says
   * false here, and the SQL structure check names the same types. A type says
   * true only once its renderer reads well in that narrow column.
   */
  readonly sticky: boolean;
  /** The section in the page's structure: `id`, `type` and its shared fields. */
  readonly section: Section;
  /** The section's text fields in one language. Every field may be unwritten. */
  readonly text: Text;
  /**
   * The required text fields this section has not got written, as paths
   * within the section (`headline`, `items.<id>.title`, `alts.<id>`), in the
   * order the section reads them.
   */
  readonly missingText: (section: z.output<Section>, text: TextReading) => string[];
  /**
   * The words that are authored markdown, and so render as rich text and
   * can hold links: exactly the fields whose schema is `markdownText`, each
   * with the use case it renders under. The one declaration the links hook
   * and the MCP tools' subset check both read.
   */
  readonly markdownFields: readonly LandingMarkdownField[];
  /**
   * The picture shapes this type's pictures may be, none for a type without
   * pictures. A section's pictures are always all one shape, so an image
   * section's grid lines up. The database refuses any other picture, by the
   * same rule written once more in SQL, and a DB test holds the two equal.
   */
  readonly pictureShapes: readonly LandingPictureShape[];
}

/**
 * One authored-markdown field of a section type's words: a field of the
 * section's own, or a field of each item's (`<items>.<item id>.<field>`), and
 * the use case it renders under, which every surface showing it passes.
 */
export type LandingMarkdownField = { readonly useCase: LandingMarkdownUseCase } & (
  | { readonly field: string }
  | { readonly items: string; readonly field: string }
);

/** The use cases a landing page's markdown fields render under. */
export type LandingMarkdownUseCase = Extract<MarkdownUseCase, "landing" | "landing-faq">;

/** Items carrying an id, distinct within their section. */
export function distinctIds(items: readonly { id: string }[]): boolean {
  return new Set(items.map((item) => item.id)).size === items.length;
}
