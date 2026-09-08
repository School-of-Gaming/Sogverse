/**
 * The brand's type, defined once.
 *
 * The faces, the mail face, the working scale, and the type rules that are
 * values rather than prose. `theme.css` is generated from here and from
 * `brand.ts` together, so a step's size, weight and line height move in one
 * place.
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
 * **`MAIL_FACE` sits beside that list and is not part of it.** It is the one
 * face the library declares without loading, for the one surface that cannot
 * load anything, and no token is generated for it.
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
   * The one monospace on the site, and it does two jobs. It is the world
   * voice — the typewriter face of Sogverse itself, spent where the platform
   * names one of its own places: in-world UI, quest and story artwork,
   * campaign posters. It is also the machine face, for text a machine wrote or
   * a person has to reproduce exactly: a room code, a password, an id, a log,
   * an inline code span.
   *
   * It was two tokens — a branded mono beside Tailwind's own, left at the UA
   * stack so machine text could not silently become branded. That was a
   * distinction every call site had to get right, and the failure was silent: a
   * room code in one token and a room code in the other look different on the
   * same screen and nothing catches it. One token, one answer, and no call site
   * left with a choice to get wrong.
   *
   * The property that had to be judged before it could carry machine text: this
   * face's zero carries no slash and no dot, so it was read against `O` at the
   * sizes codes are set — a dictated room code, a copied id, a generated
   * password — and found clear.
   *
   * Kept out of plain copy addressed to a parent, where the app face carries
   * trust better.
   */
  mono: {
    name: "Space Mono",
    token: "--font-mono",
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

// -------------------------------------------------------------- the mail face

/**
 * The face mail is set in.
 *
 * Not a `Face`, and the difference is the whole of it: a `Face` is a family the
 * consumer loads, named by a token that points at a variable. This has no file,
 * no token and no variable, because a mail client loads nothing and reads no
 * CSS variable. The stack *is* the face — the reader's own device answers it —
 * so there is nothing here for the theme generator to emit.
 */
export type MailFace = {
  /** What it is. It has no family name of its own, because it is not one family. */
  readonly name: string;
  /** The `font-family` string, written to survive an inline `style="…"` attribute. */
  readonly stack: string;
  /** The weights mail may ask for. Both are drawn by every face in the stack. */
  readonly weights: readonly number[];
};

/**
 * The mail face: the reader's own system sans, with no webfont in front of it.
 *
 * **Exclusive to mail, and never a screen face.** On a screen the brand has a
 * face and the consumer loads it; a page reaching for this one is asking for
 * the app face and spelling it wrong. Mail is the only surface that spends it,
 * and the only surface that may.
 *
 * **No webfont sits in front of it, and that is a decision rather than a
 * limitation.** The clients that carry most readers — Gmail, Outlook, Yahoo —
 * load no web font at all, so a family declared ahead of the stack would reach
 * a minority and the mail would be two designs rather than one; the brand's own
 * sans is also markedly wider than anything it could fall back to, so line
 * breaks and button widths would differ from client to client, which is exactly
 * where a mail layout comes apart. A webfont in a mail is also a request to a
 * third party, or to our own domain, on every open — an open-tracking beacon,
 * in a product whose parent-facing copy is about trust. And Outlook on Windows
 * answers a missing declared web font with Times New Roman rather than with the
 * next family in the stack, so declaring one costs a serif mail on the desktop
 * client least able to recover from it.
 *
 * **What the stack resolves to is a face, not a fallback**: San Francisco on
 * iPhone and Mac, Segoe UI in Outlook and on Windows, Roboto on Android,
 * Helvetica or Arial where nothing else exists. Each is a humanist sans, warm
 * and legible at the sizes a mail is read at, so the mail reads as native to
 * the client it arrived in rather than as a page whose face failed to load. The
 * library's rule for every face is that the fallback is the UA's own and never
 * a second webfont; mail is the surface where that fallback is the whole face.
 *
 * **Decided against.** The brand sans first with this stack behind it: the
 * archetypal family phone in our markets is Android, where every stack ends at
 * Roboto anyway, so a preference honoured by the desktop minority buys one
 * design for them and a second for everybody else. A single named web-safe face
 * (Verdana, Trebuchet) fails on the same ground — it is a desktop face with the
 * same Android ending underneath it, so it is not "one face everywhere" either,
 * and it trades a face every reader already reads comfortably for one picked
 * from a list written for a different decade.
 *
 * Two weights and no more, because every face the stack can land on draws
 * exactly these two.
 */
export const MAIL_FACE = {
  name: "The reader's own sans",
  stack:
    "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
  weights: [400, 700],
} as const satisfies MailFace;

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
