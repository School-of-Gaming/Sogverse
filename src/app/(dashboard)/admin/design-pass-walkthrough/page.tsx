/* eslint-disable i18next/no-literal-string -- temporary admin-only review deck for the brand design pass; every string here is owner-facing walkthrough narration about drafts, never product copy that ships in any locale, and the whole page is deleted before the wiring phase merges */

import {
  AudioLines,
  CalendarClock,
  ChevronRight,
  Joystick,
  LayoutDashboard,
  Radio,
  School,
  Tent,
  Users,
} from "lucide-react";
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
 * being spoken. Almost all of that is now ruled and dropped. What is left is
 * three open questions — the edge, the gradient and the active nav mark — and
 * a hub of pages to sign off. Five slides: the palette for context, the
 * shading rule, "you are here", the scene hub and the recap.
 *
 * **A settled slide is dropped, and a comment is left where it stood.** The
 * deck shrinks as the review proceeds, so what is on screen is always what is
 * still open; the ruling survives as the comment at the old position, which is
 * where the wiring phase reads it from. Renumbering the separators and the nav
 * array is part of the drop, not a tidy-up afterwards. A *row* inside a
 * surviving slide drops the same way.
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
 * its own copy reads as the defect it is. Every surviving exhibit is drawn on
 * the construct it governs: the browse card and its price chip for the edge,
 * the live enrollment card for the gradient's ignition pair, the admin
 * sidebar for the active mark.
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
 * and never an iframed page. Where a map or a sprite is importable from a server
 * component it is read here directly (the enrollment tones, the trophy's rows),
 * so the sample is the draft's real presentation rather than a picture of it.
 * Where the source is private to a client module — the checkbox row's checked
 * container, the sidebar's item shape, the browse card's hover edge, the browse
 * price chip, the button recipe — the classes are **restated literally** and the
 * sample names the file they came from, so a reader can tell a quotation from a
 * live read.
 *
 * **One home per comparison.** "You are here" is down to the sidebar's fill —
 * the header's text half is ruled (amber stays) — and the shading slide keeps
 * the edge and the gradient, which are both questions about how a brand value
 * may be mixed.
 *
 * **The home page is not in this deck** (owner ruling, 2026-09-01): it is parked
 * into its own dedicated pass. Product-type colours are out of scope and the
 * identicon has its own pass, so neither appears on any slide.
 *
 * **One honesty caveat, stated once rather than on every slide.** Tailwind
 * breakpoints read the *viewport*, not the container, so an inline sample is
 * always showing desktop styling however narrow its box is. That is why whole
 * pages are links to their scenes rather than boxes on this page.
 */

/* ------------------------------------------------------------------ */
/*  The deck                                                           */
/* ------------------------------------------------------------------ */

const SLIDES = [
  { id: "palette-today", title: "The palette today" },
  { id: "shading", title: "The shading rule" },
  { id: "you-are-here", title: '"You are here" is not "act"' },
  { id: "scenes", title: "The pages, in their scenes" },
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
  // The /40 edge stays until the edge question is confirmed; it is exactly the
  // value the shading slide's rest comparison is asking about, so leaving it
  // here is the deck showing the thing it is asking about rather than
  // pre-empting the answer.
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

/** The class string or contrast figure annotated under the thing it describes. */
function Annotation({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] text-muted-foreground">{children}</div>;
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
/*  Dropped — the strength axis                                        */
/* ------------------------------------------------------------------ */

/**
 * **RULED 2026-09-01, all three tiers — the slide drops fully settled.**
 *
 *   - **Act** — a solid fill at full value, spent on the thing the reader is
 *     asked to *do*. Ruled "great" as drawn.
 *   - **Label** — a chip that is read but not clicked: the neutral `bg-muted`
 *     ground under full-value family ink, which is the form the chip ruling
 *     gave it (a tinted brand ground is no longer available to any chip).
 *     Ruled "great" as drawn.
 *   - **Selection** — the one item among several that is currently chosen:
 *     **`border-primary bg-accent`**, a brand edge with a neutral lift. "I like
 *     the 'Brand edge, neutral lift'. We can move forward with that." The
 *     thicker-edge and leading-bar candidates are dead with it.
 *
 * **The selection ruling binds the 22 selection-ground call sites at wiring**:
 * every `bg-primary/5` selected ground becomes `bg-accent` under a full-value
 * `border-primary`. That is the whole of what the census's selection row asked,
 * and it closes the last of the shading rule's five classes.
 *
 * **Why the lift is legal under the shading rule:** `--accent` is `0 0% 13%`,
 * zero saturation. The ban is on brand colours mixed off their authored values,
 * and a grey is not a brand colour — so a neutral lift under a full-value brand
 * edge leaves every brand pixel on its authored line.
 *
 * The two rejected forms are recorded because they are the reason the ruled one
 * looks as it does: a tinted brand ground fell to the shading ruling, and the
 * edge-only correction that replaced it fell to the owner the round after —
 * "the very thing you are engaging with loses its color after you've selected
 * it", and its `bg-transparent` twin with it: "aside from the checkbox itself
 * there is no way to highlight that this whole box has been selected."
 */

/* ------------------------------------------------------------------ */
/*  Slide 2 — the shading rule                                         */
/* ------------------------------------------------------------------ */

/**
 * **The principle, owner 2026-09-01: if the brand colours are darkened or
 * shaded past strong or soft, they are no longer our brand colours.** The
 * strength axis said how loudly a family may speak; this says that loudness is
 * chosen from the values the brand actually fixes, not mixed on the way to the
 * screen. A slash-alpha class is a mix: `bg-primary/10` is not amber at ten
 * percent, it is whatever amber and the ground behind it average out to.
 *
 * **The rule governs UI uses of the brand tokens, and stops there** (owner,
 * 2026-09-01, ruling the trophy). Artwork carries its own palette and sits
 * outside the rule entirely — not as an exemption from it, but because artwork
 * should never have been reaching for a brand token in the first place.
 *
 * **The census is a command, not a list.** Regenerate it with
 * `rg -n "(hover:|focus:|group-hover:|active:)?(text|bg|border|from|to|via|ring)-primary/[0-9]+" src`
 * excluding `src/components/preview/**` and the two design-pass decks. What it
 * returns after the wiring phase is the check that the ruling landed.
 *
 * ── Ruled and closed, 2026-09-01 — rows dropped, no exhibit needed ──
 *
 *   - **Dimmed brand ink** — bound; the correction is approved. `text-primary/80`
 *     becomes `text-primary`. Nothing in `src/` ships it; the only proposal was
 *     this deck's own lifecycle draft chip, already corrected.
 *   - **Tinted label chips** — bound; `bg-primary/20 text-primary` becomes
 *     **`bg-muted text-primary`**. Six shipped sites (status chips, avatar
 *     initials, counts), plus the lifecycle ladder's completed rung and the
 *     strength axis's Label tier.
 *   - **Washed grounds under full-value ink** — bound; `bg-primary/10` becomes
 *     `bg-muted`, edge and ink unchanged. Nine sites. The chip-scale icon-accent
 *     tile (`border-yty-<family>-strong/30 bg-yty-<family>-strong/10` under a
 *     full-value glyph) stays exempt, per the home tile ruling.
 *   - **Hover darkening of the primary fill** — bound. "These buttons don't
 *     need a 90% alpha": `hover:bg-primary/90` comes out of the button recipe,
 *     and the hover affordance becomes a **non-colour** one — a shadow or a
 *     ring, implementer's call at wiring, since the recipe is one line and the
 *     choice does not want a per-surface decision.
 *   - **Selection grounds** — bound, and now ruled with the strength axis:
 *     `bg-primary/5` under a selected row becomes the neutral `bg-accent` lift
 *     beneath a full-value `border-primary`. All 22 call sites follow. See the
 *     dropped strength axis's comment.
 *
 * The two sanctioned keeps stand throughout: the home hero band and the
 * closing-CTA wash.
 *
 * **The wiring intersection this slide cannot show:** `--info` and `--success`
 * carry 50 alpha uses of their own today, and the status convergence turns
 * every one of them into a shaded *brand* colour — so the convergence change
 * resolves them under this rule rather than merely swapping hex values.
 *
 * Class strings are literal because Tailwind scans source text.
 */

/**
 * The base of the real button variant recipe at its default size, set in the
 * ruled CTA type — Poppins 16px / 600. One line in the shared recipe carries
 * that type to every button in the product. The enrollment card's Join overrides
 * it down to the `sm` size the card actually renders.
 */
const BUTTON_SHAPE =
  "inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-md px-4 py-2 text-base font-semibold transition-colors";

/* ------------------------------------------------------------------ */
/*  Dropped from slide 2 — the all-clear trophy                        */
/* ------------------------------------------------------------------ */

/**
 * **RULED 2026-09-01, and with a cleaner doctrine than the art exemption the
 * exhibit posed.** "It shouldn't need an exception because it shouldn't be
 * using brand colors. It's art."
 *
 * So the sprite's gold is a **trophy's** gold, not the brand's amber. The
 * exhibit had asked which of three shades the cup's shadow pixels should take,
 * on the assumption that the artwork was entitled to reach for `--primary` and
 * merely had to reach for it legally. The ruling refuses the premise.
 *
 * **Wiring action:** decouple the pixel-art palette from `--primary`
 * altogether. The sprite gets its own hex constants — which may well *look*
 * gold; they are the artwork's colours, authored for the artwork, and they move
 * only when someone redraws the art. No token reference survives in the
 * pixel-art colour map, so there is nothing left for a future palette change to
 * drag the trophy along with, and nothing for the shading census to flag.
 *
 * **Scope this settles, and it is wider than one sprite:** the shading rule
 * governs **UI uses of the brand tokens**. Artwork — pixel art, illustration, a
 * photograph — carries its own palette and is outside the rule, not exempted
 * from it. An exemption would have implied artwork is entitled to brand tokens
 * and is being forgiven for how it mixes them; it is not entitled to them at
 * all.
 */

/**
 * **Low-alpha edges and hover edge-lifts, merged into one choice** (owner, of
 * both classes: "I didn't even know these borders had color. It's so subtle I
 * don't even see it").
 *
 * **The owner saw no difference between any of the three, at rest or at hover**
 * — which is the finding, not a failure of the exhibit: an edge nobody can see
 * as a brand colour was never doing brand work.
 *
 * **The session's recommendation, drawn rather than argued, and posed for
 * confirmation.** It splits the two states rather than ruling one value for
 * both, because they want opposite things. At **rest** the edge is furniture: a
 * card sitting quietly in a grid does not need to be spending the brand, so the
 * brand edges go **neutral** (`border-border`). At **hover** the edge is
 * feedback, and feedback that cannot be seen is not feedback, so it goes to
 * **full value** (`border-primary`) — which is also the compliant answer,
 * because full value is an authored brand value and nothing is mixed.
 *
 * Two exhibits, because there are two questions. The rest comparison keeps all
 * three treatments on the chip and the card, so the recommendation is chosen
 * from the same field the owner already looked at. The hover pair is only two:
 * the shipped /40 lift beside the recommended full-value edge, both drawn
 * statically *at* their hover value — a state you pass through cannot be
 * compared in passing.
 *
 * Chips quote `public/products/status-chip.tsx` (the `primary` outline tone at
 * `md`); the card quotes `public/products/browse-card-shell.tsx`'s openable
 * feedback. Ink is held constant at `text-primary` in every column, so the only
 * thing changing is the edge. The rest column drops the hover shadow, which is
 * what makes it the rest state.
 */
const EDGE_REST: readonly {
  label: string;
  chip: string;
  card: string;
  note: string;
}[] = [
  {
    label: "As shipped — the /40 brand edge",
    chip: "border-primary/40 text-primary",
    card: "border-primary/40",
    note: "composites to #745310 · 2.48:1 against the card",
  },
  {
    label: "Full-value brand edge",
    chip: "border-primary text-primary",
    card: "border-primary",
    note: "#FAA901 · 8.90:1 against the card",
  },
  {
    label: "Neutral edge — recommended at rest",
    chip: "border-border text-primary",
    card: "border-border",
    note: "#333333 · the card stops spending the brand on furniture",
  },
];

const EDGE_HOVER: readonly {
  label: string;
  card: string;
  note: string;
}[] = [
  {
    label: "As shipped — the /40 lift",
    card: "border-primary/40 shadow-lg",
    note: "#745310 · 2.48:1 — the lift the owner could not see",
  },
  {
    label: "Full value — recommended at hover",
    card: "border-primary shadow-lg",
    note: "#FAA901 · 8.90:1 — visible, and nothing mixed",
  },
];

/**
 * **The defect is the wash, not the gradient** (owner, 2026-09-01: "I would be
 * more ok with the gradient if it didn't wash out our brand color"). That
 * names the problem precisely enough to redraw the row: a gradient is not a
 * violation of the shading rule *as a construct* — it is a violation when its
 * endpoints are not brand values. The shipped one fades `primary/5` to
 * `transparent`, so every pixel of it is amber mixed down toward the card.
 *
 * So the candidates below are **full-value** gradients: each one travels
 * strictly between two authored brand values, with no alpha, no transparent
 * endpoint and no dark endpoint anywhere in the ramp. A gradient that only
 * interpolates between authored colours never leaves the palette — every pixel
 * of it is a colour the brand fixes, or a point on the straight line between
 * two of them.
 *
 * **Glow is the family, because the card's state is live and liveness is
 * glow** (already ruled). Strong to soft is the pair, so the ramp runs
 * `#1AB061 → #6AC66B`.
 *
 * **The gradient border is conditionally accepted** (owner, 2026-09-01): "so
 * long as it doesn't shift the card's size or the layout of its content.
 * Remember these cards update in real time when the session opens." That is
 * the Layout & Scrolling rule stated for this card — a session opening is data
 * arriving on its own schedule, so ignition may not move a pixel — and the
 * exhibit below is the proof, not the proposal: the pair renders the card at
 * rest and the same card open, at identical geometry.
 *
 * What makes the geometry identical by construction rather than by care:
 *
 *   - The ring is an **overlay**, absolutely positioned inside the card's own
 *     bounds — two stacked spans, the gradient at `inset-0` and a `bg-card`
 *     cover at `inset-[2px]`, under the content — so it is painted, never laid
 *     out, and nothing can be displaced by it. (The shipped tone map already
 *     works this way: ignition swaps border/wash *classes* inside constant
 *     geometry; this keeps that contract and changes only what is painted.)
 *   - The card keeps its 1px `border` class in **both** states — rest paints
 *     it `border-border`, open paints it `border-transparent` — because with
 *     `border-box` sizing, dropping the class would grow the content box by
 *     1px, which is exactly the shift being forbidden.
 *   - The Live chip also arrives at ignition, and it lands at the start of the
 *     **right-packed trailing group** (chip, then chevron): the group grows
 *     leftward into the title's `min-w-0` slack, the chevron holds its
 *     position to the pixel. That is the layout rule's own late-arrival
 *     pattern, and the order is load-bearing.
 *
 * The chip keeps its **ruled** `bg-muted` form. At wiring, the swap can fade
 * the ring in through opacity — paint transitions are the permitted kind.
 */
const IGNITION_STATES: readonly {
  label: string;
  lit: boolean;
  note: string;
}[] = [
  {
    label: "At rest — before the session opens",
    lit: false,
    note: "border-border · today's quiet card, unchanged",
  },
  {
    label: "Session open — the ring ignites",
    lit: true,
    note: "#1AB061 → #6AC66B · a painted overlay; same box, same content position",
  },
];

/* ------------------------------------------------------------------ */
/*  Slide 3 — "you are here" is not "act"                              */
/* ------------------------------------------------------------------ */

/**
 * The narrowest consequence of the axis, and the one with the widest blast
 * radius: amber is the act colour, and an active nav item is not an act — it is
 * the one place you cannot go, because you are already there. Drawing it in the
 * CTA fill spends the loudest colour in the palette on the least actionable
 * element on screen.
 *
 * **Accepted in principle, blocked first on contrast and then on realism.** The
 * neutral candidates answered the contrast objection; the owner then leaned
 * inverted fill — "what I like most. But I'd need to see real example of the
 * app to make the call." So the abstract three-item columns are gone and this is
 * the admin sidebar's own composition: the real item order and labels from
 * `layout/sidebar.tsx` and `messages/en.json`'s `sidebar` namespace, the real
 * lucide icons, the real item shape, and the real expanded width.
 *
 * **The lifted-ground candidate drops.** It was the weakest of the three on the
 * contrast objection and the owner has named his lead; keeping it would spend a
 * third of the exhibit on an option nobody is choosing.
 *
 * Only the fill differs between the two columns — no weight change rides along,
 * so the comparison is of the treatment rather than of two treatments at once.
 *
 * The inverted fill is the same emphasis tier already ruled for violet's
 * replacement — the app's own ink at fill weight — so choosing it here spends no
 * new vocabulary.
 *
 * **Where else this treatment shows** (the owner's fact-check, answered): the
 * amber *fill* exists on exactly one surface — the admin sidebar.
 * `navItemsByRole` in `layout/sidebar.tsx` is keyed by role and only `admin`
 * has entries, so no other role renders a sidebar nav at all. The header's nav
 * asked the same question one strength quieter, and it is **ruled: the amber
 * active text stays** (owner, 2026-09-01, on seeing the pair: the neutral
 * alternative's grey-vs-white "are not enough contrast to see where a user
 * currently is — parents will get lost"). No rule forbids it: the you-are-here
 * argument was aimed at the *fill* tier, and the ruled grammar lists links
 * among amber's jobs — a header nav item is a link. The header exhibit is
 * dropped; only the sidebar's fill remains open on this slide.
 *
 * Classes restated from the sidebar, which is a client module.
 */
const SIDEBAR_ITEMS: readonly { label: string; icon: React.ReactNode }[] = [
  { label: "Dashboard", icon: <LayoutDashboard className="h-5 w-5" /> },
  { label: "Users", icon: <Users className="h-5 w-5" /> },
  { label: "Consumer Clubs", icon: <Joystick className="h-5 w-5" /> },
  { label: "Municipality Clubs", icon: <School className="h-5 w-5" /> },
  { label: "Camps", icon: <Tent className="h-5 w-5" /> },
];

/** The item the sample marks as current — mid-list, and the longest of the run. */
const SIDEBAR_ACTIVE_LABEL = "Consumer Clubs";

const NAV_TREATMENTS: readonly {
  label: string;
  active: string;
  note: string;
}[] = [
  {
    label: "Today — amber fill",
    active: "bg-sidebar-primary text-sidebar-primary-foreground",
    note: "ink on amber · 9.58:1",
  },
  {
    label: "Inverted fill",
    active: "bg-foreground text-background",
    note: "ink on the app's own ink · 16.00:1",
  },
];

/*
 * Dropped — the header's nav pair. Ruled 2026-09-01: the amber active text
 * stays. The neutral-emphatic alternative failed on sight ("not enough
 * contrast to see where a user currently is — parents will get lost"), and no
 * rule required the change: the you-are-here argument binds the fill tier,
 * and the grammar lists links among amber's jobs.
 */

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
 * **Both reconciliations the approval needed are now settled.** Pending steps
 * down **by construct** — an outline chip — with **full-value ink**
 * (`text-primary`, not `/80`), per the dimmed-ink ruling; and the completed
 * step's tint chip takes the chip ruling's replacement, `bg-muted text-primary`.
 * Nothing on this ladder is open any more.
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
 *
 * The badge's *ground* is decided by the chip ruling above, not here; the live
 * enrollment card on the shading slide draws it in its ruled form.
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
 * `BUTTON_SHAPE` was defined here; it now lives with the shading rule, whose
 * live enrollment card is its last consumer.
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
 * and no longer exists on `dev` — so the colour map's `bgGradient` slot now has
 * no renderer at all, and promotion decides whether the five-slot shape keeps
 * it.
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
 *
 * The primary fill's **hover** is a separate question and it is now ruled too:
 * `hover:bg-primary/90` comes out and the affordance goes non-colour. See the
 * shading rule's closed list.
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
/*  Dropped — the calm ring                                            */
/* ------------------------------------------------------------------ */

/**
 * **RULED 2026-09-01: the palette comes in.** "Frankly I love all the extra
 * colors." Billing, safeguarding and legal surfaces are **not** fenced to
 * amber-only: they take the grammar wherever a mark has a job — a status chip, a
 * date, the name of the person a subscription covers — and stop short of
 * decoration. The exhibit that settled it drew one billing card twice, once
 * amber-only and once with a glow status chip, a wit next-payment line and
 * harmony on the covered child.
 *
 * **This is a deliberate deviation from the Guidebook**, which prescribes a calm
 * ring — one act colour on the one action, nothing else coloured — for exactly
 * these surfaces. **The wiring change logs it in
 * `docs/brand-guidebook-deviations.md`**, with the owner's ruling as its
 * authority; a deviation with no entry there is the thing that file exists to
 * prevent.
 */

/* ------------------------------------------------------------------ */
/*  Small shapes the exhibits are built from                           */
/* ------------------------------------------------------------------ */

/** The browse card's free-price chip — `StatusChip` at tone primary, size md. */
function FreeChip({ className }: { className: string }) {
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
}

/**
 * A public browse card. The caller supplies the edge, and the hover exhibit
 * also supplies the `shadow-lg` — drawing the hover statically, because a state
 * you pass through cannot be compared in passing.
 */
function BrowseCard({ className }: { className: string }) {
  return (
    <div className={cn("w-64 space-y-2 rounded-lg border bg-card p-4", className)}>
      <div className="text-sm font-semibold text-foreground">Explorers Club</div>
      <p className="text-xs text-muted-foreground">Online · Mondays, 17:00</p>
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
}

/**
 * The live enrollment card from My SOG, at the real card's rows — type eyebrow,
 * product name, Live badge and chevron in the corner cluster, the schedule line,
 * and the Join at the foot. The Live chip is held constant in its **ruled**
 * form (`bg-muted` under full-value glow ink), so the three candidates differ
 * in exactly the thing under decision: where the brand is spent on the card
 * itself.
 *
 * One boolean varies — `lit` — because that is the whole point now: the two
 * states must differ in paint alone. The ring overlay renders under the
 * content (gradient span at `inset-0`, `bg-card` cover at `inset-[2px]`),
 * the 1px border class is present in both states with only its colour
 * swapped, and the Live chip mounts at the start of the right-packed trailing
 * group so its arrival grows the group leftward into the title's slack.
 */
function LiveEnrollmentCard({ lit }: { lit: boolean }) {
  return (
    <div
      className={cn(
        "relative w-72 overflow-hidden rounded-lg border bg-card",
        lit ? "border-transparent" : "border-border",
      )}
    >
      {lit && (
        <span aria-hidden className="pointer-events-none absolute inset-0">
          <span className="absolute inset-0 bg-gradient-to-r from-yty-glow-strong to-yty-glow-soft" />
          <span className="absolute inset-[2px] rounded-md bg-card" />
        </span>
      )}
      <div className="relative flex flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Club
            </p>
            <p className="text-lg font-semibold leading-tight">
              Explorers Club
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {/* Mounts at ignition, first in the right-packed group — the
                order is load-bearing: arriving here grows the group leftward
                into the title's slack and the chevron never moves. */}
            {lit && (
              <span className="inline-flex items-center gap-1 rounded-full border border-yty-glow-strong bg-muted px-2 py-0 text-[10px] font-semibold uppercase tracking-wide text-yty-glow-soft">
                <Radio className="h-3 w-3" aria-hidden />
                Live
              </span>
            )}
            <ChevronRight
              className="h-5 w-5 text-muted-foreground"
              aria-hidden
            />
          </div>
        </div>

        <div className="flex min-w-0 items-start gap-1.5 text-sm text-muted-foreground">
          <CalendarClock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          <span className="min-w-0 tabular-nums">Mondays, 17:00–18:30</span>
        </div>

        <div className="flex justify-center">
          <span
            className={cn(
              BUTTON_SHAPE,
              "h-9 gap-1.5 px-3 text-sm",
              "bg-primary text-primary-foreground shadow",
            )}
          >
            <AudioLines className="h-4 w-4" aria-hidden />
            Join voice room
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * The admin sidebar's expanded nav, at the real item order, labels, icons,
 * shape and width. Only the active item's fill varies.
 */
function SidebarSample({ active }: { active: string }) {
  return (
    <div className="w-64 space-y-1 border-r border-sidebar-border bg-sidebar-background p-4">
      {SIDEBAR_ITEMS.map((item) => (
        <div
          key={item.label}
          className={cn(
            "flex items-center gap-3 overflow-hidden whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium",
            item.label === SIDEBAR_ACTIVE_LABEL
              ? active
              : "text-sidebar-foreground",
          )}
        >
          <span className="shrink-0">{item.icon}</span>
          <span className="overflow-hidden text-ellipsis">{item.label}</span>
        </div>
      ))}
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

      {/* Dropped — the strength axis. RULED on all three tiers: Act is the
          solid fill, Label is bg-muted under full-value family ink, and
          Selection is border-primary bg-accent ("I like the 'Brand edge,
          neutral lift'. We can move forward with that"), which binds the 22
          selection-ground call sites at wiring. See the comment at the
          constants' old position. */}

      {/* ----------------------------------------------------------- 2 */}
      <Slide id="shading">
        {/* Dropped from this slide — the all-clear trophy. RULED with a cleaner
            doctrine than the art exemption: "It shouldn't need an exception
            because it shouldn't be using brand colors. It's art." The sprite's
            gold is a trophy's gold, so wiring decouples the pixel-art palette
            from --primary into the sprite's own hex constants. See the comment
            at the constants' old position. */}

        <div className="space-y-3">
          <Marker>Brand edges at rest</Marker>
          <div className="flex flex-wrap gap-8">
            {EDGE_REST.map((treatment) => (
              <div key={treatment.label} className="space-y-3">
                <Marker>{treatment.label}</Marker>
                <FreeChip className={treatment.chip} />
                <BrowseCard className={treatment.card} />
                <Annotation>{treatment.note}</Annotation>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <Marker>The same card at hover</Marker>
          <div className="flex flex-wrap gap-8">
            {EDGE_HOVER.map((treatment) => (
              <div key={treatment.label} className="space-y-3">
                <Marker>{treatment.label}</Marker>
                <BrowseCard className={treatment.card} />
                <Annotation>{treatment.note}</Annotation>
              </div>
            ))}
          </div>
          <Caption>
            An edge nobody can see as brand colour was never doing brand work —
            but a hover has to be seen to be feedback.
          </Caption>
        </div>

        <div className="space-y-3">
          <Marker>The live card — ignition is a paint swap, never a layout one</Marker>
          <div className="flex flex-wrap gap-8">
            {IGNITION_STATES.map((state) => (
              <div key={state.label} className="w-72 space-y-3">
                <Marker>{state.label}</Marker>
                <LiveEnrollmentCard lit={state.lit} />
                <Annotation>{state.note}</Annotation>
              </div>
            ))}
          </div>
          <Caption>
            The ring is a painted overlay inside the card&rsquo;s own bounds and
            the border class survives both states, so the box and every line of
            content hold position to the pixel; the Live chip lands at the start
            of the right-packed group and grows it into the title&rsquo;s slack.
          </Caption>
        </div>

        <Ruling>
          <p>
            Closed: dimmed brand ink, tinted label chips
            (&rarr;&nbsp;<code>bg-muted</code>), washed grounds
            (&rarr;&nbsp;<code>bg-muted</code>), hover darkening (the primary
            fill stops darkening; the affordance goes non-colour), selection
            grounds (&rarr;&nbsp;<code>border-primary bg-accent</code>) and the
            trophy (artwork gets its own hexes, not brand tokens).
          </p>
          <p>
            The edge — confirm the recommendation, neutral at rest and
            full-value at hover, or name a different split.
          </p>
          <p>
            The live card — confirm the gradient border with this paint-only
            ignition; the wash and the leading strip are dead if it holds.
          </p>
        </Ruling>
      </Slide>

      {/* ----------------------------------------------------------- 3 */}
      <Slide id="you-are-here">
        <div className="space-y-3">
          <Marker>The admin sidebar — the amber fill&rsquo;s one home</Marker>
          <div className="flex flex-wrap gap-8">
            {NAV_TREATMENTS.map((treatment) => (
              <div key={treatment.label} className="space-y-2">
                <Marker>{treatment.label}</Marker>
                <SidebarSample active={treatment.active} />
                <Annotation>{treatment.note}</Annotation>
              </div>
            ))}
          </div>
        </div>

        {/* The header's nav pair is dropped — ruled, the amber active text
            stays (the neutral alternative lacked the contrast; the grammar
            lists links among amber's jobs). Only the fill remains open. */}

        <Caption>
          The amber fill exists only on the admin sidebar — the header&rsquo;s
          active link is ruled and keeps its amber text.
        </Caption>

        <Ruling>
          <p>
            Confirm the inverted fill for the sidebar, or keep today&rsquo;s
            amber. (recommended: the inverted fill)
          </p>
        </Ruling>
      </Slide>

      {/* Dropped — lifecycles are one hue, stepped. Approved ("looks good to
          me"); both reconciliations are now settled by the dimmed-ink and chip
          rulings. See the comment at the constants' old position. */}

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

      {/* ----------------------------------------------------------- 4 */}
      <Slide id="scenes">
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
          <DeckLink href="/preview/gamer-dashboard/typical">
            The gamer dashboard as it ships
          </DeckLink>
          <DeckLink href="/preview/gamer-dashboard/brand-palette">
            The gamer dashboard under the draft
          </DeckLink>
        </Links>

        <Caption>
          Judged as pages in their own scenes, at any width — the palette
          changes no breakpoint.
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

      {/* Dropped — the calm ring. RULED: the palette comes in ("Frankly I love
          all the extra colors") — billing, safeguarding and legal take the
          grammar where marks have jobs, not amber-only. It is a deviation from
          the Guidebook's calm-ring prescription and the wiring change logs it in
          docs/brand-guidebook-deviations.md. See the comment at the constants'
          old position. */}

      {/* ----------------------------------------------------------- 5 */}
      <Slide id="recap">
        <ol className="max-w-prose list-decimal space-y-1.5 pl-5 text-sm text-foreground">
          <li>
            The edge — confirm neutral at rest and full-value at hover, or name
            a different split.
          </li>
          <li>
            The gradient border — confirm it with the paint-only ignition the
            exhibit proves.
          </li>
          <li>
            &ldquo;You are here&rdquo; — confirm the inverted fill for the
            admin sidebar (the header&rsquo;s amber text is ruled and stays).
          </li>
          <li>
            The pages, from their scenes — My SOG, the family product page, the
            gamer dashboard.
          </li>
        </ol>
      </Slide>
    </div>
  );
}
