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
 * **Each level has a ceiling** — a heading never takes a step louder than its
 * place in the outline allows — **and the steps named for what they title
 * belong to one level**: `hero` and `page-title` title a page, so they are
 * `h1`'s alone; `display` titles a story section, so it is `h2`'s alone.
 * **Below that, which step a heading takes is the page's choice: the quietest
 * one that still reads as a title.** Spotlighting is opt-in, and a page's `h1`
 * is often just a label for where the reader is, so an app page's title is
 * `section` by default and `page-title` is chosen for the page whose title is
 * its point.
 *
 * - **`h1`**: `hero` (a public page's headline) or `page-title` (the spotlit
 *   app page), down to `card-title` for a page that is one small object — a
 *   call screen, a not-found state — and `label` for one that titles a
 *   compact region.
 * - **`h2`**: `display`, a public page's section, and below it the shared
 *   steps. An app page's region is `section` under a spotlit title and
 *   `card-title` or `label` under a quiet one; a dialog or sheet, the first
 *   region of a new layer, titles at `card-title`.
 * - **`h3`**: up to `section`, a story page's sub-section.
 * - **`h4`**: up to `card-title`.
 *
 * `item-title` is offered from `h2` down and never at `h1`: it titles one item
 * in a run of like items, a question in an FAQ, which is never a page.
 *
 * Each level's top sits under the top of the level above it, so no heading
 * can outrank the outline over it. Within a page the rule is stricter than the
 * table: **a heading is always smaller than the heading it sits under**, and
 * siblings may share a step. The types cannot see that, because they see one
 * heading at a time, so it is held in review — until layout primitives that
 * know their nesting arrive.
 *
 * Two rules choose between the steps a level allows. **A title is never
 * smaller than the text it titles**, so `label` is for a heading over a compact
 * region — a list, a row of chips, a set of controls or fields, metadata — and
 * a heading over prose takes `card-title`, or `item-title` where it titles one
 * item among a run of like ones. And **the two story steps stay public**:
 * `hero` and `display` are for a page telling the story, never for making an
 * app section feel important.
 */
export const HEADING_STEPS = {
  1: ["hero", "page-title", "section", "card-title", "label"],
  2: ["display", "section", "card-title", "item-title", "label"],
  3: ["section", "card-title", "item-title", "label"],
  4: ["card-title", "item-title", "label"],
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
   * breakpoint the story steps restep at, so a heading never changes its
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
 * source text. Only the story steps, `hero` and `display`, name two: they are
 * the steps that restep, at the narrow size up to `md` and their own size from
 * there.
 */
const STEP_CLASS = {
  hero: "text-hero-mobile md:text-hero",
  display: "text-display-mobile md:text-display",
  "page-title": "text-page-title",
  section: "text-section",
  "card-title": "text-card-title",
  "item-title": "text-item-title",
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
