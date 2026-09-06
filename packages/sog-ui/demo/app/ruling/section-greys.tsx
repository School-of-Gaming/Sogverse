/**
 * Question 3 — the greys.
 *
 * **The question.** `accent` #212121 and `muted` #262626 are both library
 * neutrals now, and the seven `sidebar-*` tokens are gone — the rail is chrome
 * and composes from the general neutrals, on the card ground. What is left open
 * is one fill: **is the hover `accent`, as it is today, or `muted`?** And if
 * `muted` takes the hover, does `accent` have any job left?
 *
 * **The counts, regenerated with**
 *
 *     grep -rno "bg-accent" src --include=*.tsx --include=*.ts | wc -l
 *     grep -rno "hover:bg-accent" src --include=*.tsx --include=*.ts | wc -l
 *     grep -rno "bg-muted\b" src --include=*.tsx --include=*.ts | wc -l
 *     grep -rno "hover:bg-muted" src --include=*.tsx --include=*.ts | wc -l
 *
 * `bg-accent` is spent 70 times: 60 of them are `hover:`, three more are
 * another pointer or keyboard state (`focus:`, `focus-within:`, `active:`), and
 * seven hold the fill as a state that outlives the pointer. `bg-muted` is spent
 * 177 times and nine of those are hovers; the rest are quiet blocks — a
 * skeleton's bars, an unselected pill, a read-only field, a chip. So accent is
 * very nearly the hover token already, and muted is very nearly the quiet-block
 * token already. The overlap is the nine and the seven.
 *
 * **Why the question exists at all.** Nobody reported a problem; it came out of
 * measuring. Over the card ground — which is where most of the app's lists,
 * tables and menus actually sit, because they sit inside cards — accent lifts
 * by 1.08:1 and muted by 1.15:1. Over the page ground the same two lift by
 * 1.16:1 and 1.24:1. That is the whole of it: a hover inside a card is a very
 * faint change today, and on the page ground it is a clear one. The numbers are
 * not on screen and are not meant to be; if the lift cannot be seen in the row,
 * a ratio would not have helped.
 *
 * **Two rulings are legitimate.**
 *
 * - *Today is fine, both stay.* Accent is the hover, muted is the quiet block,
 *   the seven held-accent sites keep their fill, the rail keeps its `muted`
 *   hover as a rail-shaped exception, and the library ships four grounds.
 * - *Muted takes the hover, accent is deleted.* Every `hover:bg-accent` becomes
 *   `hover:bg-muted`, the seven held sites become muted too, `accent` leaves
 *   `brand.ts`, the generated theme and the demo's foundations floor, and the
 *   library ships three grounds. The rail does not change: it already reads
 *   `muted`.
 *
 * **What the section draws.** Every exemplar below is copied class for class
 * from the component that spends the fill, on the ground that component really
 * sits on, twice: the grey it wears today beside the grey the proposal would
 * give it. Where a construct has a state that survives the pointer leaving —
 * an active rail entry, a selected row, a chosen option, a pressed chip — that
 * state is drawn *and is live*, because the thing being judged is whether hover
 * and selection can still be told apart. Those constructs are in
 * `section-greys-live.tsx`; the hover-only ones are in this file.
 *
 * **What the drawing has already surfaced, for the ledger.**
 *
 * - The conversation list is the one construct that spends both greys at once:
 *   hover `accent`, selected `muted`. Under the proposal its hovered row and
 *   its selected row become the same colour.
 * - The reaction pill rests on `muted` and hovers to `accent`, so its hover
 *   runs *darker*. Under the proposal it stops answering the pointer.
 * - Three of the seven held-accent sites are drawn (the open list, the mention
 *   list, the type-filter row); the other four are the rich-text toolbar's
 *   pressed button, the voice roster's own-row tint, the zone list's drop
 *   target, and the participant row's local highlight. All seven pair the held
 *   fill with a `hover:` of the same colour or one step away, so accent's real
 *   job on them is "the highlight", not "the hover" — which is the half of the
 *   question a hover-only page could not show.
 * - Sogverse has no tab and no segmented-control primitive. The type-filter row
 *   is the nearest thing to one, and its pressed state is a bare fill with no
 *   border or ink change — 1.08:1 from an unpressed chip and nothing else. That
 *   is a state whose only signal is a colour, and it belongs in the edge-and-
 *   state queue whichever grey wins.
 *
 * Both fills are real theme tokens, so both columns are drawn in classes rather
 * than inline styles: what is on screen is what the app paints.
 */

import type { ReactNode } from "react";
import {
  ChevronRight,
  Joystick,
  LayoutDashboard,
  LogOut,
  User,
  Users,
  type LucideIcon,
} from "lucide-react";

import { NEUTRALS } from "../../../src/tokens/brand";
import {
  Caps,
  Case,
  Compare,
  Exemplar,
  Glyph,
  Question,
} from "./parts";
import {
  ContactList,
  DropdownList,
  type Fill,
  MentionList,
  PickerTiles,
  RailNav,
  ReactionPills,
  TypeChips,
} from "./section-greys-live";

// ------------------------------------------------------------------ furniture

/** The two grounds an exemplar can be judged on. */
type Ground = "background" | "card";

const GROUND_BOX: Record<Ground, string> = {
  background: "mt-2 flex-1 rounded-lg border border-border bg-background p-4",
  card: "mt-2 flex-1 rounded-lg border border-border bg-card p-4",
};

const GROUND_NAME: Record<Ground, string> = {
  background: "bg-background",
  card: "bg-card",
};

/** The class each column is drawn with, as the column's own name. */
const HOVER_NAME: Record<Fill, string> = {
  accent: "hover:bg-accent",
  muted: "hover:bg-muted",
};

const FILLS: Fill[] = ["accent", "muted"];

/**
 * One column: what it is, what it is drawn in, and the thing.
 *
 * Two names rather than one sentence. The first says which of the two columns
 * this is — what is deployed, and what is being asked about. The second is in
 * mono because both halves of it are classes a page would write to get exactly
 * this: the fill, and the ground under it.
 */
function GroundPanel({
  state,
  fillName,
  ground,
  children,
}: {
  state: string;
  fillName: string;
  ground: Ground;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <Caps>{state}</Caps>
      <p className="font-brand-mono text-body-s text-muted-foreground">
        {`${fillName} · ${GROUND_NAME[ground]}`}
      </p>
      <div className={GROUND_BOX[ground]}>{children}</div>
    </div>
  );
}

/**
 * One construct, drawn with each grey on each ground it lives on.
 *
 * `today` is per construct rather than per page: the rail already hovers to
 * `muted`, so for it accent is the alternative rather than the proposal, and
 * calling it "proposed" there would be the page lying about what is deployed.
 *
 * Two grounds make a row of four, one ground a row of two, and the panels are
 * ordered so the pair sharing a ground is adjacent — a lift is judged against
 * the other lift on the same ground, never against the same lift elsewhere.
 */
function GreyCase({
  title,
  grounds,
  today,
  name,
  render,
}: {
  title: string;
  grounds: Ground[];
  today: Fill;
  /** What to call each column. Defaults to the hover class each one writes. */
  name?: Record<Fill, string>;
  render: (fill: Fill) => ReactNode;
}) {
  const columns = grounds.length === 1 ? 2 : 4;
  const other = today === "accent" ? "proposed" : "alternative";
  return (
    <Case title={title}>
      <Compare columns={columns}>
        {grounds.flatMap((ground) =>
          FILLS.map((fill) => (
            <GroundPanel
              key={`${ground}-${fill}`}
              state={fill === today ? "today" : other}
              fillName={name === undefined ? HOVER_NAME[fill] : name[fill]}
              ground={ground}
            >
              {render(fill)}
            </GroundPanel>
          )),
        )}
      </Compare>
    </Case>
  );
}

// -------------------------------------------------------------- the four grounds

/**
 * The ladder a dark page climbs, in order, with no gap between the steps.
 *
 * Adjacent and unseparated on purpose: an edge between two greys is a third
 * value, and it is exactly what makes two near-identical fills look further
 * apart than they are. The second row is the same four carrying ink, because a
 * ground is never seen empty.
 */
const LADDER: { fill: string; token: string; name: string }[] = [
  {
    fill: "flex h-16 items-center justify-center bg-background text-foreground",
    token: "background",
    name: NEUTRALS.background.name,
  },
  {
    fill: "flex h-16 items-center justify-center bg-card text-foreground",
    token: "card",
    name: NEUTRALS.card.name,
  },
  {
    fill: "flex h-16 items-center justify-center bg-accent text-foreground",
    token: "accent",
    name: NEUTRALS.accent.name,
  },
  {
    fill: "flex h-16 items-center justify-center bg-muted text-foreground",
    token: "muted",
    name: NEUTRALS.muted.name,
  },
];

function Ladder() {
  return (
    <div className="max-w-xl">
      <div className="grid grid-cols-4 overflow-hidden rounded-lg border border-border">
        {LADDER.map((step) => (
          <div key={step.token} className={step.fill} />
        ))}
      </div>
      <div className="mt-2 grid grid-cols-4 gap-2">
        {LADDER.map((step) => (
          <p
            key={step.token}
            className="font-brand-mono text-body-s text-muted-foreground"
          >
            {step.token}
          </p>
        ))}
      </div>
      <div className="mt-6 grid grid-cols-4 overflow-hidden rounded-lg border border-border">
        {LADDER.map((step) => (
          <div key={step.token} className={step.fill}>
            <span className="text-body-s font-medium">{step.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------- hover-only exemplars

/**
 * The "Active" badge's fill and its label — Sogverse's `success` pair.
 *
 * The status colours are question 2's and are not the library's, so they are
 * spelled here rather than named. The row is drawn whole because a hover is
 * judged against the row it lifts, not against a stripped copy of it.
 */
const SUCCESS = "#2EB88A";
const SUCCESS_INK = "#FFFFFF";

/** Sogverse's `info` pair, spelled for the same reason. */
const INFO = "#308CE8";
const INFO_INK = "#FFFFFF";

/**
 * `admin/users/[id]/page.tsx` — an assigned-product row.
 *
 * The plainest hover in the app: a bordered row with no fill of its own, so it
 * takes whatever is behind it and its lift is the whole of its hover. It lives
 * inside a `Card`, which is why the card column is the real one — but the row
 * is drawn on both grounds because a fill-less row is the shape the app repeats
 * everywhere, and the two columns are what show how much the ground decides.
 *
 * Every clickable exemplar on this page is a `button` where the app writes a
 * `Link`. A demo row that navigates would leave the page being ruled on, and
 * the two elements take the same fill, the same focus ring and the same
 * pointer; `w-full` is the one class the swap costs, because an anchor fills
 * its line and a button shrinks to its content.
 */
const ASSIGNED_ROW =
  "group flex w-full items-center justify-between rounded-lg border border-border p-3 transition-colors";

function AssignedRows({ fill }: { fill: Fill }) {
  return (
    <div className="space-y-2">
      {["Minecraft club — Espoo", "Summer camp — Tampere"].map((name) => (
        <button
          key={name}
          type="button"
          className={
            fill === "accent"
              ? `${ASSIGNED_ROW} hover:bg-accent hover:text-foreground`
              : `${ASSIGNED_ROW} hover:bg-muted hover:text-foreground`
          }
        >
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{name}</span>
            <span className="block truncate text-xs text-muted-foreground">
              Wednesdays, 17:00
            </span>
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <span
              className="inline-flex shrink-0 items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold"
              style={{
                backgroundColor: SUCCESS,
                color: SUCCESS_INK,
                borderColor: SUCCESS,
              }}
            >
              Active
            </span>
            <span className="text-muted-foreground transition-transform group-hover:translate-x-0.5 group-focus-within:translate-x-0.5">
              <Glyph icon={ChevronRight} size={16} colour="currentColor" />
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

/**
 * `components/admin/sites/admin-sites-page.tsx` — the sites table.
 *
 * The only exemplar here whose fill answers the keyboard as well as the
 * pointer: the row carries `focus-within` beside `hover`, so tabbing into a
 * cell lights the whole row. Tab through the column to see it. The table's
 * `min-w-[34rem]` and its scroll container are dropped — that is page geometry,
 * not colour — and two of the four columns are kept.
 */
const SITES_ROW =
  "group relative border-b border-border transition-colors last:border-b-0";

function SitesTable({ fill }: { fill: Fill }) {
  return (
    <table className="w-full border-collapse text-sm">
      <thead>
        <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
          <th scope="col" className="px-3 py-2 font-medium">
            Site
          </th>
          <th scope="col" className="w-8 px-3 py-2" />
        </tr>
      </thead>
      <tbody>
        {["Espoo, Otaniemi", "Helsinki, Kallio", "Tampere, Hervanta"].map(
          (site) => (
            <tr
              key={site}
              className={
                fill === "accent"
                  ? `${SITES_ROW} hover:bg-accent focus-within:bg-accent`
                  : `${SITES_ROW} hover:bg-muted focus-within:bg-muted`
              }
            >
              <td className="px-3 py-2">
                <button
                  type="button"
                  className="rounded font-medium after:absolute after:inset-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-act"
                >
                  {site}
                </button>
              </td>
              <td className="w-8 px-3 py-2">
                <span className="text-muted-foreground transition-transform group-hover:translate-x-0.5 group-focus-within:translate-x-0.5">
                  <Glyph icon={ChevronRight} size={16} colour="currentColor" />
                </span>
              </td>
            </tr>
          ),
        )}
      </tbody>
    </table>
  );
}

/**
 * `components/layout/account-menu.tsx` — the header menu.
 *
 * Drawn on the card ground only, because the menu panel paints `bg-card`
 * itself. Its rows carry `focus:` beside `hover:` with the same fill, which is
 * the pattern the whole overlay family follows: one highlight, two ways to
 * reach it.
 */
const MENU_ROW =
  "flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors";

/**
 * The panel's three rows, each carrying the mark its own row carries.
 *
 * `Users` is the one stand-in: a household member's row wears that person's
 * identicon rather than an icon, and nothing in lucide is an identicon, so the
 * nearest mark for "the people in this household" stands where the face goes.
 */
const MENU_ITEMS: { label: string; glyph: LucideIcon }[] = [
  { label: "My SOG", glyph: LayoutDashboard },
  { label: "Family", glyph: Users },
  { label: "Sign out", glyph: LogOut },
];

function MenuRows({ fill }: { fill: Fill }) {
  return (
    <div className="w-56 rounded-md border border-border bg-card py-1 shadow-lg">
      {MENU_ITEMS.map((item) => (
        <button
          key={item.label}
          type="button"
          className={
            fill === "accent"
              ? `${MENU_ROW} hover:bg-accent hover:text-foreground focus:bg-accent focus:text-foreground focus:outline-none`
              : `${MENU_ROW} hover:bg-muted hover:text-foreground focus:bg-muted focus:text-foreground focus:outline-none`
          }
        >
          <Glyph icon={item.glyph} size={16} colour="currentColor" />
          {item.label}
        </button>
      ))}
    </div>
  );
}

/**
 * `components/ui/button.tsx` — the `outline` and `ghost` variants.
 *
 * The two variants are the same hover on two different rest states: `outline`
 * paints `bg-background` and lifts from the page ground wherever it is put,
 * `ghost` paints nothing and lifts from whatever is behind it. So the pair is
 * the cleanest reading of what the ground does to the fill — on a card, ghost
 * lifts by 1.08:1 and outline by 1.16:1, from the same class.
 */
const BUTTON_BASE =
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-act focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 h-10 px-4 py-2";

function Buttons({ fill }: { fill: Fill }) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        className={
          fill === "accent"
            ? `${BUTTON_BASE} border border-border bg-background shadow-sm hover:bg-accent hover:text-foreground`
            : `${BUTTON_BASE} border border-border bg-background shadow-sm hover:bg-muted hover:text-foreground`
        }
      >
        Outline
      </button>
      <button
        type="button"
        className={
          fill === "accent"
            ? `${BUTTON_BASE} hover:bg-accent hover:text-foreground`
            : `${BUTTON_BASE} hover:bg-muted hover:text-foreground`
        }
      >
        Ghost
      </button>
    </div>
  );
}

/**
 * `components/admin/dashboard/product-attention-grid.tsx` — a card that is one
 * link.
 *
 * Drawn on its own ground only: the card paints `bg-card` and hovers to accent,
 * so this is the card-to-accent step with nothing else in the frame. It is the
 * faintest hover the app has and the one an admin meets first every morning.
 */
const ATTENTION_CARD =
  "flex h-full flex-col gap-2 rounded-lg border border-border bg-card p-3 transition-colors";

function AttentionCard({ fill }: { fill: Fill }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {["Minecraft club — Espoo", "Roblox club — Vantaa"].map((name) => (
        <button
          key={name}
          type="button"
          className={
            fill === "accent"
              ? `${ATTENTION_CARD} hover:bg-accent`
              : `${ATTENTION_CARD} hover:bg-muted`
          }
        >
          <span className="flex items-start gap-2">
            <span className="mt-0.5 text-yty-harmony-soft">
              <Glyph icon={Joystick} size={16} colour="currentColor" />
            </span>
            <span className="text-sm font-medium leading-snug">{name}</span>
          </span>
          <span className="block text-left text-xs text-muted-foreground">
            No gedu assigned
          </span>
        </button>
      ))}
    </div>
  );
}

// ------------------------------------------------------ muted, held statically

/**
 * The quiet blocks, in one set.
 *
 * **The set is mixed on purpose.** Five of the six wear `muted` today and are
 * untouched by either ruling; the sixth — the type-filter row — wears `accent`
 * held as a pressed state, and is one of the seven sites the proposal would
 * move. Drawing them together is what makes the today column and the proposed
 * column differ at all: two columns of identical muted blocks would say
 * nothing, and the point worth seeing is that the proposal costs the quiet
 * blocks nothing and costs the pressed chip its distinctness from the fill
 * beside it.
 *
 * There is no solid-`muted` *inset panel* to draw: every inset the app has —
 * the reply quote strip, the photo strip, the participant tile — is a `muted`
 * at an alpha step and belongs to question 7 rather than here. What the token
 * really grounds is bars, chips and fields, which is what is drawn.
 */
function QuietBlocks({ fill }: { fill: Fill }) {
  return (
    <div className="space-y-6">
      <Exemplar
        file="family/product-page/FamilyProductPageSkeleton.tsx"
        page="/parent/products/[id], while it loads"
      >
        <div>
          <div className="h-3 w-16 animate-pulse rounded bg-muted" />
          <div className="mt-2 h-8 w-64 max-w-full animate-pulse rounded-md bg-muted" />
          <div className="mt-3 h-4 w-40 animate-pulse rounded bg-muted" />
          <div className="mt-2 h-4 w-32 animate-pulse rounded bg-muted" />
          <div className="mt-4 h-10 w-44 animate-pulse rounded-md bg-muted" />
        </div>
      </Exemplar>

      <Exemplar
        file="admin/products/product-status-chip.tsx"
        page="/admin/products, a product row"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className="shrink-0 rounded-full bg-act px-2 py-0.5 text-xs text-act-foreground">
            Running
          </span>
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            Completed
          </span>
          <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            Expired
          </span>
        </div>
      </Exemplar>

      <Exemplar
        file="admin/users/page.tsx"
        page="/admin/users, the role filter"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="inline-flex items-center rounded-full px-3 py-1 text-xs font-medium transition-colors"
            style={{ backgroundColor: INFO, color: INFO_INK }}
          >
            All
          </span>
          {["Admin", "Customer", "Gamer", "Gedu"].map((role) => (
            <span
              key={role}
              className="inline-flex items-center rounded-full bg-muted px-3 py-1 text-xs font-medium text-muted-foreground transition-colors"
            >
              {role}
            </span>
          ))}
        </div>
      </Exemplar>

      <Exemplar
        file="family/gamer-sign-in-card.tsx"
        page="/parent/gamers/[id], the address a parent reads back"
      >
        {/* The control is nested inside its own label rather than named by an
            `htmlFor`: the block is drawn four times on this page, and four
            copies of one id is a defect the page would be introducing itself. */}
        <label className="block text-sm font-medium leading-none">
          Email
          <input
            readOnly
            value="aino@example.com"
            className="mt-2 flex h-10 w-full rounded-md border border-border bg-muted px-3 py-2 text-base placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-act focus-visible:ring-offset-2"
          />
        </label>
      </Exemplar>

      {/* `User` is the chip's own mark, moved: in the app it heads the parent's
          name on the chip's second line, and the chip is drawn here as the one
          line the muted fill is being ruled on. */}
      <Exemplar
        file="admin/products/groups/participant-chip.tsx"
        page="/admin/products/[type]/[id], the groups board"
      >
        <div className="flex flex-wrap gap-2">
          {["Aino, 11", "Elias, 9"].map((who) => (
            <span
              key={who}
              className="flex items-center gap-2 rounded-lg border border-border bg-muted px-2.5 py-2 text-xs font-medium text-foreground transition-colors"
            >
              <Glyph icon={User} size={14} colour="currentColor" />
              {who}
            </span>
          ))}
        </div>
      </Exemplar>

      <Exemplar
        file="admin/dashboard/schedule-panel.tsx"
        page="/admin, the schedule filter"
      >
        <TypeChips fill={fill} />
      </Exemplar>
    </div>
  );
}

/**
 * The two overlays that hold accent as a highlight.
 *
 * Both paint their own `bg-card` panel, so there is no ground to vary — the
 * question they answer is the other one: what accent does when it is *not* a
 * hover. On the open list the held fill sits one alpha step from the hover; on
 * the mention list the two are the same value and the pointer is one of the two
 * ways of setting it. Neither distinction is lost by moving to muted, which is
 * the argument for deleting accent rather than keeping it for these.
 */
function HeldOverlays({ fill }: { fill: Fill }) {
  return (
    <div className="space-y-6">
      <Exemplar
        file="components/ui/filter-dropdown.tsx"
        page="/admin/products, the filter row"
      >
        <DropdownList fill={fill} />
      </Exemplar>
      <Exemplar
        file="components/chat/ChatComposer.tsx"
        page="a group chat, typing a mention"
      >
        <MentionList fill={fill} />
      </Exemplar>
    </div>
  );
}

const HELD_NAME: Record<Fill, string> = {
  accent: "bg-accent",
  muted: "bg-muted",
};

// --------------------------------------------------------------- the section

export function GreysSection() {
  return (
    <Question n={3} title="The greys">
      <Case title="The four grounds">
        <Ladder />
      </Case>

      <GreyCase
        title="The rail entry"
        grounds={["background"]}
        today="muted"
        render={(fill) => (
          <Exemplar
            file="components/layout/sidebar.tsx"
            page="/parent, /gedu, /admin — the rail"
          >
            <RailNav fill={fill} />
          </Exemplar>
        )}
      />

      <GreyCase
        title="The conversation list — hover and selected in one construct"
        grounds={["card"]}
        today="accent"
        render={(fill) => (
          <Exemplar
            file="admin/whatsapp/page.tsx"
            page="/admin/whatsapp, the conversation list"
          >
            <ContactList fill={fill} />
          </Exemplar>
        )}
      />

      <GreyCase
        title="A list row"
        grounds={["background", "card"]}
        today="accent"
        render={(fill) => (
          <Exemplar
            file="admin/users/[id]/page.tsx"
            page="/admin/users/[id], the assigned-products list"
          >
            <AssignedRows fill={fill} />
          </Exemplar>
        )}
      />

      <GreyCase
        title="A table row"
        grounds={["card"]}
        today="accent"
        render={(fill) => (
          <Exemplar
            file="admin/sites/admin-sites-page.tsx"
            page="/admin/sites, the sites table"
          >
            <SitesTable fill={fill} />
          </Exemplar>
        )}
      />

      <GreyCase
        title="A menu row"
        grounds={["background"]}
        today="accent"
        render={(fill) => (
          <Exemplar
            file="components/layout/account-menu.tsx"
            page="the header, on every dashboard"
          >
            <MenuRows fill={fill} />
          </Exemplar>
        )}
      />

      <GreyCase
        title="The ghost and outline buttons"
        grounds={["background", "card"]}
        today="accent"
        render={(fill) => (
          <Exemplar file="components/ui/button.tsx" page="every surface">
            <Buttons fill={fill} />
          </Exemplar>
        )}
      />

      <GreyCase
        title="A card that is one link"
        grounds={["background"]}
        today="accent"
        render={(fill) => (
          <Exemplar
            file="admin/dashboard/product-attention-grid.tsx"
            page="/admin, the attention grid"
          >
            <AttentionCard fill={fill} />
          </Exemplar>
        )}
      />

      <GreyCase
        title="A picker tile"
        grounds={["card"]}
        today="accent"
        render={(fill) => (
          <Exemplar
            file="components/family/AddGamerDialog.tsx"
            page="/parent/gamers, adding a gamer"
          >
            <PickerTiles fill={fill} />
          </Exemplar>
        )}
      />

      <GreyCase
        title="A pill that rests on muted"
        grounds={["card"]}
        today="accent"
        render={(fill) => (
          <Exemplar
            file="components/chat/ChatReactionRow.tsx"
            page="a group chat, under a message"
          >
            <ReactionPills fill={fill} />
          </Exemplar>
        )}
      />

      <GreyCase
        title="The quiet blocks"
        grounds={["background", "card"]}
        today="accent"
        name={HELD_NAME}
        render={(fill) => <QuietBlocks fill={fill} />}
      />

      <GreyCase
        title="Accent held, rather than hovered"
        grounds={["background"]}
        today="accent"
        name={HELD_NAME}
        render={(fill) => <HeldOverlays fill={fill} />}
      />
    </Question>
  );
}
