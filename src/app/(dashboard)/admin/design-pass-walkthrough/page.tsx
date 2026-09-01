/* eslint-disable i18next/no-literal-string -- temporary admin-only review deck for the brand design pass; every string here is owner-facing walkthrough narration about drafts, never product copy that ships in any locale, and the whole page is deleted before the wiring phase merges */

import { Check, ChevronRight, CreditCard, ExternalLink } from "lucide-react";
import { ENROLLMENT_TONES } from "@/components/family/enrollment-tones";
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
 * **This was the system deck — layer one, "rule on the system once".** A
 * six-territory census swept the app against the draft doctrine and found the
 * same shape over and over: one hue carrying several meanings, several hues
 * carrying one meaning, and no vocabulary at all for *how loud* a colour is
 * being spoken. Most of that finding is now ruled and dropped; what survives of
 * the system half is the strength axis and the shading rule, and what follows
 * them are sign-offs on rules already ruled above them.
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
 * **A proposal is shown against the thing it replaces, and both halves are real
 * constructs** (owner, 2026-09-01, on the shading slide's first form: "I am not
 * asking seeing what you are proposing. I need to see violations of the rule and
 * what you suggest as the replacement"). A generic square standing in for a
 * class of violation reads as an invention; the app's own row, chip or card with
 * its own copy reads as the defect it is. Where a sample is genuinely abstract —
 * a pixel of a sprite — it stays abstract and says so.
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
 * it is read here directly (the enrollment tones), so the sample is the draft's
 * real presentation rather than a picture of it. Where the map is private to a
 * client module — the admin product status chip, the checkbox row's checked
 * container, the browse card's hover edge, the button recipe — the classes are
 * **restated literally** and the sample names the file they came from, so a
 * reader can tell a quotation from a live read. A button sample is written out
 * rather than calling `buttonVariants`, which also kept the buttons slide from
 * inflating the very call-site counts it asked a decision about.
 *
 * **One home per comparison.** The checkbox row's selection ground left the
 * "you are here" slide for the shading slide, where it is one of the census's
 * own violations; that slide is now the nav treatments only.
 *
 * **The home page is not in this deck** (owner ruling, 2026-09-01): it is parked
 * into its own dedicated pass — the owner is comfortable with the current
 * amber/violet hero and its gradient is a live option there — so no home draft
 * rides with this review. The `/about` elements section is a different route and
 * one of this pass's three real consumers; it was drawn on the element-cards
 * slide, which is now ruled and dropped.
 *
 * **Product-type colours are out of scope** (owner, 2026-09-01) and the
 * identicon has its own pass, so neither appears on any slide.
 *
 * **Two honesty caveats, stated once here rather than on every slide.** Tailwind
 * breakpoints read the *viewport*, not the container, so an inline sample is
 * always showing desktop styling however narrow its box is — where the 360px
 * truth is the point, the slide falls back to a link. And a sample sits on the
 * deck's own ground unless it says otherwise.
 *
 */

/* ------------------------------------------------------------------ */
/*  The deck                                                           */
/* ------------------------------------------------------------------ */

const SLIDES = [
  { id: "palette-today", title: "The palette today" },
  { id: "strength", title: "The strength axis" },
  { id: "shading", title: "The shading rule" },
  { id: "you-are-here", title: '"You are here" is not "act"' },
  { id: "gamer-floor", title: "The pages, in their scenes" },
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
/*  Swatches                                                           */
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
/*  Dropped — colour as grammar                                        */
/* ------------------------------------------------------------------ */

/**
 * **Ruled 2026-09-01: approved whole.** "I like all the colors. Approved." The
 * vocabulary binds, all six families: amber = act, harmony pink = people, glow
 * green = growth, wit blue = knowledge, valor orange = adventure, violet = the
 * world. Violet narrows with it — it keeps display moments and the lore and
 * gives up the six unrelated UI jobs it was carrying, which is what the six
 * identical violet chips on that slide were the exhibit for.
 *
 * That makes the grammar the doctrine the wiring phase applies rather than a
 * proposal anything else on this deck still argues for; the slides that quoted
 * it in one territory each — lifecycle, liveness, time, eligibility — are ruled
 * and dropped beside it.
 *
 * The role badges passed through this slide on their way to the role-families
 * slide, which is also ruled and dropped; its comment carries that ruling.
 */

/* ------------------------------------------------------------------ */
/*  Slide 2 — the strength axis                                        */
/* ------------------------------------------------------------------ */

/**
 * **The doctrine's missing dimension.** The grammar says which family a surface
 * reaches for; nothing until now said how *loudly* it may speak. Without that,
 * two surfaces obeying the grammar perfectly can still collide, because they
 * pick the same family at the same strength for two different jobs — which is
 * exactly what the amber row below shows the app doing today.
 *
 * Three strengths, and deliberately only three: a solid fill is the loudest
 * thing a colour can be and is spent on the thing you are asked to *do*; a tint
 * with coloured text is a label, read but not clicked; an edge marks the one
 * item among several that is currently chosen. Glow is the family drawn here
 * because it is the one the ensemble rule says we hear least.
 *
 * **The owner caught this slide breaking the shading rule** (2026-09-01): the
 * proposal's selection tier carried
 * `bg-yty-glow-strong/5`, and a tint ground at row scale is exactly what the
 * shading ruling bound the same day. The proposal is therefore a solid edge on
 * a transparent ground, and the third tier is now an *edge* tier rather than an
 * edge-and-wash one.
 *
 * **Two consequences worth keeping straight, because the two halves of this
 * slide now answer to different rules.** The proposal above is corrected; the
 * amber row below is not, and must not be — it quotes the app as shipped, and
 * its "Selected" cell *is* one of the 22 census violations the shading slide
 * counts. Fixing it here would delete the evidence. And the proposal's own
 * *label* tier is a tinted chip, which is one of the three classes the shading
 * ruling left open, so it is annotated as pending rather than presented as
 * settled.
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
  note?: string;
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
    note: "pending the chip ruling",
  },
  {
    word: "Selection",
    sample: "Every week",
    className: "border border-yty-glow-strong bg-transparent text-foreground",
  },
];

/**
 * The collision the axis fixes, in the app's own classes. The first two are
 * byte-identical in strength — `--sidebar-primary` mirrors `--primary` and both
 * pair it with the ink foreground — and they mean two entirely different
 * things. The third is the census violation itself, quoted rather than
 * corrected.
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
    where: "a form choice — the tint ground the shading ruling bound",
    sample: "Every week",
    className: "border border-primary bg-primary/5 text-foreground",
  },
];

/* ------------------------------------------------------------------ */
/*  Slide 3 — the shading rule                                         */
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
 * **Every row is drawn on the construct the census found it on** (owner,
 * 2026-09-01: "I need to see violations of the rule and what you suggest as the
 * replacement"). The first form of this slide used generic shapes — a square, a
 * pill, an unnamed row — and they read as proposals rather than as the app
 * misbehaving. Each row now renders the real component's own markup with its own
 * copy, twice: as shipped, and as the suggested replacement. Only the trophy
 * stays abstract, because a sprite cell genuinely is an abstract square.
 *
 * **The finding the counts carry: the rule as stated reaches almost nothing.**
 * Dimmed brand ink — the class the sentence most obviously describes — is
 * spoken nowhere in `src/`; the only place it is proposed is this deck's own
 * lifecycle draft chip, which the lifecycle ruling has since corrected to
 * full-value ink. Everything else the census finds is a tint, an edge or a
 * hover, and each of those is a separate question the owner rules rather than
 * one this deck answers.
 *
 * **Scope ruling one (owner, 2026-09-01, on seeing the checkbox row's checked
 * state): tint grounds at card/row/surface scale are bound.** "As the
 * background of a card it's wrong… bg-primary/5 itself is an ugly yellowish
 * brown highlight." Selection grounds, washed row/banner grounds and gradient
 * washes are therefore violations to correct at wiring — with two carve-outs
 * already ruled elsewhere: the chip-scale icon-accent tile
 * (`border-yty-<family>-strong/30 bg-yty-<family>-strong/10` under a
 * full-value glyph) stays, and so do the home hero band and closing-CTA wash,
 * the two sanctioned keeps. The exempt half of the washed-ground row — the
 * icon medallion — is therefore not drawn as a violation; the selected-row half
 * is.
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
 *     against them retires the edge tier the strength axis proposes.
 *
 * The wiring intersection this slide's census cannot show: `--info` and
 * `--success` carry 50 alpha uses of their own today, and the status
 * convergence turns every one of them into a shaded *brand* colour — so the
 * convergence change resolves them under this rule rather than merely
 * swapping hex values.
 *
 * Class strings are literal because Tailwind scans source text.
 */
type ShadingConstruct =
  | "pendingChip"
  | "trophy"
  | "statusChip"
  | "filterPill"
  | "consentRow"
  | "enrollmentCard"
  | "priceChip"
  | "browseCard"
  | "primaryButton";

/** The admin product status chip's own container classes, restated. */
const STATUS_CHIP_SHAPE =
  "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-xs";

/**
 * The base of the real button variant recipe at its default size, set in the
 * ruled CTA type — Poppins 16px / 600. One line in the shared recipe carries
 * that type to every button in the product, so a sample drawn at anything else
 * would be a picture of a button that will not exist.
 *
 * It was defined on the violet-weight slide, then on the buttons slide, and both
 * are ruled and dropped; the hover-darkening row below is its last consumer, so
 * it lives here now.
 */
const BUTTON_SHAPE =
  "inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-md px-4 py-2 text-base font-semibold transition-colors";

const SHADING_ROWS: readonly {
  name: string;
  /** What the census returns for this class today. */
  count: string;
  /** The component the sample is copied from, so a shape can be checked. */
  where: string;
  construct: ShadingConstruct;
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
    where:
      "This deck's lifecycle draft chip, now corrected. The /40 edge is held identical on both halves — that is the separate edges call, not this one.",
    construct: "pendingChip",
    shipped: "border border-primary/40 text-primary/80",
    corrected: "border border-primary/40 text-primary",
    scope: "Bound",
  },
  {
    name: "Half-value fill in the admin trophy",
    count: "1 — the sprite's shade glyph",
    where:
      "admin/dashboard/pixel-art.tsx — the cup's shade pixel beside its full one. Abstract on purpose: a sprite cell is a square.",
    construct: "trophy",
    shipped: "bg-primary/55",
    corrected: "bg-muted-foreground",
    scope: "Bound",
  },
  {
    name: "Tinted label chips",
    count: "6 — status chips, avatar initials, counts",
    where: "admin/products/product-status-chip.tsx — the pending status",
    construct: "statusChip",
    shipped: "bg-primary/20 text-primary",
    corrected: "bg-muted text-primary",
    scope: "Open — chips",
  },
  {
    name: "Washed grounds under full-value ink",
    count: "9 — icon medallions and selected rows",
    where:
      "admin/products/gedu-picker-sheet.tsx — the sheet's spoken-language filter, with one chosen",
    construct: "filterPill",
    shipped: "border-primary bg-primary/10 text-primary",
    corrected: "border-primary bg-muted text-primary",
    scope: "Bound — accents exempt",
  },
  {
    name: "Selection grounds",
    count: "22 — radio rows, drop targets, checkbox rows",
    where:
      "ui/checkbox-row.tsx — the checked container, carrying the registration form's own consent",
    construct: "consentRow",
    shipped: "border-primary bg-primary/5",
    corrected: "border-primary bg-transparent",
    scope: "Bound",
  },
  {
    name: "Gradient washes",
    count: "10 — live enrollment cards, hero and CTA cards",
    where:
      "family/enrollment-tones.ts — the live card's edge and wash, read from the map rather than restated. The replacement keeps the card's own bg-card ground.",
    construct: "enrollmentCard",
    shipped: ENROLLMENT_TONES.current.live,
    corrected: "border-primary",
    scope: "Bound — sanctioned keeps stay",
  },
  {
    name: "Low-alpha edges and rings",
    count: "14 at rest — card edges, outline chips, focus rings",
    where:
      "public/products/status-chip.tsx — the primary outline tone, on a browse card's free price",
    construct: "priceChip",
    shipped: "border-primary/40 text-primary",
    corrected: "border-primary text-primary",
    scope: "Open — edges",
  },
  {
    name: "Hover and focus edge lifts",
    count: "7 — browse cards, assignment cards, filter pills",
    where:
      "public/products/browse-card-shell.tsx — an openable card, drawn at its hover value",
    construct: "browseCard",
    shipped: "border-primary/40 shadow-lg",
    corrected: "border-primary shadow-lg",
    scope: "Open — hover",
  },
  {
    name: "Hover darkening of the primary fill",
    count: "1 recipe — every primary button in the product",
    where: "ui/button.tsx — the default variant, drawn at its hover value",
    construct: "primaryButton",
    shipped: "bg-primary/90 text-primary-foreground shadow",
    corrected: "bg-primary text-primary-foreground shadow",
    scope: "Open — hover",
  },
];

/* ------------------------------------------------------------------ */
/*  Slide 4 — "you are here" is not "act"                              */
/* ------------------------------------------------------------------ */

/**
 * The narrowest consequence of the axis, and the one with the widest blast
 * radius: amber is the act colour, and an active nav item is not an act — it is
 * the one place you cannot go, because you are already there. Drawing it in the
 * CTA fill spends the loudest colour in the palette on the least actionable
 * element on screen.
 *
 * **Accepted in principle and blocked on contrast** (owner, 2026-09-01): the
 * first draft's neutral treatment "drops the contrast between selected and not
 * selected — when we used the color it was very clear what was active". So the
 * slide now draws candidates that keep the *separation* amber was buying, and
 * the ask is which one rather than whether.
 *
 * **The inverted fill leads, and the reason is that it is not a new idea.** It
 * is the same emphasis tier the owner ruled for violet's replacement the same
 * day — the app's own ink at fill weight — so choosing it here spends no new
 * vocabulary and puts one neutral emphasis treatment in two places rather than
 * two treatments in two.
 *
 * The checkbox row's selection ground used to sit on this slide beside the nav
 * columns. It moved to the shading slide, where it is one of the census's own
 * violations and is drawn against its replacement; one home per comparison.
 *
 * Classes restated from the sidebar, which is a client module.
 */
const NAV_SAMPLE_ITEMS = ["Dashboard", "Products", "Users"] as const;

const NAV_TREATMENTS: readonly {
  label: string;
  active: string;
  rest: string;
}[] = [
  {
    label: "Inverted fill",
    active: "bg-foreground font-semibold text-background",
    rest: "text-sidebar-foreground",
  },
  {
    label: "Lifted ground",
    active: "bg-accent font-semibold text-foreground",
    rest: "text-sidebar-foreground",
  },
  {
    label: "Today — amber fill",
    active: "bg-sidebar-primary text-sidebar-primary-foreground",
    rest: "text-sidebar-foreground",
  },
];

/* ------------------------------------------------------------------ */
/*  Dropped — lifecycles are one hue, stepped                          */
/* ------------------------------------------------------------------ */

/**
 * **Ruled 2026-09-01: approved.** "Looks good to me." The normal progression
 * walks one hue by *construct* — outline, then solid fill, then tint, then grey
 * — and only the abnormal exit, cancelled, keeps a second colour, because it is
 * the one state that is not a step along the ladder. The same idiom lands on the
 * WhatsApp console's delivery ladder, which draws three of its five states in no
 * colour at all today. The defect that made the slide — `completed` and
 * `expired` sharing two identical classes, so two different ends to a product's
 * life read as one — goes with it.
 *
 * **One reconciliation rides with the approval, and the wiring phase must not
 * lose it.** What is approved is the *construct* stepping. The draft chip shown
 * for `pending` also carried `text-primary/80`, which the shading rule bans, and
 * the owner had already bound dimmed brand ink the same day. So pending steps
 * down **by construct** — an outline chip — with **full-value ink**
 * (`text-primary`, not `/80`), and the completed step's tint chip is not final
 * until the still-open tinted-chip scope call is made: whatever that ruling
 * says about chip grounds applies to this ladder's tint rung too.
 */

/* ------------------------------------------------------------------ */
/*  Dropped — liveness is glow                                         */
/* ------------------------------------------------------------------ */

/**
 * **Ruled 2026-09-01: approved.** Liveness is glow everywhere — the enrollment
 * card, the gedu assignment card and both session feeds converge on one badge.
 * The defect it fixes: one badge, one word, two colours (success green on the
 * cards, info blue in the feeds), decided independently on two surfaces a family
 * can have open at the same time.
 */

/* ------------------------------------------------------------------ */
/*  Dropped — time is wit                                              */
/* ------------------------------------------------------------------ */

/**
 * **Ruled 2026-09-01: approved.** "I like it. Accept." The feed's whole future
 * system — the badge on a session that has not happened, the rail dot marking
 * the next one, the pill dividing past from ahead — converges from `--info`
 * onto wit. Every one of those marks is the platform telling the reader
 * something about time, and none is a status anyone can act on.
 */

/* ------------------------------------------------------------------ */
/*  Dropped — eligibility, one colour                                  */
/* ------------------------------------------------------------------ */

/**
 * **Ruled 2026-09-01: approved in principle.** Eligibility is wit at label
 * strength everywhere — the product card's audience chip, the schools pill and
 * the region-lock strip stop answering one question (*is this for me?*) in three
 * different colours.
 *
 * **The owner's concern, and where it is answered.** He asked what then brings
 * colour to a product page, if eligibility goes quiet. The answer is that colour
 * arrives from families doing *real jobs* there rather than from eligibility:
 * grammar buttons (a valor "Book the camp"), time rows in wit, liveness glow
 * ("live now", "starts soon"), harmony on the community facts (spots left,
 * friends attending). That composition is not a slide — it is the family product
 * page preview scene, which is where it gets signed off.
 */

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
/*  Dropped — violet's replacement weight                              */
/* ------------------------------------------------------------------ */

/**
 * **Ruled 2026-09-01: the foreground fill** — `bg-foreground text-background`.
 * The heavy outline and the wit-soft brand fill are both dead as candidates.
 *
 * The hole this fills: narrowing violet to "the world" left two gedu actions
 * needing to be *filled* — they are the only thing to do on their row — without
 * claiming the primary CTA's amber. The owner's objection to a neutral ("white
 * isn't a brand color so it's strange to see it here") is answered by what the
 * grammar did to every hue: each one is now committed to a meaning, and this
 * emphasis tier needs none, so the app's own ink at fill weight is the one
 * treatment that adds no meaning. The same tier is the lead candidate for the
 * active nav item, which is the other place a fill has to win a row without
 * asking for a click.
 *
 * His follow-on question — do buttons take different brand colours by action? —
 * is exactly the buttons slide's grammar-matched proposal, which he then ruled
 * in favour of.
 *
 * `BUTTON_SHAPE` was defined here; it now lives with the shading rule, whose
 * hover-darkening row is its last consumer.
 */

/* ------------------------------------------------------------------ */
/*  Dropped — the ensemble trim                                        */
/* ------------------------------------------------------------------ */

/**
 * **REJECTED, 2026-09-01.** Mechanical acknowledgements keep success green. The
 * owner's doctrine, in his words: "things that I would want to check my eye is
 * working / confirmed / approved, and note is muted / natural / dismissive" —
 * green is the affirmative register, and muting a confirmation reads as
 * dismissing it. So a copied link, a saved change and a sent verification mail
 * all keep the green they have.
 *
 * **The consequence is accepted with the ruling, not left as a surprise for the
 * wiring phase.** After the status convergence, `--success` *is* glow, so glow
 * now appears on confirmations as well as on domain facts; the ensemble rule's
 * ambition to "hear glow least" yields on this class. Sixteen acknowledgement
 * surfaces converge rather than going quiet.
 */

/* ------------------------------------------------------------------ */
/*  Dropped — warning is amber's neighbour                             */
/* ------------------------------------------------------------------ */

/**
 * **RULED 2026-09-01: retune `--warning` to the orange shift `#E2761B`.** Hue
 * 27.4°, Δ27.4 from `--primary` (CIE76 in Lab) and Δ15.2 from valor-strong, at
 * 5.67:1 on the card. The owner weighed the valor proximity the slide flagged
 * against it and accepted it: "I don't think it will get confused with valor…
 * I think it's ok that it is closer to error which is red." Today's `#E7B008`
 * (Δ12.0 from primary) and the desaturated ochre `#B88A2E` are both out.
 *
 * The defect it settles: `--warning` sat 4.5 degrees of hue from `--primary`, so
 * the act colour and the caution colour were, to a reader glancing at a dense
 * page, one colour — visible in the admin attention panel, whose one header slot
 * draws an amber count when something needs doing and an amber wordmark when
 * nothing does. Glyph discipline was rejected as *the* answer ("this design pass
 * is the place to settle this once and for all").
 *
 * **Wiring, three parts.** The `--warning` token retunes in `globals.css`;
 * `src/lib/constants/colors.ts` follows in the same change, because that is what
 * the email templates and the Open Graph images draw with and neither can read a
 * token; and the glyph-discipline rider stands under the new value — a warning
 * mark always carries a glyph, because a warning that reads as amber to a
 * colour-blind eye needs one whatever hue it is.
 */

/* ------------------------------------------------------------------ */
/*  Dropped — status colours meet the palette                          */
/* ------------------------------------------------------------------ */

/**
 * **Ruled 2026-09-01: option A.** `--info` converges onto wit and `--success`
 * onto glow, at the token. Both are tokens rather than call-site literals, so
 * no component changes: the two convergences the liveness and time slides showed
 * in context fall out of two lines in `globals.css`.
 *
 * **The same wiring change updates `src/lib/constants/colors.ts`** (owner's
 * explicit instruction). Those are the literal hexes the email templates and
 * the Open Graph images draw with — satori and an email client can read neither
 * a token nor a stylesheet — so a token moved without them would leave a
 * family's inbox and a shared link one palette behind the app.
 */

/* ------------------------------------------------------------------ */
/*  Dropped — the grammar in the wild                                  */
/* ------------------------------------------------------------------ */

/**
 * **Ruled 2026-09-01: approved.** "I like it." The grammar applied to the My SOG
 * enrollment cards and the attendance chips is accepted as drawn — present moves
 * to glow, absent keeps warning amber (absent-is-not-a-failure is a decision
 * this pass does not reopen) and unmarked stays muted, because it is the absence
 * of a mark rather than a state.
 *
 * **The shop was never on this slide, and that is a ruling too.** The grammar's
 * only proposal for the storefront was to colour the product types from the four
 * families; the owner rejected it the same day — the admin product palette was
 * placed 25–30° clear of the function colours precisely so a category mark can
 * never be mistaken for a state mark, and the pairing is admin-only anyway.
 *
 * **Its three preview links moved to the scenes slide rather than dying with
 * it.** My SOG as it ships, My SOG under the grammar, and the family product
 * page are judged as pages in their own scenes — which is where the owner said
 * he would sign them off — so they belong on the hub that collects every such
 * link, not on a slide that is closed.
 */

/* ------------------------------------------------------------------ */
/*  Dropped — the Yty element cards                                    */
/* ------------------------------------------------------------------ */

/**
 * **Ruled 2026-09-01: signed off as drafted.** The four element cards take the
 * brand palette — soft on the glyph and every word, strong on the wash and the
 * edge — and the wit seam is accepted rather than escalated: wit is the one pair
 * whose two variants sit far enough apart in hue to read as two colours, because
 * wit-strong cannot carry body text on this ground.
 *
 * **Three consumers, and the wiring phase should not go looking for a fourth**:
 * the `/about` elements section, the Yty-named voice zones, and the style
 * guide's swatches and fixtures. The gamer dashboard's Yty grid was the fourth
 * and no longer exists on `dev` — it was a decorative tiling of the four
 * elements over a feature that does nothing, and the Help section took its slot
 * — so the colour map's `bgGradient` slot now has no renderer at all, and
 * promotion decides whether the five-slot shape keeps it.
 */

/* ------------------------------------------------------------------ */
/*  Dropped — buttons                                                  */
/* ------------------------------------------------------------------ */

/**
 * **RULED 2026-09-01: adopt the bold, colourful grammar fills — and usage is
 * delegated** ("I leave it up to you how to use them in the app"). So the
 * session's constraint set is the operative doctrine at wiring, not a proposal
 * still waiting on a decision:
 *
 *   - a grammar fill only where the action **is** the family's word — valor
 *     "Book the camp", harmony "Invite a friend", glow "View progress", wit
 *     "See the schedule";
 *   - never beside a primary CTA, because amber keeps the act monopoly, and
 *     never two grammar fills in one view;
 *   - ink pairings from the measured contrast table — dark ink on the strong
 *     variant clears the body bar for harmony (6.11:1), glow (6.63:1) and valor
 *     (6.69:1) and misses it for wit (4.10:1), so **wit alone fills with its
 *     soft variant** at 8.10:1; white ink is not an escape at 2.8–3.1:1;
 *   - destructive red is untouched.
 *
 * **The neutral emphasis tier is the foreground fill**, per the violet-weight
 * ruling — that is what a filled non-CTA reaches for when no family's word
 * matches the action, and it is what retires the violet `secondary` fill (one
 * link anchor, and no real button anywhere in `src/`).
 *
 * The recounted blast radius the slide carried, for the wiring phase: `outline`
 * 61 call sites (44 buttons plus 17 link anchors), `ghost` 24, the violet fill
 * 1 — counting `<Button variant="X">` **plus** `buttonVariants({ variant: "X" })`,
 * which is how a `<Link>` wears the button's clothes, style guide excluded.
 */

/* ------------------------------------------------------------------ */
/*  Dropped — voice-zone tiles                                         */
/* ------------------------------------------------------------------ */

/**
 * **Ruled 2026-09-01: approved.** "Looks great." The four Yty zone tiles take
 * the brand presentations — tile wash, glyph colour and ring from the zone
 * colour map — and the zone label wears Space Mono, which is the one job that
 * face keeps under the type ruling: the platform naming one of its own places.
 * The draft's tightest pairing, a zone label over its own tint, clears 6.32:1.
 */

/* ------------------------------------------------------------------ */
/*  Slide 6 — the calm ring                                            */
/* ------------------------------------------------------------------ */

/**
 * **The Guidebook keeps billing, safeguarding and legal amber-only on a quiet
 * ground** — one act colour on the one action, and nothing else coloured. The
 * first form of this slide asserted that in a caption and drew nothing, which
 * the owner rejected on the deck's own terms (2026-09-01: "Nothing to see so I
 * can't rule on anything"). A rule with no exhibit is exactly what this page
 * exists not to be.
 *
 * So the rule is drawn as a choice: the same billing card twice, once amber-only
 * and once with the palette let in at three points the grammar would otherwise
 * license — a glow "Active" chip (liveness/growth), a wit-tinted next-payment
 * line (time ahead), and harmony on the child the subscription covers (people).
 * Each of those is a legal move under the grammar; the question the slide asks
 * is whether this is the surface where the grammar stops.
 *
 * **The card is `billing/ManageBillingCard.tsx`, with one honest addition.** The
 * real card is a header, a description and the portal button — it deliberately
 * states no amounts or dates, because those live on Stripe. A card with nothing
 * but a button has nowhere for the palette to leak *to*, so the sample carries
 * the subscription line a family reads on the same screen: who it covers, what
 * it costs, when it renews. The shape and copy of the header, description and
 * button are the real ones.
 */
const BILLING_TONES: readonly {
  label: string;
  /** The subscription's state as a coloured chip, or as plain words. */
  statusChip: string | null;
  /** The renewal line's ink. */
  dateInk: string;
  /** The covered gamer's name. */
  nameInk: string;
}[] = [
  {
    label: "Amber only — the calm ring",
    statusChip: null,
    dateInk: "text-muted-foreground",
    nameInk: "text-foreground",
  },
  {
    label: "The same card with the palette let in",
    statusChip:
      "border-yty-glow-strong/50 bg-yty-glow-strong/10 text-yty-glow-soft",
    dateInk: "text-yty-wit-soft",
    nameInk: "text-yty-harmony-soft",
  },
];

/* ------------------------------------------------------------------ */
/*  Small shapes the exhibits are built from                           */
/* ------------------------------------------------------------------ */

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

/**
 * One construct from the shading census, at the shape and copy its own component
 * gives it. The same component draws both halves of every pair, so the only
 * difference a reader sees is the value being argued about.
 *
 * The two hover rows are drawn *at their hover value* rather than reacting to a
 * cursor: a state you pass through cannot be compared in passing, and the whole
 * point of the pair is to hold both still beside each other.
 */
function ShadingConstructSample({
  construct,
  className,
}: {
  construct: ShadingConstruct;
  className: string;
}) {
  switch (construct) {
    case "pendingChip":
      return (
        <span className={cn(STATUS_CHIP_SHAPE, className)}>Awaiting start</span>
      );
    case "trophy":
      return (
        <span className="inline-grid grid-cols-4 gap-0.5" aria-hidden>
          <span className="h-4 w-4 rounded-[2px] bg-primary" />
          <span className={cn("h-4 w-4 rounded-[2px]", className)} />
          <span className={cn("h-4 w-4 rounded-[2px]", className)} />
          <span className="h-4 w-4 rounded-[2px] bg-primary" />
        </span>
      );
    case "statusChip":
      return (
        <span className={cn(STATUS_CHIP_SHAPE, className)}>Awaiting start</span>
      );
    case "filterPill":
      return (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">Speaks:</span>
          <span className={cn("rounded-full border px-2 py-0.5", className)}>
            Any
          </span>
          <span className="rounded-full border border-input px-2 py-0.5 text-muted-foreground">
            English
          </span>
          <span className="rounded-full border border-input px-2 py-0.5 text-muted-foreground">
            Finnish
          </span>
        </div>
      );
    case "consentRow":
      return (
        <div
          className={cn(
            "flex w-72 items-start gap-3 rounded-md border p-3 text-sm",
            className,
          )}
        >
          <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm bg-primary text-primary-foreground">
            <Check className="h-3 w-3" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-foreground">
              School of Gaming may send me news and offers by email.
            </span>
            <span className="mt-1 block text-xs text-info">
              Optional — you can change this anytime in your settings.
            </span>
          </span>
        </div>
      );
    case "enrollmentCard":
      return (
        <div
          className={cn(
            "w-56 space-y-2 rounded-lg border bg-card p-4",
            className,
          )}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-foreground">
              Explorers Club
            </span>
            <span
              className={cn(
                "inline-flex items-center rounded-full border font-semibold",
                ENROLLMENT_TONES.current.liveBadge,
              )}
            >
              Live
            </span>
          </div>
          <p className="text-xs text-muted-foreground">Tonight, 17:00</p>
        </div>
      );
    case "priceChip":
      return (
        <span
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border bg-background px-3 py-1 text-base font-medium",
            className,
          )}
        >
          Free
        </span>
      );
    case "browseCard":
      return (
        <div
          className={cn(
            "w-64 space-y-2 rounded-lg border bg-card p-4",
            className,
          )}
        >
          <div className="text-sm font-semibold text-foreground">
            Explorers Club
          </div>
          <p className="text-xs text-muted-foreground">
            Online · Mondays, 17:00
          </p>
          <div className="flex items-center justify-between gap-4 border-t pt-3">
            <span className="text-base font-semibold text-foreground">
              €19 / month
            </span>
            <span className="inline-flex items-center gap-0.5 text-sm font-medium text-primary">
              View
              <ChevronRight className="h-4 w-4" aria-hidden />
            </span>
          </div>
        </div>
      );
    case "primaryButton":
      return <span className={cn(BUTTON_SHAPE, className)}>Explore clubs</span>;
  }
}

/** The shading slide's scope marker, drawn so bound and open read apart. */
function ScopePill({ scope }: { scope: (typeof SHADING_ROWS)[number]["scope"] }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold",
        scope.startsWith("Bound")
          ? "bg-foreground text-background"
          : "border border-border text-muted-foreground",
      )}
    >
      {scope}
    </span>
  );
}

/**
 * The billing card, at the real card's header, description and portal button,
 * with the subscription line a family reads beside them. The tone decides how
 * much of the palette is allowed in; the amber button is constant, because it is
 * the one action and amber is the act colour under any reading.
 */
function BillingCard({ tone }: { tone: (typeof BILLING_TONES)[number] }) {
  return (
    <div className="w-full max-w-sm rounded-lg border bg-card text-card-foreground shadow-sm">
      <div className="flex flex-col space-y-1.5 p-6">
        <h3 className="flex items-center gap-2 text-2xl font-semibold leading-none tracking-tight">
          <CreditCard className="h-5 w-5 shrink-0" aria-hidden />
          Payment &amp; billing
        </h3>
        <p className="text-sm text-muted-foreground">
          Manage your saved cards, invoices, and subscriptions securely on
          Stripe.
        </p>
      </div>
      <div className="space-y-4 p-6 pt-0">
        <div className="space-y-2 rounded-md border p-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm">
              <span className={cn("font-semibold", tone.nameInk)}>Aino</span>
              <span className="text-muted-foreground"> · Explorers Club</span>
            </span>
            {tone.statusChip === null ? (
              <span className="shrink-0 text-xs text-muted-foreground">
                Active
              </span>
            ) : (
              <span
                className={cn(
                  "inline-flex shrink-0 items-center rounded-full border px-2 py-0 text-[10px] font-semibold uppercase tracking-wide",
                  tone.statusChip,
                )}
              >
                Active
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className="text-base font-semibold text-foreground">
              €19 / month
            </span>
            <span className={cn("text-xs", tone.dateInk)}>
              Next payment 3 October
            </span>
          </div>
        </div>
        <div className="flex justify-center">
          <span
            className={cn(
              BUTTON_SHAPE,
              "h-11 px-8",
              "bg-primary text-primary-foreground shadow",
            )}
          >
            <ExternalLink className="h-4 w-4" aria-hidden />
            Manage billing
          </span>
        </div>
      </div>
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
          Brand design pass — colour &amp; grammar
        </h1>
        <p className="max-w-prose text-muted-foreground">
          Can Sogverse be as fun, colourful, bright and lively as the sog.gg
          marketing site while keeping the dark ground — all while adhering to
          the Guidebook? What is left on this page is what is still open: a
          settled slide is dropped, and its ruling survives as a comment where it
          stood. Type is already ruled, on the other deck at{" "}
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

      {/* Dropped — colour as grammar. Approved whole ("I like all the colors.
          Approved"): the vocabulary binds on all six families and violet
          narrows to the world. See the comment at the constants' old
          position. */}

      {/* ----------------------------------------------------------- 2 */}
      <Slide id="strength">
        <div className="space-y-3">
          <Marker>One family, three strengths — the proposal</Marker>
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
          <Marker>One amber, three jobs — the app as it ships</Marker>
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
          mirrors the CTA token exactly — and the third is a census violation
          quoted, not a proposal.
        </Caption>

        <Ruling>
          <p>
            Adopt the strength axis — solid fill = act, tint = label, edge = the
            current selection. (recommended: adopt)
          </p>
          <p>
            The label tier is a tinted chip, so it is only final once the
            shading rule&rsquo;s chip scope call is made.
          </p>
        </Ruling>
      </Slide>

      {/* ----------------------------------------------------------- 3 */}
      <Slide id="shading">
        <div className="space-y-4">
          {SHADING_ROWS.map((row) => (
            <div key={row.name} className="space-y-4 rounded-lg border p-4">
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                <div className="space-y-0.5">
                  <div className="text-sm font-semibold text-foreground">
                    {row.name}
                  </div>
                  <div className="text-[11px] text-muted-foreground">
                    {row.count}
                  </div>
                </div>
                <ScopePill scope={row.scope} />
              </div>

              <div className="grid gap-6 sm:grid-cols-2">
                <div className="space-y-2">
                  <Marker>As shipped</Marker>
                  <ShadingConstructSample
                    construct={row.construct}
                    className={row.shipped}
                  />
                  <div className="text-[11px] text-muted-foreground">
                    {row.shipped}
                  </div>
                </div>
                <div className="space-y-2">
                  <Marker>Suggested replacement</Marker>
                  <ShadingConstructSample
                    construct={row.construct}
                    className={row.corrected}
                  />
                  <div className="text-[11px] text-muted-foreground">
                    {row.corrected}
                  </div>
                </div>
              </div>

              <div className="max-w-prose text-[11px] text-muted-foreground">
                {row.where}
              </div>
            </div>
          ))}
        </div>
        <Caption>
          The two hover rows are drawn at their hover value, because a state you
          pass through cannot be compared in passing.
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

      {/* ----------------------------------------------------------- 4 */}
      <Slide id="you-are-here">
        <div className="flex flex-wrap gap-8">
          {NAV_TREATMENTS.map((treatment) => (
            <div key={treatment.label} className="space-y-2">
              <Marker>{treatment.label}</Marker>
              <NavSample active={treatment.active} rest={treatment.rest} />
            </div>
          ))}
        </div>
        <Caption>
          The inverted fill is the emphasis tier already ruled for violet&rsquo;s
          replacement — the app&rsquo;s own ink at fill weight.
        </Caption>

        <Ruling>
          <p>
            Pick the active treatment — inverted fill, lifted ground, or
            today&rsquo;s amber. (recommended: the inverted fill)
          </p>
        </Ruling>
      </Slide>

      {/* Dropped — lifecycles are one hue, stepped. Approved ("looks good to
          me"), with the reconciliation the approval needs: the construct
          stepping is what is approved, pending steps down by construct with
          full-value ink, and the completed tint chip finalizes with the chip
          ruling. See the comment at the constants' old position. */}

      {/* Dropped — liveness is glow. Approved: one badge everywhere, on the
          enrollment card, the gedu assignment card and both feeds. See the
          comment at the constants' old position. */}

      {/* Dropped — time is wit. Approved ("I like it. Accept"): the feed's
          whole future system converges from --info onto wit. See the comment
          at the constants' old position. */}

      {/* Dropped — eligibility, one colour. Approved in principle; the owner's
          product-colour concern is answered by the other families doing real
          jobs on that page, composed on the family product page scene. See the
          comment at the constants' old position. */}

      {/* Dropped — role families. Approved as drawn, plus the standing
          direction that role colours get reinforced app-wide wherever a role is
          understood without a label (plan direction 25, wiring-phase work). See
          the comment at the constants' old position. */}

      {/* Dropped — violet's replacement weight. Ruled: the foreground fill
          (bg-foreground text-background); the heavy outline and the wit-soft
          brand fill are dead. See the comment at the constants' old
          position. */}

      {/* Dropped — the ensemble trim. REJECTED: mechanical acknowledgements
          keep success green, because green is the affirmative register and
          muted reads dismissive; glow on confirmations after the convergence is
          accepted with it. See the comment at the constants' old position. */}

      {/* Dropped — warning is amber's neighbour. RULED: retune --warning to the
          orange shift #E2761B; colors.ts follows in the same change and the
          glyph rider stands. See the comment at the constants' old
          position. */}

      {/* Dropped — status colours meet the palette. Ruled option A: --info
          converges onto wit and --success onto glow, at the token, with no call
          sites touched; src/lib/constants/colors.ts moves in the same change so
          the emails and the OG images follow. See the comment at the constants'
          old position. */}

      {/* Dropped — the grammar in the wild. Approved ("I like it"); its three
          preview links moved to the scenes slide, where My SOG and the family
          product page are signed off as pages. See the comment at the
          constants' old position. */}

      {/* ----------------------------------------------------------- 5 */}
      <Slide id="gamer-floor">
        <div className="space-y-3">
          <Marker>Mobile-first — open in a phone-sized window</Marker>
          <Links>
            <DeckLink href="/preview/gamer-dashboard/typical">
              The gamer dashboard as it ships
            </DeckLink>
            <DeckLink href="/preview/gamer-dashboard/brand-palette">
              The gamer dashboard under the draft
            </DeckLink>
          </Links>
        </div>

        <div className="space-y-3">
          <Marker>In their scenes, at any width</Marker>
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
        </div>

        <Caption>
          No exhibit here on purpose: a breakpoint reads the browser window, not
          a box on this page, so the 360 floor only tells the truth at 360.
        </Caption>

        <Ruling>
          <p>
            Sign off each page from its scene, or name what to tune. The
            greetings and headings are already the ruled Poppins.
          </p>
        </Ruling>
      </Slide>

      {/* Dropped — the Yty element cards. Signed off as drafted, wit's seam
          accepted; the consumers are the /about elements section, the voice
          zones and the style guide — the gamer dashboard's Yty grid no longer
          exists on dev. See the comment at the constants' old position. */}

      {/* Dropped — buttons. RULED: adopt the bold grammar fills, usage
          delegated. The constraint set applies at wiring — a grammar fill only
          where the action is the family's word, never beside a primary CTA,
          never two in one view, contrast-table inks with wit filling soft,
          destructive red untouched — and the foreground fill is the neutral
          emphasis tier. See the comment at the constants' old position. */}

      {/* Dropped — voice-zone tiles. Approved ("looks great"): the brand zone
          presentations, with the label in Space Mono. See the comment at the
          constants' old position. */}

      {/* ----------------------------------------------------------- 6 */}
      <Slide id="reach">
        <div className="flex flex-wrap items-start gap-8">
          {BILLING_TONES.map((tone) => (
            <div key={tone.label} className="w-full max-w-sm space-y-2">
              <Marker>{tone.label}</Marker>
              <BillingCard tone={tone} />
            </div>
          ))}
        </div>
        <Caption>
          Both cards obey the grammar; only one of them lets it speak on a
          surface whose whole job is to be trusted.
        </Caption>

        <Ruling>
          <p>
            The calm ring — A, confirm amber-only for billing, safeguarding and
            legal; or B, name what the palette may do there (status and category
            marks, but not decoration). (recommended: A)
          </p>
        </Ruling>
      </Slide>

      {/* ----------------------------------------------------------- 7 */}
      <Slide id="recap">
        <ol className="max-w-prose list-decimal space-y-1.5 pl-5 text-sm text-foreground">
          <li>
            The shading rule&rsquo;s three open scope calls — tinted label
            chips, low-alpha edges, hover darkening and lifts.
          </li>
          <li>
            &ldquo;You are here&rdquo; — pick the active treatment.
          </li>
          <li>
            The calm ring — confirm amber-only, or name what the palette may do.
          </li>
          <li>
            The pages, from their scenes — My SOG, the family product page, the
            gamer dashboard at 360.
          </li>
        </ol>
      </Slide>
    </div>
  );
}
