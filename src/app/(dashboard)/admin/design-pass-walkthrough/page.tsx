/* eslint-disable i18next/no-literal-string -- temporary admin-only review deck for the brand design pass; every string here is owner-facing walkthrough narration about drafts, never product copy that ships in any locale, and the whole page is deleted before the wiring phase merges */

import {
  HomeCtaSection,
  HomeFeaturesSection,
  HomeHeroSection,
  HomeHowItWorksSection,
  type HomeDraftClasses,
} from "@/components/home/home-page-body";
import { ENROLLMENT_TONES } from "@/components/family/enrollment-tones";
import { ATTENDANCE_TONE } from "@/components/session-feed/attendance-tone";
import {
  PRODUCT_TYPE_ORDER,
  PRODUCT_TYPE_PRESENTATION,
} from "@/components/admin/dashboard/product-type-presentation";
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
 * **Temporary.** A guided review deck for the brand palette and type design
 * pass, built so the owner can rule on the whole pass in one pass of one page
 * instead of opening a dozen preview scenes and holding the comparison in
 * memory. It is deleted from this branch before the wiring phase lands.
 *
 * Deliberately absent from the admin sidebar and from every index: this is not
 * a surface anybody navigates to, it is a link handed over once. The proxy
 * role-gates every path under `/admin` to the admin role, so reaching it by URL
 * is already gated without this page doing anything.
 *
 * **Every comparison renders the real components inline, right here** — never a
 * screenshot and never an iframed page. The home page's four colour-bearing
 * sections are exported from the page body for exactly this, so a sample in the
 * deck is the route's own code under a different palette prop and cannot drift
 * from it; the zone presentation maps and the Yty colour maps are consumed the
 * same way. Beside each sample is a plain link to the full preview scene, the
 * live page or a style-guide anchor, which is where the full-page truth lives.
 *
 * **Two honesty caveats, stated inline wherever they bite.** Tailwind
 * breakpoints read the *viewport*, not the container, so an inline sample is
 * always showing desktop styling however narrow its box is — where the 360 px
 * truth is the point (the gamer dashboard's cards, the greeting's wrapping) the
 * deck says so and leans on the link. And a sample sits on the deck's own ground unless it
 * says otherwise; the page-shaped samples are given `bg-background` so their
 * colour is judged against the ground the page actually has.
 *
 * Buttons and links in the samples are hand-written literal classes rather than
 * `buttonVariants` calls, on purpose: slide 10 quotes the recounted blast
 * radius of the `outline` variant, and a review aid that inflates the number it
 * asks a decision about would be arguing for the wrong decision.
 *
 * **Typography is not here.** The type half of the pass has its own deck at
 * `/admin/design-pass-typography` — the face specimens, all six Press Start 2P
 * sites, the gamer greeting's face and size, and CTA type. None of those rulings
 * waits on a colour decision, so each comparison has exactly one home and this
 * one is colour. That page is deleted before merge alongside this one.
 */

/* ------------------------------------------------------------------ */
/*  The deck                                                           */
/* ------------------------------------------------------------------ */

const SLIDES = [
  { id: "context", title: "What this pass is, and how to read the deck" },
  { id: "palette-today", title: "Why the palette is wrong today" },
  { id: "strong-soft", title: "The strong and soft split" },
  { id: "grammar", title: "Colour as grammar" },
  { id: "grammar-wild", title: "The grammar in the wild" },
  { id: "home-yty", title: "The home page, and the Yty element cards" },
  { id: "gradients", title: "Gradients are retired — one candidate left" },
  { id: "gamer-floor", title: "The gamer dashboard at the 360 floor" },
  { id: "wit", title: "Wit, up close" },
  { id: "buttons", title: "Buttons" },
  { id: "zones", title: "Voice-zone Yty tiles" },
  { id: "reach", title: "How far the palette reaches" },
  { id: "status-colours", title: "Status colours meet the brand palette" },
  { id: "recap", title: "Recap, and the decisions checklist" },
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
      className="scroll-mt-[calc(var(--header-height)+1rem)] space-y-5 rounded-lg border p-6"
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

function Prose({ children }: { children: React.ReactNode }) {
  return (
    <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
      {children}
    </p>
  );
}

function Marker({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
      {children}
    </div>
  );
}

function Ruling({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-2 rounded-lg border border-primary/40 bg-primary/5 p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-primary">
        Ruling asked
      </div>
      <div className="max-w-prose space-y-2 text-sm text-foreground">
        {children}
      </div>
    </div>
  );
}

function NoRuling({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        No ruling
      </div>
      <div className="max-w-prose text-sm text-muted-foreground">{children}</div>
    </div>
  );
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
  note,
  surface,
  children,
}: {
  label: string;
  href: string;
  linkLabel?: string;
  note?: string;
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
      {note ? (
        <p className="text-[11px] text-muted-foreground">{note}</p>
      ) : null}
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

/** The page ground plus the room the hero's negative top margin eats. */
const PAGE_SURFACE = "bg-background";
const HERO_SURFACE = "bg-background pt-[var(--header-height)]";

/* ------------------------------------------------------------------ */
/*  Tables and swatches                                                */
/* ------------------------------------------------------------------ */

function DeckTable({
  head,
  children,
}: {
  head: readonly string[];
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[40rem] text-sm">
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

function Swatch({
  label,
  hex,
  className,
}: {
  label: string;
  hex: string;
  className: string;
}) {
  return (
    <div className="w-32 space-y-1.5">
      <div className={cn("h-14 w-full rounded-md border", className)} />
      <div className="text-xs text-foreground">{label}</div>
      <div className="text-[11px] text-muted-foreground">{hex}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Slide data                                                         */
/* ------------------------------------------------------------------ */

/**
 * The three doses slide 6 compares, each paired with the scenario slug whose
 * page it is a slice of — so a sample and the link beside it can never point at
 * different things.
 */
const HOME_DOSES: readonly {
  slug: string;
  label: string;
  palette: YtyPalette;
}[] = [
  { slug: "current", label: "Today", palette: "current" },
  { slug: "brand-palette", label: "Accented", palette: "brand" },
  { slug: "brand-lively", label: "Lively", palette: "brand-lively" },
];

/**
 * **The retired dusk hero, kept as an exhibit and nothing else.**
 *
 * Flat is the drafts' default now, so there is no scenario drawing this and no
 * page anywhere that renders it. It survives here because it is the one
 * brand-hue blend with a case to make — it imitates the dusk sky of the brand's
 * own social imagery rather than mixing two hues for want of a third — and a
 * case cannot be judged against a description.
 *
 * The class strings are the ones the lively dose carried before the flat
 * default landed, copied verbatim and frozen. Every slot but the hero's own is
 * the *current* lively dose, because nothing else on this exhibit is under
 * question: `HomeHeroSection` reads only `hero`, `heroTitle`, `heroPrimary` and
 * `heroSecondary`, and the rest are here to satisfy the shape.
 *
 * **Exhibit-only. Do not copy these into a dose.** If the ruling keeps the dusk
 * sky, it goes back into the lively dose as a sanctioned exception and this
 * constant is deleted; if the ruling kills it, this constant is deleted. Either
 * way it has no future outside this slide.
 */
const DUSK_HERO_EXHIBIT: HomeDraftClasses = {
  hero:
    "relative -mt-[var(--header-height)] overflow-hidden bg-[linear-gradient(to_bottom,_transparent_0%,_hsl(var(--background))_100%),radial-gradient(75%_60%_at_74%_6%,_color-mix(in_oklab,_var(--color-yty-harmony-strong)_22%,_transparent)_0%,_transparent_72%),radial-gradient(70%_62%_at_16%_34%,_color-mix(in_oklab,_var(--color-yty-wit-strong)_18%,_transparent)_0%,_transparent_72%)] pt-[var(--header-height)]",
  heroTitle:
    "font-display text-2xl font-bold leading-tight tracking-tight md:text-6xl",
  heroPrimary: "text-foreground",
  heroSecondary:
    "box-decoration-clone rounded-lg bg-yty-glow-strong px-3 text-background",
  howItWorksSection: "bg-yty-harmony-strong/10 py-24",
  stepCircles: [
    "mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-yty-harmony-strong text-2xl font-bold text-background ring-4 ring-yty-harmony-strong/25",
    "mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-yty-glow-strong text-2xl font-bold text-background ring-4 ring-yty-glow-strong/25",
    "mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-yty-wit-soft text-2xl font-bold text-background ring-4 ring-yty-wit-soft/25",
  ],
  ctaCard: "mx-auto max-w-3xl bg-yty-harmony-strong/15",
  sectionRule: "mx-auto mt-6 h-1 w-24 rounded-full bg-yty-harmony-strong",
};

/** The live tokens, each against the hue the brand actually fixes for it. */
const TODAY_TOKENS: readonly {
  element: string;
  brand: string;
  hex: string;
  renders: string;
}[] = [
  {
    element: "Harmony",
    brand: "Pink",
    hex: "#34d399",
    renders: "Green — which is Glow's family, not Harmony's",
  },
  {
    element: "Glow",
    brand: "Green",
    hex: "#fbbf24",
    renders: "Amber — the same family as the CTA amber, which it collides with",
  },
  {
    element: "Valor",
    brand: "Orange",
    hex: "#fb7185",
    renders: "Rose — which is Harmony's family, not Valor's",
  },
  { element: "Wit", brand: "Blue", hex: "#a78bfa", renders: "Violet" },
];

const CURRENT_SWATCHES: readonly { label: string; hex: string; className: string }[] =
  [
    { label: "Harmony (today)", hex: "#34d399", className: "bg-yty-harmony" },
    { label: "Glow (today)", hex: "#fbbf24", className: "bg-yty-glow" },
    { label: "Valor (today)", hex: "#fb7185", className: "bg-yty-valor" },
    { label: "Wit (today)", hex: "#a78bfa", className: "bg-yty-wit" },
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

/**
 * The card-ground column of `node scripts/yty-contrast.mjs`. The card
 * (`#1a1a1a`) is the lighter of the two grounds these pairings sit on, so its
 * numbers are the binding ones; the page ground is looser everywhere.
 */
const CONTRAST_ROWS: readonly {
  element: string;
  strongHex: string;
  strong: string;
  softHex: string;
  soft: string;
  zone: string;
}[] = [
  {
    element: "Harmony",
    strongHex: "#F55B9A",
    strong: "5.67:1",
    softHex: "#FA7FA3",
    soft: "7.15:1",
    zone: "6.32:1",
  },
  {
    element: "Glow",
    strongHex: "#1AB061",
    strong: "6.16:1",
    softHex: "#6AC66B",
    soft: "8.21:1",
    zone: "7.16:1",
  },
  {
    element: "Valor",
    strongHex: "#FD700D",
    strong: "6.22:1",
    softHex: "#FF993D",
    soft: "8.18:1",
    zone: "7.16:1",
  },
  {
    element: "Wit",
    strongHex: "#3A71DE",
    strong: "3.81:1",
    softHex: "#4DB3F5",
    soft: "7.53:1",
    zone: "6.84:1",
  },
];

/* ------------------------------------------------------------------ */
/*  Slide 4 — colour as grammar                                        */
/* ------------------------------------------------------------------ */

/**
 * The proposed vocabulary: one family, one meaning, derived from what the Yty
 * elements already stand for rather than invented beside them.
 */
const GRAMMAR_CHIPS: readonly {
  family: string;
  word: string;
  swatch: string;
  wordClass: string;
  examples: readonly string[];
  note: string | null;
}[] = [
  {
    family: "Amber — the incumbent",
    word: "Act",
    swatch: "bg-primary",
    wordClass: "text-primary",
    examples: ["Primary CTA", "Links", "The identity mark"],
    note: "Its power is scarcity. Every other use spends some of it.",
  },
  {
    family: "Harmony pink",
    word: "People",
    swatch: "bg-yty-harmony-strong",
    wordClass: "text-yty-harmony-soft",
    examples: ["Friends", "Groups", "Community", "Parent and child"],
    note: null,
  },
  {
    family: "Glow green",
    word: "Growth",
    swatch: "bg-yty-glow-strong",
    wordClass: "text-yty-glow-soft",
    examples: ["Progress", "Achievements", "Yty-Points"],
    note: "The success token converges into it — slide 13.",
  },
  {
    family: "Wit blue",
    word: "Knowledge",
    swatch: "bg-yty-wit-strong",
    wordClass: "text-yty-wit-soft",
    examples: ["Information", "Learning", "Tips"],
    note: "The info token converges into it — slide 13.",
  },
  {
    family: "Valor orange",
    word: "Adventure",
    swatch: "bg-yty-valor-strong",
    wordClass: "text-yty-valor-soft",
    examples: ["Camps", "Events", "Live now"],
    note: "Used with care: it neighbours amber.",
  },
  {
    family: "Violet — open ruling",
    word: "The world",
    swatch: "bg-secondary",
    wordClass: "text-secondary",
    examples: ["Lore", "Dusk", "Display moments"],
    note: "Today it is the ambient second colour. The proposal narrows it to this and takes it out of UI grammar.",
  },
];

/**
 * Five chips the app draws in the same violet, meaning five unrelated things.
 * Identical on purpose — that is the exhibit.
 */
const VIOLET_MEANINGS: readonly {
  chip: string;
  meaning: string;
  where: string;
}[] = [
  {
    chip: "Parent",
    meaning: "A role",
    where: "The customer role badge",
  },
  {
    chip: "Join voice",
    meaning: "Locked and inert",
    where: "The Join button outside its window",
  },
  {
    chip: "Read",
    meaning: "A delivery receipt",
    where: "The admin WhatsApp double-check",
  },
  {
    chip: "Completed",
    meaning: "A finished participation",
    where: "The admin user detail's status badge",
  },
  {
    chip: "12 waiting",
    meaning: "A neutral count or tag",
    where: "Waitlist and unassigned counts, category tags",
  },
];

/** The four role badges exactly as the app draws them today. */
const ROLE_BADGES_TODAY: readonly { label: string; className: string }[] = [
  { label: "Gamer", className: ROLE_BADGE_STYLES.gamer },
  { label: "Parent", className: ROLE_BADGE_STYLES.customer },
  { label: "Gedu", className: ROLE_BADGE_STYLES.gedu },
  { label: "Admin", className: ROLE_BADGE_STYLES.admin },
];

/**
 * **An illustration, not a proposal.** One way the four roles could take real
 * families under the grammar, drawn so the question has something to look at.
 * Gedu uses wit's *soft* variant rather than its strong one for the same reason
 * the home page's third circle does: ink on wit-strong measures 3.81:1, under
 * the bar a chip label needs.
 */
const ROLE_BADGES_ILLUSTRATED: readonly {
  label: string;
  className: string;
  why: string;
}[] = [
  {
    label: "Gamer",
    className: "bg-yty-glow-strong text-background",
    why: "Growth — or amber, unchanged, if the child's badge should stay the mark's colour",
  },
  {
    label: "Parent",
    className: "bg-yty-harmony-strong text-background",
    why: "People",
  },
  {
    label: "Gedu",
    className: "bg-yty-wit-soft text-background",
    why: "Knowledge",
  },
  {
    label: "Admin",
    className: "bg-foreground text-background",
    why: "Ink, unchanged — the one role that is not a family",
  },
];

/**
 * Every surface in the app that has to tell three or more states apart. This is
 * the argument that colour is already grammar here: ten systems, each of which
 * picked its colours alone.
 */
const MULTI_STATE_SURFACES: readonly {
  surface: string;
  states: string;
  today: string;
  grammar: string;
}[] = [
  {
    surface: "Role badges",
    states: "4",
    today: "Amber, violet, ink — and an amber-to-violet gradient for the fourth",
    grammar: "Real families, and no invented colour",
  },
  {
    surface: "Participation status",
    states: "4",
    today: "Success green, warning amber, muted, violet for completed",
    grammar:
      "Growth for active; the queue and the finished seat get meanings rather than whatever was unused",
  },
  {
    surface: "Product status chip",
    states: "5",
    today:
      "Amber tint, amber fill, muted, destructive tint — and muted again, so two of the five are identical",
    grammar: "Adventure and growth are both unspent here",
  },
  {
    surface: "Attendance tone",
    states: "3",
    today: "Success, muted, and warning for absent — deliberately not red",
    grammar:
      "Growth reads a register better than 'success' does; absent-is-not-a-failure survives either way",
  },
  {
    surface: "Session-feed rail dots",
    states: "4",
    today: "Info, warning, success, muted",
    grammar: "Knowledge and growth by construction, once slide 13 converges",
  },
  {
    surface: "Game-account verification",
    states: "4",
    today: "Success, warning, destructive, muted",
    grammar: "Unchanged in meaning; it inherits the converged green",
  },
  {
    surface: "WhatsApp delivery",
    states: "4",
    today: "Muted, muted, success — and violet for read",
    grammar:
      "Knowledge or growth says 'read' without borrowing the world's colour",
  },
  {
    surface: "Product-type presentation",
    states: "4",
    today:
      "Cyan, magenta, lime, indigo — the one system with a written rationale for staying separate",
    grammar: "Converge, or stay separate. The ruling below",
  },
  {
    surface: "Voice-zone rainbow",
    states: "16",
    today: "A tuned sixteen-hue identity ring, meaning-free by design",
    grammar:
      "Stays meaning-free, and must stay visually clear of the state colours — a constraint the grammar tightens rather than relaxes",
  },
  {
    surface: "Fee status",
    states: "4",
    today: "No colour at all",
    grammar: "The gap: four states with nothing to read them by",
  },
];

/* ------------------------------------------------------------------ */
/*  Slide 5 — the grammar in the wild                                  */
/* ------------------------------------------------------------------ */

/**
 * **The product-type mapping the grammar would give the shop.**
 *
 * Derived from what each type *is* rather than assigned: a camp is an
 * adventure, a club is where a child grows week by week, a municipality club
 * reaches them through school, and an event is people in a room together.
 *
 * The tile takes the strong variant at a tenth and the glyph the soft one, which
 * is the same split every other draft surface follows — a chip label is
 * body-size text, so the 4.5:1 bar applies and soft is what clears it (6.35–7.20
 * over its own tint on the card ground).
 *
 * Classes are literal strings because Tailwind scans source text; the icons come
 * from the app's own product-type map rather than being re-picked here, so the
 * glyph in a sample is the glyph the product uses.
 */
const PRODUCT_TYPE_GRAMMAR: Record<
  (typeof PRODUCT_TYPE_ORDER)[number],
  { family: string; tile: string; glyph: string; edge: string; why: string }
> = {
  consumer_club: {
    family: "Glow — growth",
    tile: "border-yty-glow-strong/40 bg-yty-glow-strong/10",
    glyph: "text-yty-glow-soft",
    edge: "border-yty-glow-strong/25",
    why: "A club is the same children, every week, getting better at something",
  },
  municipality_club: {
    family: "Wit — knowledge",
    tile: "border-yty-wit-strong/40 bg-yty-wit-strong/10",
    glyph: "text-yty-wit-soft",
    edge: "border-yty-wit-strong/25",
    why: "The club a school or a municipality puts on, reaching a child through their education",
  },
  camp: {
    family: "Valor — adventure",
    tile: "border-yty-valor-strong/40 bg-yty-valor-strong/10",
    glyph: "text-yty-valor-soft",
    edge: "border-yty-valor-strong/25",
    why: "A week away from the ordinary week — the clearest fit of the four",
  },
  event: {
    family: "Harmony — people",
    tile: "border-yty-harmony-strong/40 bg-yty-harmony-strong/10",
    glyph: "text-yty-harmony-soft",
    edge: "border-yty-harmony-strong/25",
    why: "A one-off everybody turns up to; the point of it is who is there",
  },
};

/**
 * The two parent-dashboard states the grammar moves, each drawn from the card's
 * own tone map so the sample is the card's real presentation.
 *
 * A third state is deliberately absent: the live card's amber edge, which does
 * not move. That is on the slide as prose rather than as a row, because a
 * before-and-after pair showing no difference reads as a rendering fault.
 */
const PARENT_STATE_SAMPLES: readonly {
  label: string;
  today: string;
  draft: string;
  why: string;
}[] = [
  {
    label: "Live",
    today: ENROLLMENT_TONES.current.liveBadge,
    draft: ENROLLMENT_TONES.brand.liveBadge,
    why: "Growth, where it takes the success token today — and the same green either way once the tokens converge",
  },
];

/**
 * The family feed's rail marker, today and under the grammar.
 *
 * **Restated rather than imported, and the reason is the finding.** The family
 * feed builds this class inline and deliberately keeps no state vocabulary —
 * "the markers on the rail carry no state here" is its own comment — so there is
 * no map to read. What it distinguishes is future from past and prominent from
 * quiet, nothing more.
 */
const FEED_MARKER_SAMPLES: readonly {
  label: string;
  today: string;
  draft: string;
  why: string;
}[] = [
  {
    label: "Next session",
    today: "bg-info",
    draft: "bg-yty-wit-soft",
    why: "Knowledge — the same blue either way once the tokens converge",
  },
  {
    label: "Later sessions",
    today: "bg-info/40",
    draft: "bg-yty-wit-soft/40",
    why: "The same hue at the quiet alpha the rail already uses",
  },
  {
    label: "Sessions that have run",
    today: "bg-muted-foreground/60",
    draft: "bg-muted-foreground/60",
    why: "Unchanged. History is not a state, and the family feed grades nothing",
  },
];

/**
 * The attendance chip's three states under the grammar, beside the app's own
 * `ATTENDANCE_TONE`.
 *
 * Only one of the three moves, and that is worth seeing: present converges onto
 * growth, absent keeps warning amber because absent-is-not-a-failure is a
 * decision this pass does not reopen, and unmarked stays muted because it is the
 * absence of a mark rather than a state.
 */
const ATTENDANCE_STATES = [
  "present",
  "absent",
  "unmarked",
] as const satisfies readonly (keyof typeof ATTENDANCE_TONE)[];

const ATTENDANCE_GRAMMAR: Record<
  keyof typeof ATTENDANCE_TONE,
  { text: string; why: string }
> = {
  present: {
    text: "text-yty-glow-soft",
    why: "Growth — the one of the three that moves",
  },
  absent: {
    text: "text-warning",
    why: "Unchanged. Warning amber is far enough from valor to stay, and absent is not a failure",
  },
  unmarked: {
    text: "text-muted-foreground/70",
    why: "Unchanged. The absence of a mark is not a state to colour",
  },
};

/* ------------------------------------------------------------------ */
/*  Slide 7 — the gradient inventory                                   */
/* ------------------------------------------------------------------ */

const GRADIENT_SITES: readonly {
  site: string;
  today: string;
  proposal: string;
}[] = [
  {
    site: "Home hero",
    today: "Two radial brand glows blended into a dusk sky",
    proposal:
      "The one candidate. Retired in both drafts; drawn above as an exhibit, and yours to reinstate",
  },
  {
    site: "Hero wash on the accented dose",
    today: "Amber on the left, violet on the right — today's live page",
    proposal:
      "Retired. One harmony wash in its place; the subtitle over it measures 6.28:1",
  },
  {
    site: "How-it-works band",
    today: "Harmony into wit, both at 10%",
    proposal: "Retired. One harmony wash at the same 10%",
  },
  {
    site: "Closing CTA card",
    today:
      "Three stops on the lively dose, amber into pink on the accented one",
    proposal:
      "Retired both. One hue says the same thing and measures better — 6.39:1 against 5.86:1 on the lively card; the accented card takes amber, the act colour, at 6.52:1",
  },
  {
    site: "Section rule",
    today: "Pink through blue into green",
    proposal:
      "Retired. Solid pink — which is the standing cost: flattening forces a hue to be chosen",
  },
  {
    site: "Mission card and Yty overview card",
    today: "Amber into violet at 5%, on the About page and nowhere else",
    proposal:
      "Retired in every brand dose. One harmony wash at 10%, on both cards",
  },
  {
    site: "Same-hue fades to transparent",
    today:
      "The Yty colour map's bgGradient slot, the accented hero's harmony radial, and the live-card edges on enrollment and assignment cards",
    proposal:
      "Kept, and reclassified: one hue fading to transparent adds no second colour and invents nothing, so it is a wash rather than a smear",
  },
  {
    site: "Gedu role badge",
    today: "Amber into violet, because a fourth role had no hue left",
    proposal: "Retire — solved by the role families on slide 4",
  },
  {
    site: "Email hero glows",
    today:
      "Amber and violet glows, already pre-blended to flat hexes for mail clients",
    proposal:
      "Decide at wiring with the email suite — the blend survives only in the name",
  },
];

/**
 * The button shape every sample below wears — the base of the real variant
 * recipe at its default size.
 *
 * **Written out rather than called for.** Using the button primitive here would
 * add call sites to the very counts this slide asks a decision about, so the
 * samples are literal copies of the variants' own class strings on inert spans.
 * They are at rest only; the style guide draws every state.
 */
const BUTTON_SHAPE =
  "inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium transition-colors";

const BUTTON_SAMPLES: readonly {
  name: string;
  note: string;
  className: string;
}[] = [
  {
    name: "Primary",
    note: "Today's default, and the Guidebook's Primary to the digit — nothing to decide",
    className: "bg-primary text-primary-foreground shadow hover:bg-primary/90",
  },
  {
    name: "Secondary on dark — proposed",
    note: "The Guidebook's own on-dark button: transparent, 2 px foreground border",
    className:
      "border-2 border-foreground bg-transparent text-foreground hover:bg-foreground/10",
  },
  {
    name: "outline — today",
    note: "1 px grey border, 61 call sites",
    className:
      "border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground",
  },
  {
    name: "secondary — today",
    note: "The violet fill, 1 call site",
    className:
      "bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80",
  },
  {
    name: "Third tier, A — ghost as today",
    note: "No border, no fill until hover, 24 call sites",
    className: "hover:bg-accent hover:text-accent-foreground",
  },
  {
    name: "Third tier, B — quiet 1 px border",
    note: "Proposed: bounded, but recessive",
    className:
      "border border-input bg-transparent hover:bg-accent hover:text-accent-foreground",
  },
  {
    name: "Third tier, C — label only",
    note: "Proposed: no border and no fill, ever",
    className: "text-muted-foreground hover:text-foreground",
  },
];

const BUTTON_COUNTS: readonly {
  variant: string;
  count: string;
  note: string;
}[] = [
  {
    variant: "outline — today's 1px grey border",
    count: "61",
    note: "44 buttons plus 17 link anchors wearing the button's clothes",
  },
  {
    variant: "ghost — today's borderless quiet tier",
    count: "24",
    note: "all real buttons",
  },
  {
    variant: "secondary — today's violet fill",
    count: "1",
    note: "a single link anchor, and no real button anywhere",
  },
];

/**
 * The functional status tokens against the brand family each one now sits in.
 *
 * Hexes are what the browser resolves the HSL triples in globals.css to, and
 * the distances are CIE76 in Lab — a rough but honest "how far apart would a
 * person call these". Under about 25 is the range where two colours read as
 * two shades of one thing rather than two things.
 */
const STATUS_COLLISIONS: readonly {
  token: string;
  hex: string;
  against: string;
  againstHex: string;
  hue: string;
  distance: string;
}[] = [
  {
    token: "--info",
    hex: "#308CE8",
    against: "Wit strong",
    againstHex: "#3A71DE",
    hue: "210° vs 220°",
    distance: "17.5",
  },
  {
    token: "--info",
    hex: "#308CE8",
    against: "Wit soft",
    againstHex: "#4DB3F5",
    hue: "210° vs 204°",
    distance: "22.7",
  },
  {
    token: "--success",
    hex: "#2EB88A",
    against: "Glow strong",
    againstHex: "#1AB061",
    hue: "160° vs 148°",
    distance: "19.1",
  },
  {
    token: "--success",
    hex: "#2EB88A",
    against: "Glow soft",
    againstHex: "#6AC66B",
    hue: "160° vs 121°",
    distance: "24.7",
  },
  {
    token: "--warning",
    hex: "#E7B008",
    against: "Valor strong",
    againstHex: "#FD700D",
    hue: "45° vs 25°",
    distance: "43.9",
  },
  {
    token: "--destructive",
    hex: "#EF4343",
    against: "Harmony strong",
    againstHex: "#F55B9A",
    hue: "0° vs 335°",
    distance: "42.6",
  },
];

/** A swatch row: the status token, then the two brand variants beside it. */
const STATUS_SWATCH_ROWS: readonly {
  heading: string;
  swatches: readonly { label: string; hex: string; className: string }[];
}[] = [
  {
    heading: "One blue, or three?",
    swatches: [
      { label: "--info", hex: "#308CE8", className: "bg-info" },
      { label: "Wit strong", hex: "#3A71DE", className: "bg-yty-wit-strong" },
      { label: "Wit soft", hex: "#4DB3F5", className: "bg-yty-wit-soft" },
    ],
  },
  {
    heading: "One green, or three?",
    swatches: [
      { label: "--success", hex: "#2EB88A", className: "bg-success" },
      { label: "Glow strong", hex: "#1AB061", className: "bg-yty-glow-strong" },
      { label: "Glow soft", hex: "#6AC66B", className: "bg-yty-glow-soft" },
    ],
  },
];

/**
 * The same collision as the app actually draws it — the tinted chip shape both
 * halves already use, so the confusion is visible in context rather than as
 * squares. Left of each pair is a real status chip; right of it is the brand
 * family the draft would put beside it on the same screen.
 */
const STATUS_CHIPS: readonly {
  caption: string;
  status: { label: string; className: string };
  brand: { label: string; className: string };
}[] = [
  {
    caption: "Blue",
    status: {
      label: "Info notice",
      className: "border-info/40 bg-info/10 text-info",
    },
    brand: {
      label: "Wit — technology",
      className:
        "border-yty-wit-strong/40 bg-yty-wit-strong/10 text-yty-wit-soft",
    },
  },
  {
    caption: "Green",
    status: {
      label: "Payment succeeded",
      className: "border-success/40 bg-success/10 text-success",
    },
    brand: {
      label: "Glow — others",
      className:
        "border-yty-glow-strong/40 bg-yty-glow-strong/10 text-yty-glow-soft",
    },
  },
];

function StatusChip({
  label,
  className,
}: {
  label: string;
  className: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold",
        className,
      )}
    >
      {label}
    </span>
  );
}

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
function GrammarChip({
  chip,
}: {
  chip: (typeof GRAMMAR_CHIPS)[number];
}) {
  return (
    <div className="w-56 space-y-2 rounded-lg border p-4">
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
      {chip.note ? (
        <p className="text-[11px] leading-snug text-muted-foreground">
          {chip.note}
        </p>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Slide 5 — the samples                                              */
/* ------------------------------------------------------------------ */

/**
 * The four type nouns, in English, for the deck's own labels.
 *
 * The app reads these out of `admin.products.types` per locale; this page is
 * admin-only English narration, and importing a translator into a review aid to
 * say the word "Camp" would be ceremony.
 */
const TYPE_LABELS: Record<(typeof PRODUCT_TYPE_ORDER)[number], string> = {
  consumer_club: "Club",
  municipality_club: "Municipality club",
  camp: "Camp",
  event: "Event",
};

/** A tinted glyph tile — the mark both palettes hang the product type on. */
function TypeGlyph({
  type,
  tile,
  glyph,
}: {
  type: (typeof PRODUCT_TYPE_ORDER)[number];
  tile: string;
  glyph: string;
}) {
  const Icon = PRODUCT_TYPE_PRESENTATION[type].icon;
  return (
    <span
      className={cn(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border",
        tile,
      )}
    >
      <Icon className={cn("h-4 w-4", glyph)} aria-hidden />
    </span>
  );
}

/**
 * A slice of a shop browse card: the edge, the type mark, the name, and the
 * amber price row.
 *
 * **The markup is a copy and the colours are the argument.** The real browse
 * card is four components deep with a five-way fan-out at the leaves, and it
 * carries *no* product-type mark at all today — so a threaded palette prop here
 * would not be recolouring an existing element, it would be adding one to a live
 * component for a draft's benefit. That is the case the scene rules call a third
 * fork, so the shop is drawn here and linked rather than forked. What is real is
 * the glyph (the app's own product-type map) and every class string, which are
 * the card's own literals.
 */
function ShopCardSample({
  type,
  draft,
}: {
  type: (typeof PRODUCT_TYPE_ORDER)[number];
  draft: boolean;
}) {
  const grammar = PRODUCT_TYPE_GRAMMAR[type];
  return (
    <div
      className={cn(
        "w-56 space-y-3 rounded-lg border bg-card p-4",
        draft && grammar.edge,
      )}
    >
      <div className="flex items-center gap-2">
        {draft ? (
          <TypeGlyph type={type} tile={grammar.tile} glyph={grammar.glyph} />
        ) : null}
        <span
          className={cn(
            "text-[11px] font-semibold uppercase tracking-wider",
            draft ? grammar.glyph : "text-muted-foreground",
          )}
        >
          {TYPE_LABELS[type]}
        </span>
      </div>
      <div className="text-sm font-semibold leading-snug text-foreground">
        Explorers Club
      </div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-base font-semibold text-foreground">€29/mo</span>
        <span className="text-sm font-medium text-primary">Read more ›</span>
      </div>
    </div>
  );
}

/** A rail dot at the size the family feed draws it, with its label beside it. */
function MarkerRow({
  label,
  className,
}: {
  label: string;
  className: string;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={cn("h-2.5 w-2.5 rounded-full", className)} aria-hidden />
      <span className="text-xs text-muted-foreground">{label}</span>
    </span>
  );
}

/** The attendance chip's shape, so the tone is judged where it is spent. */
function AttendanceChip({
  label,
  className,
}: {
  label: string;
  className: string;
}) {
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

/* ------------------------------------------------------------------ */
/*  Element cards and zone tiles                                       */
/* ------------------------------------------------------------------ */

/**
 * One element under the requested palette: soft on the glyph and every word,
 * strong on the wash and the edge. The four side by side is the only way the
 * wit seam is visible — on its own, a wit card looks fine.
 *
 * The classes come from the app's own colour map rather than being restated, so
 * this card is the draft's real presentation and not a picture of it. The
 * copy is the canonical English in the constants; the shipped surfaces read the
 * same words out of the `yty` messages.
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
 * colour and the ring are the real ones. The room's own tile carries more
 * (occupancy, a glow, moderator controls); what is ruled on here is the colour.
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
      <div className="space-y-2 rounded-lg border border-destructive/50 bg-destructive/10 p-4">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-destructive">
          Temporary
        </div>
        <p className="max-w-prose text-sm text-foreground">
          Temporary review aid for the brand design pass — this page is deleted
          before merge. It is in no sidebar and no index; it exists so the colour
          half of the pass can be ruled on in one sitting.
        </p>
      </div>

      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Brand design pass — colour</h1>
        <p className="max-w-prose text-muted-foreground">
          Fourteen slides. Each one shows today beside the draft, says why the
          draft is what it is, and names the ruling it wants from you.
        </p>
      </div>

      <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
        <Marker>Typography is a separate page</Marker>
        <p className="max-w-prose text-sm text-muted-foreground">
          The type half of this pass now has its own deck at{" "}
          <a
            href="/admin/design-pass-typography"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            /admin/design-pass-typography
          </a>{" "}
          — the three faces, all six Press Start 2P sites one slide each, the
          gamer greeting&rsquo;s face and its size, and CTA type. None of those
          rulings waits on a colour decision, so they are answerable on their own
          and this deck is colour only. Both pages are deleted before merge.
        </p>
      </div>

      <div className="space-y-3 rounded-lg border border-primary/40 bg-primary/5 p-5">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-primary">
          The question this pass answers
        </div>
        <p className="max-w-prose text-lg font-semibold leading-snug text-foreground">
          Can Sogverse be as fun, colourful, bright and lively as the sog.gg
          marketing site while keeping the dark ground — all while adhering to
          the Guidebook?
        </p>
        <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
          Every slide below is evidence toward that answer. The Guidebook does
          not stand in the way of it: its own colour-rationing rule welcomes the
          full palette on marketing, gamer, community and in-world surfaces, and
          caps liveliness only in the calm ring — billing, safety and legal —
          where amber stays the single accent on a quiet ground. The home page
          is a marketing surface, so it is where the answer is drawn.
        </p>
      </div>

      <nav className="space-y-3 rounded-lg border p-4">
        <Marker>Slides</Marker>
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
      <Slide id="context">
        <Prose>
          This branch is the visual half of the Guidebook alignment: the
          Guidebook&rsquo;s Yty-Element colours and its button set, interpreted on
          Sogverse&rsquo;s dark ground — its display faces are the typography
          deck&rsquo;s half of the same alignment. Nothing live has
          moved. Every real route still renders exactly what it rendered before
          — the drafts live in preview scenes and in the UI Components style
          guide, which is what this deck walks you through.
        </Prose>
        <Prose>
          Rulings you have already made, carried into every slide below: the
          dark theme stays, so this is a dark interpretation of the Guidebook
          palette and not a white one; the Yty hues become the brand&rsquo;s
          exactly; and it is UI first, then wiring — nothing promotes to a live
          surface without your sign-off on these drafts.
        </Prose>

        <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
          <Marker>How to read the samples</Marker>
          <div className="max-w-prose space-y-2 text-sm text-muted-foreground">
            <p>
              Every before and after below is the real thing, rendered here —
              not a screenshot, not a mock, and not a framed copy of a page. The
              home page&rsquo;s sections are the route&rsquo;s own code with a
              different palette passed in, so a sample cannot drift from the page
              it claims to show. Beside each one is a link to the full preview
              scene, which is where you go for the whole page.
            </p>
            <p>
              Two things a sample cannot do, said again wherever they matter.
              Layout breakpoints read the browser window rather than the box a
              sample sits in, so everything below is showing the{" "}
              <em>desktop</em> layout however narrow it looks — where the 360 px
              phone layout is the point, the slide says so and the link is the
              answer. And a sample is a slice, so vertical rhythm between
              sections is the page&rsquo;s, not the deck&rsquo;s.
            </p>
          </div>
        </div>

        <NoRuling>
          Context. The first ruling is on slide 3.
        </NoRuling>
      </Slide>

      {/* ----------------------------------------------------------- 2 */}
      <Slide id="palette-today">
        <Prose>
          The four Yty tokens the app ships today are raw Tailwind defaults that
          were never brand colours. The brand fixes Harmony pink, Glow green,
          Valor orange and Wit blue — and two of the stand-ins are effectively
          swapped: Harmony renders in Glow&rsquo;s family and Valor in
          Harmony&rsquo;s. The Glow stand-in is worse than wrong, because it is
          the same amber as the CTA, so the element and the primary button
          compete on any page carrying both.
        </Prose>

        <DeckTable
          head={["Element", "Brand hue", "Token today", "What that actually is"]}
        >
          {TODAY_TOKENS.map((row) => (
            <tr key={row.element}>
              <Cell>{row.element}</Cell>
              <Cell>{row.brand}</Cell>
              <Cell muted>{row.hex}</Cell>
              <Cell muted>{row.renders}</Cell>
            </tr>
          ))}
        </DeckTable>

        <div className="space-y-3">
          <Marker>Today — four tokens</Marker>
          <div className="flex flex-wrap gap-4">
            {CURRENT_SWATCHES.map((swatch) => (
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

        <NoRuling>
          Context for the three slides that follow. The hues themselves are
          already ruled on — they are the brand&rsquo;s, exactly.
        </NoRuling>
      </Slide>

      {/* ----------------------------------------------------------- 3 */}
      <Slide id="strong-soft">
        <Prose>
          Each element arrives as a pair rather than one colour, and the draft
          spends them the same way on all four: soft carries text and glyphs,
          strong carries fills, borders, rings and glows. Uniformly, which is
          the point — the four elements stay one family instead of reading as
          three plus an exception.
        </Prose>
        <Prose>
          The number that settles it is wit. Wit-strong measures 3.81:1 against
          the card ground: fine for a 24 px glyph, which needs 3:1, and short of
          the 4.5:1 that body-size text needs. The slot in question carries body
          text — the About page&rsquo;s elements section sets each
          element&rsquo;s one-line description in it — so soft is what carries
          text, and every soft clears between
          7.15 and 8.21 on the card. The tightest pairing in the whole draft is
          a zone&rsquo;s own soft label over its own 10% strong tint, and the
          worst of those is 6.32:1.
        </Prose>
        <Prose>
          Measured, not eyeballed: <code>node scripts/yty-contrast.mjs</code>{" "}
          reads the hexes out of globals.css and prints every pairing against
          both grounds. The card ground is the lighter one, so the numbers below
          are its column — the page ground is looser everywhere.
        </Prose>

        <DeckTable
          head={[
            "Element",
            "Strong",
            "Strong on card",
            "Soft",
            "Soft on card",
            "Zone label on its own tint",
          ]}
        >
          {CONTRAST_ROWS.map((row) => (
            <tr key={row.element}>
              <Cell>{row.element}</Cell>
              <Cell muted>{row.strongHex}</Cell>
              <Cell>{row.strong}</Cell>
              <Cell muted>{row.softHex}</Cell>
              <Cell>{row.soft}</Cell>
              <Cell>{row.zone}</Cell>
            </tr>
          ))}
        </DeckTable>

        <Prose>
          4.5:1 is the body-text bar and 3:1 the glyph bar. Wit-strong at 3.81
          is the only cell in the table under 4.5, and it is the one number the
          whole presentation is shaped around.
        </Prose>

        <Ruling>
          <p>
            Accept the split principle: soft on text and glyphs, strong on
            fills, borders, rings and glows, on all four elements.
          </p>
        </Ruling>
      </Slide>

      {/* ----------------------------------------------------------- 4 */}
      <Slide id="grammar">
        <Prose>
          School of Gaming has an unusually large approved palette — amber and
          violet already here, pink, green, orange and blue arriving. The
          proposal is that they stop being decoration and become{" "}
          <strong className="font-semibold text-foreground">grammar</strong>: a
          family means one thing everywhere, and the meanings come from what the
          Yty elements already stand for rather than being invented beside them.
        </Prose>

        <div className="flex flex-wrap gap-4">
          {GRAMMAR_CHIPS.map((chip) => (
            <GrammarChip key={chip.word} chip={chip} />
          ))}
        </div>

        <Prose>
          The evidence for it is that colour{" "}
          <em>already</em> works this way here — just uncoordinated, one system
          at a time, each picking from whatever was unused.
        </Prose>

        <div className="space-y-3">
          <Marker>Exhibit — one violet, five meanings</Marker>
          <div className="space-y-2">
            {VIOLET_MEANINGS.map((row) => (
              <div key={row.chip} className="flex flex-wrap items-center gap-3">
                <span className="w-28 shrink-0">
                  <Pill
                    label={row.chip}
                    className="bg-secondary text-secondary-foreground"
                  />
                </span>
                <span className="w-52 shrink-0 text-sm text-foreground">
                  {row.meaning}
                </span>
                <span className="text-xs text-muted-foreground">
                  {row.where}
                </span>
              </div>
            ))}
          </div>
          <Prose>
            Same fill, five unrelated meanings, plus pure decoration — the hero
            headline&rsquo;s second chunk and the page&rsquo;s gradient washes.
            A sixth turned up while this exhibit was built: the shop card&rsquo;s
            audience chip, which is the same violet again for &ldquo;who may hold
            this seat&rdquo;. The read receipt draws it as a glyph rather than a
            fill; everything else is the pill above.
          </Prose>
        </div>

        <div className="space-y-3">
          <Marker>Exhibit — the gradient-invented colour</Marker>
          <div className="flex flex-wrap items-center gap-3">
            {ROLE_BADGES_TODAY.map((badge) => (
              <Pill key={badge.label} {...badge} />
            ))}
          </div>
          <Prose>
            Gamer amber, parent violet, admin ink — and gedu is an amber-to-violet
            gradient, because a fourth role arrived and there was no hue left to
            give it. That badge is the clearest evidence in the app that the
            two-colour palette ran out, and it is why the gradient question on
            slide 7 and the grammar question here are the same question.
          </Prose>
        </div>

        <div className="space-y-3">
          <Marker>
            Illustration only — what real families could look like
          </Marker>
          <div className="space-y-2">
            {ROLE_BADGES_ILLUSTRATED.map((badge) => (
              <div key={badge.label} className="flex flex-wrap items-center gap-3">
                <span className="w-28 shrink-0">
                  <Pill label={badge.label} className={badge.className} />
                </span>
                <span className="text-xs text-muted-foreground">
                  {badge.why}
                </span>
              </div>
            ))}
          </div>
          <Prose>
            One option set, drawn so the question has something to look at.{" "}
            <strong className="font-semibold text-foreground">
              It is not a decided mapping
            </strong>{" "}
            — the ruling below asks whether roles take families at all, and the
            mapping is then settled with you.
          </Prose>
        </div>

        <Prose>
          And the scale of it. Ten surfaces in this app have to tell three or
          more states apart, and each of them chose its colours alone:
        </Prose>

        <DeckTable
          head={[
            "Surface",
            "States",
            "Colours today",
            "What the grammar would offer",
          ]}
        >
          {MULTI_STATE_SURFACES.map((row) => (
            <tr key={row.surface}>
              <Cell>{row.surface}</Cell>
              <Cell>{row.states}</Cell>
              <Cell muted>{row.today}</Cell>
              <Cell muted>{row.grammar}</Cell>
            </tr>
          ))}
        </DeckTable>

        <Prose>
          One row is a genuine question rather than a defect. The product-type
          palette — cyan, magenta, lime, indigo — was chosen{" "}
          <em>deliberately apart</em> from the state tokens, and the reasoning is
          written into the stylesheet: a categorical colour must never be
          mistaken for a state colour. Under the grammar it could converge, and
          camp equals valor equals adventure is the natural fit; or it could stay
          the one system that is meaning-free on purpose. That is a ruling, and
          this deck does not recommend either way.
        </Prose>

        <Ruling>
          <p>
            Adopt the grammar as the app&rsquo;s colour vocabulary — amber act,
            pink people, green growth, blue knowledge, orange adventure. Wiring
            then writes it into the Styling section of the root CLAUDE.md so a
            future surface does not re-decide it.
          </p>
          <p>
            Violet narrows to &ldquo;the world&rdquo; — lore, dusk, display
            moments — and stops carrying UI grammar.
          </p>
          <p>
            Role badges take real families, retiring the gradient. The mapping
            itself is decided with you; the chips above are an illustration.
          </p>
          <p>
            Product types: converge into the grammar, or stay a separate
            categorical palette. The next slide draws the mapping.
          </p>
        </Ruling>
      </Slide>

      {/* ----------------------------------------------------------- 5 */}
      <Slide id="grammar-wild">
        <Prose>
          A vocabulary is only worth adopting if it survives contact with real
          pages, so here it is on the three surfaces you named: the shop, My SOG,
          and a family&rsquo;s product page. Each one shows today beside the
          draft, and each says whether the draft is a threaded scenario you can
          open full-page or a sample drawn here from the real class maps.
        </Prose>
        <Prose>
          <strong className="font-semibold text-foreground">
            The buttons do not change, and that is the grammar working rather
            than the grammar stopping.
          </strong>{" "}
          Amber is the act colour, so every primary CTA on all three surfaces
          stays exactly the amber it is today — a family-coloured button would be
          saying &ldquo;this is a camp&rdquo; with the one colour reserved for
          &ldquo;press this&rdquo;. If you want family-coloured buttons somewhere
          specific, that is a ruling to add rather than a gap to fill.
        </Prose>

        {/* ---- the shop ---- */}
        <div className="space-y-4">
          <Marker>Shop — the product card</Marker>
          <Prose>
            The public browse card carries no product-type mark at all today: the
            type decides which section heading a card sits under and nothing
            else. The colours below are drawn here rather than threaded through
            the real card, because the real card is four components deep with a
            five-way fan-out at the leaves — and because a palette prop there
            would not be recolouring an element, it would be adding one to a live
            component for a draft&rsquo;s benefit.
          </Prose>

          <SampleGroup title="Today, on the card a parent meets">
            <div className="flex flex-wrap gap-4 p-4">
              {PRODUCT_TYPE_ORDER.map((type) => (
                <ShopCardSample key={type} type={type} draft={false} />
              ))}
            </div>
          </SampleGroup>

          <div className="space-y-3">
            <Marker>
              Today, on admin surfaces — the product-type palette that exists
            </Marker>
            <div className="flex flex-wrap items-center gap-4">
              {PRODUCT_TYPE_ORDER.map((type) => (
                <span key={type} className="inline-flex items-center gap-2">
                  <TypeGlyph
                    type={type}
                    tile={PRODUCT_TYPE_PRESENTATION[type].tint}
                    glyph={PRODUCT_TYPE_PRESENTATION[type].text}
                  />
                  <span className="text-xs text-muted-foreground">
                    {TYPE_LABELS[type]}
                  </span>
                </span>
              ))}
            </div>
            <Prose>
              Cyan, magenta, lime and indigo — the four <code>--product-*</code>{" "}
              tokens, drawn straight from the map the admin dashboard reads.
              These are the colours the convergence question is really about.
            </Prose>
          </div>

          <SampleGroup title="Under the grammar">
            <div className="flex flex-wrap gap-4 p-4">
              {PRODUCT_TYPE_ORDER.map((type) => (
                <ShopCardSample key={type} type={type} draft />
              ))}
            </div>
          </SampleGroup>

          <DeckTable head={["Type", "Family", "Why"]}>
            {PRODUCT_TYPE_ORDER.map((type) => (
              <tr key={type}>
                <Cell>{TYPE_LABELS[type]}</Cell>
                <Cell>{PRODUCT_TYPE_GRAMMAR[type].family}</Cell>
                <Cell muted>{PRODUCT_TYPE_GRAMMAR[type].why}</Cell>
              </tr>
            ))}
          </DeckTable>

          <Prose>
            <strong className="font-semibold text-foreground">
              The trade, stated plainly.
            </strong>{" "}
            The existing four were chosen <em>deliberately apart</em> from the
            state colours, and the reasoning is written into the stylesheet: a
            categorical colour a reader can mistake for a state colour is worse
            than no colour at all, because they have to check which of the two
            they are looking at every time. Converging buys meaning — camp equals
            adventure is something a family could actually learn — and it buys
            brand colour on the storefront, which is where a stranger meets us.
            What it spends is exactly that separation: once camp is valor orange,
            an orange mark on a page could be a type or could be a state.
          </Prose>
          <p className="text-xs">
            <a
              href="/preview/shop/default"
              target="_blank"
              rel="noreferrer"
              className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Open the storefront grid as it ships
            </a>
          </p>
        </div>

        {/* ---- My SOG ---- */}
        <div className="space-y-4">
          <Marker>My SOG — the parent dashboard</Marker>
          <Prose>
            This one <em>is</em> threaded: the page body takes the palette and
            hands it to the enrollment cards, so there is a real scenario to open
            beside the ordinary one. The samples below are drawn from the
            card&rsquo;s own tone map rather than restated.
          </Prose>
          <Prose>
            Almost nothing changes, and that is the finding. Two of the
            card&rsquo;s three coloured states already carry a functional token
            sitting inside a brand family, so the draft is a convergence rather
            than a repaint — one green instead of two, one blue instead of two.
          </Prose>

          <div className="space-y-3">
            <Marker>The Live badge — today, then the draft</Marker>
            {PARENT_STATE_SAMPLES.map((row) => (
              <div key={row.label} className="flex flex-wrap items-center gap-4">
                <span
                  className={cn(
                    "inline-flex items-center rounded-full border font-semibold",
                    row.today,
                  )}
                >
                  {row.label}
                </span>
                <span
                  className={cn(
                    "inline-flex items-center rounded-full border font-semibold",
                    row.draft,
                  )}
                >
                  {row.label}
                </span>
                <span className="max-w-prose text-xs text-muted-foreground">
                  {row.why}
                </span>
              </div>
            ))}
          </div>

          <DeckTable head={["State", "Today", "Under the grammar"]}>
            <tr>
              <Cell>Live</Cell>
              <Cell muted>Success green</Cell>
              <Cell muted>Glow — growth</Cell>
            </tr>
            <tr>
              <Cell>Awaiting placement</Cell>
              <Cell muted>Info blue, on the card edge and the glyph</Cell>
              <Cell muted>Wit — knowledge, in both slots</Cell>
            </tr>
            <tr>
              <Cell>A seat has opened</Cell>
              <Cell muted>Info blue, on the rule, the glyph and the title</Cell>
              <Cell muted>Wit — knowledge, in all three</Cell>
            </tr>
            <tr>
              <Cell>Session in progress</Cell>
              <Cell muted>Amber card edge and wash</Cell>
              <Cell muted>
                Unchanged — amber is the act colour and the Join is the act
              </Cell>
            </tr>
            <tr>
              <Cell>A place in line</Cell>
              <Cell muted>No colour at all — muted body text</Cell>
              <Cell muted>
                Unchanged. Warning amber is reserved for it, but nothing is wrong
                with a place in line and the card has said so quietly since it
                was designed
              </Cell>
            </tr>
          </DeckTable>

          <div className="flex flex-wrap gap-4 text-xs">
            <a
              href="/preview/parent-dashboard/busy-family"
              target="_blank"
              rel="noreferrer"
              className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Open the busy family as it ships
            </a>
            <a
              href="/preview/parent-dashboard/brand-palette"
              target="_blank"
              rel="noreferrer"
              className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Open the same page under the grammar
            </a>
          </div>
        </div>

        {/* ---- the family product page ---- */}
        <div className="space-y-4">
          <Marker>The family product page</Marker>
          <Prose>
            Samples rather than a scenario here. The rail marker is built inline
            inside the feed and the attendance tone comes out of the shared
            session-feed map, three components down behind a render callback —
            so the tone map is imported and drawn here, and the page itself is a
            link.
          </Prose>

          <div className="space-y-3">
            <Marker>Session-feed rail markers</Marker>
            <div className="space-y-2">
              {FEED_MARKER_SAMPLES.map((row) => (
                <div key={row.label} className="flex flex-wrap items-center gap-6">
                  <span className="w-52 shrink-0">
                    <MarkerRow label={row.label} className={row.today} />
                  </span>
                  <span className="w-52 shrink-0">
                    <MarkerRow label={row.label} className={row.draft} />
                  </span>
                  <span className="max-w-prose text-xs text-muted-foreground">
                    {row.why}
                  </span>
                </div>
              ))}
            </div>
            <Prose>
              Left is today, right is the draft — and again they are nearly the
              same blue, which is the convergence rather than a mistake. One
              honesty note: a family&rsquo;s feed deliberately carries no
              done-or-owed vocabulary at all. Complete and needs-attention are
              the <em>gedu</em> feed&rsquo;s markers, on a surface family code
              cannot even import, and they inherit growth green and warning amber
              from the status ruling on slide 13 rather than from anything here.
            </Prose>
          </div>

          <div className="space-y-3">
            <Marker>Attendance chips — today, then the draft</Marker>
            <div className="space-y-2">
              {ATTENDANCE_STATES.map((state) => (
                <div key={state} className="flex flex-wrap items-center gap-4">
                  <span className="w-24 shrink-0">
                    <AttendanceChip
                      label={state}
                      className={ATTENDANCE_TONE[state].text}
                    />
                  </span>
                  <span className="w-24 shrink-0">
                    <AttendanceChip
                      label={state}
                      className={ATTENDANCE_GRAMMAR[state].text}
                    />
                  </span>
                  <span className="max-w-prose text-xs text-muted-foreground">
                    {ATTENDANCE_GRAMMAR[state].why}
                  </span>
                </div>
              ))}
            </div>
            <Prose>
              The left column is the app&rsquo;s own attendance tone map,
              imported. One of the three moves; the other two are a deliberate
              decision not to touch them.
            </Prose>
          </div>

          <p className="text-xs">
            <a
              href="/preview/parent-club/active-club"
              target="_blank"
              rel="noreferrer"
              className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Open the family product page as it ships
            </a>
          </p>
        </div>

        <Ruling>
          <p>
            The product-type mapping: adopt it as drawn — camp adventure, club
            growth, municipality club knowledge, event people — or keep the
            separate categorical palette and its written separation from the
            state colours.
          </p>
          <p>
            The status convergence, on these surfaces rather than in the
            abstract: the Live badge, awaiting placement, the seat offer and the
            feed markers as drafted.
          </p>
          <p>
            Sign off the grammar in the wild per surface — shop, My SOG, the
            family product page — or name which of the three to hold back.
          </p>
        </Ruling>
      </Slide>

      {/* ----------------------------------------------------------- 6 */}
      <Slide id="home-yty">
        <Prose>
          The home page is where the cover&rsquo;s question gets answered,
          because it is a marketing surface and the Guidebook lets a marketing
          surface have the whole palette. Below, section by section, the same
          page under three doses — same copy and same layout in all three, only
          how much colour it spends changes. Each sample is the route&rsquo;s own
          component with a different palette passed in, so what is drawn here is
          what the page draws.
        </Prose>
        <Prose>
          The draft colours the whole page rather than one section of it. The
          four feature cards each take one element family in display order —
          pink, green, orange, blue — with the soft variant on the glyph and the
          strong one on the tile wash and its edge. The three how-it-works
          circles become harmony, glow and wit fills carrying ink. And the hero
          gains colour in its glow. Valor is deliberately absent from the
          circles: an orange one beside the amber CTA is the same collision
          slide 2 opened with.
        </Prose>
        <Prose>
          <strong className="font-semibold text-foreground">
            The Yty elements are not on this page.
          </strong>{" "}
          The four element cards and the overview above them live on the About
          page — the home page keeps the hero, the features, how-it-works and the
          closing CTA, and sends a reader to About from a button in the hero. The
          element cards are still the palette&rsquo;s most concentrated use, so
          they are drawn at the foot of this slide from the same colour maps the
          About page reads; they are just no longer part of the dose question,
          because the page they sit on is not one of the three above.
        </Prose>
        <Prose>
          <strong className="font-semibold text-foreground">Accented</strong>{" "}
          spends one pink wash on the hero and leaves the section grounds, the
          headline and the page&rsquo;s rhythm where they are.{" "}
          <strong className="font-semibold text-foreground">Lively</strong>{" "}
          gives up ambient amber entirely, so the only amber on screen is the CTA
          button; the headline goes white with a glow-green marker stroke behind
          its payoff words; the feature washes double; the how-it-works band is
          tinted rather than grey; and a palette rule sits under each section
          heading.
        </Prose>
        <Prose>
          <strong className="font-semibold text-foreground">
            Both are flat.
          </strong>{" "}
          Neither draws a two-hue blend anywhere — that is your gradient
          direction landed rather than an option, and the one candidate still
          arguing its case is the whole of the next slide. What flattening cost
          the accented dose is today&rsquo;s amber-to-violet hero band, replaced
          by a single pink wash; what it cost the lively dose was a dusk sky.
        </Prose>
        <Prose>
          Both are contrast-measured, not eyeballed. The accented hero&rsquo;s
          subtitle reads 6.28:1 over its pink wash before the fade above it,
          which only darkens; the lively hero&rsquo;s sits on the plain page
          ground at 7.70:1. Every circle numeral clears the body-text bar on its
          fill: 6.11, 6.63 and 8.10.
        </Prose>

        <SampleGroup title="The hero">
          {HOME_DOSES.map((dose) => (
            <Sample
              key={dose.slug}
              label={dose.label}
              href={`/preview/home/${dose.slug}`}
              surface={HERO_SURFACE}
            >
              <HomeHeroSection palette={dose.palette} />
            </Sample>
          ))}
        </SampleGroup>

        <Prose>
          One honest oddity in those three, and it is the samples being real
          rather than a fault: the hero&rsquo;s button knows who is reading it,
          and you are signed in, so it says Dashboard where a stranger is asked
          to get started. Same button, same colour, different word.
        </Prose>

        <SampleGroup title="The feature cards">
          {HOME_DOSES.map((dose) => (
            <Sample
              key={dose.slug}
              label={dose.label}
              href={`/preview/home/${dose.slug}`}
              surface={PAGE_SURFACE}
            >
              <HomeFeaturesSection palette={dose.palette} />
            </Sample>
          ))}
        </SampleGroup>

        <SampleGroup title="How it works">
          {HOME_DOSES.map((dose) => (
            <Sample
              key={dose.slug}
              label={dose.label}
              href={`/preview/home/${dose.slug}`}
              surface={PAGE_SURFACE}
            >
              <HomeHowItWorksSection palette={dose.palette} />
            </Sample>
          ))}
        </SampleGroup>

        <SampleGroup title="The closing CTA">
          {HOME_DOSES.map((dose) => (
            <Sample
              key={dose.slug}
              label={dose.label}
              href={`/preview/home/${dose.slug}`}
              surface={PAGE_SURFACE}
            >
              <HomeCtaSection palette={dose.palette} />
            </Sample>
          ))}
        </SampleGroup>

        <div className="space-y-3">
          <div className="flex items-baseline justify-between gap-4">
            <Marker>
              The Yty element cards, on the About page — today beside the draft
            </Marker>
            <a
              href="/about#yty"
              target="_blank"
              rel="noreferrer"
              className="shrink-0 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Open the elements section on About
            </a>
          </div>
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
          <Prose>
            The element cards are identical under both drafts — the dose question
            is about the pages around them — so there is one draft row here
            rather than two. Slide 9 looks at the wit card in that row up close.
            The link above opens the live About page, which draws the{" "}
            <em>current</em> palette: the draft is the second row here, and there
            is no About scenario to open, because these two rows are the whole of
            what would change there.
          </Prose>
        </div>

        <Ruling>
          <p>
            Sign off the draft — the home page&rsquo;s feature cards,
            how-it-works circles and hero, plus the element cards the About page
            carries — or name what to tune.
          </p>
          <p>
            Pick the dose: accented, lively, or a point between the two named as
            a change. The element cards are outside that question; they are the
            same under both.
          </p>
        </Ruling>
      </Slide>

      {/* ----------------------------------------------------------- 7 */}
      <Slide id="gradients">
        <Prose>
          <strong className="font-semibold text-foreground">
            This slide used to ask whether to keep brand-hue gradients. You have
            answered it: they smear colours we no longer need to smear.
          </strong>{" "}
          So flat is not a scenario any more — it is what both drafts are. Every
          sample on every other slide of this deck is already drawn without a
          two-hue blend anywhere in it.
        </Prose>
        <Prose>
          The reasoning behind the direction, kept because it is what makes the
          one exception below judgeable: the brand has never combined its colours
          in a gradient, and every blend in this app dates from the two-colour
          era, when amber and violet were the only hues there were and anything
          needing a third look had to be given a mix of the two. The gedu role
          badge on slide 4 is the smoking gun — a colour invented out of a
          gradient because a fourth role arrived with no hue left to give it.
        </Prose>
        <Prose>
          <strong className="font-semibold text-foreground">
            One candidate still has a case, and this is it.
          </strong>{" "}
          The dusk hero is not two brand hues mixed for want of a third: it is an
          imitation of the brand&rsquo;s own social imagery, where a pink-and-blue
          night sky is a *picture* rather than a colour. That makes it a
          different argument from the rest of the inventory, and the only one
          worth drawing rather than describing. Below is the hero as both drafts
          now render it, and then the retired dusk sky as an exhibit — the same
          component, handed the old classes.
        </Prose>

        <SampleGroup title="The hero as it stands — flat">
          <Sample
            label="Flat, and the default"
            href="/preview/home/brand-lively"
            surface={HERO_SURFACE}
          >
            <HomeHeroSection palette="brand-lively" />
          </Sample>
        </SampleGroup>

        <SampleGroup title="The exhibit — the retired dusk sky">
          <Sample
            label="Dusk gradient (exhibit only — no page renders this)"
            href="/preview/home/brand-lively"
            linkLabel="Open the flat page it would replace"
            surface={HERO_SURFACE}
            note="Rendered by the page's own hero component with the retired class set passed in, so it is the real treatment rather than a picture of it. There is no scenario behind it: if you keep it, it goes back into the lively dose as a sanctioned exception; if you kill it, the exhibit is deleted."
          >
            <HomeHeroSection exhibitClasses={DUSK_HERO_EXHIBIT} />
          </Sample>
        </SampleGroup>

        <Prose>
          What the flat hero gives up is the sky; what it gains is a number.
          Removing colour from behind text can only help, and it does: the
          subtitle goes from 4.78:1 over the dusk composite to 7.70:1 on the
          plain ground. What the flat hero <em>adds</em> is the one thing it
          needed — a solid harmony edge closing the section, because three
          centred lines on bare ground read as an unstyled page rather than a
          restrained one.
        </Prose>

        <Prose>
          Every brand-gradient site in the product, and where each one now
          stands:
        </Prose>

        <DeckTable head={["Site", "Today", "Where it stands"]}>
          {GRADIENT_SITES.map((row) => (
            <tr key={row.site}>
              <Cell>{row.site}</Cell>
              <Cell muted>{row.today}</Cell>
              <Cell muted>{row.proposal}</Cell>
            </tr>
          ))}
        </DeckTable>

        <Prose>
          The line the table draws: a <em>same-hue</em> fade to transparent is a
          wash and stays, because there is no second colour in it and nothing was
          invented — the accented hero&rsquo;s pink radial, the live enrollment
          card&rsquo;s amber edge. A{" "}
          <em>two-hue blend</em> is what retires. The standing cost, worth naming
          because it recurs: flattening a multi-hue rule forces a hue to be
          chosen, and that is a small design decision each time — the section
          rule went from pink-blue-green to plain pink and the mission card from
          amber-violet to pink, both because pink is the drafts&rsquo; workhorse.
        </Prose>

        <Ruling>
          <p>
            The dusk sky: keep it as the one sanctioned gradient in the product,
            or kill it and go fully flat.
          </p>
          <p>
            If you keep it, name the boundary — is the sanction &ldquo;this
            hero&rdquo;, or &ldquo;heroes that imitate the social imagery&rdquo;?
            Anything wider re-opens the inventory above.
          </p>
        </Ruling>
      </Slide>

      {/* ----------------------------------------------------------- 8 */}
      <Slide id="gamer-floor">
        <Prose>
          The gamer dashboard is a mobile-first surface, so it is judged at the
          360 px floor — the Android baseline, and the archetypal family phone
          in our markets. What this deck rules on here is the colour: the
          enrollment cards take the grammar, the same way a parent&rsquo;s do.
          Nothing else on the page moves for colour&rsquo;s sake — the Help
          section that ends it is untouched.
        </Prose>
        <Prose>
          <strong className="font-semibold text-foreground">
            The greeting above those cards also changes, and it is not this
            deck&rsquo;s to rule on.
          </strong>{" "}
          Its face swaps from Press Start 2P to Space Mono, which is a typography
          decision and lives on{" "}
          <a
            href="/admin/design-pass-typography#site-greeting"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            the typography deck
          </a>{" "}
          together with the size question the swap forces. The links below show
          both changes at once, because the draft scenario is the whole proposal
          rather than one axis of it — so when you open them, the greeting is the
          other page&rsquo;s question and the cards are this one&rsquo;s.
        </Prose>
        <Prose>
          <strong className="font-semibold text-foreground">
            This is the one slide with no sample of its own, on purpose.
          </strong>{" "}
          The card states are already drawn on slide 5, and they cannot be judged{" "}
          <em>here</em> for the reason the whole page exists to warn about: a
          breakpoint reads the browser window, not the box a sample sits in, so a
          360 px box on this screen would still be showing you the desktop
          layout. The two links below are the honest answer, and they are worth
          opening in a phone-sized window: the same page, once as it ships and
          once under the whole draft, with the cards and the scroll between them
          at the width a child actually meets.
        </Prose>
        <Prose>
          A note on what is <em>not</em> here any more: this slide used to draw a
          four-card Yty grid, because the gamer dashboard used to carry one. It
          does not — the grid was decorative, the feature behind it did nothing,
          and the Help section took its slot. The elements are explained on the
          About page now, and their cards are on slide 6.
        </Prose>

        <div className="flex flex-wrap gap-4 text-xs">
          <a
            href="/preview/gamer-dashboard/typical"
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Open the page as it ships
          </a>
          <a
            href="/preview/gamer-dashboard/brand-palette"
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Open the same page under the whole draft
          </a>
        </div>

        <Ruling>
          <p>
            Sign off the gamer dashboard&rsquo;s colour at the floor — the
            enrollment cards as one page — or name what to tune. The
            greeting&rsquo;s face and size are answered on the typography deck.
          </p>
        </Ruling>
      </Slide>

      {/* ----------------------------------------------------------- 9 */}
      <Slide id="wit">
        <Prose>
          One element shows a seam, and it is worth your eye before you sign the
          split off. Wit&rsquo;s two variants sit further apart in hue than the
          other three pairs do — a royal blue against a sky blue — so a wit card
          is a light-blue glyph on a royal wash, where the other three read as
          one hue at two strengths.
        </Prose>
        <Prose>
          It is the numbers&rsquo; answer, not a preference: wit-strong cannot
          carry body text on this ground, so the alternative is to make wit the
          one element that breaks the rule the other three follow.
        </Prose>

        <div className="flex flex-wrap gap-4">
          {YTY_ELEMENTS.map((element) => (
            <PaletteElementCard
              key={element.id}
              element={element}
              palette="brand"
            />
          ))}
        </div>

        <Prose>
          Two ways out. Accept it as drafted — the seam is only visible when the
          four are compared side by side, which is a thing this deck does and a
          page never does. Or ask for a tuned dark variant of wit, which changes
          a brand colour and therefore escalates to the Guidebook&rsquo;s
          author; that runs in parallel and blocks none of the rest of the pass.
        </Prose>

        <Ruling>
          <p>Accept the wit pair as drafted, or escalate a tuned dark wit.</p>
        </Ruling>
      </Slide>

      {/* ---------------------------------------------------------- 10 */}
      <Slide id="buttons">
        <Prose>
          The Guidebook&rsquo;s button set mapped onto our dark ground. Its
          Primary is already ours to the digit — amber fill, ink label, no
          border — so it is shown once and there is nothing to decide about it.
          Its Secondary is specced as a dark border on white and is invisible
          here; its Ghost is the Guidebook&rsquo;s own on-dark button and is
          what the proposal adopts: transparent, 2 px foreground-colour border.
          Hover washes the border&rsquo;s own colour inward at a tenth alpha,
          because that shape has no fill to darken and anything else would
          introduce a second hue.
        </Prose>

        <div className="space-y-3">
          <Marker>Today beside proposed, at rest</Marker>
          <div className="space-y-2">
            {BUTTON_SAMPLES.map((row) => (
              <div key={row.name} className="flex flex-wrap items-center gap-4">
                <span className="w-64 shrink-0 text-xs text-foreground">
                  {row.name}
                </span>
                <span className={cn(BUTTON_SHAPE, row.className)}>
                  Explore clubs
                </span>
                <span className="text-xs text-muted-foreground">
                  {row.note}
                </span>
              </div>
            ))}
          </div>
          <Prose>
            These are the variants&rsquo; own class strings, at rest. Hover,
            disabled and loading are three more states each and they belong side
            by side rather than in a list — the style guide draws the full grid,
            and it is one click away.
          </Prose>
          <p className="text-xs">
            <a
              href="/admin/ui-components#button-guidebook-proposal-today-beside-proposed"
              target="_blank"
              rel="noreferrer"
              className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
            >
              Open every state in the style guide
            </a>
          </p>
        </div>

        <Prose>
          The blast radius, recounted from scratch — every real button plus
          every link wearing the button&rsquo;s clothes, across app code, with
          the style guide excluded. The plan estimated the violet fill at around
          thirteen sites; that count was picking up badges, which are a
          different component. The true number changes the decision:
        </Prose>

        <DeckTable head={["Variant", "Call sites", "Made of"]}>
          {BUTTON_COUNTS.map((row) => (
            <tr key={row.variant}>
              <Cell>{row.variant}</Cell>
              <Cell>{row.count}</Cell>
              <Cell muted>{row.note}</Cell>
            </tr>
          ))}
        </DeckTable>

        <Prose>
          So retiring the violet fill costs one line, not a sweep. The
          destructive and link variants are functional rather than brand
          variants and stay exactly as they are.
        </Prose>

        <Prose>
          <strong className="font-semibold text-foreground">
            The button&rsquo;s type is not decided here.
          </strong>{" "}
          Whether a CTA wears today&rsquo;s 14 px at weight 500 or the
          Guidebook&rsquo;s 16 px at 600 is a typography question that this slide
          was carrying as a passenger, and it lives on the typography deck&rsquo;s
          CTA-type slide instead — drawn on this same proposed set, so a verdict
          on the type is not a verdict on the palette.{" "}
          <a
            href="/admin/design-pass-typography#cta-type"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            Open it there
          </a>
          .
        </Prose>

        <Ruling>
          <p>
            The violet fill: does it retire into the new Secondary-on-dark, or
            survive under another name for the job it does today?
          </p>
          <p>
            The third tier, which the Guidebook does not specify: A, today&rsquo;s
            borderless ghost; B, a quiet 1 px border that reads as bounded but
            recessive; or C, label only, with no border and no fill ever.
          </p>
        </Ruling>
      </Slide>

      {/* ---------------------------------------------------------- 11 */}
      <Slide id="zones">
        <Prose>
          The Yty-named voice zones are the other surface the palette feeds —
          the About page&rsquo;s elements section is the first, and after that
          there is only the style guide&rsquo;s own swatches. The split applies
          unchanged here: the element&rsquo;s soft variant on the
          glyph and the label, strong on the tile wash, the ring and the glow.
          The arithmetic here is already settled — a zone&rsquo;s label over its
          own tint is the tightest pairing in the draft and still clears at
          6.32:1 — so what is left is whether it looks right.
        </Prose>

        <SampleGroup title="The four Yty zones, today beside the draft">
          <Sample
            label="Today"
            href="/admin/ui-components#voice-room-yty-zones-today-beside-the-brand-draft"
            linkLabel="Open the full zone list in the style guide"
            surface={PAGE_SURFACE}
          >
            <ZoneTileStrip palette="current" />
          </Sample>
          <Sample
            label="Draft"
            href="/admin/ui-components#voice-room-yty-zones-today-beside-the-brand-draft"
            linkLabel="Open the full zone list in the style guide"
            surface={PAGE_SURFACE}
          >
            <ZoneTileStrip palette="brand" />
          </Sample>
        </SampleGroup>

        <Prose>
          The tile wash, the glyph colour and the ring above are read straight
          out of the zone presentation maps the voice room composes from, so
          they are the real thing. What a room adds around them — the lobby and
          any custom zones beside these four, occupancy, the glow on the active
          tile, moderator controls — needs the room, and the style guide draws
          the whole list.
        </Prose>

        <Ruling>
          <p>Sign off the zone tiles, or name what to tune.</p>
        </Ruling>
      </Slide>

      {/* ---------------------------------------------------------- 12 */}
      <Slide id="reach">
        <Prose>
          The Guidebook rations colour by surface, and its rule restated so this
          slide stands alone: parent, partner, billing and safety surfaces get
          amber as the single accent on a calm ground; family story surfaces get
          amber plus one palette family; gamer, community and in-world surfaces
          welcome the full palette.
        </Prose>
        <Prose>
          <strong className="font-semibold text-foreground">
            Direction given: broad.
          </strong>{" "}
          This slide used to ask an open question about how far the palette
          reaches. You have since answered it — the site should be brighter and
          more fun, the way the marketing is — so the drafts stopped fencing the
          palette inside the Yty element cards. Slide 6 is what that decision looks
          like on a real page, at two doses; slide 4 is what it would mean for
          the colours to carry meaning rather than only brightness, and slide 5
          is that meaning on the shop, My SOG and a family&rsquo;s product page.
        </Prose>
        <Prose>
          That leaves one part of the rationing rule unanswered, and it is the
          part the Guidebook is most specific about: the calm ring. Billing,
          safeguarding and legal surfaces are specced as amber-single-accent on
          a quiet ground, and there is a real argument for keeping them that way
          that has nothing to do with taste — a page about a charge or a
          child&rsquo;s safety reads as more serious when it is not decorated.
          Whatever you pick becomes a written rule in the Styling section of the
          root CLAUDE.md at wiring time, so a future surface does not re-decide
          it.
        </Prose>

        <Ruling>
          <p>
            The calm ring — billing, safeguarding, legal. Confirm the
            Guidebook&rsquo;s amber-only treatment there, or adjust it.
          </p>
          <p>
            A — confirm: those surfaces stay amber as the single accent, and the
            palette stops at their door.
          </p>
          <p>
            B — adjust: name what the palette is allowed to do there, such as
            status and category marks but not decoration.
          </p>
        </Ruling>
      </Slide>

      {/* ---------------------------------------------------------- 13 */}
      <Slide id="status-colours">
        <Prose>
          The app has four functional status colours — info, success, warning,
          destructive — and they predate the brand palette by a long way. Two of
          them now land inside a brand family, which is the same defect slide 2
          opened with: the old glow amber colliding with the CTA amber. One hue,
          two meanings, and nothing on screen to tell a reader which one it is.
        </Prose>
        <Prose>
          <code>--info</code> resolves to #308CE8. Wit strong is #3A71DE and wit
          soft is #4DB3F5 — info sits between them, at 210° between their 220°
          and 204°. <code>--success</code> resolves to #2EB88A against glow
          strong #1AB061, twelve degrees apart. The other two are safely clear:
          warning and destructive are 43.9 and 42.6 away from their nearest
          brand family, which is a different colour by any measure.
        </Prose>

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

        <div className="space-y-3">
          <Marker>The same collision, as the app draws it</Marker>
          <div className="space-y-3">
            {STATUS_CHIPS.map((pair) => (
              <div key={pair.caption} className="flex flex-wrap items-center gap-3">
                <span className="w-16 shrink-0 text-xs text-muted-foreground">
                  {pair.caption}
                </span>
                <StatusChip {...pair.status} />
                <StatusChip {...pair.brand} />
              </div>
            ))}
          </div>
          <Prose>
            Left of each pair is a status chip the app ships today; right of it
            is the brand family the draft would put on the same screen. Nothing
            distinguishes &ldquo;this is information&rdquo; from &ldquo;this is
            the Wit element&rdquo; except the words inside them.
          </Prose>
        </div>

        <DeckTable
          head={["Token", "Resolves to", "Against", "Brand hex", "Hue", "Distance"]}
        >
          {STATUS_COLLISIONS.map((row) => (
            <tr key={`${row.token}-${row.against}`}>
              <Cell>
                <code>{row.token}</code>
              </Cell>
              <Cell muted>{row.hex}</Cell>
              <Cell>{row.against}</Cell>
              <Cell muted>{row.againstHex}</Cell>
              <Cell muted>{row.hue}</Cell>
              <Cell>{row.distance}</Cell>
            </tr>
          ))}
        </DeckTable>

        <Prose>
          Distance is CIE76 in Lab — a rough but honest &ldquo;would a person
          call these two colours or two shades&rdquo;. Under about 25 is the
          range where they read as one thing.
        </Prose>

        <Prose>
          The recommendation is to converge at wiring time: point{" "}
          <code>--info</code> at the wit family and <code>--success</code> at
          the glow family, so the app has one blue and one green and a reader
          never has to work out which system a colour belongs to. It costs
          nothing at the call sites — both are tokens, and every consumer
          inherits — and it means the palette is genuinely one palette rather
          than a brand set plus a legacy set that happen to overlap. Warning and
          destructive are untouched either way.
        </Prose>
        <Prose>
          Slide 4 asks the same thing from the other end. If colour is grammar,
          then &ldquo;this is information&rdquo; and &ldquo;this is Wit&rdquo;
          are not two meanings that need two blues — they are one meaning,
          knowledge, and convergence is what says so.
        </Prose>

        <Ruling>
          <p>
            A — converge: <code>--info</code> takes the wit family,{" "}
            <code>--success</code> takes the glow family.
          </p>
          <p>
            B — keep both, accepting that the app carries two blues and two
            greens that mean different things.
          </p>
          <p>
            C — defer it to the categorical-labelling follow-up, which is
            already the place a meaning-free multi-state palette gets designed.
          </p>
        </Ruling>
      </Slide>

      {/* ---------------------------------------------------------- 14 */}
      <Slide id="recap">
        <Prose>
          Eighteen rulings, colour only, in the order they were asked. Any of
          them can come back as tune this rather than yes. The cover&rsquo;s
          question is the one they add up to: whether this app can be as bright
          and lively as the marketing site on a dark ground, inside the
          Guidebook.
        </Prose>
        <Prose>
          Four more used to be on this list and are not any more — the gamer
          greeting&rsquo;s face, its wide-screen size, the Press Start 2P site
          table and CTA type. They are typography, none of them waits on a colour
          decision, and they now sit with six others on{" "}
          <a
            href="/admin/design-pass-typography#recap"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            the typography deck&rsquo;s own recap
          </a>
          , which asks ten.
        </Prose>

        <ol className="max-w-prose list-decimal space-y-2 pl-5 text-sm text-foreground">
          <li>
            Slide 3 — accept the strong and soft split: soft on text and glyphs,
            strong on fills, borders, rings and glows.
          </li>
          <li>
            Slide 4 — adopt the colour grammar: amber act, pink people, green
            growth, blue knowledge, orange adventure.
          </li>
          <li>
            Slide 4 — violet narrows to &ldquo;the world&rdquo; and stops
            carrying UI grammar.
          </li>
          <li>
            Slide 4 — role badges take real families, retiring the gradient. The
            mapping is settled with you.
          </li>
          <li>
            Slide 5 — the product-type mapping: adopt it as drawn (camp
            adventure, club growth, municipality club knowledge, event people),
            or keep the separate categorical palette.
          </li>
          <li>
            Slide 5 — the status convergence on the parent surfaces as drafted:
            the Live badge, awaiting placement, the seat offer, the feed markers.
          </li>
          <li>
            Slide 5 — sign off the grammar in the wild per surface: shop, My SOG,
            the family product page.
          </li>
          <li>
            Slide 6 — the home draft: the feature cards, the how-it-works
            circles and the hero, plus the Yty element cards the About page
            carries.
          </li>
          <li>Slide 6 — the dose: accented, or lively.</li>
          <li>
            Slide 7 — the dusk sky: keep it as the one sanctioned gradient, or
            kill it and go fully flat.
          </li>
          <li>
            Slide 7 — if kept, the boundary of that sanction: this hero, or
            heroes imitating the social imagery.
          </li>
          <li>
            Slide 8 — the gamer dashboard at the 360 floor: the enrollment cards
            as one page.
          </li>
          <li>
            Slide 9 — wit&rsquo;s strong and soft pair: accept the seam, or
            escalate a tuned dark wit to the Guidebook&rsquo;s author.
          </li>
          <li>
            Slide 10 — the violet fill: retire into Secondary-on-dark, or
            survive under another name.
          </li>
          <li>
            Slide 10 — the third button tier: A ghost as today, B a quiet 1 px
            border, or C label only.
          </li>
          <li>Slide 11 — the voice-zone Yty tiles.</li>
          <li>
            Slide 12 — the calm ring: confirm the Guidebook&rsquo;s amber-only
            treatment of billing, safeguarding and legal, or adjust it.
          </li>
          <li>
            Slide 13 — the status colours: converge info onto wit and success
            onto glow, keep both sets, or defer to the categorical-labelling
            follow-up.
          </li>
        </ol>

        <div className="space-y-2 rounded-lg border bg-muted/30 p-4">
          <Marker>What happens on sign-off</Marker>
          <div className="max-w-prose space-y-2 text-sm text-muted-foreground">
            <p>
              The wiring phase lands the tokens app-wide, including the hex
              palette the emails and canvas draw from, so nothing is left
              documenting the old colours. The button variants swap with their
              call sites fixed. The palette rules you settle here are written into the
              root CLAUDE.md and the deviations log — the colour grammar of
              slide 4 among them, which is what makes it binding on a surface
              nobody has built yet. If slide 13 says converge, the two status
              tokens move in the same commit as the Yty ones — they are tokens,
              so it is a value change and no call site is touched. The two
              rulings with real call-site cost are the grammar&rsquo;s state
              colours and the gradient retirement; both are enumerable and both
              are scoped in their own slides.
            </p>
            <p>
              Then the scaffolding goes: the draft scenarios, the draft colour
              map, and this page — along with the typography deck beside it.
            </p>
          </div>
        </div>

        <div className="space-y-2 rounded-lg border border-primary/40 bg-primary/5 p-4">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-primary">
            Feedback
          </div>
          <p className="max-w-prose text-sm text-foreground">
            Reply in the Claude session, referencing slide numbers. A slide can
            be answered with a change rather than a yes; the drafts are cheap to
            move while they are still fixtures.
          </p>
        </div>
      </Slide>
    </div>
  );
}
