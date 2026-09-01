/* eslint-disable i18next/no-literal-string -- temporary admin-only review deck for the brand design pass; every string here is owner-facing walkthrough narration about drafts, never product copy that ships in any locale, and the whole page is deleted before the wiring phase merges */

import {
  Check,
  CheckCheck,
  CircleAlert,
  CircleCheck,
  Copy,
  Globe,
  Heart,
  Info,
  Loader2,
  Lock,
  Mic,
  Send,
  ShieldCheck,
  Sparkles,
  Sprout,
  Star,
  type LucideIcon,
} from "lucide-react";
import { Fragment } from "react";
import { ENROLLMENT_TONES } from "@/components/family/enrollment-tones";
import { ATTENDANCE_TONE } from "@/components/session-feed/attendance-tone";
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
 * being spoken. Slides 2–12 are that finding, one defect per slide, each drawn
 * from the classes the app really ships. The surface slides that follow (13–18)
 * are then only sign-offs, because the rules they apply have already been ruled
 * on above them.
 *
 * **A settled slide is dropped, and a comment is left where it stood.** The
 * deck shrinks as the review proceeds, so what is on screen is always what is
 * still open; the ruling survives as the comment at the old position, which is
 * where the wiring phase reads it from. Renumbering the separators and the nav
 * array is part of the drop, not a tidy-up afterwards.
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
 * **Every draft is drawn on the settled type.** The typography rulings landed
 * first: Press Start 2P is out of the product and every site it held is re-set
 * in Poppins at the Guidebook's scale, headings are SemiBold 600, the CTA row is
 * 16px / 600, and Space Mono keeps one job — the platform naming its own places,
 * which is the voice-zone labels. So a draft exhibit here wears the type it will
 * ship on, and colour is judged against it rather than against type that is
 * already gone. A row labelled *Today* keeps today's type, because that is what
 * it documents.
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
 * exhibits rather than copying them: the feed rail markers left the
 * grammar-in-the-wild slide for the time slide, and the status-token collision
 * was never duplicated — the liveness and time slides show it in the app's own
 * surfaces. The grammar slide's run of real constructs is held to the same
 * line: every construct on it is one no other slide draws.
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
  { id: "grammar", title: "Colour as grammar" },
  { id: "strength", title: "The strength axis" },
  { id: "shading", title: "The shading rule" },
  { id: "you-are-here", title: '"You are here" is not "act"' },
  { id: "lifecycle", title: "Lifecycles are one hue, stepped" },
  { id: "liveness", title: "Liveness is glow" },
  { id: "time", title: "Time is wit" },
  { id: "eligibility", title: "Eligibility, one colour" },
  { id: "violet-weight", title: "Violet's replacement weight" },
  { id: "ensemble", title: "The ensemble trim" },
  { id: "warning-adjacency", title: "Warning is amber's neighbour" },
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
  // No wash: bg-primary/5 was this card's ground until the shading ruling
  // bound tint grounds at card scale — the deck compiles with its own rule.
  // The /40 edge stays pending the still-open edge scope call.
  return (
    <div className="space-y-1.5 rounded-lg border border-primary/40 bg-card px-4 py-3">
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
/*  Dropped — the strong and soft split                                */
/* ------------------------------------------------------------------ */

/**
 * **Ruled 2026-09-01: the split is fine, accepted as drawn.** Soft carries text
 * and glyphs, strong carries fills, borders, rings and glows, on all four
 * elements.
 *
 * The one number that made the slide — wit-strong at 3.81:1 on the card, under
 * the 4.5:1 body-text bar — is handled by mechanism rather than by vigilance:
 * wit text and wit ink always take the soft variant, and wit-strong is reserved
 * for fills, edges and swatches that carry no body text at all. So there is no
 * wit pairing left for a caller to get wrong, which is what retires the slide.
 */

/* ------------------------------------------------------------------ */
/*  Slide 2 — colour as grammar                                        */
/* ------------------------------------------------------------------ */

/**
 * The proposed vocabulary: one family, one meaning, derived from what the Yty
 * elements already stand for rather than invented beside them.
 *
 * **The role badges used to be on this slide and are not any more.** They left
 * for the role-families slide, which has since been ruled and dropped; the
 * comment at its old position carries the ruling.
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

/**
 * **The grammar on real constructs, at real shape and density** (owner,
 * 2026-09-01: the reasoning is agreed, the sign-off wants examples from the app
 * rather than chips). Each sample is a construct that ships today, redrawn in
 * the family whose word it demonstrates — so the vocabulary is judged on things
 * a reader can go and find rather than on six squares of colour.
 *
 * **Every construct here is one no other slide draws.** The badges, chips,
 * ladders and strips the other slides own are deliberately absent: this run had
 * to be assembled out of the app's remaining surfaces, and the one-home rule is
 * what makes it worth looking at rather than a second pass over the liveness
 * slide's evidence.
 *
 * **Violet is the shortest run on purpose, and that is the exhibit.** Under the
 * grammar it keeps display moments and the world — a highlighted phrase inside
 * a display title, the Programme's closing wash — and gives up the six UI jobs
 * drawn above. Both survivors are live public surfaces, not inventions.
 *
 * **Valor is the shortest of the coloured families, and that is a finding
 * too.** Outside the product-type marks the owner put out of scope, the only
 * live valor-shaped construct is the tag chip a camp wears on its photograph;
 * the camp's *action* is where the rest of valor would land, which is what the
 * buttons slide's grammar-matched row asks about.
 *
 * Classes are literal strings because Tailwind scans source text, and the
 * shapes are copied from the components named in `where` rather than invented.
 */
type GrammarShape =
  | "button"
  | "link"
  | "newcomer"
  | "reaction"
  | "badge"
  | "meter"
  | "alert"
  | "countdown"
  | "mediachip"
  | "title"
  | "washcard";

const GRAMMAR_EXAMPLE_ROWS: readonly {
  family: string;
  word: string;
  wordClass: string;
  samples: readonly {
    /** Where the construct lives, so the shape can be checked against source. */
    where: string;
    shape: GrammarShape;
    /** The construct's own tone under the grammar. */
    tone: string;
    /** A second tone where the shape needs one — digits inside a cell. */
    ink?: string;
  }[];
}[] = [
  {
    family: "Amber",
    word: "Act",
    wordClass: "text-primary",
    samples: [
      {
        where: "The primary CTA — ui/button.tsx",
        shape: "button",
        tone: "bg-primary text-primary-foreground shadow",
      },
      {
        where: "A link in body copy — auth/login-form.tsx",
        shape: "link",
        tone: "text-primary",
      },
    ],
  },
  {
    family: "Harmony pink",
    word: "People",
    wordClass: "text-yty-harmony-soft",
    samples: [
      {
        where: "The newcomer badge — member-flair/NewcomerBadge.tsx",
        shape: "newcomer",
        tone:
          "border-yty-harmony-strong/40 bg-yty-harmony-strong/15 text-yty-harmony-soft",
      },
      {
        where: "Your own reaction — chat/ChatReactionRow.tsx",
        shape: "reaction",
        tone:
          "border-yty-harmony-strong/60 bg-yty-harmony-strong/15 text-yty-harmony-soft",
      },
    ],
  },
  {
    family: "Glow green",
    word: "Growth",
    wordClass: "text-yty-glow-soft",
    samples: [
      {
        where: "The certification badge — admin/gedu-certification-card.tsx",
        shape: "badge",
        tone: "bg-yty-glow-strong text-background",
      },
      {
        where: "The mic level meter — voice/MicLevelIndicator.tsx",
        shape: "meter",
        tone: "bg-yty-glow-strong",
      },
    ],
  },
  {
    family: "Wit blue",
    word: "Knowledge",
    wordClass: "text-yty-wit-soft",
    samples: [
      {
        where: "The shared info alert — ui/alert.tsx",
        shape: "alert",
        tone:
          "border-yty-wit-strong/50 bg-yty-wit-strong/10 text-yty-wit-soft",
      },
      {
        where: "The registration countdown — products/countdown-clock.tsx",
        shape: "countdown",
        tone: "border-yty-wit-strong/40 bg-yty-wit-strong/10",
        ink: "text-yty-wit-soft",
      },
    ],
  },
  {
    family: "Valor orange",
    word: "Adventure",
    wordClass: "text-yty-valor-soft",
    samples: [
      {
        where: "The tag chip on a photo — products/product-chips.tsx",
        shape: "mediachip",
        tone: "bg-yty-valor-strong text-background",
      },
    ],
  },
  {
    family: "Violet",
    word: "The world",
    wordClass: "text-secondary",
    samples: [
      {
        where: "A display title's phrase — roblox/roblox-hero.tsx",
        shape: "title",
        tone: "text-secondary",
      },
      {
        where: "The Programme's closing card — roblox/programme-cta.tsx",
        shape: "washcard",
        tone: "bg-gradient-to-r from-primary/10 to-secondary/10",
      },
    ],
  },
];

/** The countdown's three cells, at the values the clock draws them. */
const COUNTDOWN_CELLS: readonly { value: string; unit: string }[] = [
  { value: "02", unit: "days" },
  { value: "11", unit: "hrs" },
  { value: "45", unit: "min" },
];

/* ------------------------------------------------------------------ */
/*  Slide 3 — the strength axis                                        */
/* ------------------------------------------------------------------ */

/**
 * **The doctrine's missing dimension.** The grammar slide says which family a surface
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
  "inline-flex h-9 items-center justify-center rounded-md px-4";

/**
 * The type each half of this slide wears. The draft steps are set in the ruled
 * CTA type (Poppins 16px / 600); the amber-jobs row below them keeps 14px / 500,
 * because it is quoting what the app ships today.
 */
const STRENGTH_TYPE_RULED = "text-base font-semibold";
const STRENGTH_TYPE_TODAY = "text-sm font-medium";

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
/*  Slide 4 — the shading rule                                         */
/* ------------------------------------------------------------------ */

/**
 * **The principle, owner 2026-09-01: if the brand colours are darkened or
 * shaded past strong or soft, they are no longer our brand colours.** The
 * strength axis above says how loudly a family may speak; this says that
 * loudness is chosen from the values the brand actually fixes, not mixed on the
 * way to the screen. A slash-alpha class is a mix: `bg-primary/10` is not amber
 * at ten percent, it is whatever amber and the ground behind it average out to.
 *
 * **The census is a command, not a list.** Regenerate it with
 * `rg -n "(hover:|focus:|group-hover:|active:)?(text|bg|border|from|to|via|ring)-primary/[0-9]+" src`
 * excluding `src/components/preview/**` and the two design-pass decks. What it
 * returns today is the counts on the rows below; what it returns after the
 * wiring phase is the check that the ruling landed.
 *
 * **The finding the counts carry: the rule as stated reaches almost nothing.**
 * Dimmed brand ink — the class the sentence most obviously describes — is
 * spoken nowhere in `src/`; the only place it is proposed is this deck's own
 * lifecycle draft chip, which is therefore among the constructs waiting on the
 * scope call rather than a shipped defect. Everything else the census finds is
 * a tint, an edge or a hover, and each of those is a separate question the
 * owner rules rather than one this deck answers.
 *
 * **Scope ruling one (owner, 2026-09-01, on seeing the checkbox row's checked
 * state): tint grounds at card/row/surface scale are bound.** "As the
 * background of a card it's wrong… bg-primary/5 itself is an ugly yellowish
 * brown highlight." Selection grounds, washed row/banner grounds and gradient
 * washes are therefore violations to correct at wiring — with two carve-outs
 * already ruled elsewhere: the chip-scale icon-accent tile
 * (`border-yty-<family>-strong/30 bg-yty-<family>-strong/10` under a
 * full-value glyph) stays, and so do the home hero band and closing-CTA wash,
 * the two sanctioned keeps.
 *
 * The classes still open and why each is genuinely arguable:
 *
 *   - **Tinted label chips** are neither an icon accent nor a card — a
 *     text-bearing chip ground sits between the exempt construct and the bound
 *     one.
 *   - **Hover darkening** is transient feedback the reader never holds still
 *     long enough to compare against the brand value, and it is one line in the
 *     button recipe rather than a decision anybody makes per surface.
 *   - **Low-alpha edges** are the strength axis's own third tier. Ruling
 *     against them retires the edge-and-wash selection tier the slide before
 *     this one proposes.
 *
 * The wiring intersection this slide's census cannot show: `--info` and
 * `--success` carry 50 alpha uses of their own today, and the status
 * convergence turns every one of them into a shaded *brand* colour — so the
 * convergence change resolves them under this rule rather than merely
 * swapping hex values.
 *
 * Class strings are literal because Tailwind scans source text.
 */
type ShadingShape = "ink" | "chip" | "tile" | "row" | "button" | "block";

const SHADING_ROWS: readonly {
  name: string;
  /** What the census returns for this class today. */
  count: string;
  shape: ShadingShape;
  /** The off-value the app ships. */
  shipped: string;
  /** The same construct with nothing mixed into the brand value. */
  corrected: string;
  /** Whether the rule reaches it (ruled or on its own), or waits on a scope call. */
  scope:
    | "Bound"
    | "Bound — accents exempt"
    | "Bound — sanctioned keeps stay"
    | "Open — hover"
    | "Open — chips"
    | "Open — edges";
}[] = [
  {
    name: "Dimmed brand ink",
    count: "0 shipped — proposed by this deck's own lifecycle draft",
    shape: "ink",
    shipped: "text-primary/80",
    corrected: "text-primary",
    scope: "Bound",
  },
  {
    name: "Half-value fill in the admin trophy",
    count: "1 — the sprite's shade glyph",
    shape: "block",
    shipped: "bg-primary/55",
    corrected: "bg-muted-foreground",
    scope: "Bound",
  },
  {
    name: "Tinted label chips",
    count: "6 — status chips, avatar initials, counts",
    shape: "chip",
    shipped: "bg-primary/20 text-primary",
    corrected: "bg-muted text-primary",
    scope: "Open — chips",
  },
  {
    name: "Washed grounds under full-value ink",
    count: "9 — icon medallions and selected rows",
    shape: "tile",
    shipped: "bg-primary/10",
    corrected: "bg-muted",
    scope: "Bound — accents exempt",
  },
  {
    name: "Selection grounds",
    count: "22 — radio rows, drop targets, checkbox rows",
    shape: "row",
    shipped: "border-primary bg-primary/5",
    corrected: "border-primary bg-transparent",
    scope: "Bound",
  },
  {
    name: "Gradient washes",
    count: "10 — live enrollment cards, hero and CTA cards",
    shape: "row",
    shipped: "border-primary bg-gradient-to-r from-primary/5 to-transparent",
    corrected: "border-primary bg-transparent",
    scope: "Bound — sanctioned keeps stay",
  },
  {
    name: "Low-alpha edges and rings",
    count: "14 at rest — card edges, outline chips, focus rings",
    shape: "row",
    shipped: "border-primary/40",
    corrected: "border-primary",
    scope: "Open — edges",
  },
  {
    name: "Hover and focus edge lifts",
    count: "7 — browse cards, assignment cards, filter pills",
    shape: "row",
    shipped: "border-primary/40 bg-accent",
    corrected: "border-primary bg-accent",
    scope: "Open — hover",
  },
  {
    name: "Hover darkening of the primary fill",
    count: "1 recipe — every primary button in the product",
    shape: "button",
    shipped: "bg-primary/90 text-primary-foreground shadow",
    corrected: "bg-primary text-primary-foreground shadow",
    scope: "Open — hover",
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
/*  Dropped — role families                                            */
/* ------------------------------------------------------------------ */

/**
 * **Ruled 2026-09-01: approved as drawn.** The gamer keeps amber and the admin
 * keeps ink; the parent takes harmony and the gedu takes wit's soft variant,
 * which retires the amber-to-violet gradient the fourth role was given when
 * there was no hue left for it.
 *
 * **Standing direction from the same ruling, recorded as plan direction 25:**
 * the role colours are to be reinforced app-wide wherever a role is understood
 * even without an explicit label — a surface that is *about* a gedu, a parent
 * or a gamer carries that family whether or not a badge is on screen. That is
 * wiring-phase work, not another slide: the mapping is settled, and what is
 * left is finding every such surface.
 */

/* ------------------------------------------------------------------ */
/*  Slide 10 — violet's replacement weight                             */
/* ------------------------------------------------------------------ */

/**
 * Narrowing violet to "the world" leaves a real hole, and it is worth showing
 * rather than asserting: two gedu actions need to be *filled* — they are the
 * only thing to do on their row — without claiming the primary CTA's amber. The
 * violet fill is what does that job today.
 *
 * **Ruled 2026-09-01: violet is out here and the fill weight is right.** What
 * is still open is the colour, and the owner's objection is worth answering in
 * the render rather than in prose — white is not a brand colour, so a
 * foreground fill looks like a colour from nowhere. The violet row therefore
 * stays as the *today* reference, and a fourth row puts a brand hue beside the
 * two neutrals so the comparison is visible instead of argued.
 *
 * **Wit-soft is the counter-candidate because it is the one brand fill that
 * takes dark ink legibly at this size** — 8.10:1 with `text-background`, where
 * wit-strong is 4.10:1 and misses the body bar. Harmony, glow and valor would
 * all clear it too; wit is chosen because it is the family furthest from the
 * two actions' meaning, which is precisely what the caption is about.
 */
/**
 * The base of the real variant recipe at its default size, set in the ruled CTA
 * type — Poppins 16px / 600. One line in the shared recipe carries that type to
 * every button in the product, so a candidate drawn at anything else would be a
 * picture of a button that will not exist.
 */
const BUTTON_SHAPE =
  "inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-md px-4 py-2 text-base font-semibold transition-colors";

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
  {
    name: "Wit-soft fill — a brand hue",
    className:
      "bg-yty-wit-soft text-background shadow-sm hover:bg-yty-wit-soft/90",
  },
];

const EMPHASIS_ACTIONS: readonly { label: string; icon: LucideIcon }[] = [
  { label: "Send report", icon: Send },
  { label: "Join", icon: Lock },
];

/* ------------------------------------------------------------------ */
/*  Slide 11 — the ensemble trim                                       */
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
/*  Slide 12 — warning is amber's neighbour                            */
/* ------------------------------------------------------------------ */

/**
 * `--warning` sits 4.5 degrees of hue from `--primary`. That is not a defect
 * anyone introduced — a warning colour is *supposed* to be amber — but it does
 * mean the act colour and the caution colour are, to a reader glancing at a
 * dense page, the same colour. The admin dashboard's attention panel is where
 * it shows: one header slot draws an amber count when something needs doing and
 * an amber wordmark when nothing does.
 *
 * **Glyph discipline was rejected as the answer (owner, 2026-09-01): he has
 * never liked the closeness and wants this pass to settle it.** So the slide
 * now carries retune candidates rendered in the panel itself rather than a
 * behaviour rule to remember. The discipline line survives as a rider under any
 * choice, because a warning that reads as amber to a colour-blind eye needs a
 * glyph whatever hue it is.
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

/**
 * The three candidates, each drawn in the attention panel's own slot.
 *
 * **They are inline styles rather than Tailwind classes, and that is not
 * sloppiness.** A candidate has no token yet — minting one is the wiring
 * change this ruling authorises — and a class can only name a token that
 * exists. Writing the hex at the use site is also the honest signal that
 * nothing here is live.
 *
 * Numbers are all computed rather than eyeballed. `Δ` is CIE76 in Lab, the same
 * measure the status-colour swatches were annotated with: under about 25, two
 * colours read as two shades of one thing. Contrast is against the card
 * (`#1a1a1a`), which is the ground the panel sits on and the stricter of the
 * two the app has; 4.5:1 is the body-text bar a `text-warning` label has to
 * clear.
 *
 * The desaturated candidate started in the `#A16207`–`#B45309` region the owner
 * named and had to be lifted out of it: both of those measure 3.5:1 on the
 * card, well under the bar. `#B88A2E` is that idea tuned until it passes — same
 * hue as the brand amber, sixty percent of its saturation, and 31.5 away, which
 * is further apart than `--info` and wit-strong ever were.
 *
 * The orange-shifted candidate is included because it is the obvious move and
 * because its number is the argument against it: 27.4 clear of amber, but 15.2
 * from valor-strong, which puts the caution colour inside the family that marks
 * camps, events and quests.
 */
const WARNING_CANDIDATES: readonly {
  name: string;
  hex: string;
  hue: string;
  toPrimary: string;
  toValor: string;
  contrast: string;
}[] = [
  {
    name: "Today — #E7B008",
    hex: "#E7B008",
    hue: "hue 45.0°",
    toPrimary: "Δ 12.0 from --primary",
    toValor: "Δ 43.9 from valor-strong",
    contrast: "8.79:1 on the card",
  },
  {
    name: "Desaturated ochre — #B88A2E",
    hex: "#B88A2E",
    hue: "hue 40.0°",
    toPrimary: "Δ 31.5 from --primary",
    toValor: "Δ 44.5 from valor-strong",
    contrast: "5.56:1 on the card",
  },
  {
    name: "Orange-shifted — #E2761B",
    hex: "#E2761B",
    hue: "hue 27.4°",
    toPrimary: "Δ 27.4 from --primary",
    toValor: "Δ 15.2 from valor-strong",
    contrast: "5.67:1 on the card",
  },
];

/* ------------------------------------------------------------------ */
/*  Dropped — status colours meet the palette                          */
/* ------------------------------------------------------------------ */

/**
 * **Ruled 2026-09-01: option A.** `--info` converges onto wit and `--success`
 * onto glow, at the token. Both are tokens rather than call-site literals, so
 * no component changes: the two convergences the liveness and time slides show
 * in context fall out of two lines in `globals.css`.
 *
 * **The same wiring change updates `src/lib/constants/colors.ts`** (owner's
 * explicit instruction). Those are the literal hexes the email templates and
 * the Open Graph images draw with — satori and an email client can read neither
 * a token nor a stylesheet — so a token moved without them would leave a
 * family's inbox and a shared link one palette behind the app.
 */

/* ------------------------------------------------------------------ */
/*  Slide 13 — the grammar in the wild                                 */
/* ------------------------------------------------------------------ */

/**
 * **The shop is not on this slide, and that is a ruling rather than an
 * omission.** The grammar's only proposal for the storefront was to colour the
 * product types from the four families; the owner rejected it on 2026-09-01 —
 * the admin product palette was placed 25–30° clear of the function colours
 * precisely so a category mark can never be mistaken for a state mark, and the
 * pairing is admin-only anyway.
 *
 * The rail markers left this slide for the time slide, where the rest of the
 * feed's future system is, and the status-convergence ruling left it for the
 * liveness and time slides, which carry it once each in the territory it
 * belongs to. What remains here is the pair of surfaces the owner asked to see
 * the grammar *applied* on rather than argued about.
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
/*  Slide 16 — buttons                                                 */
/* ------------------------------------------------------------------ */

/**
 * The button samples wear `BUTTON_SHAPE` — the base of the real variant recipe
 * at its default size, at the ruled CTA type. (The *type* was decided on the
 * typography deck; this slide is colour and shape, drawn on it.)
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

/**
 * **Grammar-matched buttons** (owner, 2026-09-01: open to more colourful
 * buttons, but only where the action is in line with the colour's grammar
 * meaning). Four actions where the verb *is* the family's word, each at the two
 * strengths the axis allows a non-CTA to take: a solid fill, and the quiet
 * outline-or-label tier.
 *
 * **The ink is picked per fill from measured contrast, not by habit.** Dark ink
 * on the strong variant clears the body bar for harmony (6.11:1), glow (6.63:1)
 * and valor (6.69:1), and misses it for wit — 4.10:1 — which is why wit alone
 * fills with its soft variant, at 8.10:1. White ink is not an escape: it
 * measures 2.8–3.1:1 on the three strongs, so the dark-ink fill is the only
 * legible solid these hues have.
 */
const GRAMMAR_BUTTONS: readonly {
  family: string;
  action: string;
  fill: string;
  quiet: string;
  note: string;
}[] = [
  {
    family: "Valor — adventure",
    action: "Book the camp",
    fill: "bg-yty-valor-strong text-background shadow",
    quiet: "border border-yty-valor-strong text-yty-valor-soft",
    note: "ink on the fill, 6.69:1",
  },
  {
    family: "Harmony — people",
    action: "Invite a friend",
    fill: "bg-yty-harmony-strong text-background shadow",
    quiet: "border border-yty-harmony-strong text-yty-harmony-soft",
    note: "ink on the fill, 6.11:1",
  },
  {
    family: "Glow — growth",
    action: "View progress",
    fill: "bg-yty-glow-strong text-background shadow",
    quiet: "border border-yty-glow-strong text-yty-glow-soft",
    note: "ink on the fill, 6.63:1",
  },
  {
    family: "Wit — knowledge",
    action: "See the schedule",
    fill: "bg-yty-wit-soft text-background shadow",
    quiet: "border border-yty-wit-strong text-yty-wit-soft",
    note: "soft, because wit-strong is 4.10:1",
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
  typeClass,
  note,
}: {
  word: string;
  sample: string;
  className: string;
  /** The CTA type this cell is set in — ruled for a draft, today's for a quote. */
  typeClass: string;
  note?: string;
}) {
  return (
    <div className="w-48 space-y-2">
      <span className={cn(STRENGTH_SHAPE, typeClass, className)}>{sample}</span>
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
 * One construct from the grammar's examples run, at the shape its own component
 * draws it in. The `where` field on each sample names that component, so a
 * shape here can be checked against source rather than taken on trust.
 *
 * The newcomer badge's pips are `bg-current` rather than the badge's own two
 * tone classes — the real meter drains from full to a quarter alpha, and
 * inheriting the pill's colour is what lets one tone string drive the whole
 * sample. It is the one place this run simplifies a shape.
 */
function GrammarExample({
  shape,
  tone,
  ink,
}: {
  shape: GrammarShape;
  tone: string;
  ink?: string;
}) {
  switch (shape) {
    case "button":
      return <span className={cn(BUTTON_SHAPE, tone)}>Join the club</span>;
    case "link":
      return (
        <span className="text-sm text-muted-foreground">
          Trouble signing in?{" "}
          <span className={cn("font-medium", tone)}>Forgot your password?</span>
        </span>
      );
    case "newcomer":
      return (
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-0 text-[10px] font-medium leading-4",
            tone,
          )}
        >
          <Star className="h-3 w-3" aria-hidden />
          New
          <span className="ml-1 grid grid-cols-2 gap-0.5" aria-hidden>
            <span className="h-1 w-1 rounded-full bg-current" />
            <span className="h-1 w-1 rounded-full bg-current" />
            <span className="h-1 w-1 rounded-full bg-current" />
            <span className="h-1 w-1 rounded-full bg-current opacity-25" />
          </span>
        </span>
      );
    case "reaction":
      return (
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs leading-none",
            tone,
          )}
        >
          <Heart className="h-3.5 w-3.5" aria-hidden />
          <span className="tabular-nums">3</span>
        </span>
      );
    case "badge":
      return (
        <span
          className={cn(
            "inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold",
            tone,
          )}
        >
          <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
          Certified
        </span>
      );
    case "meter":
      return (
        <span className="inline-flex items-center gap-2">
          <Mic className="h-4 w-4 text-muted-foreground" aria-hidden />
          <span className="h-1.5 w-28 overflow-hidden rounded-full bg-muted">
            <span className={cn("block h-full w-2/3 rounded-full", tone)} />
          </span>
        </span>
      );
    case "alert":
      return (
        <div
          className={cn(
            "flex w-full items-start gap-3 rounded-lg border p-4 text-sm",
            tone,
          )}
        >
          <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span>Switching profile signs this device in as your gamer.</span>
        </div>
      );
    case "countdown":
      return (
        <span className="inline-flex gap-2">
          {COUNTDOWN_CELLS.map((cell) => (
            <span
              key={cell.unit}
              className={cn("w-16 rounded-md border py-2 text-center", tone)}
            >
              <span className={cn("block text-xl font-bold tabular-nums", ink)}>
                {cell.value}
              </span>
              <span className="block text-[9px] uppercase tracking-wider text-muted-foreground">
                {cell.unit}
              </span>
            </span>
          ))}
        </span>
      );
    case "mediachip":
      return (
        <span
          className={cn(
            "inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium shadow-sm",
            tone,
          )}
        >
          <Sprout className="h-3 w-3 shrink-0" aria-hidden />
          Beginner
        </span>
      );
    case "title":
      return (
        <span className="text-2xl font-semibold text-foreground">
          Play together in <span className={tone}>Sogverse</span>
        </span>
      );
    case "washcard":
      return (
        <div className={cn("w-full rounded-lg border p-4", tone)}>
          <div className="text-sm font-semibold text-foreground">
            Explore the Programme
          </div>
          <p className="text-xs text-muted-foreground">
            In collaboration with Roblox.
          </p>
        </div>
      );
  }
}

/**
 * One construct class from the shading census, at a shape borrowed from the
 * surfaces the class actually appears on. The same component draws both halves
 * of every pair, so the only difference a reader sees is the value.
 */
function ShadingSample({
  shape,
  className,
}: {
  shape: ShadingShape;
  className: string;
}) {
  switch (shape) {
    case "ink":
      return <span className={cn("text-sm font-semibold", className)}>Pending</span>;
    case "chip":
      return <span className={cn(LIFECYCLE_SHAPE, className)}>pending</span>;
    case "tile":
      return (
        <span
          className={cn(
            "inline-flex h-12 w-12 items-center justify-center rounded-lg",
            className,
          )}
        >
          <Sparkles className="h-6 w-6 text-primary" aria-hidden />
        </span>
      );
    case "row":
      return (
        <div
          className={cn(
            "flex w-52 items-start gap-3 rounded-md border p-3 text-sm text-foreground",
            className,
          )}
        >
          <span className="mt-0.5 h-4 w-4 shrink-0 rounded-sm border border-current" />
          <span>Every week</span>
        </div>
      );
    case "button":
      return <span className={cn(BUTTON_SHAPE, className)}>Explore clubs</span>;
    case "block":
      return <span className={cn("block h-8 w-8 rounded-sm", className)} />;
  }
}

/**
 * The admin attention panel's header slot, which is the one place the act
 * colour and the caution colour sit in the same geometry.
 *
 * The count's tone arrives as a hex rather than a class because the candidates
 * have no tokens yet; `1a` is the eight-digit spelling of the `/10` wash the
 * live panel draws behind its count.
 */
function AttentionPanelSample({ hex }: { hex: string }) {
  return (
    <div className="rounded-lg border bg-card">
      <div className="flex flex-row items-center justify-between gap-4 p-6">
        <span className="text-xl font-semibold text-foreground">
          Needs attention
        </span>
        <span className="flex items-center gap-2">
          <CircleAlert className="h-5 w-5 shrink-0" style={{ color: hex }} aria-hidden />
          <span
            className="rounded-full px-3 py-1 text-sm font-semibold"
            style={{ backgroundColor: `${hex}26`, color: hex }}
          >
            3
          </span>
        </span>
      </div>
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
 *
 * The draft strip also carries the ruled face: a zone name is the platform
 * naming one of its own places, which is the one job Space Mono keeps once
 * everything else in the app is Poppins.
 */
function ZoneTileStrip({ palette }: { palette: YtyPalette }) {
  const draft = palette !== "current";
  const presentations = draft ? YTY_PRESENTATIONS_DRAFT : YTY_PRESENTATIONS;

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
            <span
              className={cn(
                "text-sm font-semibold",
                draft && "font-brand-mono",
                zone.color.glyph,
              )}
            >
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
          the Guidebook? Slides 2–12 rule on the system once; the rest apply it.
          Type is already ruled, on the other deck at{" "}
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

      {/* Dropped — the strong and soft split. Ruled fine; wit-strong's 3.81:1
          is handled by mechanism rather than by care. See the comment at the
          constants' old position. */}

      {/* ----------------------------------------------------------- 2 */}
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

        <div className="space-y-3">
          <Marker>The same vocabulary on constructs that ship</Marker>
          <div className="flex flex-wrap gap-4">
            {GRAMMAR_EXAMPLE_ROWS.map((row) => (
              <div
                key={row.family}
                className="w-80 space-y-4 rounded-lg border bg-card p-4"
              >
                <div className="space-y-0.5">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    {row.family}
                  </div>
                  <div className={cn("text-lg font-semibold", row.wordClass)}>
                    {row.word}
                  </div>
                </div>
                {row.samples.map((sample) => (
                  <div key={sample.where} className="space-y-1.5">
                    <div className="flex min-h-9 items-center">
                      <GrammarExample
                        shape={sample.shape}
                        tone={sample.tone}
                        ink={sample.ink}
                      />
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {sample.where}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
        <Caption>
          Each construct is one no other slide draws, redrawn in the family whose
          word it demonstrates.
        </Caption>

        <Ruling>
          <p>
            Adopt the grammar as the app&rsquo;s colour vocabulary — or sign it
            off family by family, naming any whose examples do not carry it.
            (recommended: adopt)
          </p>
          <p>
            Violet narrows to &ldquo;the world&rdquo; and stops carrying UI
            grammar. (recommended: narrow)
          </p>
        </Ruling>
      </Slide>

      {/* ----------------------------------------------------------- 3 */}
      <Slide id="strength">
        <div className="space-y-3">
          <Marker>One family, three strengths</Marker>
          <div className="flex flex-wrap gap-6">
            {STRENGTH_STEPS.map((step) => (
              <StrengthCell
                key={step.word}
                {...step}
                typeClass={STRENGTH_TYPE_RULED}
              />
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
                typeClass={STRENGTH_TYPE_TODAY}
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

      {/* ----------------------------------------------------------- 4 */}
      <Slide id="shading">
        <div className="space-y-3">
          <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-x-6 gap-y-1">
            <Marker>Construct class</Marker>
            <Marker>Off-value, as shipped</Marker>
            <Marker>At full value</Marker>
            <Marker>Scope</Marker>
            {SHADING_ROWS.map((row) => (
              <Fragment key={row.name}>
                <div className="border-t py-3 pr-4">
                  <div className="text-sm text-foreground">{row.name}</div>
                  <div className="text-[11px] text-muted-foreground">
                    {row.count}
                  </div>
                </div>
                <div className="border-t py-3">
                  <ShadingSample shape={row.shape} className={row.shipped} />
                  <div className="pt-1.5 text-[11px] text-muted-foreground">
                    {row.shipped}
                  </div>
                </div>
                <div className="border-t py-3">
                  <ShadingSample shape={row.shape} className={row.corrected} />
                  <div className="pt-1.5 text-[11px] text-muted-foreground">
                    {row.corrected}
                  </div>
                </div>
                <div className="border-t py-3">
                  <span
                    className={cn(
                      "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
                      row.scope.startsWith("Bound")
                        ? "bg-foreground text-background"
                        : "border border-border text-muted-foreground",
                    )}
                  >
                    {row.scope}
                  </span>
                </div>
              </Fragment>
            ))}
          </div>
        </div>
        <Caption>
          The hover row is the button&rsquo;s hover value beside its rest value,
          because a state you pass through cannot be compared in passing.
        </Caption>

        <Ruling>
          <p>
            Ruled: the rule is codified, and tint grounds at card/row scale are
            bound — the icon-accent tile and the two sanctioned home keeps stay
            exempt.
          </p>
          <p>
            Still open, three separate calls: tinted label chips (neither an
            accent nor a card), low-alpha edges, and hover darkening/lifts.
          </p>
          <p>
            Ruling against edges retires the strength axis&rsquo;s own third
            tier.
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

      {/* Dropped — role families. Approved as drawn, plus the standing
          direction that role colours get reinforced app-wide wherever a role is
          understood without a label (plan direction 25, wiring-phase work). See
          the comment at the constants' old position. */}

      {/* ---------------------------------------------------------- 10 */}
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
          Every hue is committed to a meaning, so a brand fill on Send report
          claims one the action does not have; the foreground fill is the
          app&rsquo;s own ink at fill weight, not a new colour.
        </Caption>

        <Ruling>
          <p>
            Violet is out and the fill weight is right — pick the colour that
            replaces it: foreground fill, heavy outline, or the wit-soft brand
            fill. (recommended: foreground fill)
          </p>
        </Ruling>
      </Slide>

      {/* ---------------------------------------------------------- 11 */}
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

      {/* ---------------------------------------------------------- 12 */}
      <Slide id="warning-adjacency">
        <div className="flex flex-wrap gap-4">
          {AMBER_NEIGHBOURS.map((swatch) => (
            <Swatch key={swatch.label} {...swatch} />
          ))}
        </div>

        <div className="space-y-3">
          <Marker>The same panel slot, once per candidate</Marker>
          {WARNING_CANDIDATES.map((candidate) => (
            <div key={candidate.hex} className="space-y-1.5">
              <AttentionPanelSample hex={candidate.hex} />
              <div className="flex flex-wrap items-baseline gap-x-4 text-[11px] text-muted-foreground">
                <span className="font-semibold text-foreground">
                  {candidate.name}
                </span>
                <span>{candidate.hue}</span>
                <span>{candidate.toPrimary}</span>
                <span>{candidate.toValor}</span>
                <span>{candidate.contrast}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-3">
          <Marker>The other state of that slot, which is amber</Marker>
          <div className="rounded-lg border bg-card">
            <div className="flex flex-row flex-wrap items-center justify-between gap-x-6 gap-y-3 p-6">
              {/* Poppins, not the pixel face: the all-clear is one of the six
                  Press Start 2P sites the type ruling converts, and it now sits
                  at the same size and weight as the "Needs attention" title
                  above — which is the point of the exhibit, since the two are
                  the same slot in two states and both are amber today. */}
              <span className="text-xl font-semibold text-primary">
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
        <Caption>
          Δ is CIE76 in Lab, the measure the status swatches carried; contrast is
          against the card, where 4.5:1 is the body-text bar.
        </Caption>

        <Ruling>
          <p>
            Retune <code>--warning</code>, or keep it: A, today&rsquo;s
            #E7B008; B, the desaturated ochre #B88A2E; C, the orange-shifted
            #E2761B.
          </p>
          <p>
            C reads as valor at 15.2 away, which puts caution inside the family
            that marks camps, events and quests.
          </p>
          <p>
            Rider under any choice: a warning mark carries a glyph and never sits
            inside an amber-act container.
          </p>
        </Ruling>
      </Slide>

      {/* Dropped — status colours meet the palette. Ruled option A: --info
          converges onto wit and --success onto glow, at the token, with no call
          sites touched; src/lib/constants/colors.ts moves in the same change so
          the emails and the OG images follow. See the comment at the constants'
          old position. */}

      {/* ---------------------------------------------------------- 13 */}
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

      {/* ---------------------------------------------------------- 14 */}
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
            enrollment cards as one page — or name what to tune. The greeting
            above them is already the ruled Poppins.
          </p>
        </Ruling>
      </Slide>

      {/* ---------------------------------------------------------- 15 */}
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

      {/* ---------------------------------------------------------- 16 */}
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

        <div className="space-y-3">
          <Marker>
            Grammar-matched — the action is the family&rsquo;s own word
          </Marker>
          {GRAMMAR_BUTTONS.map((row) => (
            <div key={row.family} className="flex flex-wrap items-center gap-4">
              <span className="w-40 shrink-0 text-xs text-muted-foreground">
                {row.family}
              </span>
              <span className={cn(BUTTON_SHAPE, row.fill)}>{row.action}</span>
              <span className={cn(BUTTON_SHAPE, row.quiet)}>{row.action}</span>
              <span className="text-[11px] text-muted-foreground">
                {row.note}
              </span>
            </div>
          ))}
        </div>

        <div className="space-y-3">
          <Marker>The same fill in a card footer, beside the amber CTA</Marker>
          <div className="max-w-md rounded-lg border bg-card p-4">
            <div className="text-base font-semibold text-foreground">
              Builders Camp
            </div>
            <p className="pt-1 text-sm text-muted-foreground">
              Two weeks in June, in Helsinki.
            </p>
            <div className="flex flex-col-reverse gap-2 pt-4 sm:flex-row sm:justify-end">
              <span
                className={cn(
                  BUTTON_SHAPE,
                  "bg-yty-valor-strong text-background shadow",
                )}
              >
                Book the camp
              </span>
              <span
                className={cn(
                  BUTTON_SHAPE,
                  "bg-primary text-primary-foreground shadow",
                )}
              >
                Join the club
              </span>
            </div>
          </div>
        </div>

        <Ruling>
          <p>
            The violet fill — retire it into Secondary-on-dark, or keep it under
            another name. (recommended: retire; it is one call site)
          </p>
          <p>
            The third tier — A ghost as today, B a quiet 1px border, or C label
            only.
          </p>
          <p>
            Grammar colour on buttons — A, adopt fills under four constraints
            (the action is the family&rsquo;s word; never two grammar fills in
            one view; amber keeps the act monopoly, so a grammar fill may not sit
            beside a primary CTA; destructive red is untouched); B, allow grammar
            colour only at outline-or-label strength; or C, keep buttons neutral
            and amber.
          </p>
        </Ruling>

        <Links>
          <DeckLink href="/admin/ui-components#button-guidebook-proposal-today-beside-proposed">
            Every state in the style guide
          </DeckLink>
        </Links>
      </Slide>

      {/* ---------------------------------------------------------- 17 */}
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

      {/* ---------------------------------------------------------- 18 */}
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

      {/* ---------------------------------------------------------- 19 */}
      <Slide id="recap">
        <ol className="max-w-prose list-decimal space-y-1.5 pl-5 text-sm text-foreground">
          <li>Adopt the colour grammar — whole, or family by family.</li>
          <li>Violet narrows to &ldquo;the world&rdquo;.</li>
          <li>The strength axis — solid = act, tint = label, edge = selection.</li>
          <li>The shading rule — codify it.</li>
          <li>Its scope — hover darkening, tint grounds, low-alpha edges.</li>
          <li>Selected and active states leave amber.</li>
          <li>The lifecycle idiom — one hue, stepped.</li>
          <li>Liveness is glow everywhere.</li>
          <li>The future system converges to wit.</li>
          <li>Eligibility is wit at label strength.</li>
          <li>
            Violet&rsquo;s replacement fill — foreground, heavy outline, or
            wit-soft.
          </li>
          <li>The ensemble trim on mechanical acknowledgements.</li>
          <li>
            Warning — keep #E7B008, or retune to the ochre or the orange shift.
          </li>
          <li>The grammar per surface — My SOG, the family product page.</li>
          <li>The gamer dashboard&rsquo;s colour at the 360 floor.</li>
          <li>The Yty element cards as drafted.</li>
          <li>Wit&rsquo;s pair — accept the seam, or escalate a tuned dark wit.</li>
          <li>The violet fill button — retire, or keep under another name.</li>
          <li>The third button tier — A, B or C.</li>
          <li>Grammar colour on buttons — fills, outline only, or neither.</li>
          <li>The voice-zone tiles.</li>
          <li>The calm ring — confirm amber-only, or adjust.</li>
        </ol>
      </Slide>
    </div>
  );
}
