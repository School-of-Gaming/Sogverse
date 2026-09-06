"use client";

/**
 * Question 3 — the greys.
 *
 * **Why this section was rebuilt (2026-09-06).** It used to draw Sogverse's own
 * call sites, today beside a one-token patch on them: a rail that hovers to one
 * grey beside a list that hovers to another, a pill whose hover runs *darker*
 * than its rest state, a chosen option one alpha step from a hovered one. The
 * owner's reading of that page was the finding: *"I don't think Sogverse is
 * correctly using muted and accent as it is. And the current examples in the
 * rulings page are confusing me."* Comparing a muddle to a patch on the muddle
 * cannot be ruled on, because neither column is a system. So the page stopped
 * drawing the sites and started drawing the **systems**: two complete,
 * correctly-built miniatures, each with the same constructs, each built from
 * the role definitions rather than from any class string the app carries today.
 * Nothing below is copied from Sogverse. What is ruled here is which ladder the
 * library ships; the sweep that moves ~250 call sites onto it follows the
 * ruling and is not what the ruling is made from.
 *
 * **The roles, in the owner's words.**
 *
 * - **card** is *depth*: "a thing on the page". It is authored, not transient —
 *   a block with an inside and an outside.
 * - **accent** is *the response ground*: "you are here". It is what a surface
 *   paints when it is answering you — the row under the pointer, the option the
 *   keyboard has landed on, the thing you chose.
 * - **muted** is *the quiet ground*: "I matter less than my neighbours". Never
 *   a state. A skeleton's bars, an inset, a read-only field, an unselected pill.
 * - **disabled is opacity**, not a grey, in both systems. It is drawn in the
 *   menu and beside the buttons so that quiet, disabled and editable can be
 *   told apart at a glance — three ideas one grey ladder is often asked to
 *   carry, and only one of them is a ground.
 *
 * **What each column is.**
 *
 * - **Four steps** — page, card, accent, muted. Two grounds above the card: one
 *   for the response, one for the quiet block.
 * - **Three steps** — page, card, and one grey above them, drawn at muted's
 *   value because that is the larger of the two lifts and the one a hover on a
 *   card can actually be seen at. It is named only "lifted" here: if this column
 *   is ruled, what the token is called is decided at landing, and a page that
 *   pre-named it would be arguing for one of the two answers.
 *
 * **The measured lifts, off page.** accent over card 1.08, muted over card
 * 1.15; accent over page 1.16, muted over page 1.24. That arithmetic is why
 * every construct here is drawn on the ground it really sits on, and why the
 * list is drawn twice — once inside a card, which is where most of a dashboard's
 * lists live, and once on the page ground, where the same class is a much
 * clearer change. The numbers are not on screen and are not meant to be: if the
 * lift cannot be seen in the row, a ratio would not have helped.
 *
 * **The rule three steps runs on: a ground lifts once.** There is one step
 * above the card, so a thing resting *on* that step has nowhere further to go,
 * and everything a second grey used to say has to be said another way — an
 * edge, a mark, or ink. That is not a workaround; it is the whole shape of the
 * system, so the column draws it as the design rather than as a concession: the
 * chosen row is a 2px leading edge in act (or a check), and the pill that
 * already rests on the lifted grey answers the pointer with its ink and its
 * border.
 *
 * **Which way round the four-step list is drawn, and why.** Hover is `accent`
 * and the chosen row is `muted`. Accent is the response ground, and the most
 * literal reading of "the ground answering you" is the ground under the pointer
 * that is on it right now; a selection has to survive the pointer leaving, so
 * it takes the one step the ladder has left above that. The inversion is drawn
 * directly beneath, because it differs visibly and it is the honest case
 * against: with hover on muted the transient state is the *lighter*, louder of
 * the two, and a row shouts while you pass over it and whispers once you pick
 * it.
 *
 * **The tension the four-step column has to be ruled with open eyes about.**
 * Muted's own definition says *never a state*, and a chosen row is a state. So
 * the second state grey is bought by spending the quiet ground on one, and the
 * four-step system is not "two grounds and two states" but "one response ground
 * plus the quiet ground, part-time". Both variants above show it; neither hides
 * it.
 *
 * **The one construct where neither ladder has a ground to give.** A filter
 * pill *rests* on the quiet grey, so in four steps its only lift is `accent`,
 * which is **darker** than where it started, and in three steps there is no
 * step above at all. Both columns therefore answer the pointer with ink, and
 * the three-step column moves its border too; the four-step column draws the
 * lift-to-accent variant beneath so the drop is seen rather than described. The
 * selected pill is act with act ink in both columns, because a selection is
 * brand, not grey.
 *
 * **What each ruling lands.**
 *
 * - **Four steps.** Both tokens stay in the library. Sogverse's ~250 grey sites
 *   are swept to spend them *by role*: every pointer response and every chosen
 *   item on accent, every de-emphasised block on muted, and the sites that today
 *   have it backwards (a rest state on muted hovering to accent, a chosen option
 *   at an alpha step of the hover) are corrected rather than preserved.
 * - **Three steps.** One token, named at landing; `accent` and `muted` both
 *   leave `brand.ts`, the generated theme and the demo's foundations floor. The
 *   sweep maps hover, selection and quiet onto the one grey, and adds the edge,
 *   mark or ink signal at every site where the second grey was carrying a
 *   distinction on its own.
 *
 * **The ledger's counts, regenerated with**
 *
 *     grep -rno "bg-accent" src --include=*.tsx --include=*.ts | wc -l
 *     grep -rno "hover:bg-accent" src --include=*.tsx --include=*.ts | wc -l
 *     grep -rno "bg-muted\b" src --include=*.tsx --include=*.ts | wc -l
 *     grep -rno "hover:bg-muted" src --include=*.tsx --include=*.ts | wc -l
 *
 * `bg-accent` is spent 70 times: 60 `hover:`, three more a pointer or keyboard
 * state, and seven holding the fill as a state that outlives the pointer.
 * `bg-muted` is spent 177 times, nine of them hovers and the rest quiet blocks.
 * That is the size of either sweep, and it is the same order of work whichever
 * column wins.
 *
 * **Everything on screen is painted in real theme classes**, never inline
 * styles: what is drawn is what the app would paint. The three-step column
 * writes `bg-muted` because that is the value it is proposing; the page calls it
 * "lifted", which is the only place the two disagree, and deliberately.
 */

import { useState, type ReactNode } from "react";
import {
  ArrowLeftRight,
  Check,
  LayoutDashboard,
  LogOut,
  Settings,
  Users,
  type LucideIcon,
} from "lucide-react";

import { Caps, Case, Glyph, Question } from "./parts";

// ------------------------------------------------------------------ furniture

/** The two grounds every construct here is drawn on, both shared by both systems. */
type Ground = "background" | "card";

const GROUND_BOX: Record<Ground, string> = {
  background: "mt-2 rounded-lg border border-border bg-background p-4",
  card: "mt-2 rounded-lg border border-border bg-card p-4",
};

const GROUND_NAME: Record<Ground, string> = {
  background: "background",
  card: "card",
};

/**
 * One construct, named, on the ground it is being judged on.
 *
 * Two names and no sentence: the construct, and the ground under it. The ground
 * is named because the same fill is a different change on each — that is most
 * of what this section is about.
 */
function Block({
  title,
  ground,
  children,
}: {
  title: string;
  ground: Ground;
  children: ReactNode;
}) {
  return (
    <div>
      <Caps>{title}</Caps>
      <p className="font-brand-mono text-body-s text-muted-foreground">
        {GROUND_NAME[ground]}
      </p>
      <div className={GROUND_BOX[ground]}>{children}</div>
    </div>
  );
}

/**
 * One way of drawing a construct inside its block, named by the recipe.
 *
 * The name is the recipe in the system's own words — "hover accent · selected
 * muted", "hover lifted · selected edge" — so two variants stacked in one block
 * are told apart by what they are rather than by an ordinal.
 */
function Variant({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div>
      <p className="font-brand-mono text-body-s text-muted-foreground">{name}</p>
      <div className="mt-2">{children}</div>
    </div>
  );
}

/** A system: its name, then its constructs in the same order as its neighbour's. */
function Column({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Case title={title}>
      <div className="space-y-10">{children}</div>
    </Case>
  );
}

// ----------------------------------------------------------------- the ladder

/**
 * The steps of one system, adjacent and unseparated.
 *
 * No gap between the squares on purpose: an edge between two greys is a third
 * value, and it is exactly what makes two near-identical fills look further
 * apart than they are. The second strip is the same steps carrying ink, because
 * a ground is never seen empty.
 */
function Ladder({
  grid,
  steps,
}: {
  grid: string;
  steps: readonly { readonly fill: string; readonly name: string }[];
}) {
  return (
    <div>
      <div className={`${grid} overflow-hidden rounded-lg border border-border`}>
        {steps.map((step) => (
          <div key={step.name} className={`h-16 ${step.fill}`} />
        ))}
      </div>
      <div className={`${grid} mt-2 gap-2`}>
        {steps.map((step) => (
          <p
            key={step.name}
            className="font-brand-mono text-body-s text-muted-foreground"
          >
            {step.name}
          </p>
        ))}
      </div>
      <div
        className={`${grid} mt-6 overflow-hidden rounded-lg border border-border`}
      >
        {steps.map((step) => (
          <div
            key={step.name}
            className={`flex h-16 items-center justify-center ${step.fill}`}
          >
            <span className="text-body-s font-medium text-foreground">
              {step.name}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const FOUR_STEPS = [
  { fill: "bg-background", name: "background" },
  { fill: "bg-card", name: "card" },
  { fill: "bg-accent", name: "accent" },
  { fill: "bg-muted", name: "muted" },
] as const;

const THREE_STEPS = [
  { fill: "bg-background", name: "background" },
  { fill: "bg-card", name: "card" },
  { fill: "bg-muted", name: "lifted" },
] as const;

// -------------------------------------------------------------------- a list

/**
 * The non-grey half of a selection's signal.
 *
 * `none` is the four-step claim — the second grey carries the distinction
 * alone. `edge` and `check` are what three steps has instead, and both are
 * drawn because they are genuinely different to live with: the edge is visible
 * in peripheral vision down a long list, and the check reads at a glance but
 * only where the eye already is.
 */
type Mark = "none" | "edge" | "check";

const ROW =
  "relative flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition-colors";

const ROWS: readonly {
  readonly id: string;
  readonly name: string;
  readonly meta: string;
}[] = [
  { id: "aino", name: "Aino Virtanen", meta: "Wednesdays, 17:00" },
  { id: "mikael", name: "Mikael Korhonen", meta: "Wednesdays, 17:00" },
  { id: "sofia", name: "Sofia Lindgren", meta: "Thursdays, 16:00" },
  { id: "elias", name: "Elias Nieminen", meta: "Thursdays, 16:00" },
  { id: "venla", name: "Venla Mäkinen", meta: "Saturdays, 10:00" },
  { id: "onni", name: "Onni Salo", meta: "Saturdays, 10:00" },
];

/**
 * Six rows, one of them chosen, every row answering the pointer.
 *
 * Click a row to move the selection: a hover and a selection are told apart by
 * moving the pointer between them, never by reading two screenshots, so the
 * selection is live even though only the hover strictly has to be.
 *
 * Neither mark moves the layout. The edge is absolutely positioned, and the
 * check's slot is reserved on every row, so choosing a row cannot shift the row
 * under the pointer out from under it.
 */
function RowList({
  hover,
  selected,
  mark,
}: {
  /** The fill a row takes under the pointer. */
  hover: string;
  /** The fill a chosen row keeps once the pointer has left. */
  selected: string;
  mark: Mark;
}) {
  const [chosen, setChosen] = useState("sofia");
  return (
    <div className="space-y-0.5">
      {ROWS.map((row) => {
        const isChosen = row.id === chosen;
        return (
          <button
            key={row.id}
            type="button"
            aria-pressed={isChosen}
            onClick={() => setChosen(row.id)}
            className={
              isChosen ? `${ROW} ${selected} ${hover}` : `${ROW} ${hover}`
            }
          >
            {isChosen && mark === "edge" ? (
              <span className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-act" />
            ) : null}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-foreground">
                {row.name}
              </span>
              <span
                className={
                  isChosen && mark !== "none"
                    ? "block truncate text-xs text-foreground"
                    : "block truncate text-xs text-muted-foreground"
                }
              >
                {row.meta}
              </span>
            </span>
            {mark === "check" ? (
              <span className="flex w-4 shrink-0 justify-end text-act">
                {isChosen ? (
                  <Glyph icon={Check} size={16} colour="currentColor" />
                ) : null}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

// -------------------------------------------------------------------- a menu

const MENU_ROW =
  "flex w-full items-center gap-2 rounded-sm px-3 py-2 text-left text-sm text-foreground transition-colors disabled:pointer-events-none disabled:opacity-50";

const MENU_ITEMS: readonly {
  readonly label: string;
  readonly glyph: LucideIcon;
  readonly disabled?: true;
}[] = [
  { label: "My SOG", glyph: LayoutDashboard },
  { label: "Family", glyph: Users },
  { label: "Switch account", glyph: ArrowLeftRight, disabled: true },
  { label: "Settings", glyph: Settings },
  { label: "Sign out", glyph: LogOut },
];

/**
 * A menu panel, floating on the page ground.
 *
 * It is drawn on the page rather than in a card because that is where a menu
 * really is: it paints its own card panel and opens over whatever summoned it,
 * so its rows lift from the card and its panel lifts from the page. One item is
 * disabled by opacity and not by a grey — which is the whole reason it is here.
 * A disabled row and a quiet block have to be told apart, and in both systems
 * the answer is the same: the quiet block keeps its ink and changes ground, the
 * disabled row keeps its ground and loses its ink.
 */
function Menu({ hover }: { hover: string }) {
  return (
    <div className="w-60 rounded-md border border-border bg-card p-1 shadow-lg">
      {MENU_ITEMS.map((item) => (
        <button
          key={item.label}
          type="button"
          disabled={item.disabled}
          className={`${MENU_ROW} ${hover}`}
        >
          <Glyph icon={item.glyph} size={16} colour="currentColor" />
          {item.label}
        </button>
      ))}
    </div>
  );
}

// -------------------------------------------------------------- a filter row

const PILL =
  "inline-flex items-center rounded-full border px-3 py-1 text-xs font-medium transition-colors";

const PILLS = ["All", "Clubs", "Camps", "Events", "Schools"] as const;

/**
 * Five pills, one selected, resting on the quiet ground.
 *
 * The construct that has no ground to lift to in either system, and the reason
 * both columns answer it with ink. The selected pill is act with act ink in
 * both, because a selection is brand rather than grey — which is also what
 * keeps the pill honest under three steps, where a chosen pill and a hovered
 * pill would otherwise be the same value.
 */
function FilterPills({ rest }: { rest: string }) {
  const [chosen, setChosen] = useState("Camps");
  return (
    <div className="flex flex-wrap items-center gap-2">
      {PILLS.map((pill) => (
        <button
          key={pill}
          type="button"
          aria-pressed={pill === chosen}
          onClick={() => setChosen(pill)}
          className={
            pill === chosen
              ? `${PILL} border-act bg-act text-act-foreground`
              : `${PILL} ${rest}`
          }
        >
          {pill}
        </button>
      ))}
    </div>
  );
}

// --------------------------------------------------- the quiet-ground blocks

/**
 * Four bars while a list loads.
 *
 * Both systems paint them on the quiet ground, and in three steps that is the
 * same value a row takes under the pointer — which is not a defect and is worth
 * seeing next to the list above: a skeleton is not interactive, so nothing is
 * being confused, and the cost of the collapse is paid only where a *hoverable*
 * thing rests on the quiet ground.
 */
function Skeleton({ quiet }: { quiet: string }) {
  return (
    <div className="space-y-2">
      <div className={`h-4 w-40 animate-pulse rounded ${quiet}`} />
      <div className={`h-4 w-64 max-w-full animate-pulse rounded ${quiet}`} />
      <div className={`h-4 w-52 max-w-full animate-pulse rounded ${quiet}`} />
      <div className={`h-4 w-32 animate-pulse rounded ${quiet}`} />
    </div>
  );
}

/**
 * A quoted message inside a card — the plainest inset there is.
 *
 * An inset is the clearest case for the quiet ground: a block set back from the
 * content around it, which is exactly what "I matter less than my neighbours"
 * describes, and it is never a state.
 */
function Inset({ quiet }: { quiet: string }) {
  return (
    <div>
      <div className={`rounded-md p-3 ${quiet}`}>
        <p className="text-xs font-medium text-muted-foreground">
          Aino Virtanen
        </p>
        <p className="mt-1 text-sm text-foreground">
          Can we move Wednesday&rsquo;s session to 18:00?
        </p>
      </div>
      <p className="mt-3 text-sm text-foreground">
        That works &mdash; I&rsquo;ll let the group know.
      </p>
    </div>
  );
}

const FIELD =
  "mt-2 flex h-10 w-full rounded-md border border-border px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-act focus-visible:ring-offset-2";

const BUTTON =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-act focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50";

/**
 * Quiet, disabled and editable, in one frame.
 *
 * The three ideas a grey ladder is most often asked to carry, drawn together so
 * they can be told apart: the read-only field is quiet (a ground change, full
 * ink), the disabled button is disabled (no ground change, less ink), and the
 * editable field is neither — it sits on the page ground because a well is a
 * hole in the card rather than a lift off it.
 */
function QuietDisabledEditable({ quiet }: { quiet: string }) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {/* Each control is nested inside its own label rather than named by an
            `htmlFor`: the block is drawn twice on this page, and two copies of
            one id is a defect the page would be introducing itself. */}
        <label className="block text-sm font-medium leading-none text-foreground">
          Email
          <input
            defaultValue="aino@example.com"
            className={`${FIELD} bg-background text-foreground`}
          />
        </label>
        <label className="block text-sm font-medium leading-none text-foreground">
          Sign-in address
          <input
            readOnly
            value="aino@gamer.sogverse.internal"
            className={`${FIELD} ${quiet} text-muted-foreground`}
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={`${BUTTON} bg-act text-act-foreground`}>
          Save changes
        </button>
        <button
          type="button"
          disabled
          className={`${BUTTON} bg-act text-act-foreground`}
        >
          Save changes
        </button>
      </div>
    </div>
  );
}

/**
 * A ghost button — a control with no ground of its own until the pointer arrives.
 *
 * The cleanest reading of what a hover fill is worth, because there is nothing
 * else in the frame: no border, no rest fill, no ink change. Whatever the hover
 * is, it is the whole of the button's answer. Two of them, because a lift this
 * small is judged against the control beside it rather than against a memory of
 * the same control a moment ago.
 */
function GhostButton({ hover }: { hover: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        className={`${BUTTON} text-foreground ${hover} hover:text-foreground`}
      >
        Ghost
      </button>
      <button
        type="button"
        className={`${BUTTON} text-foreground ${hover} hover:text-foreground`}
      >
        Ghost
      </button>
    </div>
  );
}

// --------------------------------------------------------------- the columns

/** Page, card, accent, muted: one ground for the response, one for the quiet block. */
function FourSteps() {
  return (
    <Column title="Four steps">
      <Block title="The steps" ground="background">
        <Ladder grid="grid grid-cols-4" steps={FOUR_STEPS} />
      </Block>

      <Block title="A list" ground="card">
        <div className="space-y-6">
          <Variant name="hover accent · selected muted">
            <RowList hover="hover:bg-accent" selected="bg-muted" mark="none" />
          </Variant>
          <Variant name="hover muted · selected accent">
            <RowList hover="hover:bg-muted" selected="bg-accent" mark="none" />
          </Variant>
        </div>
      </Block>

      <Block title="A list, on the page" ground="background">
        <RowList hover="hover:bg-accent" selected="bg-muted" mark="none" />
      </Block>

      <Block title="A menu" ground="background">
        <Menu hover="hover:bg-accent" />
      </Block>

      <Block title="A filter row" ground="card">
        <div className="space-y-6">
          <Variant name="hover ink">
            <FilterPills rest="border-border bg-muted text-muted-foreground hover:text-foreground" />
          </Variant>
          <Variant name="hover accent">
            <FilterPills rest="border-border bg-muted text-muted-foreground hover:bg-accent hover:text-foreground" />
          </Variant>
        </div>
      </Block>

      <Block title="A skeleton" ground="card">
        <Skeleton quiet="bg-muted" />
      </Block>

      <Block title="An inset" ground="card">
        <Inset quiet="bg-muted" />
      </Block>

      <Block title="Quiet, disabled, editable" ground="card">
        <QuietDisabledEditable quiet="bg-muted" />
      </Block>

      <Block title="A ghost button" ground="card">
        <GhostButton hover="hover:bg-accent" />
      </Block>
    </Column>
  );
}

/** Page, card, and one grey above them, which every state and every quiet block shares. */
function ThreeSteps() {
  return (
    <Column title="Three steps">
      <Block title="The steps" ground="background">
        <Ladder grid="grid grid-cols-3" steps={THREE_STEPS} />
      </Block>

      <Block title="A list" ground="card">
        <div className="space-y-6">
          <Variant name="hover lifted · selected edge">
            <RowList hover="hover:bg-muted" selected="bg-muted" mark="edge" />
          </Variant>
          <Variant name="hover lifted · selected check">
            <RowList hover="hover:bg-muted" selected="bg-muted" mark="check" />
          </Variant>
        </div>
      </Block>

      <Block title="A list, on the page" ground="background">
        <RowList hover="hover:bg-muted" selected="bg-muted" mark="edge" />
      </Block>

      <Block title="A menu" ground="background">
        <Menu hover="hover:bg-muted" />
      </Block>

      <Block title="A filter row" ground="card">
        <Variant name="hover ink and edge">
          <FilterPills rest="border-border bg-muted text-muted-foreground hover:border-foreground hover:text-foreground" />
        </Variant>
      </Block>

      <Block title="A skeleton" ground="card">
        <Skeleton quiet="bg-muted" />
      </Block>

      <Block title="An inset" ground="card">
        <Inset quiet="bg-muted" />
      </Block>

      <Block title="Quiet, disabled, editable" ground="card">
        <QuietDisabledEditable quiet="bg-muted" />
      </Block>

      <Block title="A ghost button" ground="card">
        <GhostButton hover="hover:bg-muted" />
      </Block>
    </Column>
  );
}

// --------------------------------------------------------------- the section

export function GreysSection() {
  return (
    <Question n={3} title="The greys">
      <div className="grid gap-12 xl:grid-cols-2">
        <FourSteps />
        <ThreeSteps />
      </div>
    </Question>
  );
}
