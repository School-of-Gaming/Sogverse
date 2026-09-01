/* eslint-disable i18next/no-literal-string -- temporary admin-only review deck for the brand design pass; every string here is owner-facing walkthrough narration about drafts, never product copy that ships in any locale, and the whole page is deleted before the wiring phase merges */

import { Info } from "lucide-react";
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
 * and never an iframed page. The zone presentation maps, the Yty colour maps,
 * the enrollment tone map and the attendance tone map are read here directly, so
 * a sample is the draft's real presentation rather than a picture of it. Beside
 * each sample is a plain link to the full preview scene, the live page or a
 * style-guide anchor.
 *
 * **The home page is not in this deck** (owner ruling, 2026-09-01): it is parked
 * into its own dedicated pass — the owner is comfortable with the current
 * amber/violet hero and its gradient is a live option there — so no home draft
 * rides with this review. The dose question, the hero exhibits and the dusk-sky
 * gradient went with it. What survives here is the `/about` elements section,
 * which is a different route and one of this pass's three real consumers; its
 * cards are on the elements slide. The home preview scenes still exist and are
 * untouched, ready for that pass.
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
  { id: "grammar-wild", title: "The grammar in the wild" },
  { id: "gamer-floor", title: "The gamer dashboard at 360" },
  { id: "elements", title: "The Yty element cards" },
  { id: "buttons", title: "Buttons" },
  { id: "zones", title: "Voice-zone tiles" },
  { id: "reach", title: "The calm ring" },
  { id: "status-colours", title: "Status colours meet the palette" },
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
    examples: ["Progress", "Achievements", "Yty-Points"],
  },
  {
    family: "Wit blue",
    word: "Knowledge",
    swatch: "bg-yty-wit-strong",
    wordClass: "text-yty-wit-soft",
    examples: ["Information", "Learning", "Tips"],
  },
  {
    family: "Valor orange",
    word: "Adventure",
    swatch: "bg-yty-valor-strong",
    wordClass: "text-yty-valor-soft",
    examples: ["Camps", "Events", "Live now"],
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
 * the home page's third circle does: ink on wit-strong measures 3.81:1.
 */
const ROLE_BADGES_ILLUSTRATED: readonly { label: string; className: string }[] = [
  { label: "Gamer", className: "bg-yty-glow-strong text-background" },
  { label: "Parent", className: "bg-yty-harmony-strong text-background" },
  { label: "Gedu", className: "bg-yty-wit-soft text-background" },
  { label: "Admin", className: "bg-foreground text-background" },
];

/* ------------------------------------------------------------------ */
/*  Slide 4 — the grammar in the wild                                  */
/* ------------------------------------------------------------------ */

/**
 * **The shop is not on this slide, and that is a ruling rather than an
 * omission.** The grammar's only proposal for the storefront was to colour the
 * product types from the four families (camp = valor, club = glow, and so on);
 * the owner rejected it on 2026-09-01 — the admin product palette was placed
 * 25–30° clear of the function colours precisely so a category mark can never be
 * mistaken for a state mark, and the pairing is admin-only anyway. A parent's
 * browse card carries no type colour at all, so with the mapping dead there is
 * nothing type-coloured left for any parent-facing sample to show, and the
 * comparison came out whole rather than staying as a settled note.
 */

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
/*  Slide 7 — buttons                                                  */
/* ------------------------------------------------------------------ */

/**
 * The button shape every sample wears — the base of the real variant recipe at
 * its default size, at today's CTA type. (The *type* question moved to the
 * typography deck; this slide is colour and shape.)
 *
 * **Written out rather than called for.** Using the button primitive here would
 * add call sites to the very counts this slide asks a decision about, so the
 * samples are literal copies of the variants' own class strings on inert spans.
 * They are at rest only; the style guide draws every state.
 */
const BUTTON_SHAPE =
  "inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium transition-colors";

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
/*  Slide 10 — status colours                                          */
/* ------------------------------------------------------------------ */

/**
 * The functional status tokens against the brand family each one now sits in.
 *
 * Distances are CIE76 in Lab — a rough but honest "how far apart would a person
 * call these"; under about 25 is where two colours read as two shades of one
 * thing. They are annotated on the swatches rather than tabled, because the
 * swatches are what make the claim and the number is the footnote.
 *
 * Warning and destructive are absent: at 43.9 and 42.6 from their nearest brand
 * family they are a different colour by any measure, and a before-and-after
 * showing no collision would read as a rendering fault.
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

/**
 * The same collision as the app actually draws it — the tinted chip shape both
 * halves already use, so the confusion is visible in context rather than as
 * squares.
 */
const STATUS_CHIPS: readonly {
  status: { label: string; className: string };
  brand: { label: string; className: string };
}[] = [
  {
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

/* ------------------------------------------------------------------ */
/*  Small shapes the exhibits are built from                           */
/* ------------------------------------------------------------------ */

function StatusChip({ label, className }: { label: string; className: string }) {
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

/** A rail dot at the size the family feed draws it, with its label beside it. */
function MarkerRow({ label, className }: { label: string; className: string }) {
  return (
    <span className="inline-flex items-center gap-2">
      <span className={cn("h-2.5 w-2.5 rounded-full", className)} aria-hidden />
      <span className="text-xs text-muted-foreground">{label}</span>
    </span>
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
        <h1 className="text-3xl font-bold">Brand design pass — colour</h1>
        <p className="max-w-prose text-muted-foreground">
          Can Sogverse be as fun, colourful, bright and lively as the sog.gg
          marketing site while keeping the dark ground — all while adhering to the
          Guidebook? Each slide draws today beside the draft and asks one
          question; type is the other deck, at{" "}
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

        <div className="space-y-3">
          <Marker>Role badges — today, then real families</Marker>
          <div className="flex flex-wrap items-center gap-3">
            {ROLE_BADGES_TODAY.map((badge) => (
              <Pill key={badge.label} {...badge} />
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {ROLE_BADGES_ILLUSTRATED.map((badge) => (
              <Pill key={badge.label} {...badge} />
            ))}
          </div>
          <Caption>
            Gedu is an amber-to-violet gradient today because a fourth role
            arrived with no hue left; the second row is an illustration, not a
            decided mapping.
          </Caption>
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
          <p>
            Role badges take real families, retiring the gradient — mapping
            settled with you. (recommended: adopt)
          </p>
        </Ruling>
      </Slide>

      {/* ----------------------------------------------------------- 4 */}
      <Slide id="grammar-wild">
        <div className="space-y-3">
          <Marker>My SOG enrollment cards — today, then the draft</Marker>
          <EnrollmentStates palette="current" />
          <EnrollmentStates palette="brand" />
        </div>

        <div className="space-y-3">
          <Marker>Session-feed rail markers</Marker>
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
            The status convergence on these surfaces as drafted. (recommended:
            adopt)
          </p>
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

      {/* ----------------------------------------------------------- 5 */}
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

      {/* ----------------------------------------------------------- 6 */}
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

      {/* ---------------------------------------------------------- 7 */}
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

      {/* ---------------------------------------------------------- 8 */}
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

      {/* ---------------------------------------------------------- 9 */}
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

      {/* --------------------------------------------------------- 10 */}
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

        <div className="space-y-3">
          <Marker>The same collision, as the app draws it</Marker>
          {STATUS_CHIPS.map((pair) => (
            <div key={pair.status.label} className="flex flex-wrap items-center gap-3">
              <StatusChip {...pair.status} />
              <StatusChip {...pair.brand} />
            </div>
          ))}
        </div>
        <Caption>
          Distances are CIE76 in Lab; under about 25 two colours read as one thing
          at two strengths.
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

      {/* --------------------------------------------------------- 11 */}
      <Slide id="recap">
        <ol className="max-w-prose list-decimal space-y-1.5 pl-5 text-sm text-foreground">
          <li>The strong and soft split.</li>
          <li>Adopt the colour grammar.</li>
          <li>Violet narrows to &ldquo;the world&rdquo;.</li>
          <li>Role badges take real families, retiring the gradient.</li>
          <li>The status convergence on the parent surfaces as drafted.</li>
          <li>The grammar per surface — My SOG, the family product page.</li>
          <li>The gamer dashboard&rsquo;s colour at the 360 floor.</li>
          <li>The Yty element cards as drafted.</li>
          <li>Wit&rsquo;s pair — accept the seam, or escalate a tuned dark wit.</li>
          <li>The violet fill button — retire, or keep under another name.</li>
          <li>The third button tier — A, B or C.</li>
          <li>The voice-zone tiles.</li>
          <li>The calm ring — confirm amber-only, or adjust.</li>
          <li>Status colours — converge, keep both, or defer.</li>
        </ol>
      </Slide>
    </div>
  );
}
