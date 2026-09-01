/* eslint-disable i18next/no-literal-string -- temporary admin-only review deck for the brand design pass; every string here is owner-facing walkthrough narration about drafts, never product copy that ships in any locale, and the whole page is deleted before the wiring phase merges */

import {
  Check,
  CheckCheck,
  ChevronRight,
  CircleAlert,
  CircleCheck,
  Copy,
  FileWarning,
  Globe,
  Info,
  Loader2,
  Lock,
  MailCheck,
  Send,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { ENROLLMENT_TONES } from "@/components/family/enrollment-tones";
import { ATTENDANCE_TONE } from "@/components/session-feed/attendance-tone";
import { ROLE_BADGE_STYLES } from "@/lib/constants/roles";
import {
  YTY_PRESENTATIONS,
  YTY_PRESENTATIONS_DRAFT,
} from "@/lib/constants/voice-zones";
import {
  YTY_ELEMENTS,
  ytyElementColor,
  type YtyPalette,
} from "@/lib/constants/yty";
import { cn } from "@/lib/utils";

/**
 * **Temporary.** The colour half of the brand design pass, built so the owner can
 * rule on it in one pass of one page instead of opening a dozen preview scenes
 * and holding the comparison in memory. Deleted from this branch before the
 * wiring phase lands, together with the typography deck at
 * `/admin/design-pass-typography`.
 *
 * Deliberately absent from the admin sidebar and from every index. The proxy
 * role-gates every path under `/admin`, so reaching it by URL is already gated
 * without this page doing anything.
 *
 * **This is the system deck — layer one, "rule on the system once".** A
 * six-territory census swept the app against the draft doctrine and found the
 * same shape over and over: one hue carrying several meanings, several hues
 * carrying one meaning, and no vocabulary at all for *how loud* a colour is
 * being spoken. Slides 4–13 are that finding, one defect per slide, each drawn
 * from the classes the app really ships; slide 14 is the token question the
 * same census raised. The surface slides that follow (15–20) are then only
 * sign-offs, because the rules they apply have already been ruled on above
 * them.
 *
 * **Show, don't tell — this page is exhibits, not argument** (owner direction,
 * 2026-09-01: "update them so I can see what you mean and not read what you
 * mean"). Every slide is a title, a rendered comparison, at most one caption
 * line, and a one-line ruling. Contrast figures and colour distances appear as
 * annotations *on* an exhibit, never as a table with prose around it. The
 * reasoning behind each draft is not on the page: it lives in the session
 * reports, in `docs/plans/brand-palette-and-type-design-pass.md`, and in these
 * code comments. A slide carrying more words than the UI it shows is a bug.
 *
 * **Every comparison renders the real components inline** — never a screenshot
 * and never an iframed page. Where a map is importable from a server component
 * it is read here directly (the zone presentations, the Yty colours, the
 * enrollment tones, the attendance tones, the role badge styles), so the sample
 * is the draft's real presentation rather than a picture of it. Where the map
 * is private to a client module — the admin product status chip, the WhatsApp
 * delivery ladder, the session feed's badges and rail markers — the classes are
 * **restated literally** and the slide's caption says where they came from, so
 * a reader can tell a quotation from a live read.
 *
 * **One home per comparison.** Folding this deck's new system slides in moved
 * three exhibits rather than copying them: the role badges left the grammar
 * slide for the role-families slide, the feed rail markers left the
 * grammar-in-the-wild slide for the time slide, and the status-token chips left
 * the status slide entirely — that collision is now shown in real context by
 * the liveness and time slides, so the status slide keeps only the swatch
 * evidence its distances annotate.
 *
 * **The home page is not in this deck** (owner ruling, 2026-09-01): it is parked
 * into its own dedicated pass — the owner is comfortable with the current
 * amber/violet hero and its gradient is a live option there — so no home draft
 * rides with this review. What survives here is the `/about` elements section,
 * which is a different route and one of this pass's three real consumers.
 *
 * **Product-type colours are out of scope** (owner, 2026-09-01) and the
 * identicon has its own pass, so neither appears on any slide.
 *
 * **Two honesty caveats, stated once here rather than on every slide.** Tailwind
 * breakpoints read the *viewport*, not the container, so an inline sample is
 * always showing desktop styling however narrow its box is — where the 360px
 * truth is the point, the slide falls back to a link. And a sample sits on the
 * deck's own ground unless it says otherwise; the page-shaped samples are given
 * `bg-background` so their colour is judged against the ground the page has.
 *
 * Buttons in the samples are hand-written literal classes rather than
 * `buttonVariants` calls, on purpose: the buttons slide quotes the recounted
 * blast radius of the `outline` variant, and a review aid that inflates the
 * number it asks a decision about would be arguing for the wrong decision.
 */

/* ------------------------------------------------------------------ */
/*  The deck                                                           */
/* ------------------------------------------------------------------ */

const SLIDES = [
  { id: "palette-today", title: "The palette today" },
  { id: "strong-soft", title: "Strong and soft" },
  { id: "grammar", title: "Colour as grammar" },
  { id: "strength", title: "The strength axis" },
  { id: "you-are-here", title: '"You are here" is not "act"' },
  { id: "lifecycle", title: "Lifecycles are one hue, stepped" },
  { id: "liveness", title: "Liveness is glow" },
  { id: "time", title: "Time is wit" },
  { id: "eligibility", title: "Eligibility, one colour" },
  { id: "roles", title: "Role families" },
  { id: "violet-weight", title: "Violet's replacement weight" },
  { id: "ensemble", title: "The ensemble trim" },
  { id: "warning-adjacency", title: "Warning is amber's neighbour" },
  { id: "status-colours", title: "Status colours meet the palette" },
  { id: "grammar-wild", title: "The grammar in the wild" },
  { id: "gamer-floor", title: "The gamer dashboard at 360" },
  { id: "elements", title: "The Yty element cards" },
  { id: "buttons", title: "Buttons" },
  { id: "zones", title: "Voice-zone tiles" },
  { id: "reach", title: "The calm ring" },
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
        <h2 className="text-2xl font-bold">{slide.title}</h2>
      </div>
      {children}
    </section>
  );
}

/** One line, and only where the exhibit above it is not self-labelling. */
function Caption({ children }: { children: React.ReactNode }) {
  return <p className="max-w-prose text-sm text-muted-foreground">{children}</p>;
}

/** The ask, one line per ruling, recommendation folded in rather than argued. */
function Ruling({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-1.5 rounded-lg border border-primary/40 bg-primary/5 px-4 py-3">
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

function DeckLink({ href, children }: { href: string; children: React.ReactNode }) {
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

function Links({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-wrap gap-4 text-xs">{children}</div>;
}

/* ------------------------------------------------------------------ */
/*  Inline samples                                                     */
/* ------------------------------------------------------------------ */

/**
 * One live sample — the real components, rendered here — with a plain link to
 * the page or style-guide anchor that holds the full-size truth.
 *
 * `surface` lets a caller give the sample the page's own ground rather than the
 * deck's card, and absorb the hero's negative top margin where one is inside.
 */
function Sample({
  label,
  href,
  linkLabel = "Open the full page",
  surface,
  children,
}: {
  label: string;
  href: string;
  linkLabel?: string;
  surface?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-foreground">
          {label}
        </span>
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          {linkLabel}
        </a>
      </div>
      <div className={cn("overflow-hidden rounded-lg border", surface)}>
        {children}
      </div>
    </div>
  );
}

/** A titled run of samples that are meant to be compared with each other. */
function SampleGroup({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <Marker>{title}</Marker>
      <div className="space-y-5">{children}</div>
    </div>
  );
}

/** A sample sits on the deck's card unless it asks for the page's own ground. */
const PAGE_SURFACE = "bg-background";

/**
 * Today above, the draft below, with the two labels the deck uses everywhere.
 * A comparison whose halves are not labelled the same way on every slide costs
 * the reader a re-read per slide.
 */
function BeforeAfter({
  before,
  after,
}: {
  before: React.ReactNode;
  after: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Marker>Today</Marker>
        {before}
      </div>
      <div className="space-y-2">
        <Marker>Draft</Marker>
        {after}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Swatches and tables                                                */
/* ------------------------------------------------------------------ */

/**
 * A colour chip. `note` is the one place a number belongs on this page — a
 * contrast ratio or a colour distance annotated on the swatch it describes,
 * rather than in a table with a paragraph around it.
 */
function Swatch({
  label,
  hex,
  note,
  className,
}: {
  label: string;
  hex: string;
  note?: string;
  className: string;
}) {
  return (
    <div className="w-32 space-y-1.5">
      <div className={cn("h-14 w-full rounded-md border", className)} />
      <div className="text-xs text-foreground">{label}</div>
      <div className="text-[11px] text-muted-foreground">{hex}</div>
      {note ? (
        <div className="text-[11px] text-muted-foreground">{note}</div>
      ) : null}
    </div>
  );
}

function DeckTable({
  head,
  children,
}: {
  head: readonly string[];
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] text-sm">
        <thead>
          <tr>
            {head.map((cell) => (
              <th
                key={cell}
                className="pb-2 pr-6 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
              >
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function Cell({
  children,
  muted = false,
}: {
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <td
      className={cn(
        "border-t py-2.5 pr-6 align-top",
        muted && "text-muted-foreground",
      )}
    >
      {children}
    </td>
  );
}

/* ------------------------------------------------------------------ */
/*  Slide 1 — the palette today                                        */
/* ------------------------------------------------------------------ */

/**
 * The live tokens, each labelled with the hue the brand actually fixes for it —
 * so the swatch above the label *is* the finding. Two are effectively swapped
 * (Harmony renders in Glow's family, Valor in Harmony's) and the Glow stand-in
 * is the CTA amber, which is the collision drawn immediately below.
 */
const CURRENT_SWATCHES: readonly {
  label: string;
  hex: string;
  note: string;
  className: string;
}[] = [
  {
    label: "Harmony",
    hex: "#34d399",
    note: "brand says pink",
    className: "bg-yty-harmony",
  },
  {
    label: "Glow",
    hex: "#fbbf24",
    note: "brand says green",
    className: "bg-yty-glow",
  },
  {
    label: "Valor",
    hex: "#fb7185",
    note: "brand says orange",
    className: "bg-yty-valor",
  },
  {
    label: "Wit",
    hex: "#a78bfa",
    note: "brand says blue",
    className: "bg-yty-wit",
  },
];

/** The collision, as two adjacent chips rather than a sentence about them. */
const AMBER_COLLISION: readonly {
  label: string;
  hex: string;
  className: string;
}[] = [
  { label: "Glow, today", hex: "#fbbf24", className: "bg-yty-glow" },
  { label: "The CTA amber", hex: "#FAA901", className: "bg-primary" },
];

const BRAND_SWATCHES: readonly { label: string; hex: string; className: string }[] =
  [
    {
      label: "Harmony strong",
      hex: "#F55B9A",
      className: "bg-yty-harmony-strong",
    },
    { label: "Harmony soft", hex: "#FA7FA3", className: "bg-yty-harmony-soft" },
    { label: "Glow strong", hex: "#1AB061", className: "bg-yty-glow-strong" },
    { label: "Glow soft", hex: "#6AC66B", className: "bg-yty-glow-soft" },
    { label: "Valor strong", hex: "#FD700D", className: "bg-yty-valor-strong" },
    { label: "Valor soft", hex: "#FF993D", className: "bg-yty-valor-soft" },
    { label: "Wit strong", hex: "#3A71DE", className: "bg-yty-wit-strong" },
    { label: "Wit soft", hex: "#4DB3F5", className: "bg-yty-wit-soft" },
  ];

/* ------------------------------------------------------------------ */
/*  Slide 2 — the strong and soft split                                */
/* ------------------------------------------------------------------ */

/**
 * The split, drawn as what it actually decides: which variant can carry a line
 * of body text on the card ground.
 *
 * Numbers are the card-ground column of `node scripts/yty-contrast.mjs` — the
 * card (`#1a1a1a`) is the lighter of the two grounds these pairings sit on, so
 * its numbers are the binding ones. 4.5:1 is the body-text bar. Wit-strong at
 * 3.81 is the only cell under it, and it is the one number the whole
 * presentation is shaped around — which is why it is annotated on the line it
 * fails rather than filed in a table.
 *
 * Class strings are literal because Tailwind scans source text.
 */
const SPLIT_ROWS: readonly {
  element: string;
  strong: string;
  strongRatio: string;
  soft: string;
  softRatio: string;
}[] = [
  {
    element: "Harmony",
    strong: "text-yty-harmony-strong",
    strongRatio: "5.67:1",
    soft: "text-yty-harmony-soft",
    softRatio: "7.15:1",
  },
  {
    element: "Glow",
    strong: "text-yty-glow-strong",
    strongRatio: "6.16:1",
    soft: "text-yty-glow-soft",
    softRatio: "8.21:1",
  },
  {
    element: "Valor",
    strong: "text-yty-valor-strong",
    strongRatio: "6.22:1",
    soft: "text-yty-valor-soft",
    softRatio: "8.18:1",
  },
  {
    element: "Wit",
    strong: "text-yty-wit-strong",
    strongRatio: "3.81:1",
    soft: "text-yty-wit-soft",
    softRatio: "7.53:1",
  },
];

/** The line each row sets — body-size, which is the size the bar applies at. */
const SPLIT_SAMPLE = "The relationship with technology";

/* ------------------------------------------------------------------ */
/*  Slide 3 — colour as grammar                                        */
/* ------------------------------------------------------------------ */

/**
 * The proposed vocabulary: one family, one meaning, derived from what the Yty
 * elements already stand for rather than invented beside them.
 *
 * **The role badges used to be on this slide and are not any more.** They are
 * the grammar's largest single application, they need the density proof beside
 * them to be judged at all, and a comparison with two homes goes stale in the
 * one nobody opens — so they are slide 10 in full, and this slide keeps the
 * vocabulary and violet's overload.
 */
const GRAMMAR_CHIPS: readonly {
  family: string;
  word: string;
  swatch: string;
  wordClass: string;
  examples: readonly string[];
}[] = [
  {
    family: "Amber",
    word: "Act",
    swatch: "bg-primary",
    wordClass: "text-primary",
    examples: ["Primary CTA", "Links", "The mark"],
  },
  {
    family: "Harmony pink",
    word: "People",
    swatch: "bg-yty-harmony-strong",
    wordClass: "text-yty-harmony-soft",
    examples: ["Friends", "Groups", "Community"],
  },
  {
    family: "Glow green",
    word: "Growth",
    swatch: "bg-yty-glow-strong",
    wordClass: "text-yty-glow-soft",
    examples: ["Progress", "Achievements", "Liveness"],
  },
  {
    family: "Wit blue",
    word: "Knowledge",
    swatch: "bg-yty-wit-strong",
    wordClass: "text-yty-wit-soft",
    examples: ["Information", "Time ahead", "Eligibility"],
  },
  {
    family: "Valor orange",
    word: "Adventure",
    swatch: "bg-yty-valor-strong",
    wordClass: "text-yty-valor-soft",
    examples: ["Camps", "Events", "Quests"],
  },
  {
    family: "Violet",
    word: "The world",
    swatch: "bg-secondary",
    wordClass: "text-secondary",
    examples: ["Lore", "Dusk", "Display"],
  },
];

/**
 * Six chips the app draws in the same violet, meaning six unrelated things.
 * Identical on purpose — that is the exhibit, and it needs no sentence.
 */
const VIOLET_MEANINGS: readonly { chip: string; meaning: string }[] = [
  { chip: "Parent", meaning: "A role" },
  { chip: "Join voice", meaning: "Locked and inert" },
  { chip: "Read", meaning: "A delivery receipt" },
  { chip: "Completed", meaning: "A finished participation" },
  { chip: "12 waiting", meaning: "A neutral count" },
  { chip: "Adults", meaning: "Who may hold a seat" },
];

/* ------------------------------------------------------------------ */
/*  Slide 4 — the strength axis                                        */
/* ------------------------------------------------------------------ */

/**
 * **The doctrine's missing dimension.** Slide 3 says which family a surface
 * reaches for; nothing until now said how *loudly* it may speak. Without that,
 * two surfaces obeying the grammar perfectly can still collide, because they
 * pick the same family at the same strength for two different jobs — which is
 * exactly what the amber row below shows the app doing today.
 *
 * Three strengths, and deliberately only three: a solid fill is the loudest
 * thing a colour can be and is spent on the thing you are asked to *do*; a tint
 * with coloured text is a label, read but not clicked; an edge with a faint
 * wash marks the one item among several that is currently chosen. Glow is the
 * family drawn here because it is the one the ensemble rule says we hear least.
 */
const STRENGTH_SHAPE =
  "inline-flex h-9 items-center justify-center rounded-md px-4 text-sm font-medium";

const STRENGTH_STEPS: readonly {
  word: string;
  sample: string;
  className: string;
}[] = [
  {
    word: "Act",
    sample: "Join the club",
    className: "bg-yty-glow-strong text-background",
  },
  {
    word: "Label",
    sample: "Achievement",
    className: "bg-yty-glow-strong/15 text-yty-glow-soft",
  },
  {
    word: "Selection",
    sample: "Every week",
    className:
      "border border-yty-glow-strong bg-yty-glow-strong/5 text-foreground",
  },
];

/**
 * The collision the axis fixes, in the app's own classes. The first two are
 * byte-identical in strength — `--sidebar-primary` mirrors `--primary` and both
 * pair it with the ink foreground — and they mean two entirely different
 * things. The third is already at edge strength, which is the axis being obeyed
 * by accident rather than by rule.
 */
const AMBER_JOBS: readonly {
  job: string;
  where: string;
  sample: string;
  className: string;
}[] = [
  {
    job: "Act",
    where: "a primary button",
    sample: "Explore clubs",
    className: "bg-primary text-primary-foreground shadow",
  },
  {
    job: "You are here",
    where: "the admin sidebar's active item",
    sample: "Products",
    className: "bg-sidebar-primary text-sidebar-primary-foreground",
  },
  {
    job: "Selected",
    where: "a form choice",
    sample: "Every week",
    className: "border border-primary bg-primary/5 text-foreground",
  },
];

/* ------------------------------------------------------------------ */
/*  Slide 5 — "you are here" is not "act"                              */
/* ------------------------------------------------------------------ */

/**
 * The narrowest consequence of the axis, and the one with the widest blast
 * radius: amber is the act colour, and an active nav item is not an act — it is
 * the one place you cannot go, because you are already there. Drawing it in the
 * CTA fill spends the loudest colour in the palette on the least actionable
 * element on screen.
 *
 * The alternative keeps the *strength* (a fill, because "you are here" does
 * need to win its row) and spends a neutral: the ground lifts and the label
 * goes to full foreground weight. Classes restated from the sidebar and the
 * checkbox row, both of which are client modules.
 */
const NAV_SAMPLE_ITEMS = ["Dashboard", "Products", "Users"] as const;

const NAV_TREATMENTS: readonly {
  label: string;
  active: string;
  rest: string;
}[] = [
  {
    label: "Today",
    active: "bg-sidebar-primary text-sidebar-primary-foreground",
    rest: "text-sidebar-foreground",
  },
  {
    label: "Foreground strength",
    active: "bg-accent font-semibold text-foreground",
    rest: "text-sidebar-foreground",
  },
];

const SELECTION_TREATMENTS: readonly { label: string; className: string }[] = [
  { label: "Today", className: "border-primary bg-primary/5" },
  { label: "Foreground strength", className: "border-foreground/50 bg-foreground/5" },
];

/* ------------------------------------------------------------------ */
/*  Slide 6 — lifecycles are one hue, stepped                          */
/* ------------------------------------------------------------------ */

/**
 * **Restated, not imported, and the caption says so.** The admin product
 * chip's status map is module-private to a client component, so there is
 * nothing a server component can read; these strings are a quotation of it.
 *
 * The defect is visible without a word: `completed` and `expired` are the same
 * two classes, so two different ends to a product's life are drawn as one.
 * Under the idiom the normal progression walks one hue from edge to solid to
 * tint to grey, and only the abnormal exit — cancelled — keeps a second colour,
 * because it is the one state that is not a step along the ladder at all.
 */
const LIFECYCLE_SHAPE =
  "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs";

const PRODUCT_STATUS_TODAY: readonly { status: string; className: string }[] = [
  { status: "pending", className: "bg-primary/20 text-primary" },
  { status: "running", className: "bg-primary text-primary-foreground" },
  { status: "completed", className: "bg-muted text-muted-foreground" },
  { status: "cancelled", className: "bg-destructive/20 text-destructive" },
  { status: "expired", className: "bg-muted text-muted-foreground" },
];

const PRODUCT_STATUS_DRAFT: readonly { status: string; className: string }[] = [
  { status: "pending", className: "border border-primary/40 text-primary/80" },
  { status: "running", className: "bg-primary text-primary-foreground" },
  { status: "completed", className: "bg-primary/15 text-primary" },
  { status: "cancelled", className: "bg-destructive/20 text-destructive" },
  { status: "expired", className: "bg-muted text-muted-foreground" },
];

/**
 * The same idiom on a ladder that has no colour at all today. Three of the
 * WhatsApp console's five delivery states are drawn in the inherited text
 * colour, one is violet and one is destructive — so the ladder reads as two
 * marks and three absences rather than as a progression. Classes restated: the
 * console picks them in nested ternaries and keeps no map.
 */
const DELIVERY_TODAY: readonly {
  state: string;
  icon: LucideIcon;
  className: string;
}[] = [
  { state: "pending", icon: Loader2, className: "" },
  { state: "sent", icon: Check, className: "" },
  { state: "delivered", icon: CheckCheck, className: "" },
  { state: "read", icon: CheckCheck, className: "text-secondary" },
  { state: "failed", icon: CircleAlert, className: "text-destructive" },
];

const DELIVERY_DRAFT: readonly {
  state: string;
  icon: LucideIcon;
  className: string;
}[] = [
  { state: "pending", icon: Loader2, className: "text-muted-foreground" },
  { state: "sent", icon: Check, className: "text-yty-wit-soft/40" },
  { state: "delivered", icon: CheckCheck, className: "text-yty-wit-soft/70" },
  { state: "read", icon: CheckCheck, className: "text-yty-wit-soft" },
  { state: "failed", icon: CircleAlert, className: "text-destructive" },
];

/* ------------------------------------------------------------------ */
/*  Slide 7 — liveness is glow                                         */
/* ------------------------------------------------------------------ */

/**
 * One badge, one word, two colours — decided independently on two surfaces a
 * family can have open at the same time. The green half is read from the real
 * tone map; the blue half is restated, because both feeds build it inline.
 *
 * The converged badge is also read from the map rather than written out, so the
 * third sample is the actual draft the enrollment card would ship.
 */
const LIVE_BADGE_SHAPE = "inline-flex items-center gap-1 rounded-full border";

const LIVE_BADGES_TODAY: readonly { where: string; className: string }[] = [
  {
    where: "Enrollment card, gedu assignment card",
    className: ENROLLMENT_TONES.current.liveBadge,
  },
  {
    where: "Gedu session feed, family session feed",
    className:
      "border-info bg-info/10 px-2 py-0 text-[10px] uppercase tracking-wide text-info",
  },
];

/* ------------------------------------------------------------------ */
/*  Slide 8 — time is wit                                              */
/* ------------------------------------------------------------------ */

/**
 * The feed's whole future system is drawn in `--info` — the badge on a session
 * that has not happened, the rail dot marking the next one, the pill that
 * divides what is past from what is ahead. Under the grammar that is wit's
 * territory rather than a status token's: every one of these marks is the
 * platform telling the reader something about time, and none of them is a
 * status anyone can act on.
 *
 * The rail markers moved here from the grammar-in-the-wild slide, which is why
 * that slide is now the enrollment card and the attendance chip only.
 */
const FUTURE_BADGE_SHAPE =
  "inline-flex shrink-0 items-center rounded-full border px-2 py-0 text-[10px] uppercase tracking-wide";

const FUTURE_BADGES: readonly {
  label: string;
  today: string;
  draft: string;
}[] = [
  {
    label: "Next session",
    today: "border-info/50 text-info",
    draft: "border-yty-wit-soft/50 text-yty-wit-soft",
  },
  {
    label: "Upcoming",
    today: "border-info/50 text-info",
    draft: "border-yty-wit-soft/50 text-yty-wit-soft",
  },
];

/**
 * The family feed's rail marker, today and under the grammar.
 *
 * **Restated rather than imported, and the reason is the finding.** The family
 * feed builds this class inline and deliberately keeps no state vocabulary —
 * "the markers on the rail carry no state here" is its own comment — so there is
 * no map to read.
 */
const FEED_MARKER_SAMPLES: readonly {
  label: string;
  today: string;
  draft: string;
}[] = [
  { label: "Next session", today: "bg-info", draft: "bg-yty-wit-soft" },
  { label: "Later sessions", today: "bg-info/40", draft: "bg-yty-wit-soft/40" },
  {
    label: "Sessions that have run",
    today: "bg-muted-foreground/60",
    draft: "bg-muted-foreground/60",
  },
];

const NOW_DIVIDER_TONES: readonly {
  tick: string;
  pill: string;
  rule: string;
}[] = [
  {
    tick: "bg-info/70",
    pill: "border-info/40 bg-info/10 text-info",
    rule: "bg-info/40",
  },
  {
    tick: "bg-yty-wit-soft/70",
    pill: "border-yty-wit-strong/40 bg-yty-wit-strong/10 text-yty-wit-soft",
    rule: "bg-yty-wit-strong/40",
  },
];

/* ------------------------------------------------------------------ */
/*  Slide 9 — eligibility, one colour                                  */
/* ------------------------------------------------------------------ */

/**
 * Three surfaces answering one question — *is this for me?* — in three
 * different colours: the media chip on a product card fills violet, the
 * region-lock strip tints info, the schools pill tints amber. A parent moving
 * from the shop to a municipality page to a product meets all three in a
 * minute, and nothing connects them.
 *
 * Under the grammar the answer is wit at label strength everywhere: it is
 * information about the reader's fit, it is never clickable, and tinting it
 * keeps the amber pill from reading as an act.
 */
const ELIGIBILITY_TONES: readonly {
  who: string;
  strip: string;
  stripGlyph: string;
  pill: string;
}[] = [
  {
    who: "bg-secondary text-secondary-foreground",
    strip: "border-info/30 bg-info/10",
    stripGlyph: "text-info",
    pill: "bg-primary/10 text-primary",
  },
  {
    who: "bg-yty-wit-strong/20 text-yty-wit-soft",
    strip: "border-yty-wit-strong/30 bg-yty-wit-strong/10",
    stripGlyph: "text-yty-wit-soft",
    pill: "bg-yty-wit-strong/10 text-yty-wit-soft",
  },
];

/* ------------------------------------------------------------------ */
/*  Slide 10 — role families                                           */
/* ------------------------------------------------------------------ */

/** The four role badges exactly as the app draws them today, from the map. */
const ROLE_BADGES_TODAY: readonly { label: string; className: string }[] = [
  { label: "Gamer", className: ROLE_BADGE_STYLES.gamer },
  { label: "Parent", className: ROLE_BADGE_STYLES.customer },
  { label: "Gedu", className: ROLE_BADGE_STYLES.gedu },
  { label: "Admin", className: ROLE_BADGE_STYLES.admin },
];

/**
 * The proposal. Two of the four do not move: the gamer keeps amber, because a
 * gamer is who the product is *for* and amber is the brand's own lead; the
 * admin keeps ink, because it is deliberately outside the palette. The two that
 * move are the two that need a family — parent to harmony, which is the people
 * colour, and gedu to wit, which retires the gradient that only ever existed
 * because a fourth role arrived with no hue left.
 *
 * Gedu takes wit's *soft* variant rather than its strong one for the same
 * reason the element cards do: ink on wit-strong measures 3.81:1.
 */
const ROLE_BADGES_PROPOSED: readonly { label: string; className: string }[] = [
  { label: "Gamer", className: "bg-primary text-primary-foreground" },
  { label: "Parent", className: "bg-yty-harmony-strong text-background" },
  { label: "Gedu", className: "bg-yty-wit-soft text-background" },
  { label: "Admin", className: "bg-foreground text-background" },
];

/**
 * The density proof. A role badge is never seen alone: in the admin users list
 * it sits inside a right-packed run with up to four status glyphs, and the
 * question a swatch cannot answer is whether a *family* mark and a *status*
 * mark stay legible as two different kinds of thing at that spacing. Row shape
 * and glyph tones restated from the users list.
 */
const USER_ROW_PEOPLE = [
  "Aino Virtanen",
  "Mikael Lindgren",
  "Sofia Nurmi",
  "Elias Koskinen",
] as const;

/* ------------------------------------------------------------------ */
/*  Slide 11 — violet's replacement weight                             */
/* ------------------------------------------------------------------ */

/**
 * Narrowing violet to "the world" leaves a real hole, and it is worth showing
 * rather than asserting: two gedu actions need to be *filled* — they are the
 * only thing to do on their row — without claiming the primary CTA's amber. The
 * violet fill is what does that job today.
 *
 * Both candidates spend a neutral instead of a hue, which is the point: the
 * grammar's families are all committed to meanings, so an emphasis tier that
 * needs no meaning should not borrow one.
 */
const BUTTON_SHAPE =
  "inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium transition-colors";

const EMPHASIS_TREATMENTS: readonly { name: string; className: string }[] = [
  {
    name: "Today — violet fill",
    className:
      "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
  },
  {
    name: "Foreground fill",
    className: "bg-foreground text-background shadow-sm hover:bg-foreground/90",
  },
  {
    name: "Heavy outline",
    className:
      "border-2 border-foreground bg-transparent text-foreground hover:bg-foreground/10",
  },
];

const EMPHASIS_ACTIONS: readonly { label: string; icon: LucideIcon }[] = [
  { label: "Send report", icon: Send },
  { label: "Join", icon: Lock },
];

/* ------------------------------------------------------------------ */
/*  Slide 12 — the ensemble trim                                       */
/* ------------------------------------------------------------------ */

/**
 * The ensemble rule's first half, drawn. Sixteen surfaces acknowledge a
 * mechanical act — copied, saved, sent, verified — in success green, and every
 * one of them would converge onto glow. That would put the growth colour on
 * clipboard feedback more often than on anything a child actually did, which is
 * the showcase skewing itself.
 *
 * The trim is not "no colour": it is that a mechanical acknowledgement gets the
 * quiet treatment and glow stays reserved for domain facts — progress,
 * achievement, presence, liveness.
 */
const ACK_TONES: readonly {
  chip: string;
  banner: string;
  glyph: string;
}[] = [
  {
    chip: "border-success text-success",
    banner: "bg-success/10 text-success",
    glyph: "text-success",
  },
  {
    chip: "border-border text-muted-foreground",
    banner: "border border-border bg-muted/40 text-muted-foreground",
    glyph: "text-muted-foreground",
  },
];

/* ------------------------------------------------------------------ */
/*  Slide 13 — warning is amber's neighbour                            */
/* ------------------------------------------------------------------ */

/**
 * `--warning` sits 4.5 degrees of hue from `--primary`. That is not a defect
 * anyone introduced — a warning colour is *supposed* to be amber — but it does
 * mean the act colour and the caution colour are, to a reader glancing at a
 * dense page, the same colour. The admin dashboard's attention panel is where
 * it shows: one header slot draws an amber count when something needs doing and
 * an amber wordmark when nothing does.
 */
const AMBER_NEIGHBOURS: readonly {
  label: string;
  hex: string;
  note: string;
  className: string;
}[] = [
  {
    label: "--primary",
    hex: "#FAA901",
    note: "hue 40.5°",
    className: "bg-primary",
  },
  {
    label: "--warning",
    hex: "#E7B008",
    note: "hue 45.0° — 4.5° away",
    className: "bg-warning",
  },
];

/* ------------------------------------------------------------------ */
/*  Slide 14 — status colours                                          */
/* ------------------------------------------------------------------ */

/**
 * The functional status tokens against the brand family each one now sits in.
 *
 * Distances are CIE76 in Lab — a rough but honest "how far apart would a person
 * call these"; under about 25 is where two colours read as two shades of one
 * thing. They are annotated on the swatches rather than tabled, because the
 * swatches are what make the claim and the number is the footnote.
 *
 * **The tinted-chip exhibit that used to sit under these swatches is gone.**
 * Slides 7 and 8 now show the same collision in the app's own surfaces — a Live
 * badge that is green on one page and blue on another, a whole future system in
 * info — which is strictly better evidence than two invented chips, and keeping
 * both would be two homes for one comparison.
 *
 * Warning and destructive are absent: at 43.9 and 42.6 from their nearest brand
 * family they are a different colour by any measure, and a before-and-after
 * showing no collision would read as a rendering fault. Warning's *other*
 * adjacency — to amber — is slide 13.
 */
const STATUS_SWATCH_ROWS: readonly {
  heading: string;
  swatches: readonly {
    label: string;
    hex: string;
    note?: string;
    className: string;
  }[];
}[] = [
  {
    heading: "One blue, or three?",
    swatches: [
      { label: "--info", hex: "#308CE8", className: "bg-info" },
      {
        label: "Wit strong",
        hex: "#3A71DE",
        note: "17.5 away",
        className: "bg-yty-wit-strong",
      },
      {
        label: "Wit soft",
        hex: "#4DB3F5",
        note: "22.7 away",
        className: "bg-yty-wit-soft",
      },
    ],
  },
  {
    heading: "One green, or three?",
    swatches: [
      { label: "--success", hex: "#2EB88A", className: "bg-success" },
      {
        label: "Glow strong",
        hex: "#1AB061",
        note: "19.1 away",
        className: "bg-yty-glow-strong",
      },
      {
        label: "Glow soft",
        hex: "#6AC66B",
        note: "24.7 away",
        className: "bg-yty-glow-soft",
      },
    ],
  },
];

/* ------------------------------------------------------------------ */
/*  Slide 15 — the grammar in the wild                                 */
/* ------------------------------------------------------------------ */

/**
 * **The shop is not on this slide, and that is a ruling rather than an
 * omission.** The grammar's only proposal for the storefront was to colour the
 * product types from the four families; the owner rejected it on 2026-09-01 —
 * the admin product palette was placed 25–30° clear of the function colours
 * precisely so a category mark can never be mistaken for a state mark, and the
 * pairing is admin-only anyway.
 *
 * The rail markers left this slide for slide 8, where the rest of the feed's
 * future system is, and the status-convergence ruling left it for slides 7, 8
 * and 14, which now carry it once each in the territory it belongs to. What
 * remains here is the pair of surfaces the owner asked to see the grammar
 * *applied* on rather than argued about.
 */

/**
 * The attendance chip's three states under the grammar, beside the app's own
 * `ATTENDANCE_TONE`. Only present moves: absent keeps warning amber because
 * absent-is-not-a-failure is a decision this pass does not reopen, and unmarked
 * stays muted because it is the absence of a mark rather than a state.
 */
const ATTENDANCE_STATES = [
  "present",
  "absent",
  "unmarked",
] as const satisfies readonly (keyof typeof ATTENDANCE_TONE)[];

const ATTENDANCE_GRAMMAR: Record<keyof typeof ATTENDANCE_TONE, string> = {
  present: "text-yty-glow-soft",
  absent: "text-warning",
  unmarked: "text-muted-foreground/70",
};

/* ------------------------------------------------------------------ */
/*  Slide 18 — buttons                                                 */
/* ------------------------------------------------------------------ */

/**
 * The button samples wear `BUTTON_SHAPE` — the base of the real variant recipe
 * at its default size, at today's CTA type. (The *type* question moved to the
 * typography deck; this slide is colour and shape.)
 *
 * **Written out rather than called for.** Using the button primitive here would
 * add call sites to the very counts this slide asks a decision about, so the
 * samples are literal copies of the variants' own class strings on inert spans.
 * They are at rest only; the style guide draws every state.
 */
const BUTTON_SAMPLES: readonly { name: string; className: string }[] = [
  {
    name: "Primary — unchanged",
    className: "bg-primary text-primary-foreground shadow hover:bg-primary/90",
  },
  {
    name: "Secondary on dark — proposed",
    className:
      "border-2 border-foreground bg-transparent text-foreground hover:bg-foreground/10",
  },
  {
    name: "outline — today",
    className:
      "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
  },
  {
    name: "secondary — today, the violet fill",
    className:
      "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
  },
  {
    name: "Third tier A — ghost as today",
    className: "hover:bg-accent hover:text-accent-foreground",
  },
  {
    name: "Third tier B — quiet 1px border",
    className:
      "border border-input bg-transparent hover:bg-accent hover:text-accent-foreground",
  },
  {
    name: "Third tier C — label only",
    className: "text-muted-foreground hover:text-foreground",
  },
];

/**
 * The recounted blast radius. A call site is `<Button variant="X">` **plus**
 * `buttonVariants({ variant: "X" })` — the helper is how a `<Link>` wears the
 * button's clothes — counted across `src/`, style guide excluded. The plan
 * estimated the violet fill at ~13; that count was picking up `<Badge>`
 * variants. This table stays a table because the numbers *are* the exhibit.
 */
const BUTTON_COUNTS: readonly {
  variant: string;
  count: string;
  note: string;
}[] = [
  {
    variant: "outline",
    count: "61",
    note: "44 buttons plus 17 link anchors",
  },
  { variant: "ghost", count: "24", note: "all real buttons" },
  {
    variant: "secondary — the violet fill",
    count: "1",
    note: "a single link anchor, and no real button anywhere",
  },
];

/* ------------------------------------------------------------------ */
/*  Small shapes the exhibits are built from                           */
/* ------------------------------------------------------------------ */

/** A filled badge, the shape the app's role and status badges already take. */
function Pill({ label, className }: { label: string; className: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold",
        className,
      )}
    >
      {label}
    </span>
  );
}

/** One family of the proposed grammar: the colour, the word, and its beat. */
function GrammarChip({ chip }: { chip: (typeof GRAMMAR_CHIPS)[number] }) {
  return (
    <div className="w-44 space-y-2 rounded-lg border p-4">
      <div className={cn("h-10 w-full rounded-md", chip.swatch)} />
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
        {chip.family}
      </div>
      <div className={cn("text-lg font-semibold", chip.wordClass)}>
        {chip.word}
      </div>
      <ul className="space-y-0.5 text-xs text-foreground">
        {chip.examples.map((example) => (
          <li key={example}>{example}</li>
        ))}
      </ul>
    </div>
  );
}

/** A strength sample with the one word it is an example of underneath it. */
function StrengthCell({
  word,
  sample,
  className,
  note,
}: {
  word: string;
  sample: string;
  className: string;
  note?: string;
}) {
  return (
    <div className="w-48 space-y-2">
      <span className={cn(STRENGTH_SHAPE, className)}>{sample}</span>
      <div className="text-sm font-semibold text-foreground">{word}</div>
      {note ? (
        <div className="text-[11px] text-muted-foreground">{note}</div>
      ) : null}
    </div>
  );
}

/** A three-item sidebar at the real item shape, one of them active. */
function NavSample({
  active,
  rest,
}: {
  active: string;
  rest: string;
}) {
  return (
    <div className="w-56 space-y-1 rounded-lg bg-sidebar-background p-4">
      {NAV_SAMPLE_ITEMS.map((item) => (
        <div
          key={item}
          className={cn(
            "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium",
            item === "Products" ? active : rest,
          )}
        >
          {item}
        </div>
      ))}
    </div>
  );
}

/** The checkbox row's ticked shape, which is where selection colour is spent. */
function SelectionSample({ className }: { className: string }) {
  return (
    <div
      className={cn(
        "flex w-56 items-start gap-3 rounded-md border p-3 text-sm text-foreground",
        className,
      )}
    >
      <span className="mt-0.5 h-4 w-4 shrink-0 rounded-sm border border-current" />
      <span>Every week</span>
    </div>
  );
}

/** The admin status chip's shape, so a lifecycle step is judged where it lives. */
function LifecycleChip({
  status,
  className,
}: {
  status: string;
  className: string;
}) {
  return <span className={cn(LIFECYCLE_SHAPE, className)}>{status}</span>;
}

/** One rung of a delivery ladder: the glyph, at the size the console draws it. */
function DeliveryRung({
  state,
  icon: Icon,
  className,
}: {
  state: string;
  icon: LucideIcon;
  className: string;
}) {
  return (
    <div className="flex w-24 flex-col items-center gap-1.5">
      <Icon className={cn("h-4 w-4", className)} aria-hidden />
      <span className="text-[11px] text-muted-foreground">{state}</span>
    </div>
  );
}

/** The outline badge both Live badges wear; the tone arrives whole. */
function LiveBadge({ className }: { className: string }) {
  return <span className={cn(LIVE_BADGE_SHAPE, className)}>Live</span>;
}

/** A rail dot at the size the family feed draws it, with its label beside it. */
function MarkerRow({ label, className }: { label: string; className: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={cn("h-2.5 w-2.5 rounded-full", className)} aria-hidden />
      <span className="text-xs text-muted-foreground">{label}</span>
    </span>
  );
}

/** The feed's now-divider, at its real geometry so the pill reads in context. */
function NowDividerSample({
  tone,
}: {
  tone: (typeof NOW_DIVIDER_TONES)[number];
}) {
  return (
    <div className="flex items-center gap-3 py-2">
      <span
        className={cn("h-0.5 w-4 shrink-0 rounded-full", tone.tick)}
        aria-hidden
      />
      <span
        className={cn(
          "inline-flex shrink-0 items-center rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wider",
          tone.pill,
        )}
      >
        Now
      </span>
      <span
        className={cn("h-0.5 flex-1 rounded-full", tone.rule)}
        aria-hidden
      />
    </div>
  );
}

/** The three eligibility answers, in the three shapes the app really uses. */
function EligibilityRow({
  tone,
}: {
  tone: (typeof ELIGIBILITY_TONES)[number];
}) {
  return (
    <div className="flex flex-wrap items-start gap-4">
      <span
        className={cn(
          "inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium shadow-sm",
          tone.who,
        )}
      >
        Ages 8–12
      </span>
      <span
        className={cn(
          "inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
          tone.pill,
        )}
      >
        Clubs available
      </span>
      <div
        className={cn(
          "flex w-72 items-start gap-3 rounded-md border p-4",
          tone.strip,
        )}
      >
        <Globe
          className={cn("mt-0.5 h-5 w-5 shrink-0", tone.stripGlyph)}
          aria-hidden
        />
        <p className="text-sm text-foreground">
          This club runs in Finland only.
        </p>
      </div>
    </div>
  );
}

/**
 * One admin users-list row, right-packed exactly as the list packs it: the
 * status glyphs, then the role badge, then the chevron. The order is the real
 * one, because it is what puts the family mark next to the status marks.
 */
function UserRowSample({
  name,
  badge,
}: {
  name: string;
  badge: { label: string; className: string };
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b p-4 last:border-b-0">
      <span className="min-w-0 truncate text-sm text-foreground">{name}</span>
      <span className="flex shrink-0 items-center gap-2">
        <FileWarning className="h-4 w-4 text-warning" aria-hidden />
        <ShieldCheck className="h-4 w-4 text-success" aria-hidden />
        <MailCheck className="h-4 w-4 text-success" aria-hidden />
        <Pill
          label={badge.label}
          className={cn("px-2 py-0 text-[10px]", badge.className)}
        />
        <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden />
      </span>
    </div>
  );
}

/** The two acknowledgement shapes the app spends success green on. */
function AckSample({ tone }: { tone: (typeof ACK_TONES)[number] }) {
  return (
    <div className="flex flex-wrap items-start gap-4">
      <span
        className={cn(
          "flex shrink-0 items-center gap-2 rounded-md border bg-muted/50 px-3 py-1.5 text-sm",
          tone.chip,
        )}
      >
        <Copy className="h-4 w-4" aria-hidden />
        sogverse.com/r/8fk2
      </span>
      <span className={cn("rounded-md p-3 text-sm", tone.banner)}>
        Your changes have been saved.
      </span>
      <span className={cn("flex items-center gap-1.5 text-sm", tone.glyph)}>
        <Check className="h-4 w-4" aria-hidden />
        Verification email sent
      </span>
    </div>
  );
}

/**
 * An enrollment card's two coloured states, drawn from the card's own tone map.
 *
 * Both are convergences rather than repaints — the Live badge moves from the
 * success token onto glow, the awaiting card from info onto wit — which is why
 * the two columns look nearly identical and why they have to be seen adjacent to
 * be judged at all. The live card's amber edge is deliberately not here: it does
 * not move, and a before-and-after showing no difference reads as a fault.
 */
function EnrollmentStates({ palette }: { palette: YtyPalette }) {
  const tones = ENROLLMENT_TONES[palette];
  return (
    <div className="flex flex-wrap gap-4">
      <div className={cn("w-56 space-y-2 rounded-lg border bg-card p-4", tones.live)}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold text-foreground">
            Explorers Club
          </span>
          <span
            className={cn(
              "inline-flex items-center rounded-full border font-semibold",
              tones.liveBadge,
            )}
          >
            Live
          </span>
        </div>
        <p className="text-xs text-muted-foreground">Tonight, 17:00</p>
      </div>
      <div
        className={cn("w-56 space-y-2 rounded-lg border bg-card p-4", tones.awaiting)}
      >
        <span className="text-sm font-semibold text-foreground">
          Builders Camp
        </span>
        <div className="flex items-start gap-2">
          <Info className={tones.awaitingGlyph} aria-hidden />
          <p className="text-xs text-muted-foreground">
            Awaiting placement in a group
          </p>
        </div>
      </div>
    </div>
  );
}

/** The attendance chip's shape, so the tone is judged where it is spent. */
function AttendanceChip({ label, className }: { label: string; className: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-border px-2.5 py-0.5 text-xs font-medium",
        className,
      )}
    >
      {label}
    </span>
  );
}

/**
 * One element under the requested palette: soft on the glyph and every word,
 * strong on the wash and the edge. The four side by side is the only way the
 * wit seam is visible — on its own, a wit card looks fine.
 *
 * The classes come from the app's own colour map rather than being restated, so
 * this card is the draft's real presentation and not a picture of it.
 */
function PaletteElementCard({
  element,
  palette,
}: {
  element: (typeof YTY_ELEMENTS)[number];
  palette: YtyPalette;
}) {
  const color = ytyElementColor(element, palette);
  const Icon = element.icon;

  return (
    <div
      className={cn(
        "w-52 space-y-2 rounded-lg border p-4",
        color.bg,
        color.border,
      )}
    >
      <Icon className={cn("h-7 w-7", color.accent)} aria-hidden />
      <div className={cn("text-base font-semibold", color.accent)}>
        {element.name}
      </div>
      <p className={cn("text-sm", color.accent)}>{element.description}</p>
    </div>
  );
}

/**
 * A strip of the four Yty voice zones, straight out of the presentation maps
 * the voice room composes its zone list from — so the tile wash, the glyph
 * colour and the ring are the real ones.
 */
function ZoneTileStrip({ palette }: { palette: YtyPalette }) {
  const presentations =
    palette === "current" ? YTY_PRESENTATIONS : YTY_PRESENTATIONS_DRAFT;

  return (
    <div className="flex flex-wrap gap-3 p-4">
      {presentations.map((zone, index) => {
        const Icon = zone.icon;
        return (
          <div
            key={zone.id}
            className={cn(
              "flex w-36 flex-col items-center gap-2 rounded-lg p-4 ring-1",
              zone.color.tile,
              zone.color.ring,
            )}
          >
            <Icon className={cn("h-6 w-6", zone.color.glyph)} aria-hidden />
            <span className={cn("text-sm font-semibold", zone.color.glyph)}>
              {YTY_ELEMENTS[index].name}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function DesignPassWalkthroughPage() {
  return (
    <div className="space-y-8">
      <div className="rounded-lg border border-destructive/50 bg-destructive/10 px-4 py-3">
        <p className="max-w-prose text-sm text-foreground">
          <span className="font-semibold text-destructive">Temporary</span> —
          review aid for the brand design pass, deleted before merge.
        </p>
      </div>

      <div className="space-y-2">
        <h1 className="text-3xl font-bold">
          Brand design pass — colour & grammar
        </h1>
        <p className="max-w-prose text-muted-foreground">
          Can Sogverse be as fun, colourful, bright and lively as the sog.gg
          marketing site while keeping the dark ground — all while adhering to
          the Guidebook? Slides 4–14 rule on the system once; the rest apply it.
          Type is the other deck, at{" "}
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
      <Slide id="palette-today">
        <div className="space-y-3">
          <Marker>The four tokens the app ships</Marker>
          <div className="flex flex-wrap gap-4">
            {CURRENT_SWATCHES.map((swatch) => (
              <Swatch key={swatch.label} {...swatch} />
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <Marker>Glow beside the CTA</Marker>
          <div className="flex flex-wrap gap-4">
            {AMBER_COLLISION.map((swatch) => (
              <Swatch key={swatch.label} {...swatch} />
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <Marker>The brand — four pairs</Marker>
          <div className="flex flex-wrap gap-4">
            {BRAND_SWATCHES.map((swatch) => (
              <Swatch key={swatch.label} {...swatch} />
            ))}
          </div>
        </div>

        <Caption>Context — the hues themselves are already ruled on.</Caption>
      </Slide>

      {/* ----------------------------------------------------------- 2 */}
      <Slide id="strong-soft">
        <div className="space-y-3 rounded-lg border bg-card p-4">
          {SPLIT_ROWS.map((row) => (
            <div key={row.element} className="flex flex-wrap items-baseline gap-x-6">
              <span className="w-20 shrink-0 text-xs text-muted-foreground">
                {row.element}
              </span>
              <span className="flex items-baseline gap-2">
                <span className={cn("text-sm", row.strong)}>{SPLIT_SAMPLE}</span>
                <span
                  className={cn(
                    "text-[11px] tabular-nums",
                    row.strongRatio === "3.81:1"
                      ? "text-destructive"
                      : "text-muted-foreground",
                  )}
                >
                  {row.strongRatio}
                </span>
              </span>
              <span className="flex items-baseline gap-2">
                <span className={cn("text-sm", row.soft)}>{SPLIT_SAMPLE}</span>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {row.softRatio}
                </span>
              </span>
            </div>
          ))}
        </div>
        <Caption>
          Strong on the left, soft on the right, on the card ground — 4.5:1 is the
          body-text bar, and wit-strong is the only line under it.
        </Caption>

        <Ruling>
          <p>
            Accept the split — soft carries text and glyphs, strong carries fills,
            borders, rings and glows, on all four. (recommended: accept)
          </p>
        </Ruling>
      </Slide>

      {/* ----------------------------------------------------------- 3 */}
      <Slide id="grammar">
        <div className="flex flex-wrap gap-4">
          {GRAMMAR_CHIPS.map((chip) => (
            <GrammarChip key={chip.word} chip={chip} />
          ))}
        </div>

        <div className="space-y-3">
          <Marker>One violet, six meanings</Marker>
          <div className="space-y-2">
            {VIOLET_MEANINGS.map((row) => (
              <div key={row.chip} className="flex items-center gap-3">
                <span className="w-28 shrink-0">
                  <Pill
                    label={row.chip}
                    className="bg-secondary text-secondary-foreground"
                  />
                </span>
                <span className="text-sm text-muted-foreground">
                  {row.meaning}
                </span>
              </div>
            ))}
          </div>
        </div>

        <Ruling>
          <p>
            Adopt the grammar as the app&rsquo;s colour vocabulary. (recommended:
            adopt)
          </p>
          <p>
            Violet narrows to &ldquo;the world&rdquo; and stops carrying UI
            grammar. (recommended: narrow)
          </p>
        </Ruling>
      </Slide>

      {/* ----------------------------------------------------------- 4 */}
      <Slide id="strength">
        <div className="space-y-3">
          <Marker>One family, three strengths</Marker>
          <div className="flex flex-wrap gap-6">
            {STRENGTH_STEPS.map((step) => (
              <StrengthCell key={step.word} {...step} />
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <Marker>One amber, three jobs</Marker>
          <div className="flex flex-wrap gap-6">
            {AMBER_JOBS.map((job) => (
              <StrengthCell
                key={job.job}
                word={job.job}
                sample={job.sample}
                note={job.where}
                className={job.className}
              />
            ))}
          </div>
        </div>
        <Caption>
          The first two are the same fill and the same ink — the sidebar token
          mirrors the CTA token exactly.
        </Caption>

        <Ruling>
          <p>
            Adopt the strength axis — solid fill = act, tint = label, edge = the
            current selection. (recommended: adopt)
          </p>
        </Ruling>
      </Slide>

      {/* ----------------------------------------------------------- 5 */}
      <Slide id="you-are-here">
        <div className="flex flex-wrap gap-8">
          {NAV_TREATMENTS.map((treatment) => (
            <div key={treatment.label} className="space-y-2">
              <Marker>{treatment.label}</Marker>
              <NavSample active={treatment.active} rest={treatment.rest} />
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-8">
          {SELECTION_TREATMENTS.map((treatment) => (
            <div key={treatment.label} className="space-y-2">
              <Marker>{treatment.label}</Marker>
              <SelectionSample className={treatment.className} />
            </div>
          ))}
        </div>

        <Ruling>
          <p>
            Selected and active states leave amber, which stays the act colour.
            (recommended: the foreground-strength treatment)
          </p>
        </Ruling>
      </Slide>

      {/* ----------------------------------------------------------- 6 */}
      <Slide id="lifecycle">
        <BeforeAfter
          before={
            <div className="flex flex-wrap items-center gap-3">
              {PRODUCT_STATUS_TODAY.map((step) => (
                <LifecycleChip key={step.status} {...step} />
              ))}
            </div>
          }
          after={
            <div className="flex flex-wrap items-center gap-3">
              {PRODUCT_STATUS_DRAFT.map((step) => (
                <LifecycleChip key={step.status} {...step} />
              ))}
            </div>
          }
        />
        <Caption>
          Restated from the admin product chip, whose map is private to its
          module — completed and expired are the same two classes today.
        </Caption>

        <BeforeAfter
          before={
            <div className="flex flex-wrap items-start gap-2">
              {DELIVERY_TODAY.map((rung) => (
                <DeliveryRung key={rung.state} {...rung} />
              ))}
            </div>
          }
          after={
            <div className="flex flex-wrap items-start gap-2">
              {DELIVERY_DRAFT.map((rung) => (
                <DeliveryRung key={rung.state} {...rung} />
              ))}
            </div>
          }
        />
        <Caption>
          The WhatsApp console&rsquo;s delivery ladder, restated: it picks these
          in nested ternaries and keeps no map.
        </Caption>

        <Ruling>
          <p>
            Adopt the lifecycle idiom — one hue stepped by strength for the
            normal progression, a second colour only for the abnormal exit.
            (recommended: adopt)
          </p>
        </Ruling>
      </Slide>

      {/* ----------------------------------------------------------- 7 */}
      <Slide id="liveness">
        <BeforeAfter
          before={
            <div className="space-y-2">
              {LIVE_BADGES_TODAY.map((badge) => (
                <div key={badge.where} className="flex items-center gap-3">
                  <span className="w-20 shrink-0">
                    <LiveBadge className={badge.className} />
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {badge.where}
                  </span>
                </div>
              ))}
            </div>
          }
          after={
            <LiveBadge className={ENROLLMENT_TONES.brand.liveBadge} />
          }
        />
        <Caption>
          One word, two colours, on two surfaces a family can have open at once.
        </Caption>

        <Ruling>
          <p>
            Liveness is glow everywhere — the enrollment card, the gedu
            assignment card and both session feeds converge on one badge.
            (recommended: converge)
          </p>
        </Ruling>
      </Slide>

      {/* ----------------------------------------------------------- 8 */}
      <Slide id="time">
        <div className="space-y-3">
          <Marker>Session badges</Marker>
          {FUTURE_BADGES.map((badge) => (
            <div key={badge.label} className="flex flex-wrap items-center gap-6">
              <span className="w-36 shrink-0">
                <span className={cn(FUTURE_BADGE_SHAPE, badge.today)}>
                  {badge.label}
                </span>
              </span>
              <span className="w-36 shrink-0">
                <span className={cn(FUTURE_BADGE_SHAPE, badge.draft)}>
                  {badge.label}
                </span>
              </span>
            </div>
          ))}
        </div>

        <div className="space-y-3">
          <Marker>Rail markers</Marker>
          {FEED_MARKER_SAMPLES.map((row) => (
            <div key={row.label} className="flex flex-wrap items-center gap-6">
              <span className="w-52 shrink-0">
                <MarkerRow label={row.label} className={row.today} />
              </span>
              <span className="w-52 shrink-0">
                <MarkerRow label={row.label} className={row.draft} />
              </span>
            </div>
          ))}
        </div>

        <div className="space-y-3">
          <Marker>The now divider</Marker>
          {NOW_DIVIDER_TONES.map((tone) => (
            <NowDividerSample key={tone.pill} tone={tone} />
          ))}
        </div>
        <Caption>Today on the left and above; the draft beside and below.</Caption>

        <Ruling>
          <p>
            The feed&rsquo;s future system converges to wit — what the platform
            tells you about time ahead. (recommended: converge)
          </p>
        </Ruling>
      </Slide>

      {/* ----------------------------------------------------------- 9 */}
      <Slide id="eligibility">
        <BeforeAfter
          before={<EligibilityRow tone={ELIGIBILITY_TONES[0]} />}
          after={<EligibilityRow tone={ELIGIBILITY_TONES[1]} />}
        />
        <Caption>
          The product card&rsquo;s audience chip, the schools pill and the
          region-lock strip — one question, three colours.
        </Caption>

        <Ruling>
          <p>
            Eligibility is wit at label strength everywhere. (recommended: adopt)
          </p>
        </Ruling>
      </Slide>

      {/* ---------------------------------------------------------- 10 */}
      <Slide id="roles">
        <BeforeAfter
          before={
            <div className="flex flex-wrap items-center gap-3">
              {ROLE_BADGES_TODAY.map((badge) => (
                <Pill key={badge.label} {...badge} />
              ))}
            </div>
          }
          after={
            <div className="flex flex-wrap items-center gap-3">
              {ROLE_BADGES_PROPOSED.map((badge) => (
                <Pill key={badge.label} {...badge} />
              ))}
            </div>
          }
        />
        <Caption>
          Gedu is an amber-to-violet gradient today because a fourth role arrived
          with no hue left.
        </Caption>

        <div className="space-y-3">
          <Marker>Beside the status marks, at list density</Marker>
          <div className="overflow-hidden rounded-lg border bg-card">
            {USER_ROW_PEOPLE.map((name, index) => (
              <UserRowSample
                key={name}
                name={name}
                badge={ROLE_BADGES_TODAY[index]}
              />
            ))}
          </div>
          <div className="overflow-hidden rounded-lg border bg-card">
            {USER_ROW_PEOPLE.map((name, index) => (
              <UserRowSample
                key={name}
                name={name}
                badge={ROLE_BADGES_PROPOSED[index]}
              />
            ))}
          </div>
        </div>

        <Ruling>
          <p>
            Role badges take real families, retiring the gradient — the mapping
            itself is open to swaps. (recommended: adopt)
          </p>
        </Ruling>
      </Slide>

      {/* ---------------------------------------------------------- 11 */}
      <Slide id="violet-weight">
        {EMPHASIS_ACTIONS.map((action) => (
          <div key={action.label} className="flex flex-wrap items-center gap-4">
            {EMPHASIS_TREATMENTS.map((treatment) => (
              <div key={treatment.name} className="w-56 space-y-2">
                <span className={cn(BUTTON_SHAPE, treatment.className)}>
                  <action.icon className="h-4 w-4" aria-hidden />
                  {action.label}
                </span>
                <div className="text-[11px] text-muted-foreground">
                  {treatment.name}
                </div>
              </div>
            ))}
          </div>
        ))}
        <Caption>
          The gedu&rsquo;s send-report button and the locked Join — filled, but
          never the primary CTA.
        </Caption>

        <Ruling>
          <p>
            Pick the emphasis tier that replaces the violet fill.
            (recommended: foreground fill)
          </p>
        </Ruling>
      </Slide>

      {/* ---------------------------------------------------------- 12 */}
      <Slide id="ensemble">
        <BeforeAfter
          before={<AckSample tone={ACK_TONES[0]} />}
          after={<AckSample tone={ACK_TONES[1]} />}
        />
        <Caption>
          Glow stays reserved for domain facts — progress, achievement, presence,
          liveness — so green does not flood the ensemble.
        </Caption>

        <Ruling>
          <p>
            Adopt the trim — mechanical acknowledgements go quiet rather than
            converging onto glow. (recommended: adopt)
          </p>
        </Ruling>
      </Slide>

      {/* ---------------------------------------------------------- 13 */}
      <Slide id="warning-adjacency">
        <div className="flex flex-wrap gap-4">
          {AMBER_NEIGHBOURS.map((swatch) => (
            <Swatch key={swatch.label} {...swatch} />
          ))}
        </div>

        <div className="space-y-3">
          <Marker>The admin attention panel, both states of one slot</Marker>
          <div className="rounded-lg border bg-card">
            <div className="flex flex-row items-center justify-between gap-4 p-6">
              <span className="text-xl font-semibold text-foreground">
                Needs attention
              </span>
              <span className="rounded-full bg-warning/15 px-3 py-1 text-sm font-semibold text-warning">
                3
              </span>
            </div>
          </div>
          <div className="rounded-lg border bg-card">
            <div className="flex flex-row flex-wrap items-center justify-between gap-x-6 gap-y-3 p-6">
              <span className="font-display text-sm leading-relaxed tracking-normal text-primary sm:text-base">
                All clear
              </span>
              <span className="flex min-w-0 flex-wrap items-center justify-end gap-x-3 gap-y-2">
                <span className="text-sm text-muted-foreground">
                  Nothing is waiting on you.
                </span>
                <CircleCheck className="h-5 w-5 shrink-0 text-success" aria-hidden />
              </span>
            </div>
          </div>
        </div>

        <Ruling>
          <p>
            Own the adjacency — a warning mark always carries a glyph and never
            sits inside an amber-act container. (recommended: adopt)
          </p>
          <p>
            Or retune <code>--warning</code> away from amber — an escalation,
            since it moves a functional token.
          </p>
        </Ruling>
      </Slide>

      {/* ---------------------------------------------------------- 14 */}
      <Slide id="status-colours">
        {STATUS_SWATCH_ROWS.map((row) => (
          <div key={row.heading} className="space-y-3">
            <Marker>{row.heading}</Marker>
            <div className="flex flex-wrap gap-4">
              {row.swatches.map((swatch) => (
                <Swatch key={swatch.label} {...swatch} />
              ))}
            </div>
          </div>
        ))}
        <Caption>
          Distances are CIE76 in Lab; under about 25 two colours read as one thing
          at two strengths. Slides 7 and 8 are these two collisions in context.
        </Caption>

        <Ruling>
          <p>
            Status colours — A, converge <code>--info</code> onto wit and{" "}
            <code>--success</code> onto glow; B, keep both sets; or C, defer to
            the categorical-labelling follow-up. (recommended: A — both are
            tokens, so no call site changes)
          </p>
        </Ruling>
      </Slide>

      {/* ---------------------------------------------------------- 15 */}
      <Slide id="grammar-wild">
        <div className="space-y-3">
          <Marker>My SOG enrollment cards — today, then the draft</Marker>
          <EnrollmentStates palette="current" />
          <EnrollmentStates palette="brand" />
        </div>

        <div className="space-y-3">
          <Marker>Attendance chips</Marker>
          {ATTENDANCE_STATES.map((state) => (
            <div key={state} className="flex flex-wrap items-center gap-4">
              <span className="w-24 shrink-0">
                <AttendanceChip
                  label={state}
                  className={ATTENDANCE_TONE[state].text}
                />
              </span>
              <span className="w-24 shrink-0">
                <AttendanceChip label={state} className={ATTENDANCE_GRAMMAR[state]} />
              </span>
            </div>
          ))}
        </div>

        <Ruling>
          <p>
            Sign off the grammar per surface — My SOG, the family product page —
            or name which to hold back.
          </p>
        </Ruling>

        <Links>
          <DeckLink href="/preview/parent-dashboard/busy-family">
            My SOG as it ships
          </DeckLink>
          <DeckLink href="/preview/parent-dashboard/brand-palette">
            My SOG under the grammar
          </DeckLink>
          <DeckLink href="/preview/parent-club/active-club">
            The family product page
          </DeckLink>
        </Links>
      </Slide>

      {/* ---------------------------------------------------------- 16 */}
      <Slide id="gamer-floor">
        <Caption>
          No exhibit here: a breakpoint reads the browser window, not a box on
          this page, so 360px only tells the truth at 360px. Open both in a
          phone-sized window.
        </Caption>

        <Links>
          <DeckLink href="/preview/gamer-dashboard/typical">
            The page as it ships
          </DeckLink>
          <DeckLink href="/preview/gamer-dashboard/brand-palette">
            The same page under the draft
          </DeckLink>
        </Links>

        <Ruling>
          <p>
            Sign off the gamer dashboard&rsquo;s colour at the floor — the
            enrollment cards as one page — or name what to tune. The
            greeting&rsquo;s face is the typography deck.
          </p>
        </Ruling>
      </Slide>

      {/* ---------------------------------------------------------- 17 */}
      <Slide id="elements">
        <div className="flex flex-wrap gap-4">
          {YTY_ELEMENTS.map((element) => (
            <PaletteElementCard
              key={element.id}
              element={element}
              palette="current"
            />
          ))}
        </div>
        <div className="flex flex-wrap gap-4">
          {YTY_ELEMENTS.map((element) => (
            <PaletteElementCard
              key={element.id}
              element={element}
              palette="brand"
            />
          ))}
        </div>
        <Caption>
          Today above, the draft below — and wit is the one pair whose two
          variants sit far enough apart in hue to read as two colours, because
          wit-strong cannot carry body text on this ground.
        </Caption>

        <Ruling>
          <p>
            Sign off the element cards as drafted, or name what to tune.
            (recommended: sign off)
          </p>
          <p>
            Wit&rsquo;s pair — accept the seam, or escalate a tuned dark wit to
            the Guidebook&rsquo;s author. (recommended: accept)
          </p>
        </Ruling>

        <Links>
          <DeckLink href="/about#yty">The live About elements section</DeckLink>
        </Links>
      </Slide>

      {/* ---------------------------------------------------------- 18 */}
      <Slide id="buttons">
        <div className="space-y-2">
          {BUTTON_SAMPLES.map((row) => (
            <div key={row.name} className="flex flex-wrap items-center gap-4">
              <span className="w-56 shrink-0 text-xs text-muted-foreground">
                {row.name}
              </span>
              <span className={cn(BUTTON_SHAPE, row.className)}>
                Explore clubs
              </span>
            </div>
          ))}
        </div>

        <DeckTable head={["Variant", "Call sites", "Made of"]}>
          {BUTTON_COUNTS.map((row) => (
            <tr key={row.variant}>
              <Cell>{row.variant}</Cell>
              <Cell>{row.count}</Cell>
              <Cell muted>{row.note}</Cell>
            </tr>
          ))}
        </DeckTable>

        <Ruling>
          <p>
            The violet fill — retire it into Secondary-on-dark, or keep it under
            another name. (recommended: retire; it is one call site)
          </p>
          <p>
            The third tier — A ghost as today, B a quiet 1px border, or C label
            only.
          </p>
        </Ruling>

        <Links>
          <DeckLink href="/admin/ui-components#button-guidebook-proposal-today-beside-proposed">
            Every state in the style guide
          </DeckLink>
        </Links>
      </Slide>

      {/* ---------------------------------------------------------- 19 */}
      <Slide id="zones">
        <SampleGroup title="The four Yty zones — today, then the draft">
          <Sample
            label="Today"
            href="/admin/ui-components#voice-room-yty-zones-today-beside-the-brand-draft"
            linkLabel="Open the full zone list"
            surface={PAGE_SURFACE}
          >
            <ZoneTileStrip palette="current" />
          </Sample>
          <Sample
            label="Draft"
            href="/admin/ui-components#voice-room-yty-zones-today-beside-the-brand-draft"
            linkLabel="Open the full zone list"
            surface={PAGE_SURFACE}
          >
            <ZoneTileStrip palette="brand" />
          </Sample>
        </SampleGroup>
        <Caption>
          A zone label over its own tint is the draft&rsquo;s tightest pairing and
          still clears 6.32:1.
        </Caption>

        <Ruling>
          <p>Sign off the zone tiles, or name what to tune.</p>
        </Ruling>
      </Slide>

      {/* ---------------------------------------------------------- 20 */}
      <Slide id="reach">
        <Caption>
          Nothing to draw here — this is a rule, not an appearance. The Guidebook
          keeps billing, safeguarding and legal amber-only on a quiet ground;
          every other surface has the full palette by your direction.
        </Caption>

        <Ruling>
          <p>
            The calm ring — A, confirm amber-only there; or B, name what the
            palette may do (status and category marks, but not decoration).
            (recommended: A)
          </p>
        </Ruling>
      </Slide>

      {/* ---------------------------------------------------------- 21 */}
      <Slide id="recap">
        <ol className="max-w-prose list-decimal space-y-1.5 pl-5 text-sm text-foreground">
          <li>The strong and soft split.</li>
          <li>Adopt the colour grammar.</li>
          <li>Violet narrows to &ldquo;the world&rdquo;.</li>
          <li>The strength axis — solid = act, tint = label, edge = selection.</li>
          <li>Selected and active states leave amber.</li>
          <li>The lifecycle idiom — one hue, stepped.</li>
          <li>Liveness is glow everywhere.</li>
          <li>The future system converges to wit.</li>
          <li>Eligibility is wit at label strength.</li>
          <li>Role badges take real families, retiring the gradient.</li>
          <li>Violet&rsquo;s replacement emphasis — foreground fill, or heavy outline.</li>
          <li>The ensemble trim on mechanical acknowledgements.</li>
          <li>Warning&rsquo;s adjacency to amber — own it, or retune the token.</li>
          <li>Status colours — converge, keep both, or defer.</li>
          <li>The grammar per surface — My SOG, the family product page.</li>
          <li>The gamer dashboard&rsquo;s colour at the 360 floor.</li>
          <li>The Yty element cards as drafted.</li>
          <li>Wit&rsquo;s pair — accept the seam, or escalate a tuned dark wit.</li>
          <li>The violet fill button — retire, or keep under another name.</li>
          <li>The third button tier — A, B or C.</li>
          <li>The voice-zone tiles.</li>
          <li>The calm ring — confirm amber-only, or adjust.</li>
        </ol>
      </Slide>
    </div>
  );
}
