/**
 * The heading: one primitive for every heading School of Gaming draws.
 *
 * A heading titles a region of a page — a page, a section, a card, a dialog, a
 * compact group of rows — and text that titles nothing is not a heading,
 * however large or bold it is meant to look. An eyebrow, a field label, a pill
 * or a lead sentence is set as text.
 *
 * **Two props where a hand-written heading had one tag and a size.** `level` is
 * the outline — the `h1`–`h4` a screen reader and a search engine walk — and
 * `step` is what the eye reads. They were one decision on every hand-rolled
 * heading, so a page either skipped levels to get the size it wanted or wore the
 * wrong size to keep its outline; as two required props neither has to give.
 * They are not independent, though: {@link HEADING_STEPS} says which steps each
 * level may take, and a pair outside it does not compile.
 *
 * **What it draws, and nothing else.** The step's size, weight and leading (one
 * utility carries all three), the ink, and balanced line breaks. No margin —
 * where a heading sits is its container's decision. No colour prop — a heading
 * is ink, and the one declared departure, the public hero's phrase in act, is a
 * span the hero's own call site passes inside `children` (`brand.ts`). No
 * tracking and no case transform — headings are sentence case at the face's own
 * spacing, so `uppercase` has nowhere to be written.
 */

import type { ReactNode, Ref } from "react";

import type { TypeStepId } from "../tokens/typography";

/** The outline levels a heading may take. `h5` and `h6` are not offered: no page needs an outline that deep. */
export type HeadingLevel = 1 | 2 | 3 | 4;

/**
 * **Which steps each outline level may take — the table the types enforce.**
 *
 * The rule behind it: **a level takes only steps at its own rank or below.** A
 * step is a claim about rank, and a heading deeper in the outline claiming more
 * rank than one above it tells the eye the opposite of what the outline tells a
 * screen reader. So the steps run down the table as the levels do, and each
 * level's list starts where the one above it allows.
 *
 * - **`h1`** is the page's own title: `hero` on a public page, `page-title` on
 *   an app page. Nothing smaller titles a whole page.
 * - **`h2`** is a top region of the page. On a public page that is a `display`
 *   section; on an app page a `section`. A **dialog or sheet** titles at `h2`
 *   with `card-title`: it is a new layer above the page, so it is the first
 *   region of that layer, at the size of the object it is. A **card** can be
 *   `h2` too, where it sits directly under the page title with no section
 *   above it.
 * - **`h3`** sits inside an `h2` region: a sub-`section` of a story section, a
 *   card inside an app section (`card-title`), or a compact region (`label`).
 *   The same card is `h2` on one page and `h3` on another, which is why level
 *   and step are two props.
 * - **`h4`** sits inside a card or a sub-section: a `card-title` inside a
 *   sub-section, or a `label` over a compact region of a card.
 *
 * `hero`, `display` and `page-title` are each one level only, because each
 * names what the level is. `label` never reaches `h2`: a region titled at the
 * top of a page in 14px is a section dressed as a footnote.
 */
export const HEADING_STEPS = {
  1: ["hero", "page-title"],
  2: ["display", "section", "card-title"],
  3: ["section", "card-title", "label"],
  4: ["card-title", "label"],
} as const satisfies Record<HeadingLevel, readonly TypeStepId[]>;

/** Every step a heading can wear, at some level. */
export type HeadingStep = (typeof HEADING_STEPS)[HeadingLevel][number];

/** The steps one level may take. */
export type HeadingStepAt<Level extends HeadingLevel> =
  (typeof HEADING_STEPS)[Level][number];

/**
 * A level and a step that may go together — the table, as a type. A union of
 * one member per level, so `level` narrows `step` and a pair outside the table
 * is a compile error at the call site.
 */
export type HeadingPair = {
  [Level in HeadingLevel]: { level: Level; step: HeadingStepAt<Level> };
}[HeadingLevel];

export type HeadingProps = HeadingPair & {
  /**
   * The words. A node rather than a string so the heading can carry the hero's
   * act phrase as a span — never a block element, and never a second heading.
   * An icon is not a child: the base styles set an `svg` to `display: block`,
   * so one inside the heading breaks its line. An icon that belongs to a
   * heading sits beside it, the two in a row the call site lays out.
   */
  children: ReactNode;
  /** The element's id, for an anchor link or for `aria-labelledby` on the region it titles. */
  id?: string;
  /**
   * The words' language, where it differs from the page's — a Library card can
   * title an article written in another locale — so a screen reader pronounces
   * them right.
   */
  lang?: string;
  /**
   * The rendered element, for a caller that moves focus to it — a screen whose
   * first job on arriving is to tell a screen reader where the reader now is.
   * A plain prop rather than `forwardRef`: React 19 hands a function component
   * its `ref` like any other prop.
   */
  ref?: Ref<HTMLHeadingElement>;
  /**
   * A place focus is moved to by script, never one a reader tabs to. Sets
   * `tabIndex={-1}`, which makes the heading focusable without adding a tab
   * stop on the way down the page, and draws no focus ring: the ring is the
   * answer to "where will my next key press land", and a heading takes no key
   * presses. Pair it with `ref` and a mount effect that calls `focus()`.
   */
  focusTarget?: boolean;
  /**
   * Where the lines sit. `start` is the default and is written out rather than
   * inherited: a heading whose alignment came from a wrapper's class would be
   * styled by that wrapper, which is the restyling seam this primitive closes.
   * `center` is for a heading over a centred composition — an empty state, an
   * auth page's title block. `center-narrow` is centred below `md` and starts
   * from `md`, for a composition that changes shape there: a hero whose words
   * stack centred over their picture on a phone and sit beside it on a wide
   * screen, or a dialog header that centres on a phone. Only `md`, the one
   * breakpoint the scale already resteps at, so a heading never changes its
   * alignment and its size at two different widths.
   */
  align?: "start" | "center" | "center-narrow";
  /**
   * One line, cut with an ellipsis where it runs out of room. For a title in a
   * row that cannot grow — a card in a dense grid, a sheet's header — where a
   * wrapped title would push the row's controls out of place. Never for a page
   * or section heading, whose words a reader has to be able to read whole.
   */
  truncate?: boolean;
  /**
   * In the outline and read aloud, but not drawn. For a region whose purpose
   * the page already shows visually — a toolbar, a feed whose cards title
   * themselves — but that a screen reader's heading list should still reach.
   */
  srOnly?: boolean;
};

/**
 * Each step's utility, written out because Tailwind finds a class by reading
 * source text. Only `hero` names two: it is the one step that resteps, at the
 * narrow size up to `md` and its own size from there.
 */
const STEP_CLASS = {
  hero: "text-hero-mobile md:text-hero",
  display: "text-display",
  "page-title": "text-page-title",
  section: "text-section",
  "card-title": "text-card-title",
  label: "text-label",
} as const satisfies Record<HeadingStep, string>;

const ALIGN_CLASS = {
  start: "text-start",
  center: "text-center",
  "center-narrow": "text-center md:text-start",
} as const satisfies Record<NonNullable<HeadingProps["align"]>, string>;

/**
 * A heading, at an outline level and a step the level allows.
 *
 * Lines are balanced (`text-wrap: balance`), so a heading that wraps breaks
 * into lines of near-equal length rather than leaving one word alone on the
 * last line — a headline's shape is read before its words, and a stranded
 * word reads as a mistake. Balancing is skipped where `truncate` holds the
 * heading to one line, since there is nothing to balance.
 */
export function Heading({
  level,
  step,
  children,
  id,
  lang,
  ref,
  focusTarget = false,
  align = "start",
  truncate = false,
  srOnly = false,
}: HeadingProps) {
  const Element = `h${level}` as const;
  const className = [
    STEP_CLASS[step],
    "text-foreground",
    ALIGN_CLASS[align],
    truncate ? "truncate" : "text-balance",
    srOnly ? "sr-only" : null,
    focusTarget ? "focus:outline-none" : null,
  ]
    .filter((part) => part !== null)
    .join(" ");
  return (
    <Element
      id={id}
      lang={lang}
      ref={ref}
      tabIndex={focusTarget ? -1 : undefined}
      className={className}
    >
      {children}
    </Element>
  );
}
