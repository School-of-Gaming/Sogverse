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
 * **`FACES` is the exhaustive list.** Four faces are loaded and no other is: a
 * face that is not here is not available to the UI, whether or not it exists in
 * the brand's art. The logo's lettering, campaign display faces and anything
 * retired are drawn, not typed, and the UI never recreates them.
 *
 * ## The type rules that are opinions
 *
 * The two that are values are exported below, because a check can hold a number.
 * The rest are held here:
 *
 * - **Headings are sentence case.** Never ALL CAPS, never Title Case Every
 *   Word: caps read as shouting and undercut the calm register the brand speaks
 *   in.
 * - **Caps are permitted on furniture** — the small, tracked markers a reader
 *   scans as structure rather than reads as prose: eyebrows, pills, field
 *   labels, table headers. The test is voice against furniture, not the HTML
 *   tag.
 * - **Caps and letterspacing travel as a pair.** A marker that goes sentence
 *   case drops its tracking in the same edit, because tracked lowercase reads
 *   as a rendering fault.
 * - **Emphasis is bold, not italic**, in UI and body alike. Italics are for
 *   genuine titles and the rare editorial flourish.
 * - **Two or three weights per piece, no more.** The family offers many; using
 *   many is how a layout starts to look nervous.
 *
 * **What is deliberately absent:** the brand's formatting standards — dates,
 * timestamps, ranges, durations, zero-cent prices — are not encoded here. The
 * product renders dates and times per locale and per viewer timezone, and no
 * clock format moves until that question is answered whole. Encoding one of
 * them here is how a deferral gets overridden by accident.
 */

/**
 * A face the theme names.
 *
 * `token` is the semantic name the theme declares and a component asks for;
 * `variable` is the face variable the consumer must define and that the token
 * points at. The indirection is the whole contract: a component asks for "the
 * cursive face" and never for a family.
 */
export type Face = {
  /** The family, by its own name. */
  readonly name: string;
  /** The semantic token the theme declares — what a `font-*` utility reads. */
  readonly token: `--font-${string}`;
  /** The variable the consumer defines on `<html>`, which `token` points at. */
  readonly variable: `--font-${string}`;
  /** The fallback stack, always the UA's own — never a second webfont. */
  readonly fallback: string;
  /** Weights the consumer loads. A weight not listed is synthesised by the browser, not drawn. */
  readonly weights: readonly number[];
  /** Subsets the consumer requests. `latin-ext` is not optional: the product ships Finnish, Swedish and French. */
  readonly subsets: readonly string[];
};

export const FACES = {
  /**
   * The app face: body copy and every heading. A geometric, rounded, warm sans
   * that reads as trustworthy to a parent and approachable to a child.
   *
   * There is no display face beside it — a heading that wants personality gets
   * the scale, not another family. It is also the one face with no acceptable
   * fallback: leave its variable undefined and the page is silently unstyled,
   * where the other three degrade to a real UA stack a consumer can live with.
   *
   * Not a variable font, so each weight is a separate file and has to be asked
   * for by name.
   */
  sans: {
    name: "Poppins",
    token: "--font-sans",
    variable: "--font-poppins",
    fallback: "system-ui, sans-serif",
    weights: [400, 500, 600, 700],
    subsets: ["latin", "latin-ext"],
  },
  /**
   * The editorial voice: a humanist serif for editorial headlines, pull quotes
   * and long-form pieces written in a person's voice.
   *
   * A seasoning, not a staple. Never set UI or a long passage of body text in
   * it on screen. The theme carries the name and waits for a placement.
   */
  serif: {
    name: "Crimson Pro",
    token: "--font-serif",
    variable: "--font-crimson-pro",
    fallback: "Georgia, serif",
    weights: [400, 600],
    subsets: ["latin", "latin-ext"],
  },
  /**
   * The world voice: the typewriter-monospace face of Sogverse itself, spent
   * where the platform names one of its own places — in-world UI, quest and
   * story artwork, campaign posters.
   *
   * Read narrowly, and kept out of plain copy addressed to a parent, where the
   * app face carries trust better. Deliberately not called `--font-mono`, which
   * owns Tailwind's own utility and is spent on machine text — a room code, an
   * id, an inline code span — that must not silently become branded.
   */
  brandMono: {
    name: "Space Mono",
    token: "--font-brand-mono",
    variable: "--font-space-mono",
    fallback: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    weights: [400, 700],
    subsets: ["latin", "latin-ext"],
  },
  /**
   * Handwriting, for a signature and nothing else — a name typed into a signing
   * field, rendered the way it would be signed. Anything longer than a name is
   * unreadable in it, which is what keeps the scope closed rather than merely
   * narrow.
   */
  cursive: {
    name: "Dancing Script",
    token: "--font-cursive",
    variable: "--font-dancing-script",
    fallback: "cursive",
    weights: [600],
    subsets: ["latin", "latin-ext"],
  },
} as const satisfies Record<string, Face>;

export type FaceId = keyof typeof FACES;

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
  /** The narrow-viewport size, where a step has one. `null` means the step does not restep. */
  readonly mobilePx: number | null;
  readonly weight: number;
  readonly lineHeight: number;
};

/**
 * The working type scale.
 *
 * Seven steps and no more: hero, three headings, two body sizes and the button
 * label. A surface that wants a size the scale does not have is asking for a
 * step, which is a decision made here, not an arbitrary value written into a
 * page.
 *
 * **Only H1 resteps for a narrow viewport.** A hero size cannot fit the mobile
 * floor, so its narrow step is pinned here rather than re-decided per page;
 * every other step ships one size at every width, because a heading that
 * changes size at a breakpoint costs more in inconsistency than it buys in fit.
 */
export const TYPE_SCALE = [
  /** Hero headlines. */
  {
    id: "h1",
    cssName: "--text-h1",
    label: "H1",
    face: "sans",
    px: 48,
    mobilePx: 30,
    weight: 600,
    lineHeight: 1.1,
  },
  /** Section titles. */
  {
    id: "h2",
    cssName: "--text-h2",
    label: "H2",
    face: "sans",
    px: 36,
    mobilePx: null,
    weight: 600,
    lineHeight: 1.2,
  },
  /** Card and sub-section titles. */
  {
    id: "h3",
    cssName: "--text-h3",
    label: "H3",
    face: "sans",
    px: 24,
    mobilePx: null,
    weight: 600,
    lineHeight: 1.3,
  },
  /** Small headings, set at body weight so they read as a lead rather than a shout. */
  {
    id: "h4",
    cssName: "--text-h4",
    label: "H4",
    face: "sans",
    px: 18,
    mobilePx: null,
    weight: 400,
    lineHeight: 1.4,
  },
  /** Main body copy, with the loosest line height in the scale because it is the one people read. */
  {
    id: "body-l",
    cssName: "--text-body-l",
    label: "Body L",
    face: "sans",
    px: 18,
    mobilePx: null,
    weight: 400,
    lineHeight: 1.7,
  },
  /** Captions, labels and navigation. */
  {
    id: "body-s",
    cssName: "--text-body-s",
    label: "Body S",
    face: "sans",
    px: 14,
    mobilePx: null,
    weight: 400,
    lineHeight: 1.5,
  },
  /** Button labels. Line height 1, because a label is one line inside a box that sets its own height. */
  {
    id: "cta",
    cssName: "--text-cta",
    label: "CTA",
    face: "sans",
    px: 16,
    mobilePx: null,
    weight: 600,
    lineHeight: 1,
  },
] as const satisfies readonly TypeStep[];

export type TypeStepId = (typeof TYPE_SCALE)[number]["id"];

// -------------------------------------------------------------- type rules

/**
 * The cap on a reading column, in characters.
 *
 * Body copy runs to about this many characters on a wide viewport and no
 * further: past it the eye loses the start of the next line, and a paragraph
 * that spans a whole desktop window is read once and skimmed after. A layout
 * primitive spends this; a page never types the number.
 */
export const BODY_LINE_LENGTH_CH = 70;

/**
 * The narrow design floor, in CSS pixels.
 *
 * A narrow layout is designed and judged at this width. Anything narrower must
 * degrade gracefully — no horizontal document scroll, nothing clipped into
 * uselessness — but no layout decision is weighed against it.
 */
export const MOBILE_FLOOR_PX = 360;
