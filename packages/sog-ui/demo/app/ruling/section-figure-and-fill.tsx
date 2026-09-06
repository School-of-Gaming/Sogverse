/**
 * Question 1 — figure and fill.
 *
 * **The rule being weighed, in the owner's words.** Pointing at the product
 * card's waitlist chip: _"the brand colours look bad under either white or
 * black text, and that chip gets around it by putting the colour on the dark
 * ground, where it keeps its greatest contrast and its vibrancy."_ Stated as a
 * rule: **a family or status colour is a figure on the dark ground wherever it
 * names something, and a fill only where it is pressed.** And the owner's answer
 * when it was put as a paragraph: _"I'd need to see it, we don't have all the
 * buttons as brand colours, we'd need an example to prove the rule."_ This
 * section is that example.
 *
 * **The refinement the drawing exists to test: label versus control.** The rule
 * is not "no fills". A fill is right where the thing is a *control* — something
 * a hand presses, where the colour is the target and the ink on it is the label
 * of an action. It is wrong where the colour only *names* something — a state,
 * a kind, a role — because a label is not pressed, so a fill spends the loudest
 * treatment we have on a word that is only telling you what something is. Three
 * constructs per colour is the whole of the argument: a filled button (a
 * control), a filled badge (a label wearing a control's clothes) and the chip
 * (the same label as a figure). If the rule holds, the button column reads right
 * on every row and the badge column reads wrong on every row, and they are the
 * same recipe.
 *
 * **What confirming lands.**
 *
 * - The **19 filled badges** take the chip's shape: a neutral edge on the ground
 *   they sit on, the word in the colour, the glyph beside it where the site has
 *   one. Nothing else about them changes.
 * - The rule enters `packages/sog-ui/CLAUDE.md` beside the no-alpha paragraph,
 *   which is the other half of the same sentence: a brand colour exists at its
 *   authored value, and this says where that value goes — an edge, an ink, a
 *   mark, or a fill under a control.
 * - **Buttons are untouched.** Which colours a button may wear is the Button
 *   adoption's, not this ruling's: the seven rows below with no hover shade are
 *   colours the app has never built a filled button in, and they are drawn
 *   without one because inventing a hover recipe here would be deciding that
 *   question by accident. Only act, world and destructive carry a live hover,
 *   because only those three exist in `ui/button.tsx`.
 *
 * **What the drawing puts on screen that the paragraph could not: violet cannot
 * be a figure.** Every hue in the ten clears the body floor as an ink on both
 * grounds except `world`, which measures 2.71 on a card and 2.91 on the page —
 * under the glyph floor, let alone the body one. So the rule is worded "a family
 * or status colour" rather than "a brand colour": violet is a fill or it is
 * nothing, which is exactly why the signature pair splits the work the way it
 * does (amber acts, violet is the world's ground). The world row's chip is drawn
 * anyway, because a rule with a named exception is worth seeing failing.
 *
 * **Every ratio below is computed with `contrastRatio` from
 * `packages/sog-ui/src/tokens/contrast.ts`**, from the authored hexes, never
 * typed by hand. The body floor is 4.5 and the glyph floor is 3.
 *
 * | row | fill + its label | as ink on a card | as ink on the page |
 * |---|---|---|---|
 * | act | 9.58 (ink) | 8.90 | 9.58 |
 * | world | 6.43 (white) | 2.71 | 2.91 |
 * | destructive | 6.19 | 5.75 | 6.19 |
 * | warning | 11.34 | 10.53 | 11.34 |
 * | success | 8.83 | 8.21 | 8.83 |
 * | info | 8.10 | 7.53 | 8.10 |
 * | yty-harmony | 7.70 | 7.15 | 7.70 |
 * | yty-glow | 8.83 | 8.21 | 8.83 |
 * | yty-valor | 8.23 | 7.65 | 8.23 |
 * | yty-wit | 8.10 | 7.53 | 8.10 |
 *
 * The half of the owner's sentence the numbers do confirm outright: each of the
 * signature pair has exactly one ink and no choice about it. White on act is
 * 1.96 and ink on world is 2.91 — the wrong ink on either one is not a weaker
 * option, it is unreadable.
 *
 * **Every class string below is the app's, class for class.** The button is
 * `ui/button.tsx`'s default variant at its default size, the badge is
 * `ui/badge.tsx`'s default variant, and the chip is
 * `public/products/status-chip.tsx` at `sm`. What varies between rows is only
 * the colour tokens, which is what each cell's caption names; the shape classes
 * are constant and are stated once, in the column header, so the eye is left
 * with the one thing being ruled on.
 *
 * The four family rows take their word and their glyph from the library's own
 * `PRODUCT_KIND_GRAMMAR`, because those four are the surface the badges really
 * come from — a product kind is a fact that takes a family, and the mark that
 * rides with it is the grammar's, not this page's.
 */

import {
  CircleAlert,
  CircleCheck,
  Hourglass,
  Info,
  TriangleAlert,
  UserRound,
  type LucideIcon,
} from "lucide-react";

import { PRODUCT_KIND_GRAMMAR } from "../../../src/tokens/grammar";
import { Caps, Case, Question } from "./parts";

/**
 * One colour's row.
 *
 * `fill` and `ink` are one decision, not two: the ink a fill carries is fixed by
 * the fill, and the palette offers no second choice. `figure` is the same hex as
 * `fill`, written as a text utility — which is the whole of what "figure" means
 * here, and why the two columns can be compared at all.
 *
 * `hover` is empty for every colour `ui/button.tsx` does not ship a variant in.
 * An empty string draws a button that does not respond to a pointer, and that is
 * the honest picture: the app has no filled button in that colour, so there is
 * no hover recipe to copy and none is invented.
 */
interface Row {
  readonly token: string;
  readonly fill: string;
  readonly ink: string;
  readonly figure: string;
  readonly hover: string;
  readonly word: string;
  readonly glyph: LucideIcon;
}

const ROWS: readonly Row[] = [
  {
    token: "act",
    fill: "bg-act",
    ink: "text-act-foreground",
    figure: "text-act",
    hover: "hover:bg-act/90",
    word: "Waitlist",
    glyph: Hourglass,
  },
  {
    token: "world",
    fill: "bg-world",
    ink: "text-world-foreground",
    figure: "text-world",
    hover: "hover:bg-world/80",
    word: "Adults",
    glyph: UserRound,
  },
  {
    token: "destructive",
    fill: "bg-destructive",
    ink: "text-destructive-foreground",
    figure: "text-destructive",
    hover: "hover:bg-destructive/90",
    word: "Overdue",
    glyph: CircleAlert,
  },
  {
    token: "warning",
    fill: "bg-warning",
    ink: "text-warning-foreground",
    figure: "text-warning",
    hover: "",
    word: "Attention",
    glyph: TriangleAlert,
  },
  {
    token: "success",
    fill: "bg-success",
    ink: "text-success-foreground",
    figure: "text-success",
    hover: "",
    word: "Certified",
    glyph: CircleCheck,
  },
  {
    token: "info",
    fill: "bg-info",
    ink: "text-info-foreground",
    figure: "text-info",
    hover: "",
    word: "Awaiting",
    glyph: Info,
  },
  {
    token: "yty-harmony",
    fill: "bg-yty-harmony",
    ink: "text-background",
    figure: "text-yty-harmony",
    hover: "",
    word: "Event",
    glyph: PRODUCT_KIND_GRAMMAR.event.glyph,
  },
  {
    token: "yty-glow",
    fill: "bg-yty-glow",
    ink: "text-background",
    figure: "text-yty-glow",
    hover: "",
    word: "Club",
    glyph: PRODUCT_KIND_GRAMMAR.consumer_club.glyph,
  },
  {
    token: "yty-valor",
    fill: "bg-yty-valor",
    ink: "text-background",
    figure: "text-yty-valor",
    hover: "",
    word: "Camp",
    glyph: PRODUCT_KIND_GRAMMAR.camp.glyph,
  },
  {
    token: "yty-wit",
    fill: "bg-yty-wit",
    ink: "text-background",
    figure: "text-yty-wit",
    hover: "",
    word: "School",
    glyph: PRODUCT_KIND_GRAMMAR.municipality_club.glyph,
  },
];

/** One label for every button, so the colour is the only thing that varies down the column. */
const BUTTON_LABEL = "Join the club";

/** `ui/button.tsx`, the default variant at the default size, less its colour tokens. */
const BUTTON_SHAPE =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-act focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0 h-10 px-4 py-2 shadow";

/** `ui/badge.tsx`, the default variant, less its colour tokens. */
const BADGE_SHAPE =
  "inline-flex items-center rounded-full border border-border px-2.5 py-0.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-act focus:ring-offset-2 shadow";

/** `public/products/status-chip.tsx` at `sm`, less its ink. */
const CHIP_SHAPE =
  "inline-flex items-center rounded-full border border-border bg-background font-medium gap-1 px-2 py-0.5 text-xs";

const GRID = "grid grid-cols-[8rem_repeat(5,minmax(0,1fr))]";
const CARD_CELL = "border-t border-border bg-card px-4 py-6";
const PAGE_CELL = "border-t border-border bg-background px-4 py-6";

/** The tokens that vary, under the thing they paint. Nothing else appears in a cell. */
function Recipe({ children }: { children: string }) {
  return (
    <p className="mt-3 font-brand-mono text-body-s break-words text-muted-foreground">
      {children}
    </p>
  );
}

/** A column's name, the component it is copied from, and the shape classes it holds constant. */
function Column({
  name,
  file,
  page,
  shape,
}: {
  name: string;
  file: string;
  page: string;
  shape: string;
}) {
  return (
    <div className="px-4 pt-4 pb-6">
      <Caps>{name}</Caps>
      <p className="mt-2 text-body-s text-muted-foreground">
        <span className="font-brand-mono">{file}</span>
        {" — "}
        {page}
      </p>
      <p className="mt-2 font-brand-mono text-body-s break-words text-muted-foreground">
        {shape}
      </p>
    </div>
  );
}

export function FigureAndFillSection() {
  return (
    <Question n={1} title="Figure and fill">
      <Case title="Ten colours, a control, a label, and the same label as a figure">
        <div className="overflow-x-auto">
          <div className="min-w-[76rem]">
            <div className={GRID}>
              <div />
              <div className="col-span-3 bg-card px-4 pt-6">
                <Caps>On a card</Caps>
              </div>
              <div className="col-span-2 bg-background px-4 pt-6">
                <Caps>On the page</Caps>
              </div>
            </div>

            <div className={GRID}>
              <div />
              <div className="bg-card">
                <Column
                  name="A filled button"
                  file="ui/button.tsx"
                  page="the home page's call to action"
                  shape={BUTTON_SHAPE}
                />
              </div>
              <div className="bg-card">
                <Column
                  name="A filled badge"
                  file="ui/badge.tsx"
                  page="a gedu's certification card"
                  shape={BADGE_SHAPE}
                />
              </div>
              <div className="bg-card">
                <Column
                  name="A figure chip"
                  file="public/products/status-chip.tsx"
                  page="a product's browse card"
                  shape={CHIP_SHAPE}
                />
              </div>
              <div className="bg-background">
                <Column
                  name="A filled badge"
                  file="ui/badge.tsx"
                  page="a gedu's certification card"
                  shape={BADGE_SHAPE}
                />
              </div>
              <div className="bg-background">
                <Column
                  name="A figure chip"
                  file="public/products/status-chip.tsx"
                  page="a product's browse card"
                  shape={CHIP_SHAPE}
                />
              </div>
            </div>

            {ROWS.map((row) => {
              const Icon = row.glyph;
              const fillRecipe = `${row.fill} ${row.ink}`;
              const figureRecipe = `border-border bg-background ${row.figure}`;
              const badge = (
                <span className={`${BADGE_SHAPE} ${fillRecipe}`}>
                  {row.word}
                </span>
              );
              const chips = (
                <span className="flex flex-wrap items-center gap-2">
                  <span className={`${CHIP_SHAPE} ${row.figure}`}>
                    {row.word}
                  </span>
                  <span className={`${CHIP_SHAPE} ${row.figure}`}>
                    <Icon className="h-3 w-3" aria-hidden />
                    {row.word}
                  </span>
                </span>
              );
              return (
                <div key={row.token} className={GRID}>
                  <div className="border-t border-border py-6 pr-4">
                    <p className="font-brand-mono text-body-s break-words">
                      {row.token}
                    </p>
                  </div>
                  <div className={CARD_CELL}>
                    <button
                      type="button"
                      className={`${BUTTON_SHAPE} ${fillRecipe} ${row.hover}`}
                    >
                      {BUTTON_LABEL}
                    </button>
                    <Recipe>
                      {row.hover === ""
                        ? fillRecipe
                        : `${fillRecipe} ${row.hover}`}
                    </Recipe>
                  </div>
                  <div className={CARD_CELL}>
                    {badge}
                    <Recipe>{fillRecipe}</Recipe>
                  </div>
                  <div className={CARD_CELL}>
                    {chips}
                    <Recipe>{figureRecipe}</Recipe>
                  </div>
                  <div className={PAGE_CELL}>
                    {badge}
                    <Recipe>{fillRecipe}</Recipe>
                  </div>
                  <div className={PAGE_CELL}>
                    {chips}
                    <Recipe>{figureRecipe}</Recipe>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </Case>
    </Question>
  );
}
