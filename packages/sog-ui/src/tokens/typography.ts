/**
 * The brand's type, defined once.
 *
 * The faces, the working scale, and the type rules that are values rather than
 * prose. `theme.css` is generated from here and from `brand.ts` together, so a
 * step's size, weight and line height move in one place.
 *
 * **The package owns the names; the consumer supplies the files.** Nothing here
 * loads a font. A consumer loads each face through `next/font` and exposes it as
 * a CSS variable **on `<html>`, never on `<body>`** — the theme block emits at
 * `:root`, so a face variable defined one element lower is invisible there while
 * the page still looks styled, which is the failure mode that hides best. The
 * demo's layout is the reference implementation of that contract.
 *
 * As in `brand.ts`, the `role` and `usage` strings are Guidebook quotations kept
 * as documentation data for the demo. They are never product copy and no
 * component renders one, and every entry carries a `source` so a reader can tell
 * a Guidebook value from one we had to invent.
 */

import type { Source } from "./brand";

/**
 * A face the theme names.
 *
 * `token` is the semantic name the theme declares and a component asks for;
 * `variable` is the face variable the consumer must define and that the token
 * points at. The indirection is the whole contract: a component asks for "the
 * cursive face" and never for a family.
 */
export type Face = {
  /** The family, as the Guidebook names it. */
  readonly name: string;
  /** The semantic token the theme declares — what a `font-*` utility reads. */
  readonly token: `--font-${string}`;
  /** The variable the consumer defines on `<html>`, which `token` points at. */
  readonly variable: `--font-${string}`;
  /** The fallback stack, always the UA's own — never a second webfont. */
  readonly fallback: string;
  /** Weights the reference consumer loads. A weight not listed is synthesised by the browser, not drawn. */
  readonly weights: readonly number[];
  /** Subsets the reference consumer requests. `latin-ext` is not optional: the product ships Finnish, Swedish and French. */
  readonly subsets: readonly string[];
  /** The Guidebook's one-line statement of the face's job. */
  readonly role: string;
  /** Where it may and may not be set. */
  readonly usage: string;
  /**
   * `required` faces have no acceptable fallback: forget one and the page is
   * silently unstyled. The rest degrade to a real UA stack, so a consumer that
   * has no placement for them can leave them undefined.
   */
  readonly required: boolean;
  readonly source: Source;
};

export const FACES = {
  sans: {
    name: "Poppins",
    token: "--font-sans",
    variable: "--font-poppins",
    fallback: "system-ui, sans-serif",
    weights: [400, 500, 600, 700],
    subsets: ["latin", "latin-ext"],
    role: "Poppins is the workhorse. Headings and body copy on the website and in most contexts. A geometric, rounded, warm sans that reads as trustworthy to parents and approachable to children.",
    usage:
      "Body copy and every heading. There is no display face beside it — a heading that wants personality gets the scale, not another family.",
    required: true,
    source: "Guidebook",
  },
  serif: {
    name: "Crimson Pro",
    token: "--font-serif",
    variable: "--font-crimson-pro",
    fallback: "Georgia, serif",
    weights: [400, 600],
    subsets: ["latin", "latin-ext"],
    role: "Crimson Pro is the serif accent. A humanist serif kept for special use: editorial headlines, pull quotes, the Princi-Pal's long-form pieces.",
    usage:
      "A seasoning, not a staple. Never set long UI or body text in it on screen. Named by the Guidebook and unplaced in the product so far, so the theme carries the name and waits for a placement.",
    required: false,
    source: "Guidebook",
  },
  brandMono: {
    name: "Space Mono",
    token: "--font-brand-mono",
    variable: "--font-space-mono",
    fallback: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    weights: [400, 700],
    subsets: ["latin", "latin-ext"],
    role: "Space Mono is the world. The typewriter-monospace face of Sogverse itself: in-platform UI, campaign posters, quest and story artwork, anything meant to feel like it comes from inside the game world.",
    usage:
      "Read narrowly: the platform naming one of its own places. Keep it out of plain parent-facing copy, where Poppins carries trust better. Deliberately not called `--font-mono`, which owns Tailwind's own utility and is spent on machine text — a room code, an id, an inline code span — that must not silently become branded.",
    required: false,
    source: "Guidebook",
  },
  cursive: {
    name: "Dancing Script",
    token: "--font-cursive",
    variable: "--font-dancing-script",
    fallback: "cursive",
    weights: [600],
    subsets: ["latin", "latin-ext"],
    role: "Handwriting, for a signature and nothing else — a name typed into a signing field, rendered the way it would be signed.",
    usage:
      "Anything longer than a name is unreadable in it, which is what keeps the scope closed rather than merely narrow. Not a Guidebook face: an owner exception, 2026-09-01, recorded in docs/brand-guidebook-deviations.md.",
    required: false,
    source: "owner ruling",
  },
} as const satisfies Record<string, Face>;

export type FaceId = keyof typeof FACES;

/**
 * Faces the brand owns that the UI may not set.
 *
 * Recorded because "not in the theme" and "not a brand face" are different
 * facts, and a reader looking for the logo's lettering deserves to find out why
 * it is absent rather than to conclude it was forgotten.
 */
export const NON_UI_FACES = [
  {
    name: "Lazydog",
    kind: "campaign",
    usage: "Cartoonish, playful, speech-bubble contexts. Gamer-facing campaign art only, never the website.",
  },
  {
    name: "Shlop",
    kind: "campaign",
    usage: "Spooky content — Halloween camps and the like. Campaign art only.",
  },
  {
    name: "True Typewriter",
    kind: "campaign",
    usage: "Mystery and adventure atmosphere. Campaign art only.",
  },
  {
    name: "The “SOG” monogram",
    kind: "locked",
    usage: "A custom gamified display face that exists only inside the logo. Do not recreate it for headlines; its scarcity is what makes the badge feel special.",
  },
  {
    name: "The condensed sans in “SCHOOL OF GAMING”",
    kind: "locked",
    usage: "Lives only in the lockup.",
  },
  {
    name: "Work Sans",
    kind: "retired",
    usage: "Used by earlier versions of the Guidebook and retired. The files may still sit in the Brand Kit folder; build nothing new on them.",
  },
  {
    name: "Plus Jakarta Sans",
    kind: "retired",
    usage: "Appeared in earlier notes and is not used — close enough to Poppins that keeping both adds confusion without adding range.",
  },
] as const;

// ------------------------------------------------------------- the scale

export type TypeStep = {
  /** The semantic name — what the step is, not how big it is. */
  readonly id: string;
  /** The CSS token the theme declares, and the `text-*` utility it generates. */
  readonly cssName: `--text-${string}`;
  readonly label: string;
  readonly face: FaceId;
  /** The size the library ships, in CSS pixels. */
  readonly px: number;
  /**
   * The Guidebook gives several steps as a range rather than a number. The
   * shipped `px` is the bottom of it; the range is kept so a surface with room
   * knows how far up it may go without leaving the scale.
   */
  readonly range: readonly [number, number] | null;
  /** The narrow-viewport size, where a step has one. `null` means the step does not restep. */
  readonly mobilePx: number | null;
  /** Where the mobile step came from. `null` wherever there is no mobile step. */
  readonly mobileSource: Source | null;
  readonly weight: number;
  readonly lineHeight: number;
  readonly use: string;
  readonly source: Source;
};

/**
 * The working type scale, from the Guidebook's own table.
 *
 * **The Guidebook has no mobile step** — seven rows, no responsive row, and the
 * ranges never say which end belongs to which viewport. H1's mobile step is the
 * design pass's ruling: 48px is a hero size and the 360px floor cannot carry it,
 * so the step down to 30px is pinned here rather than re-decided per page. Every
 * other step ships one size at every width.
 */
export const TYPE_SCALE = [
  {
    id: "h1",
    cssName: "--text-h1",
    label: "H1",
    face: "sans",
    px: 48,
    range: [48, 56],
    mobilePx: 30,
    mobileSource: "design pass",
    weight: 600,
    lineHeight: 1.1,
    use: "Hero headlines",
    source: "Guidebook",
  },
  {
    id: "h2",
    cssName: "--text-h2",
    label: "H2",
    face: "sans",
    px: 36,
    range: [36, 40],
    mobilePx: null,
    mobileSource: null,
    weight: 600,
    lineHeight: 1.2,
    use: "Section titles",
    source: "Guidebook",
  },
  {
    id: "h3",
    cssName: "--text-h3",
    label: "H3",
    face: "sans",
    px: 24,
    range: [24, 28],
    mobilePx: null,
    mobileSource: null,
    weight: 600,
    lineHeight: 1.3,
    use: "Card and sub-section titles",
    source: "Guidebook",
  },
  {
    id: "h4",
    cssName: "--text-h4",
    label: "H4",
    face: "sans",
    px: 18,
    range: [18, 20],
    mobilePx: null,
    mobileSource: null,
    weight: 400,
    lineHeight: 1.4,
    use: "Small headings",
    source: "Guidebook",
  },
  {
    id: "body-l",
    cssName: "--text-body-l",
    label: "Body L",
    face: "sans",
    px: 18,
    range: null,
    mobilePx: null,
    mobileSource: null,
    weight: 400,
    lineHeight: 1.7,
    use: "Main body copy",
    source: "Guidebook",
  },
  {
    id: "body-s",
    cssName: "--text-body-s",
    label: "Body S",
    face: "sans",
    px: 14,
    range: null,
    mobilePx: null,
    mobileSource: null,
    weight: 400,
    lineHeight: 1.5,
    use: "Captions, labels, nav",
    source: "Guidebook",
  },
  {
    id: "cta",
    cssName: "--text-cta",
    label: "CTA",
    face: "sans",
    px: 16,
    range: null,
    mobilePx: null,
    mobileSource: null,
    weight: 600,
    lineHeight: 1,
    use: "Button labels",
    source: "Guidebook",
  },
] as const satisfies readonly TypeStep[];

export type TypeStepId = (typeof TYPE_SCALE)[number]["id"];

// -------------------------------------------------------------- type rules

/**
 * The type rules that are values, so a check can hold them rather than a
 * reviewer remembering them. Each carries the value, the sentence it came from,
 * and where it came from — because three of the seven are ours and not the
 * brand's.
 *
 * **What is deliberately absent:** the Guidebook's formatting standards — dates,
 * timestamps, ranges, durations, zero-cent prices — are not encoded here. They
 * are escalated whole to the Guidebook's author (five entries in
 * `docs/brand-guidebook-deviations.md`), because the app renders dates and times
 * per locale and per viewer timezone and no clock format moves until that is
 * answered. Encoding one of them as a rule below would be how a deferral gets
 * overridden by accident.
 */
export const TYPE_RULES = {
  headingCase: {
    value: "sentence",
    statement:
      "Headings are sentence case. Never ALL CAPS, never Title Case Every Word. ALL CAPS reads as shouting and undercuts the calm register.",
    source: "Guidebook",
  },
  /**
   * The reading that reconciles A.3's ban with B.2's own bold-caps topic pill:
   * headings are voice and stay sentence case, furniture — eyebrows, pills,
   * field labels, table headers — may be caps. Recorded as "Uppercase labels"
   * in `docs/brand-guidebook-deviations.md`.
   */
  capsOnFurniture: {
    value: true,
    statement:
      "Caps are permitted on furniture — the small, tracked markers a reader scans as structure rather than reads as prose. The Guidebook's own topic pill is bold caps.",
    source: "owner ruling",
  },
  emphasis: {
    value: "bold",
    statement:
      "Emphasis is bold, not italic, in UI and body. Reserve italics for genuine titles and the rare editorial flourish.",
    source: "Guidebook",
  },
  bodyLineLength: {
    value: 70,
    statement:
      "Body line length caps around 70 characters on desktop for readability.",
    source: "Guidebook",
  },
  weightsPerPiece: {
    value: 3,
    statement:
      "Two or three weights per piece, no more. The family gives you many; using many is how a layout starts to look nervous.",
    source: "Guidebook",
  },
  /** No tracking or letterspacing rule appears anywhere in the Guidebook; this one is ours. */
  trackingFollowsCaps: {
    value: true,
    statement:
      "Caps and letterspacing travel as a pair: a marker that goes sentence case drops its tracking in the same edit, because tracked lowercase reads as a rendering fault.",
    source: "design pass",
  },
  mobileFloor: {
    value: 360,
    statement:
      "360 CSS px is the design floor. Anything narrower must degrade gracefully; no layout decision is weighed against it.",
    source: "design pass",
  },
} as const satisfies Record<
  string,
  { value: string | number | boolean; statement: string; source: Source }
>;

export type TypeRuleId = keyof typeof TYPE_RULES;
