/* eslint-disable i18next/no-literal-string -- temporary admin-only review deck for the brand design pass; every string here is owner-facing review narration or a specimen of a live English message, never product copy that ships in any locale, and the whole page is deleted before the wiring phase merges */

import {
  Check,
  ChevronRight,
  ChevronUp,
  Gamepad2,
  Globe,
  Info,
  MapPin,
  Plus,
  Radio,
  Shield,
  Sparkles,
  Star,
  TriangleAlert,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";
import { Identicon } from "@/components/ui/identicon";
import { CHAT_REACTION_GLYPHS } from "@/lib/constants/chat";
import {
  VOICE_ZONE_COLORS,
  VOICE_ZONE_ICONS,
} from "@/lib/constants/voice-zones";
import { cn } from "@/lib/utils";

/**
 * **Temporary.** The border-colour half of the brand design pass, ordered as its
 * own deck by the owner (plan direction 33): "in general a colorful border could
 * enhance that vibrant look of the app I am going for… I think I need a border
 * color review. Because I agree, some place it just be neutral and some places
 * it should be colored. It depends on context."
 *
 * Deleted from this branch before the wiring phase lands, together with the
 * colour deck at `/admin/design-pass-walkthrough` and the typography deck at
 * `/admin/design-pass-typography`. Deliberately absent from the admin sidebar
 * and from every index; the proxy role-gates every path under `/admin`, so
 * reaching it by URL is already gated without this page doing anything.
 *
 * ## The format, ruled by the owner (direction 33b)
 *
 * Every open construct renders in **three clear columns**: "(1) as the app ships
 * now, post-layer-fix, the branch's current rendering; (2) what will ship with
 * the design updated — the rulings and recommendations applied, colour kept
 * where the design keeps colour; (3) the neutral proposal, where one is proposed
 * (empty otherwise)." And: "every border that appears or changes on hover/focus
 * gets an explicit, complete inventory — the real easy case to miss."
 *
 * Three consequences the code carries:
 *
 * - The three columns are one shared pair of components (`Exhibit` + `Column`)
 *   with one fixed label map, so a reader learns the grid once and every slide
 *   after that reads the same way. A column that has nothing new to draw renders
 *   a `ColumnNote` instead of a second identical render — two identical cells is
 *   a wasted exhibit, and the reader hunting for a difference that is not there
 *   is worse than being told there is none.
 * - Column 2 is where the *standing* rulings are already applied: the tint ban
 *   resolved to full value (`border-warning/40` → `border-warning`), washed
 *   grounds replaced by `bg-muted`/`bg-accent`, ruled constructs in their ruled
 *   form. It is not a proposal to *add* colour; it is what wiring writes if the
 *   colour stays.
 * - Column 3 is drawn only where neutral is genuinely on the table. Where the
 *   recommendation is unambiguously colour — form validation is the case — the
 *   slot carries a one-line muted note rather than an empty hole, so the grid
 *   stays scannable down the page.
 *
 * Slide 1 stays a **reference**: its five constructs are already ruled, drawn in
 * their ruled form as the yardstick the rest is measured against. The review's
 * decisions all land in the three-column grids that follow it.
 *
 * ## Why this deck exists at all
 *
 * `globals.css` carried an *unlayered* `* { border-color: hsl(var(--border)) }`
 * rule. Tailwind 4 emits every utility inside `@layer utilities`, and unlayered
 * CSS beats all layered CSS regardless of specificity — so every border-*colour*
 * utility in the app was dead from the initial commit until 2026-09-01, when the
 * rule was wrapped in `@layer base` on this branch. Consequence: the ~160
 * coloured-border instances below were all authored blind, and the app the owner
 * has actually used has never had a coloured border in it. `ring-*` utilities
 * are the exception — they draw with box-shadow, not border-colour, so they
 * always rendered (see slide 8).
 *
 * ## Census regeneration commands
 *
 * Run from the repo root. The positive glob is deliberately *first*, because a
 * later glob overrides an earlier one in ripgrep and putting it last silently
 * re-includes the excluded directories. The exclusions name bare directories
 * rather than `dir/` followed by a double star: gitignore semantics skip an
 * excluded directory's contents anyway, and the star-slash form cannot be
 * written inside a block comment.
 *
 * The whole palette:
 *
 * ```
 * rg -o "(hover:|focus:|focus-visible:|focus-within:|group-hover:|active:)?(border|ring)-(primary|secondary|destructive|warning|success|info|foreground|yty-[a-z]+(-strong|-soft)?|sidebar-primary)(/[0-9]+)?" src -g '*.{ts,tsx}' -g '!src/components/preview' -g '!src/app/(dashboard)/admin/design-pass-*' -g '!src/lib/constants/colors.ts' --no-filename | sort | uniq -c | sort -rn
 * ```
 *
 * The hover/focus half, which slide 2 enumerates exhaustively:
 *
 * ```
 * rg -n "(hover:|focus:|focus-visible:|focus-within:|group-hover:|active:)border-" src -g '!src/components/preview' -g '!src/app/(dashboard)/admin/design-pass-*'
 * ```
 *
 * **Verified 2026-09-01 against this branch — 160 instances, 138 borders and 22
 * rings**, which is the direction-32 figure ("~150") re-run with the prefix list
 * completed (`focus-within:` was missing) and with `.md`/`colors.ts` comment
 * matches dropped. **Post-merge note (same day): the dev merge (chat wire-up +
 * gamer creations) brings the census to 163** — the material additions are the
 * gedu session-feed creations block's warning edges (`border-warning` on its
 * notice, `border-warning/40` tinted — the tint falls under the standing ban
 * and resolves with slide 4's ruling). Dev's authors also worked under the
 * layer bug, so their borders were authored blind like everything here:
 *
 * - **primary — 47 borders** (36 bare, 5 `hover:`, 2 `focus-visible:`, 1
 *   `focus-within:`, 1 `group-hover:`, 1 `active:`, 1 `/40`). The branch has
 *   already promoted almost all of these from `/N` to full value under direction
 *   31(c); one `/40` remains, in the enrollment tone map's `current` entry,
 *   which quotes the app as shipped on purpose.
 * - **functional statuses — 48 borders**: info 14, success 13, warning 11,
 *   destructive 10. Still overwhelmingly tinted (only 12 of the 48 are full
 *   value), so the tint ban has real work to do here.
 * - **yty — 18 borders**: 6 full value (the enrollment/product-page tone maps'
 *   `border-yty-wit-strong` and `border-yty-glow-strong`), 12 tinted at `/30`
 *   (the icon-accent tile recipe, in the element constants and the home tiles).
 * - **foreground — 25 borders**: 6 full value (the voice pickers' selection
 *   ring and the roster's), 15 `hover:border-foreground/30`, 2
 *   `focus-within:border-foreground/30`, 1 `hover:border-foreground/40`, 1
 *   `border-foreground/40`.
 * - **rings — 22**: primary 11, yty 8, plus `ring-foreground`, `ring-info/40`
 *   and `focus:ring-destructive`.
 *
 * **The hover/focus census, re-run for slide 2 — 31 prefixed border utilities
 * on 27 source lines in 19 files.** By family: `hover:border-foreground/30` 15
 * plus `focus-within:border-foreground/30` 2; `hover:border-foreground/40` 1;
 * prefixed `border-primary` 10 (`hover:` 5, `focus-visible:` 2, `focus-within:`
 * 1, `active:` 1, `group-hover:` 1, `group-focus-visible:` counted with its
 * pair); prefixed `border-transparent` 2; prefixed `border-border` 1. Every one
 * of the 19 files is drawn or named on slide 2 — that slide is the inventory,
 * and the old "hover lifts" slide's content was folded into it so each
 * comparison keeps exactly one home.
 *
 * The primary/foreground split moved once already, mid-review: direction 34's
 * ruling converted the enrollment card's and the gedu assignment card's amber
 * hover lifts to the gray idiom, which is why the gray count is 15 + 2 rather
 * than the 13 direction 32 recorded. Re-run the commands before quoting a figure.
 *
 * **Grouped by construct context, not by colour** (direction 33). The question
 * a border answers is a property of what it is drawn around — an invalid field,
 * an alert, a chip, an icon tile, a card at rest, a hover state, a selection —
 * and the same hue can be right in one and wrong in the next.
 *
 * **Show, don't tell** (owner direction, 2026-09-01: "the console is where you
 * describe things, the review pages are where you show things"). Every slide is
 * a title, the three-column grid, an annotation naming the source file and the
 * count, at most one caption line, and one ruling per context. The reasoning is
 * not on the page: it lives in these comments, in the plan and in the session
 * report.
 *
 * **No tinted candidate is offered.** The tint ban is ruled and standing
 * (directions 25–31): a brand colour shaded past its authored strong/soft pair
 * is no longer a brand colour. So column 1 quotes the tint only where the tint
 * is what ships, and columns 2 and 3 never introduce one. Column 2 is drawn to
 * look good, not to lose: the owner's lean is vibrancy, so it is a contender.
 *
 * **The hover principle, owner (2026-09-01), binding slide 2 and colouring the
 * whole review:** "a border that is only colored on hover means it is only
 * enhancing a desktop layout and has no impact on mobile… considering how
 * parents tend to use mobile more than desktop, we could be putting work into an
 * effect that won't be appreciated by one of our main audiences." So vibrancy
 * spent only behind hover never reaches the mobile-first family audience: where
 * a border deserves colour for the vibrant look it earns it *at rest*, visible
 * on touch, and hover stays functional feedback in the neutral idiom.
 * Desktop-default admin and gedu surfaces may still weigh hover colour. That is
 * why several of slide 2's column-2 cells move the colour to rest rather than
 * keeping it on the hover: keeping the colour and reaching a phone are the same
 * edit.
 *
 * **And its first casualty, ruled mid-review (direction 34):** on My SOG a live
 * card's own green state edge was repainted amber the instant a cursor landed —
 * "these are the kind of crashes that I couldn't have seen before because of the
 * bug you fixed." Ruling, already applied on this branch: **a border that
 * carries state is never repainted by a hover; hover lifts on state-bearing
 * cards take the neutral gray idiom** (`hover:border-foreground/30`, shadows
 * kept). The enrollment card's shared `openable` tone and the gedu assignment
 * card are converted, and slide 2 opens with that pair drawn as reference.
 *
 * **Hover and focus are painted statically.** A hover you have to produce with a
 * cursor is a state half the deck's readers on a laptop trackpad will not
 * compare side by side, and the whole question is how rest and hover read
 * *against each other*. Each "hover" pose therefore applies the prefixed class's
 * own colour unconditionally, and the class line names the real prefixed
 * utility.
 *
 * **Nothing live is modified.** Every candidate is reproduced inline from the
 * source file named in its annotation, class string for class string. The deck
 * reads the live constants where a construct is data-driven (the voice-zone
 * colour map, the chat reaction glyphs) and copies the markup where it is not.
 *
 * **The furniture is a copy of the other decks', not an import.** All three
 * pages are deleted in the same change, and a shared module between three doomed
 * pages is a fourth thing to delete plus a reason for someone to keep it.
 */

/* ------------------------------------------------------------------ */
/*  The deck                                                           */
/* ------------------------------------------------------------------ */

const SLIDES = [
  { id: "settled", title: "Already ruled — the coloured borders with jobs" },
  { id: "hover", title: "Borders that appear on hover" },
  { id: "validation", title: "Form validation" },
  { id: "alerts", title: "Status banners and alerts" },
  { id: "chips", title: "Outline chips and badges" },
  { id: "yty-tiles", title: "The Yty accent edges" },
  { id: "card-edges", title: "Card edges at rest" },
  { id: "rings", title: "Rings" },
  { id: "recap", title: "Recap" },
] as const;

type SlideId = (typeof SLIDES)[number]["id"];

/* ------------------------------------------------------------------ */
/*  Slide furniture                                                    */
/* ------------------------------------------------------------------ */

function Slide({ id, children }: { id: SlideId; children: React.ReactNode }) {
  const index = SLIDES.findIndex((slide) => slide.id === id);
  const slide = SLIDES[index];

  return (
    <section
      id={id}
      className="scroll-mt-[calc(var(--header-height)+1rem)] space-y-4 rounded-lg border p-6"
    >
      <div className="flex items-baseline gap-3">
        <span className="text-2xl font-bold tabular-nums text-primary">
          {index + 1}
        </span>
        <h2 className="text-2xl font-semibold">{slide.title}</h2>
      </div>
      {children}
    </section>
  );
}

/** One line, and only where the exhibit above it is not self-labelling. */
function Caption({ children }: { children: React.ReactNode }) {
  return <p className="max-w-prose text-sm text-muted-foreground">{children}</p>;
}

/** Where the exhibit came from and how many of it there are. */
function Annotation({ children }: { children: React.ReactNode }) {
  return (
    <p className="max-w-prose font-mono text-[11px] leading-relaxed text-muted-foreground">
      {children}
    </p>
  );
}

/**
 * The ask, one line per ruling, posed as a choice between the columns above it
 * with the recommendation folded in rather than argued.
 */
function Ruling({ children }: { children: React.ReactNode }) {
  // Full-value edge on a neutral card, matching both other decks' ruling card.
  // The tint ban binds this page too, so a `/40` edge here would be the deck
  // shipping the violation it is asking the owner to rule on.
  return (
    <div className="space-y-1.5 rounded-lg border border-primary bg-card px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-primary">
        Ruling
      </div>
      <div className="max-w-prose space-y-1 text-sm text-foreground">
        {children}
      </div>
    </div>
  );
}

function Marker({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </div>
  );
}

/** A construct's name inside a slide, with whether it is ruled or still open. */
function ConstructHeading({
  label,
  status,
}: {
  label: string;
  status: "Ruled — applied on this branch" | "Open" | "Neutral idiom";
}) {
  return (
    <div className="flex flex-wrap items-baseline gap-3 pt-3">
      <h3 className="text-lg font-semibold">{label}</h3>
      <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {status}
      </span>
    </div>
  );
}

function DeckLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
    >
      {children}
    </a>
  );
}

/* ------------------------------------------------------------------ */
/*  The three columns (direction 33b)                                  */
/* ------------------------------------------------------------------ */

/**
 * One label map, used by every open exhibit on the deck, so the grid reads
 * identically from slide 2 to slide 8 and the numbers can be cited in a ruling
 * ("column 2, or column 3") without re-explaining them each time.
 */
const COLUMN_LABELS = {
  "ships-now": "1 · Ships now",
  updated: "2 · Design updated",
  neutral: "3 · Neutral proposal",
} as const;

type ColumnSlot = keyof typeof COLUMN_LABELS;

/**
 * The shared grid. `stacked` is for constructs that are a *row* — an admin week
 * strip, a filter bar — where a third of the page would wrap them into a shape
 * they never take in the app; the three columns then run down the page instead
 * of across it, keeping the same labels and the same order.
 */
function Exhibit({
  stacked,
  children,
}: {
  stacked?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid items-start gap-4",
        stacked ? "grid-cols-1" : "md:grid-cols-3",
      )}
    >
      {children}
    </div>
  );
}

/**
 * One column: its fixed label, the class string it is drawn with, and the
 * exhibit on the page's own ground. The class line is part of the exhibit rather
 * than commentary — it is what the wiring change will actually write.
 */
function Column({
  slot,
  classes,
  children,
}: {
  slot: ColumnSlot;
  classes: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Marker>{COLUMN_LABELS[slot]}</Marker>
      <div className="font-mono text-[10px] leading-tight text-muted-foreground">
        {classes}
      </div>
      <div className="rounded-lg border bg-background p-4">{children}</div>
    </div>
  );
}

/**
 * A column with nothing new to draw: identical to what ships, or no neutral
 * proposed. Drawn as a dashed box rather than a second copy of column 1 —
 * two identical cells is a wasted exhibit, and it sends the reader hunting for
 * a difference that is not there. The mono dash keeps the box top aligned with
 * the rendered columns beside it.
 */
function ColumnNote({
  slot,
  children,
}: {
  slot: ColumnSlot;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Marker>{COLUMN_LABELS[slot]}</Marker>
      <div className="font-mono text-[10px] leading-tight text-muted-foreground">
        &mdash;
      </div>
      <div className="rounded-lg border border-dashed bg-background p-4 text-sm text-muted-foreground">
        {children}
      </div>
    </div>
  );
}

/** A sub-label inside a column: rest beside hover, empty beside filled. */
function Pose({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
        {label}
      </div>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Reference furniture (slide 1 and the ruled hover entries)          */
/* ------------------------------------------------------------------ */

/** A row of reference poses, each keeping its own column so widths compare. */
function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap items-start gap-4">{children}</div>;
}

/** One reference pose: a free label, its class string, and the exhibit. */
function Candidate({
  label,
  classes,
  children,
}: {
  label: string;
  classes?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-[16rem] flex-1 space-y-2">
      <Marker>{label}</Marker>
      {classes !== undefined && (
        <div className="font-mono text-[10px] leading-tight text-muted-foreground">
          {classes}
        </div>
      )}
      <div className="rounded-lg border bg-background p-4">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  1 — the settled coloured borders                                   */
/*                                                                     */
/*  Reference only, no ruling: each of these was decided on the fixed   */
/*  rendering and is what the rest of the review is measured against.   */
/* ------------------------------------------------------------------ */

/** The registration form's real marketing consent, `auth.register.*`. */
const CONSENT_LABEL = "School of Gaming may send me news and offers by email.";
const CONSENT_HINT = "Optional — you can change this anytime in your settings.";

/**
 * `src/components/ui/checkbox-row.tsx`, drawn with the *ruled* checked state.
 * The live variant still says `border-primary bg-primary/5`; direction 28 ruled
 * the wash out and the neutral `bg-accent` lift in, and the wiring change
 * carries it to all 22 selection-ground call sites.
 */
function ConsentRow({ checked }: { checked: boolean }) {
  return (
    <span
      className={cn(
        "flex items-start gap-3 rounded-md border p-3 text-sm",
        checked ? "border-primary bg-accent" : "border-input",
      )}
    >
      <span
        className={cn(
          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border",
          checked
            ? "border-primary bg-primary text-primary-foreground"
            : "border-input",
        )}
      >
        {checked && <Check className="h-3 w-3" strokeWidth={3} aria-hidden />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block">{CONSENT_LABEL}</span>
        <span className="mt-1 block text-xs text-info">{CONSENT_HINT}</span>
      </span>
    </span>
  );
}

/**
 * `src/components/voice/ZoneList.tsx`. The current zone wears the zone's own
 * colour: `.zone-glow` already binds `--glow-color`, so one arbitrary-value
 * class colours the edge to match every zone with no per-colour class list.
 */
const ZONE_SAMPLES = [
  {
    name: "Redstone lab",
    color: "red",
    Icon: VOICE_ZONE_ICONS.wrench,
    current: true,
  },
  {
    name: "Build site",
    color: "cyan",
    Icon: VOICE_ZONE_ICONS.pickaxe,
    current: true,
  },
  {
    name: "Adventure party",
    color: "violet",
    Icon: VOICE_ZONE_ICONS.swords,
    current: true,
  },
  {
    name: "Lobby",
    color: "sky",
    Icon: VOICE_ZONE_ICONS.rocket,
    current: false,
  },
] as const;

function ZoneCard({
  name,
  color,
  Icon,
  current,
}: {
  name: string;
  color: keyof typeof VOICE_ZONE_COLORS;
  Icon: LucideIcon;
  current: boolean;
}) {
  const classes = VOICE_ZONE_COLORS[color];
  return (
    <div
      className={cn(
        "rounded-xl border px-3 py-2.5",
        current
          ? cn(classes.glow, "border-[var(--glow-color)]")
          : "border-border",
      )}
    >
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-lg",
            classes.tile,
          )}
        >
          <Icon className={cn("h-5 w-5", classes.glyph)} aria-hidden />
        </span>
        <span className="flex-1 truncate text-sm font-medium">{name}</span>
      </div>
    </div>
  );
}

/** The Live chip, `src/components/family/enrollment-tones.ts` → `liveBadge`. */
function LiveChip() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-yty-glow-strong bg-muted px-2 py-0 text-[10px] font-semibold uppercase tracking-wide text-yty-glow-soft">
      <Radio className="h-3 w-3" aria-hidden />
      Live
    </span>
  );
}

/**
 * The ignition ring, `src/components/family/EnrollmentCard.tsx`. A painted
 * overlay inside the card's own bounds — gradient span at `inset-0`, `bg-card`
 * cover at `inset-[2px]`, both under the content — so lighting it moves nothing.
 * The 1px border class survives both states and only swaps colour.
 */
function IgnitionCard({
  lit,
  edgeClassName,
  lifted,
}: {
  lit: boolean;
  /** Overrides the card's own edge — how slide 2 paints a hover statically. */
  edgeClassName?: string;
  lifted?: boolean;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border bg-card text-card-foreground shadow-sm",
        edgeClassName ?? (lit ? "border-transparent" : "border-border"),
        lifted && "shadow-lg",
      )}
    >
      {lit && (
        <span aria-hidden className="pointer-events-none absolute inset-0">
          <span className="absolute inset-0 bg-gradient-to-r from-yty-glow-strong to-yty-glow-soft" />
          <span className="absolute inset-[2px] rounded-md bg-card" />
        </span>
      )}
      <div className="relative flex items-start justify-between gap-2 p-5">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Club
          </p>
          <p className="text-lg font-semibold leading-tight">
            Minecraft Builders — Tuesdays
          </p>
          <p className="text-sm text-muted-foreground">Aino · 18:00–19:30</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {lit && <LiveChip />}
          <ChevronRight
            className="h-5 w-5 text-muted-foreground"
            aria-hidden
          />
        </div>
      </div>
    </div>
  );
}

/**
 * `src/components/voice/ZoneColorPicker.tsx`. Selected vs unselected was
 * `border-foreground` vs `border-transparent` — both dead before the fix, so the
 * selected state was literally indistinguishable in a mod-only picker. The
 * unselected swatch also carries `hover:border-foreground/40`, which is why this
 * component is reused on slide 2's inventory.
 */
const PICKER_SWATCHES = [
  "red",
  "amber",
  "green",
  "teal",
  "sky",
  "violet",
  "pink",
] as const;

function ZoneColorPickerRow({
  selected,
  unselectedClassName = "border-transparent",
}: {
  selected: string;
  unselectedClassName?: string;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {PICKER_SWATCHES.map((key) => {
        const isSelected = key === selected;
        return (
          <span
            key={key}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-lg border",
              VOICE_ZONE_COLORS[key].solid,
              isSelected ? "border-foreground" : unselectedClassName,
            )}
          >
            {isSelected && (
              <Check
                className="h-4 w-4 text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.55)]"
                aria-hidden
              />
            )}
          </span>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  2 — borders that appear on hover: the complete inventory           */
/*                                                                     */
/*  Every one of the 31 prefixed border utilities in `src/` is drawn    */
/*  or named here, grouped by construct. Ruled entries render as        */
/*  reference poses; open ones take the three columns.                  */
/* ------------------------------------------------------------------ */

/**
 * `src/components/admin/products/sections/*.tsx` — the radio/checkbox option
 * row that carries `hover:border-foreground/30`. Nine of the thirteen open gray
 * instances are this exact shape, all on the admin product form.
 */
function AdminOptionRow({
  edgeClassName,
  hovered,
}: {
  edgeClassName: string;
  hovered?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-md border p-3 text-sm",
        edgeClassName,
        hovered && "bg-accent",
      )}
    >
      <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-input" />
      <span className="min-w-0 flex-1">
        <span className="block font-medium">Everyone, no region lock</span>
        <span className="mt-1 block text-xs text-muted-foreground">
          Families in any country can sign up.
        </span>
      </span>
    </div>
  );
}

/**
 * `src/components/admin/dashboard/users-strip.tsx` and
 * `product-attention-grid.tsx` — the other four gray instances, a dashboard
 * strip row rather than a form option. Same class pair, different construct, so
 * it is drawn rather than folded into the row above.
 */
function AdminStripRow({
  edgeClassName,
  hovered,
}: {
  edgeClassName: string;
  hovered?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-lg border bg-card px-4 py-3",
        edgeClassName,
        hovered && "bg-accent",
      )}
    >
      <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full">
        <Identicon id="e067379f-6728-4677-a067-6a2560da213a" size={32} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">Väinö Korhonen</p>
        <p className="truncate text-xs text-muted-foreground">
          Joined 2 days ago
        </p>
      </div>
      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
    </div>
  );
}

/**
 * `src/components/chat/ChatReactionRow.tsx` — the reaction pill. Its unselected
 * state carries `hover:border-border` over a rest edge that is already
 * `border-border`: a prefixed border utility that changes nothing. Listed for
 * completeness, and because the wiring change can simply delete it.
 */
function ChatReactionPills({
  unselectedClassName,
}: {
  unselectedClassName: string;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      <span className="inline-flex items-center gap-1 rounded-full border border-primary bg-primary/15 px-2 py-0.5 text-xs leading-none text-primary">
        <span aria-hidden className="text-xl leading-none">
          {CHAT_REACTION_GLYPHS.thumbs_up}
        </span>
        <span className="tabular-nums">3</span>
      </span>
      <span
        className={cn(
          "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs leading-none",
          unselectedClassName,
        )}
      >
        <span aria-hidden className="text-xl leading-none">
          {CHAT_REACTION_GLYPHS.celebrate}
        </span>
        <span className="tabular-nums">1</span>
      </span>
    </div>
  );
}

/**
 * `src/components/public/products/browse-card-shell.tsx` — the shop card. A
 * public, mobile-first surface, which is where the hover principle bites: the
 * amber lift only ever existed for a cursor, and it never rendered even there.
 * The same three utilities cover `hover:`, `focus-within:` and `active:` — the
 * `active:` half is the touch acknowledgement, so this construct is the one
 * place a prefixed amber edge does reach a phone.
 */
function BrowseCard({
  edgeClassName,
  lifted,
}: {
  edgeClassName: string;
  lifted?: boolean;
}) {
  return (
    <div
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-lg border bg-card text-card-foreground shadow-sm",
        edgeClassName,
        lifted && "shadow-lg",
      )}
    >
      <div className="flex h-20 items-center justify-center bg-muted text-xs uppercase tracking-wider text-muted-foreground">
        School of Gaming
      </div>
      <div className="space-y-2 p-4">
        <p className="text-base font-semibold leading-tight">
          Minecraft Builders
        </p>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Online
        </p>
        <div className="mt-auto flex items-center justify-between gap-6 border-t pt-3">
          <span className="text-base font-semibold text-foreground">
            €39 / month
          </span>
          <span className="inline-flex shrink-0 items-center gap-0.5 text-sm font-medium text-primary">
            View
            <ChevronRight className="h-4 w-4" aria-hidden />
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * `src/components/public/products/product-browse-filters.tsx` — the shop's
 * filter chips. The selected chip is a solid amber fill; the unselected one
 * carries the amber hover edge this slide asks about. No state edge to fight,
 * which is why direction 34 left these open.
 */
function FilterChipRow({ restEdge }: { restEdge: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-primary bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-sm">
        Clubs
      </span>
      {["Camps", "Events", "Online"].map((label) => (
        <span
          key={label}
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-full border bg-background px-3 py-1.5 text-xs font-medium text-foreground/80",
            restEdge,
          )}
        >
          {label}
        </span>
      ))}
    </div>
  );
}

/**
 * The dashed "add" affordance, three sites with one recipe:
 * `src/components/public/products/signup-panel-view.tsx` (set-location and
 * add-gamer) and `src/components/parent/parent-dashboard-page-body.tsx`
 * (add-gamer). All three go amber on hover; the parent one repeats it on
 * `focus-visible:`.
 */
function DashedAddButton({
  edgeClassName,
  hovered,
  icon: Icon,
  label,
}: {
  edgeClassName: string;
  hovered?: boolean;
  icon: LucideIcon;
  label: string;
}) {
  return (
    <div
      className={cn(
        "flex w-full items-center justify-center gap-2 rounded-md border border-dashed px-3 py-2 text-sm font-medium",
        edgeClassName,
        hovered ? "bg-accent text-foreground" : "text-muted-foreground",
      )}
    >
      <Icon className="h-4 w-4" aria-hidden />
      {label}
    </div>
  );
}

/**
 * `src/components/family/ProfileTiles.tsx` — the add-profile tile. The one
 * prefixed amber site the tint ban actually reaches: its hover pairs
 * `group-hover:border-primary` with `group-hover:bg-primary/5`, and a washed
 * brand ground is ruled bound (direction 27), so column 2 is a real edit rather
 * than a restatement of column 1.
 */
function AddProfileTile({
  edgeClassName,
  groundClassName,
  glyphClassName,
}: {
  edgeClassName: string;
  groundClassName?: string;
  glyphClassName: string;
}) {
  return (
    <div className="flex w-20 flex-col items-center gap-2">
      <div
        className={cn(
          "relative aspect-square w-full overflow-hidden rounded-lg border-2 border-dashed",
          edgeClassName,
          groundClassName,
        )}
      >
        <div className="absolute inset-0 flex items-center justify-center">
          <Plus className={cn("h-8 w-8", glyphClassName)} strokeWidth={1.5} />
        </div>
      </div>
      <span className="whitespace-nowrap text-center text-xs font-medium text-muted-foreground">
        Add a gamer
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  3 — form validation                                                */
/* ------------------------------------------------------------------ */

/** `auth.common.password`, `auth.login.passwordPlaceholder`, `auth.login.errors.invalidCredentials`. */
const FIELD_LABEL = "Password";
const FIELD_PLACEHOLDER = "Enter your password";
const FIELD_ERROR = "The email or password you entered is incorrect.";

/**
 * The login card's field, reproduced from `src/components/ui/input.tsx` plus
 * `src/components/ui/field.tsx`'s label, with the form-level error block the
 * five auth forms all render. The block is borderless and sits *above* the
 * fields; nothing in the app puts an edge on the field itself.
 */
function LoginField({
  inputClassName,
  labelClassName,
}: {
  inputClassName: string;
  labelClassName?: string;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
        {FIELD_ERROR}
      </div>
      <div className="space-y-2">
        <div className={cn("text-sm font-medium", labelClassName)}>
          {FIELD_LABEL}
        </div>
        <div
          className={cn(
            "flex h-10 w-full items-center rounded-md border bg-background px-3 py-2 text-base text-muted-foreground",
            inputClassName,
          )}
        >
          {FIELD_PLACEHOLDER}
        </div>
      </div>
    </div>
  );
}

/** `src/components/pin/pin-pad.tsx` — the one place destructive draws an edge. */
function PinDots({ tone }: { tone: "filled" | "error" | "empty" }) {
  return (
    <div className="flex gap-5">
      {[0, 1, 2, 3].map((i) => (
        <span
          key={i}
          className={cn(
            "h-4 w-4 rounded-full border-2",
            tone === "error"
              ? "border-destructive bg-destructive"
              : tone === "filled"
                ? "border-primary bg-primary"
                : "border-muted-foreground/40",
          )}
        />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  4 — status banners and alerts                                      */
/* ------------------------------------------------------------------ */

/**
 * `src/components/ui/alert.tsx` — the four toned variants. As authored every
 * one is `border-X/50 bg-X/10 text-X`; the wash under full-value ink is already
 * ruled bound (direction 27, `bg-muted` replacement approved), so columns 2 and
 * 3 carry the ruled ground and vary only the edge.
 */
const ALERT_VARIANTS = [
  {
    tone: "destructive",
    icon: TriangleAlert,
    shipped: "border-destructive/50 bg-destructive/10 text-destructive",
    full: "border-destructive bg-muted text-destructive",
    neutral: "border-border bg-muted text-destructive",
    body: "We couldn’t take the payment for this club.",
  },
  {
    tone: "warning",
    icon: TriangleAlert,
    shipped: "border-warning/50 bg-warning/10 text-warning",
    full: "border-warning bg-muted text-warning",
    neutral: "border-border bg-muted text-warning",
    body: "This session has no Gedu assigned yet.",
  },
  {
    tone: "success",
    icon: Check,
    shipped: "border-success/50 bg-success/10 text-success",
    full: "border-success bg-muted text-success",
    neutral: "border-border bg-muted text-success",
    body: "Your child’s place is confirmed.",
  },
  {
    tone: "info",
    icon: Info,
    shipped: "border-info/50 bg-info/10 text-info",
    full: "border-info bg-muted text-info",
    neutral: "border-border bg-muted text-info",
    body: "Sessions pause during the school holidays.",
  },
] as const;

function AlertStack({
  variantKey,
}: {
  variantKey: "shipped" | "full" | "neutral";
}) {
  return (
    <div className="space-y-2">
      {ALERT_VARIANTS.map((variant) => (
        <div
          key={variant.tone}
          className={cn(
            "relative flex items-start gap-3 rounded-lg border p-3 text-sm",
            variant[variantKey],
          )}
        >
          <variant.icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>{variant.body}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * `src/components/gedu/gedu-next-step-notice.tsx`, real copy from
 * `gedu.contract.notice`. A `border-2` notice — the loudest bordered surface in
 * the app, and one a gedu is meant to act on.
 */
function GeduNextStepNotice({ edgeClassName }: { edgeClassName: string }) {
  return (
    <div
      className={cn(
        "flex items-start gap-4 rounded-lg border-2 p-5",
        edgeClassName,
      )}
    >
      <TriangleAlert className="mt-0.5 h-6 w-6 shrink-0 text-warning" aria-hidden />
      <div className="min-w-0 space-y-1">
        <p className="text-lg font-bold text-warning">
          You haven&rsquo;t accepted your Gedu contract
        </p>
        <p className="text-sm text-foreground">
          Reading and accepting the terms you work under is mandatory. It takes a
          couple of minutes.
        </p>
        <p className="inline-flex items-center gap-1.5 pt-1 text-sm font-medium text-warning">
          Read and accept the contract
          <ChevronRight className="h-4 w-4" aria-hidden />
        </p>
      </div>
    </div>
  );
}

/**
 * `src/components/public/products/signup-panel-view.tsx` — the region-lock
 * block a parent meets on a product page. Real copy from
 * `productDetail.signupPanel.regionLock.wrongCountry`.
 */
function RegionLockNotice({ edgeClassName }: { edgeClassName: string }) {
  return (
    <div className={cn("flex items-start gap-3 rounded-md border p-4", edgeClassName)}>
      <Globe className="mt-0.5 h-5 w-5 shrink-0 text-info" aria-hidden />
      <p className="text-sm text-foreground">
        This product is only offered in one country:{" "}
        <span className="font-semibold">Finland</span>.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  5 — outline chips and badges                                       */
/* ------------------------------------------------------------------ */

/**
 * `src/components/public/products/status-chip.tsx` — the shared outline chip.
 * Its four tones are the census's cleanest example of the mixed authoring: one
 * full value, two tinted, one neutral, in a single map.
 */
const CHIP_TONES = [
  {
    tone: "primary",
    label: "Free",
    shipped: "border-primary text-primary",
    full: "border-primary text-primary",
    neutral: "border-border text-primary",
  },
  {
    tone: "warning",
    label: "Full",
    shipped: "border-warning/50 text-warning",
    full: "border-warning text-warning",
    neutral: "border-border text-warning",
  },
  {
    tone: "info",
    label: "Waitlist",
    shipped: "border-info/40 text-info",
    full: "border-info text-info",
    neutral: "border-border text-info",
  },
  {
    tone: "muted",
    label: "Online",
    shipped: "border-border text-muted-foreground",
    full: "border-border text-muted-foreground",
    neutral: "border-border text-muted-foreground",
  },
] as const;

function ChipRow({
  variantKey,
}: {
  variantKey: "shipped" | "full" | "neutral";
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {CHIP_TONES.map((chip) => (
        <span
          key={chip.tone}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-1 text-base font-medium",
            chip[variantKey],
          )}
        >
          {chip.label}
        </span>
      ))}
    </div>
  );
}

/**
 * The three other outline badges the census turns up, each from a different
 * surface: the newcomer star (`src/components/member-flair/NewcomerBadge.tsx`),
 * the session-feed alert badge
 * (`src/components/gedu/session-feed/SessionFeedAlertBadge.tsx`) and the feed's
 * now-divider pill (`src/components/session-feed/NowDivider.tsx`).
 */
function BadgeRow({
  variantKey,
}: {
  variantKey: "shipped" | "full" | "neutral";
}) {
  const edges = {
    shipped: {
      newcomer: "border-success/40 bg-success/15 text-success",
      alert: "border-warning/50 bg-warning/10 text-warning",
      now: "border-info/40 bg-info/10 text-info",
    },
    full: {
      newcomer: "border-success bg-muted text-success",
      alert: "border-warning bg-muted text-warning",
      now: "border-info bg-muted text-info",
    },
    neutral: {
      newcomer: "border-border bg-muted text-success",
      alert: "border-border bg-muted text-warning",
      now: "border-border bg-muted text-info",
    },
  }[variantKey];

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className={cn(
          "inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0 text-[10px] font-medium leading-4",
          edges.newcomer,
        )}
      >
        <Star className="h-3 w-3" aria-hidden />
        New
      </span>
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold",
          edges.alert,
        )}
      >
        <TriangleAlert className="h-3.5 w-3.5" aria-hidden />
        Needs a report
      </span>
      <span
        className={cn(
          "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wider",
          edges.now,
        )}
      >
        <ChevronUp className="h-4 w-4" aria-hidden />3 more upcoming sessions
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  6 — the Yty accent edges                                           */
/* ------------------------------------------------------------------ */

/**
 * The icon-accent tile, from `src/components/home/home-page-body.tsx`'s
 * `FEATURE_ACCENTS_RULED` and the same recipe in
 * `src/lib/constants/yty.ts`. Titles are the real `home.features.*.title`
 * strings, in the palette's display order (harmony pink, glow green, valor
 * orange, wit blue).
 *
 * The finding this slide exists for: the tile was approved on the home review
 * with its `/30` edge **dead**, so the look the owner signed off was tint ground
 * plus a quiet neutral edge — which is column 3 here, not column 1.
 */
const FEATURE_TILES = [
  {
    key: "minecraftClubs",
    title: "Every session has a Gedu",
    icon: Gamepad2,
    shipped: "border-yty-harmony-strong/30 bg-yty-harmony-strong/10",
    full: "border-yty-harmony-strong bg-yty-harmony-strong/10",
    neutral: "border-border bg-yty-harmony-strong/10",
    glyph: "text-yty-harmony-soft",
  },
  {
    key: "screenTime",
    title: "Designed to build real skills",
    icon: Sparkles,
    shipped: "border-yty-glow-strong/30 bg-yty-glow-strong/10",
    full: "border-yty-glow-strong bg-yty-glow-strong/10",
    neutral: "border-border bg-yty-glow-strong/10",
    glyph: "text-yty-glow-soft",
  },
  {
    key: "newFriends",
    title: "New friends, real connections",
    icon: Users,
    shipped: "border-yty-valor-strong/30 bg-yty-valor-strong/10",
    full: "border-yty-valor-strong bg-yty-valor-strong/10",
    neutral: "border-border bg-yty-valor-strong/10",
    glyph: "text-yty-valor-soft",
  },
  {
    key: "parents",
    title: "Parents are part of it",
    icon: Shield,
    shipped: "border-yty-wit-strong/30 bg-yty-wit-strong/10",
    full: "border-yty-wit-strong bg-yty-wit-strong/10",
    neutral: "border-border bg-yty-wit-strong/10",
    glyph: "text-yty-wit-soft",
  },
] as const;

function FeatureTileColumn({
  variantKey,
}: {
  variantKey: "shipped" | "full" | "neutral";
}) {
  return (
    <div className="space-y-3">
      {FEATURE_TILES.map((tile) => (
        <div
          key={tile.key}
          className="rounded-lg border bg-card/50 p-4 text-card-foreground"
        >
          <div className="flex items-center gap-4">
            <div
              className={cn(
                "flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border",
                tile[variantKey],
              )}
            >
              <tile.icon className={cn("h-6 w-6", tile.glyph)} aria-hidden />
            </div>
            <p className="min-w-0 text-base font-semibold leading-tight">
              {tile.title}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  7 — card edges at rest                                             */
/* ------------------------------------------------------------------ */

/**
 * `src/components/gedu/GeduAssignmentCard.tsx` — the live assignment card. As
 * authored it carries `border-primary` plus a `from-primary/5` wash, and the
 * wash half is already ruled out; only the edge is open.
 */
function GeduCard({
  edgeClassName,
  washClassName,
}: {
  edgeClassName: string;
  washClassName?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-lg border bg-card p-5 text-card-foreground shadow-sm",
        edgeClassName,
        washClassName,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 space-y-1">
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Club
          </p>
          <p className="text-lg font-semibold leading-tight">
            Minecraft Builders
          </p>
          <p className="flex flex-wrap items-center gap-x-2 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">Tuesday group</span>
            <span className="inline-flex items-center gap-1 tabular-nums before:mr-1 before:text-muted-foreground/50 before:content-['·']">
              <Users className="h-3.5 w-3.5" aria-hidden />8 gamers
            </span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full border border-success/50 bg-success/10 px-2 py-0 text-[10px] font-semibold uppercase tracking-wide text-success">
            <Radio className="h-3 w-3" aria-hidden />
            Live
          </span>
          <ChevronRight className="h-5 w-5 text-muted-foreground" aria-hidden />
        </div>
      </div>
    </div>
  );
}

/**
 * `src/components/admin/dashboard/week-rows.tsx` — today's row in the admin
 * week strip. An admin surface, so the colour-budget principle (family and gedu
 * surfaces lean colourful, admin leans restrained) weighs here and not on the
 * card above.
 */
function WeekRow({
  edgeClassName,
  label,
  date,
  muted,
}: {
  edgeClassName: string;
  label: string;
  date: string;
  muted?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-2 rounded-lg border p-2 sm:flex-row sm:gap-3",
        edgeClassName,
      )}
    >
      <div className="flex shrink-0 items-baseline gap-2 px-1 sm:w-24 sm:flex-col sm:items-start sm:gap-0">
        <span
          className={cn(
            "text-sm font-semibold",
            muted ? "text-muted-foreground" : "text-foreground",
          )}
        >
          {label}
        </span>
        <span className="text-xs tabular-nums text-muted-foreground">
          {date}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="flex items-center gap-1.5 rounded border border-border py-1 pl-1.5 pr-2 text-xs leading-tight">
          <Gamepad2 className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
          Minecraft Builders
        </span>
        <span className="flex items-center gap-1.5 rounded border border-border py-1 pl-1.5 pr-2 text-xs leading-tight">
          <Sparkles className="h-3.5 w-3.5 shrink-0 text-info" aria-hidden />
          Roblox Creators
        </span>
      </div>
    </div>
  );
}

/**
 * `src/components/chat/ChatReply.tsx` — the quoted-message snippet. A leading
 * bar rather than a box: the edge *is* the construct here, which is the same
 * argument that kept the Live chip and the selection row coloured. Already full
 * value on the branch, so columns 1 and 2 agree.
 */
function ChatQuote({ barClassName }: { barClassName: string }) {
  return (
    <div className="space-y-1">
      <span
        className={cn(
          "flex w-full items-start gap-1.5 rounded border-l-2 bg-muted/60 px-2 py-1 text-left text-xs",
          barClassName,
        )}
      >
        <span className="flex min-w-0 flex-1 gap-1 overflow-hidden">
          <span className="shrink-0 font-medium text-primary">Aino</span>
          <span className="truncate text-muted-foreground">
            can we build the redstone door next week
          </span>
        </span>
      </span>
      <p className="text-sm">Yes! Bring your plan and we&rsquo;ll start there.</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  8 — rings                                                          */
/*                                                                     */
/*  `ring-*` draws with box-shadow, so none of these was affected by   */
/*  the layer bug: every one of the 22 ring instances has been on      */
/*  screen since it was written. Changing one is a visible change, and */
/*  the slide says so rather than pretending it is a no-op.            */
/* ------------------------------------------------------------------ */

/**
 * Real generated UUIDs, hardcoded: the identicon is derived from the id's hex
 * bytes, so a readable stand-in renders a degenerate grid rather than a
 * different face — and generating one at render time would give the same person
 * a new face on every reload.
 */
const PROFILE_FIXTURES = [
  { id: "8571449a-ab28-49cc-8560-a28dc2a84f9e", name: "Aino" },
  { id: "e067379f-6728-4677-a067-6a2560da213a", name: "Väinö" },
  { id: "f97ef16a-1c80-42b1-b542-7abbe073a171", name: "Sofia" },
] as const;

/**
 * `src/components/family/ProfileTiles.tsx` — the family switcher. The active
 * tile is `border-transparent ring-4 ring-primary`; the inactive ones hold a
 * *zero-width* `ring-primary/50` that the hover widens to 4 while dropping the
 * border to transparent. `restRingWidth` is what lets slide 2 draw that swap
 * honestly (rest at `ring-0`, hover at `ring-4`) while slide 8 draws the rest
 * ring at `ring-2` so its colour can be judged at all.
 */
function ProfileTileRow({
  activeRing,
  restRing,
  restRingWidth = "ring-2",
  restBorder = "border-border",
}: {
  activeRing: string;
  restRing: string;
  restRingWidth?: string;
  restBorder?: string;
}) {
  return (
    <div className="flex flex-wrap gap-4">
      {PROFILE_FIXTURES.map((member, index) => {
        const isActive = index === 0;
        return (
          <div key={member.id} className="flex w-20 flex-col items-center gap-2">
            <div
              className={cn(
                "relative aspect-square w-full overflow-hidden rounded-lg border-2 ring-offset-2 ring-offset-background",
                isActive
                  ? cn("border-transparent ring-4", activeRing)
                  : cn(restBorder, restRingWidth, restRing),
              )}
            >
              <Identicon id={member.id} size={80} />
            </div>
            <span
              className={cn(
                "whitespace-nowrap text-center text-xs font-medium",
                isActive ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {member.name}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * `src/components/voice/VoiceAvatar.tsx` (the local participant's own tile) and
 * `src/components/calendar/session-calendar-view.tsx` (today's date cell). Both
 * are quiet "this one is you / this one is now" marks rather than selections.
 */
function QuietRingRow({
  avatarRing,
  todayRing,
}: {
  avatarRing: string;
  todayRing: string;
}) {
  return (
    <div className="flex items-center gap-6">
      <div
        className={cn(
          "relative h-11 w-11 overflow-hidden rounded-md border-2 border-border",
          avatarRing,
        )}
      >
        <Identicon id={PROFILE_FIXTURES[0].id} size={44} />
      </div>
      <div className="flex items-center gap-1">
        {[14, 15, 16].map((day) => (
          <span
            key={day}
            className={cn(
              "relative mx-auto flex h-7 w-7 items-center justify-center rounded-full text-xs tabular-nums",
              day === 15
                ? cn("text-muted-foreground/70", todayRing)
                : day === 16
                  ? "bg-primary font-semibold text-primary-foreground"
                  : "text-muted-foreground/70",
            )}
          >
            {day}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function DesignPassBordersPage() {
  return (
    <div className="space-y-8">
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3">
        <p className="max-w-prose text-sm text-foreground">
          <span className="font-semibold text-destructive">Temporary</span> —
          review aid for the brand design pass, deleted before merge.
        </p>
      </div>

      <div className="space-y-2">
        <h1 className="text-3xl font-semibold">Brand design pass — borders</h1>
        <p className="max-w-prose text-muted-foreground">
          Every coloured border in the app was dead from the initial commit until
          the layer fix on this branch, so all 160 instances below are rendering
          for the first time. One slide per construct context, each drawing the
          real thing in three columns — ships now, design updated, neutral
          proposal. Colour is at{" "}
          <DeckLink href="/admin/design-pass-walkthrough">
            /admin/design-pass-walkthrough
          </DeckLink>
          , type at{" "}
          <DeckLink href="/admin/design-pass-typography">
            /admin/design-pass-typography
          </DeckLink>
          .
        </p>
      </div>

      <nav className="rounded-lg border p-4">
        <ol className="flex flex-wrap gap-x-2 gap-y-2">
          {SLIDES.map((slide, index) => (
            <li key={slide.id}>
              <a
                href={`#${slide.id}`}
                className="inline-flex items-baseline gap-2 rounded-md border px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground"
              >
                <span className="tabular-nums text-muted-foreground">
                  {index + 1}
                </span>
                <span>{slide.title}</span>
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {/* ----------------------------------------------------------- 1 */}
      <Slide id="settled">
        <Row>
          <Candidate
            label="Selection edge"
            classes="border-primary bg-accent / border-input"
          >
            <div className="space-y-2">
              <ConsentRow checked={false} />
              <ConsentRow checked />
            </div>
          </Candidate>
          <Candidate
            label="Current voice zone"
            classes="zone-glow [--glow-color:…] border-[var(--glow-color)] / border-border"
          >
            <div className="space-y-2 rounded-lg border bg-card p-3">
              {ZONE_SAMPLES.map((zone) => (
                <ZoneCard key={zone.name} {...zone} />
              ))}
            </div>
          </Candidate>
        </Row>

        <Row>
          <Candidate
            label="Ignition ring and Live chip"
            classes="border-transparent + inset-0 bg-gradient-to-r from-yty-glow-strong to-yty-glow-soft"
          >
            <div className="space-y-3">
              <IgnitionCard lit={false} />
              <IgnitionCard lit />
            </div>
          </Candidate>
          <Candidate
            label="Zone picker selection"
            classes="border-foreground / border-transparent"
          >
            <div className="space-y-3">
              <ZoneColorPickerRow selected="violet" />
              <ZoneColorPickerRow selected="amber" />
            </div>
          </Candidate>
        </Row>

        <Annotation>
          checkbox-row.tsx · ZoneList.tsx + ZoneDialog.tsx · EnrollmentCard.tsx +
          enrollment-tones.ts · ZoneColorPicker.tsx + ZoneIconPicker.tsx — 12 of
          the 160 instances
        </Annotation>

        <Caption>
          These five are already ruled; every decision the review still has to
          make is posed in the three-column grids on the slides that follow.
        </Caption>
      </Slide>

      {/* ----------------------------------------------------------- 2 */}
      <Slide id="hover">
        <Annotation>
          31 prefixed border utilities on 27 source lines in 19 files —
          hover: · focus: · focus-visible: · focus-within: · group-hover: ·
          active:. Every file is drawn or named below. Hover and focus are
          painted statically, because the question is how rest and hover read
          against each other.
        </Annotation>

        <ConstructHeading
          label="State-bearing cards — the crash that produced the rule"
          status="Ruled — applied on this branch"
        />
        <Row>
          <Candidate
            label="At rest — the card's own state edge"
            classes="border-transparent + the glow ignition ring"
          >
            <IgnitionCard lit />
          </Candidate>
          <Candidate
            label="Hover, as it shipped between the layer fix and the ruling"
            classes="hover:border-primary hover:shadow-lg"
          >
            <IgnitionCard lit edgeClassName="border-primary" lifted />
          </Candidate>
          <Candidate
            label="Hover, as ruled and now applied"
            classes="hover:border-foreground/30 focus-within:border-foreground/30 hover:shadow-lg"
          >
            <IgnitionCard lit edgeClassName="border-foreground/30" lifted />
          </Candidate>
        </Row>
        <Annotation>
          enrollment-tones.ts (OPENABLE, 1 hover + 1 focus-within) ·
          GeduAssignmentCard.tsx (1 hover + 1 focus-within) — 4 of the 31
        </Annotation>
        <Caption>
          Two meanings fighting over one border: the amber lift did not sit
          beside the green state edge, it replaced it.
        </Caption>

        <ConstructHeading
          label="Admin option rows and dashboard strips"
          status="Neutral idiom"
        />
        <Exhibit>
          <Column
            slot="ships-now"
            classes="rest: border-input / border-border · hover:border-foreground/30 hover:bg-accent"
          >
            <div className="space-y-4">
              <Pose label="Rest">
                <AdminOptionRow edgeClassName="border-input" />
              </Pose>
              <Pose label="Hover">
                <AdminOptionRow edgeClassName="border-foreground/30" hovered />
              </Pose>
              <Pose label="Strip row, hover">
                <AdminStripRow edgeClassName="border-foreground/30" hovered />
              </Pose>
            </div>
          </Column>
          <ColumnNote slot="updated">
            Identical to column 1. <code>foreground</code> is the app&rsquo;s own
            ink, not a brand token, so it composites to a mid-gray and the tint
            ban does not reach it — no standing ruling changes these 13.
          </ColumnNote>
          <Column
            slot="neutral"
            classes="rest: border-input / border-border · hover:bg-accent (no border class)"
          >
            <div className="space-y-4">
              <Pose label="Rest">
                <AdminOptionRow edgeClassName="border-input" />
              </Pose>
              <Pose label="Hover">
                <AdminOptionRow edgeClassName="border-input" hovered />
              </Pose>
              <Pose label="Strip row, hover">
                <AdminStripRow edgeClassName="border-border" hovered />
              </Pose>
            </div>
          </Column>
        </Exhibit>
        <Annotation>
          when-section.tsx (2) · billing-section.tsx (2) · audience-section.tsx
          (2) · spoken-language-radios.tsx · registration-section.tsx ·
          region-lock-radios.tsx · holiday-calendar-option.tsx · week-rows.tsx ·
          users-strip.tsx · product-attention-grid.tsx — 13 instances across 11
          files, every one of them admin
        </Annotation>
        <Ruling>
          Gray hover lifts — keep the edge change as authored (column 2), or
          drop the border class and let the ground lift carry it (column 3).
          (recommended: column 2 — it is the neutral idiom, it is what the ruled
          state-bearing cards now use too, and the tint ban does not reach a
          non-brand token)
        </Ruling>

        <ConstructHeading
          label="Zone colour picker — the unselected swatch"
          status="Neutral idiom"
        />
        <Exhibit>
          <Column
            slot="ships-now"
            classes="border-transparent hover:border-foreground/40"
          >
            <div className="space-y-4">
              <Pose label="Rest">
                <ZoneColorPickerRow selected="violet" />
              </Pose>
              <Pose label="Hover on every unselected swatch">
                <ZoneColorPickerRow
                  selected="violet"
                  unselectedClassName="border-foreground/40"
                />
              </Pose>
            </div>
          </Column>
          <ColumnNote slot="updated">
            Identical to column 1 — the same non-brand gray as the rows above,
            one step stronger at <code>/40</code> because it has to read against
            a solid colour swatch.
          </ColumnNote>
          <ColumnNote slot="neutral">
            No neutral proposed — the lift already is the neutral idiom, and on a
            solid swatch it is the only hover feedback there is.
          </ColumnNote>
        </Exhibit>
        <Annotation>
          ZoneColorPicker.tsx — 1 instance, mod-only surface (the selected
          <code> border-foreground</code> ring is slide 1&rsquo;s reference)
        </Annotation>

        <ConstructHeading
          label="Chat reaction pill — a hover border that changes nothing"
          status="Neutral idiom"
        />
        <Exhibit>
          <Column
            slot="ships-now"
            classes="border-border … hover:border-border hover:bg-accent"
          >
            <div className="space-y-4">
              <Pose label="Rest">
                <ChatReactionPills unselectedClassName="border-border bg-muted text-muted-foreground" />
              </Pose>
              <Pose label="Hover">
                <ChatReactionPills unselectedClassName="border-border bg-accent text-muted-foreground" />
              </Pose>
            </div>
          </Column>
          <ColumnNote slot="updated">
            Identical to column 1 by construction:{" "}
            <code>hover:border-border</code> restates the rest edge, so the
            utility draws nothing. Wiring deletes the class; the render does not
            move.
          </ColumnNote>
          <ColumnNote slot="neutral">
            No neutral proposed — it is already neutral at both ends.
          </ColumnNote>
        </Exhibit>
        <Annotation>
          ChatReactionRow.tsx — 1 instance; the selected pill&rsquo;s{" "}
          <code>border-primary bg-primary/15</code> is a washed brand ground that
          slide 5&rsquo;s chip ruling reaches, not this one
        </Annotation>

        <ConstructHeading
          label="Shop browse cards"
          status="Open"
        />
        <Exhibit>
          <Column
            slot="ships-now"
            classes="rest: border-border · hover:border-primary focus-within:border-primary active:border-primary + hover:shadow-lg"
          >
            <div className="space-y-4">
              <Pose label="Rest">
                <BrowseCard edgeClassName="border-border" />
              </Pose>
              <Pose label="Hover / focus / touch">
                <BrowseCard edgeClassName="border-primary" lifted />
              </Pose>
            </div>
          </Column>
          <Column
            slot="updated"
            classes="rest: border-primary · hover:shadow-lg (colour moved to rest)"
          >
            <div className="space-y-4">
              <Pose label="Rest">
                <BrowseCard edgeClassName="border-primary" />
              </Pose>
              <Pose label="Hover / focus / touch">
                <BrowseCard edgeClassName="border-primary" lifted />
              </Pose>
            </div>
          </Column>
          <Column
            slot="neutral"
            classes="rest: border-border · hover:shadow-lg (no colour class)"
          >
            <div className="space-y-4">
              <Pose label="Rest">
                <BrowseCard edgeClassName="border-border" />
              </Pose>
              <Pose label="Hover / focus / touch">
                <BrowseCard edgeClassName="border-border" lifted />
              </Pose>
            </div>
          </Column>
        </Exhibit>
        <Annotation>
          browse-card-shell.tsx — 3 instances (hover:, focus-within:, active:);
          the <code>active:</code> half is the touch acknowledgement, so this is
          the one prefixed amber site a phone can already reach
        </Annotation>

        <ConstructHeading label="Shop filter chips" status="Open" />
        <Exhibit stacked>
          <Column
            slot="ships-now"
            classes="rest: border-input · hover:border-primary hover:bg-accent"
          >
            <div className="space-y-4">
              <Pose label="Rest">
                <FilterChipRow restEdge="border-input" />
              </Pose>
              <Pose label="Hover">
                <FilterChipRow restEdge="border-primary bg-accent" />
              </Pose>
            </div>
          </Column>
          <Column
            slot="updated"
            classes="rest: border-primary · hover:bg-accent (colour moved to rest)"
          >
            <div className="space-y-4">
              <Pose label="Rest">
                <FilterChipRow restEdge="border-primary" />
              </Pose>
              <Pose label="Hover">
                <FilterChipRow restEdge="border-primary bg-accent" />
              </Pose>
            </div>
          </Column>
          <Column
            slot="neutral"
            classes="rest: border-input · hover:bg-accent (no colour class)"
          >
            <div className="space-y-4">
              <Pose label="Rest">
                <FilterChipRow restEdge="border-input" />
              </Pose>
              <Pose label="Hover">
                <FilterChipRow restEdge="border-input bg-accent" />
              </Pose>
            </div>
          </Column>
        </Exhibit>
        <Annotation>
          product-browse-filters.tsx — 1 instance, on a public mobile-first
          surface where a hover-only colour never reaches the audience
        </Annotation>
        <Caption>
          Column 2 is the same vibrancy spent where a phone can see it; column 1
          spends it where it cannot.
        </Caption>
        <Ruling>
          Browse cards and filter chips — move the amber to rest (column 2), keep
          it on the hover as authored (column 1), or go neutral (column 3).
          (recommended: column 2 on the chips and column 3 on the cards — a chip
          is small enough for a full amber edge to read as a control, while a
          whole card in amber at rest would say &ldquo;live&rdquo; on a shop grid
          where nothing is)
        </Ruling>

        <ConstructHeading
          label="Dashed add affordances, and the add-profile tile"
          status="Open"
        />
        <Exhibit>
          <Column
            slot="ships-now"
            classes="rest: border-dashed border-input · hover:border-primary hover:bg-accent · tile: group-hover:border-primary group-hover:bg-primary/5"
          >
            <div className="space-y-4">
              <Pose label="Rest">
                <DashedAddButton
                  edgeClassName="border-input"
                  icon={Plus}
                  label="Add a gamer"
                />
              </Pose>
              <Pose label="Hover">
                <DashedAddButton
                  edgeClassName="border-primary"
                  hovered
                  icon={Plus}
                  label="Add a gamer"
                />
              </Pose>
              <Pose label="Tile, hover">
                <AddProfileTile
                  edgeClassName="border-primary"
                  groundClassName="bg-primary/5"
                  glyphClassName="text-primary"
                />
              </Pose>
            </div>
          </Column>
          <Column
            slot="updated"
            classes="hover:border-primary hover:bg-accent · tile: group-hover:border-primary group-hover:bg-accent"
          >
            <div className="space-y-4">
              <Pose label="Rest">
                <DashedAddButton
                  edgeClassName="border-input"
                  icon={UserPlus}
                  label="Add a gamer"
                />
              </Pose>
              <Pose label="Hover">
                <DashedAddButton
                  edgeClassName="border-primary"
                  hovered
                  icon={UserPlus}
                  label="Add a gamer"
                />
              </Pose>
              <Pose label="Tile, hover — the /5 wash replaced">
                <AddProfileTile
                  edgeClassName="border-primary"
                  groundClassName="bg-accent"
                  glyphClassName="text-primary"
                />
              </Pose>
            </div>
          </Column>
          <Column
            slot="neutral"
            classes="hover:border-foreground/30 hover:bg-accent · tile: group-hover:border-foreground/30 group-hover:bg-accent"
          >
            <div className="space-y-4">
              <Pose label="Rest">
                <DashedAddButton
                  edgeClassName="border-input"
                  icon={MapPin}
                  label="Set your location"
                />
              </Pose>
              <Pose label="Hover">
                <DashedAddButton
                  edgeClassName="border-foreground/30"
                  hovered
                  icon={MapPin}
                  label="Set your location"
                />
              </Pose>
              <Pose label="Tile, hover">
                <AddProfileTile
                  edgeClassName="border-foreground/30"
                  groundClassName="bg-accent"
                  glyphClassName="text-foreground"
                />
              </Pose>
            </div>
          </Column>
        </Exhibit>
        <Annotation>
          signup-panel-view.tsx (2: set-location, add-gamer) ·
          parent-dashboard-page-body.tsx (1 hover + 1 focus-visible) ·
          ProfileTiles.tsx add tile (1 group-hover + 1 group-focus-visible) — 6
          instances, all family-facing; the tile&rsquo;s{" "}
          <code>group-hover:bg-primary/5</code> is the only washed brand ground
          in the hover census
        </Annotation>
        <Ruling>
          Dashed add affordances — keep the amber hover with the tile&rsquo;s
          wash replaced by the neutral accent lift (column 2), or go neutral
          (column 3). (recommended: column 2 — a dashed outline reads as
          &ldquo;nothing here yet&rdquo; at rest and the amber is what says it is
          a control; the <code>/5</code> wash goes either way, since it is a
          standing ruling rather than a question)
        </Ruling>

        <ConstructHeading
          label="Profile tiles — the border that disappears on hover"
          status="Open"
        />
        <Exhibit>
          <Column
            slot="ships-now"
            classes="rest: border-border ring-0 ring-primary/50 · group-hover:border-transparent group-hover:ring-4"
          >
            <div className="space-y-4">
              <Pose label="Rest">
                <ProfileTileRow
                  activeRing="ring-primary"
                  restRing="ring-primary/50"
                  restRingWidth="ring-0"
                />
              </Pose>
              <Pose label="Hover on every inactive tile">
                <ProfileTileRow
                  activeRing="ring-primary"
                  restRing="ring-primary/50"
                  restRingWidth="ring-4"
                  restBorder="border-transparent"
                />
              </Pose>
            </div>
          </Column>
          <Column
            slot="updated"
            classes="rest: border-border ring-0 ring-primary · group-hover:border-transparent group-hover:ring-4"
          >
            <div className="space-y-4">
              <Pose label="Rest">
                <ProfileTileRow
                  activeRing="ring-primary"
                  restRing="ring-primary"
                  restRingWidth="ring-0"
                />
              </Pose>
              <Pose label="Hover on every inactive tile">
                <ProfileTileRow
                  activeRing="ring-primary"
                  restRing="ring-primary"
                  restRingWidth="ring-4"
                  restBorder="border-transparent"
                />
              </Pose>
            </div>
          </Column>
          <Column
            slot="neutral"
            classes="rest: border-border ring-0 ring-border · group-hover:border-transparent group-hover:ring-4"
          >
            <div className="space-y-4">
              <Pose label="Rest">
                <ProfileTileRow
                  activeRing="ring-primary"
                  restRing="ring-border"
                  restRingWidth="ring-0"
                />
              </Pose>
              <Pose label="Hover on every inactive tile">
                <ProfileTileRow
                  activeRing="ring-primary"
                  restRing="ring-border"
                  restRingWidth="ring-4"
                  restBorder="border-transparent"
                />
              </Pose>
            </div>
          </Column>
        </Exhibit>
        <Annotation>
          ProfileTiles.tsx — 2 instances (group-hover:, group-focus-visible:),
          the only place in the app a border is removed on hover rather than
          added; the ring it hands over to is slide 8&rsquo;s question
        </Annotation>
        <Caption>
          The border is transparent only while the ring is wide, so the tile
          never carries two edges at once and never changes size.
        </Caption>
        <Ruling>
          Profile tile hover ring — full value (column 2), or neutral (column 3).
          (recommended: column 2, and it decides slide 8&rsquo;s first exhibit
          with it — the ring is the whole affordance here, and the{" "}
          <code>/50</code> tint is a shaded brand value the ban already reaches)
        </Ruling>
      </Slide>

      {/* ----------------------------------------------------------- 3 */}
      <Slide id="validation">
        <Exhibit>
          <Column slot="ships-now" classes="border-input (no edge at all)">
            <LoginField inputClassName="border-input" />
          </Column>
          <Column
            slot="updated"
            classes="border-destructive · text-destructive on the label"
          >
            <LoginField
              inputClassName="border-destructive"
              labelClassName="text-destructive"
            />
          </Column>
          <ColumnNote slot="neutral">
            No neutral proposed — a field the reader has to go back and fix is
            the one border convention every reader already knows, and neutral
            here means the form says nothing about which field failed.
          </ColumnNote>
        </Exhibit>

        <Exhibit>
          <Column
            slot="ships-now"
            classes="border-destructive bg-destructive / border-primary bg-primary / border-muted-foreground/40"
          >
            <div className="space-y-4">
              <PinDots tone="empty" />
              <PinDots tone="filled" />
              <PinDots tone="error" />
            </div>
          </Column>
          <ColumnNote slot="updated">
            Identical to column 1 — the PIN dots are already at full value on
            both tones, so nothing the standing rulings say changes them.
          </ColumnNote>
          <ColumnNote slot="neutral">
            No neutral proposed — a wrong PIN has to read as wrong, and the dot
            is too small to carry the message any other way.
          </ColumnNote>
        </Exhibit>

        <Annotation>
          input.tsx · the five forms in auth/ · pin-pad.tsx — destructive: 10
          borders (4 full, 3 at /50, 3 at /40), and not one of them on a field
        </Annotation>

        <Caption>
          No input in the app carries a red edge — errors are a borderless block
          above the fields, and the PIN dots are the only place destructive draws
          on an edge at all.
        </Caption>

        <Ruling>
          Form validation — put the full-value red edge and the toned label on
          invalid fields (column 2), or leave errors to the message block alone
          (column 1). (recommended: column 2 — it points at the field they have
          to fix rather than making them re-read the form)
        </Ruling>
      </Slide>

      {/* ----------------------------------------------------------- 4 */}
      <Slide id="alerts">
        <Exhibit>
          <Column slot="ships-now" classes="border-X/50 bg-X/10 text-X">
            <AlertStack variantKey="shipped" />
          </Column>
          <Column slot="updated" classes="border-X bg-muted text-X">
            <AlertStack variantKey="full" />
          </Column>
          <Column slot="neutral" classes="border-border bg-muted text-X">
            <AlertStack variantKey="neutral" />
          </Column>
        </Exhibit>

        <Exhibit>
          <Column
            slot="ships-now"
            classes="border-2 border-warning/60 bg-warning/10"
          >
            <GeduNextStepNotice edgeClassName="border-warning/60 bg-warning/10" />
          </Column>
          <Column slot="updated" classes="border-2 border-warning bg-muted">
            <GeduNextStepNotice edgeClassName="border-warning bg-muted" />
          </Column>
          <Column slot="neutral" classes="border-2 border-border bg-muted">
            <GeduNextStepNotice edgeClassName="border-border bg-muted" />
          </Column>
        </Exhibit>

        <Exhibit>
          <Column slot="ships-now" classes="border-info/30 bg-info/10">
            <RegionLockNotice edgeClassName="border-info/30 bg-info/10" />
          </Column>
          <Column slot="updated" classes="border-info bg-muted">
            <RegionLockNotice edgeClassName="border-info bg-muted" />
          </Column>
          <Column slot="neutral" classes="border-border bg-muted">
            <RegionLockNotice edgeClassName="border-border bg-muted" />
          </Column>
        </Exhibit>

        <Annotation>
          alert.tsx · gedu-next-step-notice.tsx · signup-panel-view.tsx —
          functional statuses: 48 borders (info 14, success 13, warning 11,
          destructive 10), 36 of them tinted
        </Annotation>

        <Caption>
          The tinted grounds are already ruled out, so columns 2 and 3 carry the
          replacement ground and differ only at the edge.
        </Caption>

        <Ruling>
          Alerts and notices — keep the full-value family edge (column 2), or go
          neutral and let the glyph and ink carry the tone (column 3).
          (recommended: column 2 on the alert variants and the gedu next-step
          notice, column 3 on the region-lock block — the first two interrupt
          you, the third is a fact on a page you were already reading)
        </Ruling>
      </Slide>

      {/* ----------------------------------------------------------- 5 */}
      <Slide id="chips">
        <Exhibit>
          <Column
            slot="ships-now"
            classes="border-primary · border-warning/50 · border-info/40 · border-border"
          >
            <div className="space-y-3">
              <ChipRow variantKey="shipped" />
              <BadgeRow variantKey="shipped" />
            </div>
          </Column>
          <Column
            slot="updated"
            classes="border-primary · border-warning · border-info · border-border"
          >
            <div className="space-y-3">
              <ChipRow variantKey="full" />
              <BadgeRow variantKey="full" />
            </div>
          </Column>
          <Column
            slot="neutral"
            classes="border-border · text-primary / text-warning / text-info / text-success"
          >
            <div className="space-y-3">
              <ChipRow variantKey="neutral" />
              <BadgeRow variantKey="neutral" />
            </div>
          </Column>
        </Exhibit>

        <Annotation>
          status-chip.tsx (4 tones: 1 full, 2 tinted, 1 neutral, in one map) ·
          NewcomerBadge.tsx · SessionFeedAlertBadge.tsx · NowDivider.tsx —
          the admin product-status chip is not here: it is a fill family
          (bg-primary/20, bg-primary, bg-muted) and draws no edge at all
        </Annotation>

        <Caption>
          A chip is small enough that its edge is most of its area, which is what
          makes this the context where a coloured border is loudest per pixel.
        </Caption>

        <Ruling>
          Outline chips — full-value family edge (column 2), or neutral edge with
          the colour left in the ink (column 3). (recommended: column 2 — a chip
          is a label the eye picks out of a row, the edge is the shape doing that
          work, and this is the cheapest vibrancy in the app since it is already
          everywhere)
        </Ruling>
      </Slide>

      {/* ----------------------------------------------------------- 6 */}
      <Slide id="yty-tiles">
        <Exhibit>
          <Column
            slot="ships-now"
            classes="border-yty-X-strong/30 bg-yty-X-strong/10"
          >
            <FeatureTileColumn variantKey="shipped" />
          </Column>
          <Column
            slot="updated"
            classes="border-border bg-yty-X-strong/10 (the approved look restored)"
          >
            <FeatureTileColumn variantKey="neutral" />
          </Column>
          <Column
            slot="neutral"
            classes="border-yty-X-strong bg-yty-X-strong/10 (the family edge at full value)"
          >
            <FeatureTileColumn variantKey="full" />
          </Column>
        </Exhibit>

        <Annotation>
          home-page-body.tsx (FEATURE_ACCENTS_RULED) · yty.ts
          (YTY_ELEMENT_DRAFT_COLORS) — yty: 18 borders, 12 of them the /30 tile
          edge. Columns 2 and 3 are swapped from every other slide on purpose:
          here the neutral edge *is* the design-updated recommendation, because
          it is what the owner signed off on the home review.
        </Annotation>

        <Caption>
          The tile was signed off with this edge dead, so the approved look is a
          quiet neutral edge under a tinted ground.
        </Caption>

        <Ruling>
          Yty tile edges — restore the approved look, a neutral edge (column 2),
          or take the family edge to full value (column 3). (recommended: column
          2 — the tint is the accent, the glyph is the colour, and the{" "}
          <code>/30</code> edge is the valor mud already disliked; full value is
          drawn beside it so the vibrant reading is seen rather than assumed
          away)
        </Ruling>
      </Slide>

      {/* ----------------------------------------------------------- 7 */}
      <Slide id="card-edges">
        <Exhibit>
          <Column
            slot="ships-now"
            classes="border-primary bg-gradient-to-r from-primary/5 to-transparent"
          >
            <GeduCard
              edgeClassName="border-primary"
              washClassName="bg-gradient-to-r from-primary/5 to-transparent"
            />
          </Column>
          <Column slot="updated" classes="border-primary (wash retired)">
            <GeduCard edgeClassName="border-primary" />
          </Column>
          <Column slot="neutral" classes="border-border">
            <GeduCard edgeClassName="border-border" />
          </Column>
        </Exhibit>

        <Exhibit stacked>
          <Column
            slot="ships-now"
            classes="border-primary bg-primary/5 (today) / border-border (the rest)"
          >
            <div className="space-y-2">
              <WeekRow
                edgeClassName="border-primary bg-primary/5"
                label="Today"
                date="1 Sep"
              />
              <WeekRow
                edgeClassName="border-border bg-card"
                label="Tue"
                date="2 Sep"
                muted
              />
            </div>
          </Column>
          <Column
            slot="updated"
            classes="border-primary bg-accent (today) / border-border bg-card"
          >
            <div className="space-y-2">
              <WeekRow
                edgeClassName="border-primary bg-accent"
                label="Today"
                date="1 Sep"
              />
              <WeekRow
                edgeClassName="border-border bg-card"
                label="Tue"
                date="2 Sep"
                muted
              />
            </div>
          </Column>
          <Column
            slot="neutral"
            classes="border-border bg-accent (today) / border-border bg-card"
          >
            <div className="space-y-2">
              <WeekRow
                edgeClassName="border-border bg-accent"
                label="Today"
                date="1 Sep"
              />
              <WeekRow
                edgeClassName="border-border bg-card"
                label="Tue"
                date="2 Sep"
                muted
              />
            </div>
          </Column>
        </Exhibit>

        <Exhibit>
          <Column slot="ships-now" classes="border-l-2 border-primary">
            <ChatQuote barClassName="border-primary" />
          </Column>
          <ColumnNote slot="updated">
            Identical to column 1 — the quote bar was already promoted to full
            value, and the edge <em>is</em> the construct here, the same argument
            that kept the Live chip and the selection row coloured.
          </ColumnNote>
          <Column slot="neutral" classes="border-l-2 border-border">
            <ChatQuote barClassName="border-border" />
          </Column>
        </Exhibit>

        <Annotation>
          GeduAssignmentCard.tsx · week-rows.tsx · ChatReply.tsx — primary: 47
          borders, of which 36 are bare rest edges like these. The week
          row&rsquo;s <code>bg-primary/5</code> is a washed brand ground the
          selection ruling already replaces with <code>bg-accent</code>.
        </Annotation>

        <Caption>
          These are the &ldquo;many places I have never seen a border before&rdquo;
          sites — nobody has ever met one of them coloured.
        </Caption>

        <Ruling>
          Card edges at rest — keep the amber (column 2), or go neutral and let
          the ground and the chips carry the state (column 3). (recommended:
          column 2 on the gedu card, column 3 on the admin week row — a live club
          is worth an amber edge on a gedu&rsquo;s own dashboard;
          &ldquo;today&rdquo; in an admin strip is orientation, and admin leans
          restrained. The chat quote bar keeps amber either way)
        </Ruling>
      </Slide>

      {/* ----------------------------------------------------------- 8 */}
      <Slide id="rings">
        <Exhibit>
          <Column
            slot="ships-now"
            classes="ring-4 ring-primary (active) · ring-2 ring-primary/50 (rest)"
          >
            <ProfileTileRow
              activeRing="ring-primary"
              restRing="ring-primary/50"
            />
          </Column>
          <Column
            slot="updated"
            classes="ring-4 ring-primary · ring-2 ring-primary"
          >
            <ProfileTileRow activeRing="ring-primary" restRing="ring-primary" />
          </Column>
          <Column
            slot="neutral"
            classes="ring-4 ring-foreground · ring-2 ring-border"
          >
            <ProfileTileRow
              activeRing="ring-foreground"
              restRing="ring-border"
            />
          </Column>
        </Exhibit>

        <Exhibit>
          <Column
            slot="ships-now"
            classes="ring-1 ring-primary/30 · ring-1 ring-primary/60"
          >
            <QuietRingRow
              avatarRing="ring-1 ring-primary/30"
              todayRing="ring-1 ring-primary/60"
            />
          </Column>
          <Column
            slot="updated"
            classes="ring-1 ring-primary · ring-1 ring-primary"
          >
            <QuietRingRow
              avatarRing="ring-1 ring-primary"
              todayRing="ring-1 ring-primary"
            />
          </Column>
          <Column
            slot="neutral"
            classes="ring-1 ring-border · ring-1 ring-border"
          >
            <QuietRingRow
              avatarRing="ring-1 ring-border"
              todayRing="ring-1 ring-border"
            />
          </Column>
        </Exhibit>

        <Annotation>
          ProfileTiles.tsx · VoiceAvatar.tsx · session-calendar-view.tsx ·
          yty.ts + voice-zones.ts (8 yty rings) — 22 ring instances, 11 of them
          primary. The rest ring is drawn at <code>ring-2</code> so its colour
          can be judged; it ships at <code>ring-0</code> and only the hover
          widens it, which is slide 2&rsquo;s last exhibit.
        </Annotation>

        <Caption>
          Rings draw with box-shadow, so unlike every other slide these have
          always rendered: changing one is a change the owner will actually see.
        </Caption>

        <Ruling>
          Rings — full value (column 2), or neutral (column 3). (recommended:
          column 2 throughout — the tinted rest ring and the two{" "}
          <code>/30</code>–<code>/60</code> quiet marks are shaded brand values
          the ban reaches, and full value at 1px is the smallest honest reading
          of it)
        </Ruling>
      </Slide>

      {/* ----------------------------------------------------------- 9 */}
      <Slide id="recap">
        <ol className="max-w-prose list-decimal space-y-1.5 pl-5 text-sm text-foreground">
          <li>
            Gray hover lifts (13 admin sites) — keep the edge change, or ground
            lift only.
          </li>
          <li>
            Browse cards and filter chips — amber at rest, amber on hover as
            authored, or neutral.
          </li>
          <li>
            Dashed add affordances and the add-profile tile — keep the amber
            hover, or neutral. (The <code>/5</code> wash on the tile is already
            ruled out either way.)
          </li>
          <li>Profile tile hover ring — full value, or neutral.</li>
          <li>
            Form fields — add the full-value <code>border-destructive</code>{" "}
            edge and toned label, or keep errors in the message block alone.
          </li>
          <li>
            Alert variants and the gedu next-step notice — full-value family
            edge, or neutral.
          </li>
          <li>Region-lock notice — full-value info edge, or neutral.</li>
          <li>Outline chips and badges — full-value edge, or neutral.</li>
          <li>Yty tile edges — neutral (the approved look), or full value.</li>
          <li>Gedu assignment card — keep amber, or neutral.</li>
          <li>Admin week row — keep amber, or neutral.</li>
          <li>Profile tiles — the rest ring&rsquo;s tint goes full value or neutral.</li>
          <li>Voice avatar and calendar today — full value at 1px, or neutral.</li>
        </ol>

        <Caption>
          Settled already and drawn as reference rather than asked about: the
          selection edge, the current voice zone, the ignition ring and Live
          chip, the zone picker rings, the state-bearing cards&rsquo; gray hover,
          the chat quote bar, the chat reaction pill&rsquo;s no-op hover class,
          and the PIN dots.
        </Caption>
      </Slide>
    </div>
  );
}
