/**
 * The proposed heading steps, as class recipes — the one place this page spells
 * a step, so every section draws a step from the same string.
 *
 * **A rename is one recipe drawn twice.** `hero`, `section`, `card-title` and
 * `sub-section` are the round-1 `h1`, `h2`, `h3` and `h4` under a role's name, at
 * exactly that round's size, weight and leading, so the `today` drawing and the
 * `proposed` drawing are one string and the eye confirms nothing moves. The
 * ruled scale has since renamed the tokens, so each recipe names the token that
 * now carries those values — `display` for the old `h2`, `section` for the old
 * `h3` — and the old `h4`, whose 400 weight no ruled step keeps, is the
 * `card-title` token set back to that weight.
 *
 * **A new step is drawn in plain values.** `page-title` and `label` do not exist
 * in the tokens, and neither does the 20px `card-title` candidate, so they are
 * spelled here as arbitrary values for this page only. Nothing is added to
 * `src/tokens/` until the owner rules.
 *
 * - `page-title` takes 1.2 leading, h2's: it sits between the hero (1.1, tight
 *   for a display line of three or four words) and the card title (1.3), and an
 *   app page title is a line of one to four words that rarely wraps.
 * - The 20px `card-title` candidate keeps h3's 1.3, so the only thing that moves
 *   between the two card-title drawings is the size.
 * - `label` at 14px is the body-s token with the weight lifted to 600 — the
 *   same size and leading as the sentence under it, set apart by weight alone.
 *   At 12px it takes the same 1.5 leading rather than Tailwind's `text-xs`
 *   default (1.333), so the two candidates differ by size and nothing else.
 *
 * The step names are proposals and are drawn as labels; they are what the
 * owner is ruling on.
 */

export const STEP = {
  hero: "text-hero-mobile md:text-hero",
  section: "text-display",
  cardTitle: "text-section",
  subSection: "text-card-title font-normal",
} as const;

export const PAGE_TITLE = {
  28: "text-[1.75rem] leading-[1.2] font-semibold",
  30: "text-[1.875rem] leading-[1.2] font-semibold",
  32: "text-[2rem] leading-[1.2] font-semibold",
} as const;

export const CARD_TITLE_20 = "text-[1.25rem] leading-[1.3] font-semibold";

export const LABEL = {
  14: "text-body-s font-semibold",
  12: "text-[0.75rem] leading-[1.5] font-semibold",
} as const;

/**
 * The page-title candidate the other sections draw with when they need one
 * page title rather than three. 30px is the middle candidate and today's
 * `text-3xl`, so it moves the fewest pages; it is a drawing choice, not a
 * ruling, and §1 is where the size is decided.
 */
export const PAGE_TITLE_DRAWN = PAGE_TITLE[30];

/**
 * The `app-section` candidates (§8): a section heading for the app's own
 * pages, where no h2 reaches the 36px `section` step and today's sit at 18–20px
 * (`text-lg font-semibold` twelve times, `text-xl font-semibold` ten).
 *
 * Both take the card title's 1.3 leading, so the two drawings differ by size
 * alone. At 20px the candidate is the same recipe as the 20px `card-title`
 * candidate — drawn under its own name all the same, because whether the two
 * roles share one size is part of what §8 and §9 ask.
 */
export const APP_SECTION = {
  20: "text-[1.25rem] leading-[1.3] font-semibold",
  22: "text-[1.375rem] leading-[1.3] font-semibold",
} as const;

/**
 * The app-section candidate the level table draws (§2). Twenty is where ten of
 * today's app h2s already sit; a drawing choice, not a ruling.
 */
export const APP_SECTION_DRAWN = APP_SECTION[20];
