/* eslint-disable i18next/no-literal-string -- temporary admin-only review deck for the brand design pass; every string here is owner-facing walkthrough narration about drafts, never product copy that ships in any locale, and the whole page is deleted before the wiring phase merges */

import {
  AudioLines,
  CalendarClock,
  Check,
  ChevronRight,
  CircleCheck,
  Joystick,
  LayoutDashboard,
  Radio,
  School,
  Tent,
  Users,
} from "lucide-react";
import { ENROLLMENT_TONES } from "@/components/family/enrollment-tones";
import { TROPHY_CUP } from "@/components/admin/dashboard/pixel-art";
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
 * five open questions — the selection treatment, the trophy, the edge, the
 * gradient and the active nav item — and a hub of pages to sign off.
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
 * its own copy reads as the defect it is. **The trophy was the last abstract
 * exhibit and is now real too** (owner, on the abstract cells: "it loses its
 * color. But maybe I need to see it in something real") — the sprite draws from
 * the exported `TROPHY_CUP` rows inside the real all-clear card.
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
 * **One home per comparison.** The selection question now lives on the strength
 * slide, because it *is* that axis's third tier and the owner rejected both of
 * its drawn forms in one breath; the shading slide keeps only a pointer.
 *
 * **`--accent` is a neutral token** — `0 0% 13%`, zero saturation — which is
 * what makes a `bg-accent` lift a legal answer under the shading rule: the ban
 * is on brand colours mixed off their authored values, and a grey is not a
 * brand colour.
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
  { id: "strength", title: "The strength axis" },
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
  // The /40 edge stays pending the still-open edge scope call, which is drawn
  // one slide down on the app's own constructs.
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
/*  Slide 2 — the strength axis                                        */
/* ------------------------------------------------------------------ */

/**
 * **The doctrine's missing dimension.** The grammar says which family a surface
 * reaches for; nothing until now said how *loudly* it may speak. Three
 * strengths, and deliberately only three: a solid fill is the loudest thing a
 * colour can be and is spent on the thing you are asked to *do*; a chip with
 * coloured text is a label, read but not clicked; the third tier marks the one
 * item among several that is currently chosen. Glow is the family drawn here
 * because it is the one the ensemble rule says we hear least.
 *
 * **Two of the three tiers are ruled** (owner, 2026-09-01): Act and Label are
 * "great" as drawn. The Label tier's ground moved with the same batch's chip
 * ruling — a tinted brand ground becomes the neutral `bg-muted` under
 * full-value family ink — so it is drawn here in its ruled form rather than the
 * tinted one it was proposed in.
 *
 * **The third tier is the batch's real design problem, and it has now been
 * rejected in both of its drawn forms.** The tint ground it was first proposed
 * with fell to the shading ruling; the solid-edge-only correction that replaced
 * it fell to the owner the next round — "the very thing you are engaging with
 * loses its color after you've selected it" — and the shading slide's
 * `bg-transparent` twin fell with it: "aside from the checkbox itself there is
 * no way to highlight that this whole box has been selected."
 *
 * So a selected row has to read *selected as a whole* and stay vibrant, without
 * a shaded brand ground. All three candidates below hold the brand at full
 * value and take their lift, where they take one, from a **neutral** token —
 * `--accent` is `0 0% 13%`, zero saturation, so the tint ban does not reach it.
 *
 * The row is the real one: `ui/checkbox-row.tsx`'s container, at the
 * registration form's own consent sentence and hint. Its shipped checked state
 * is `border-primary bg-primary/5`, which is one of the 22 census violations.
 *
 * **The app-as-shipped amber row is dropped from this slide.** It argued that
 * one amber was doing three jobs at one strength, and the axis it argued for is
 * now agreed; its third cell — the `bg-primary/5` selection ground — survives
 * as the "as shipped" column below, which is the only part still under
 * decision. The nav job it also quoted is the next slide, drawn on the real
 * sidebar.
 */
const STRENGTH_SHAPE =
  "inline-flex h-9 items-center justify-center rounded-md px-4";

/** The ruled CTA type (Poppins 16px / 600) every draft step is set in. */
const STRENGTH_TYPE_RULED = "text-base font-semibold";

const STRENGTH_STEPS: readonly {
  word: string;
  sample: string;
  className: string;
  note: string;
}[] = [
  {
    word: "Act",
    sample: "Join the club",
    className: "bg-yty-glow-strong text-background",
    note: "ruled · ink on the fill 6.63:1",
  },
  {
    word: "Label",
    sample: "Achievement",
    className: "bg-muted text-yty-glow-soft",
    note: "ruled · neutral ground under family ink, 7.14:1",
  },
];

/**
 * The consent row's checked container, three ways. Each is drawn beside an
 * untouched unchecked row (`border-input`, the component's own), because the
 * question is not whether a treatment looks good on its own — it is whether
 * selected and not-selected read apart at a glance in a stack of rows.
 *
 * Class strings are literal because Tailwind scans source text.
 */
const SELECTION_CANDIDATES: readonly {
  label: string;
  checkedClass: string;
  note: string;
}[] = [
  {
    label: "As shipped — the bound violation",
    checkedClass: "border-primary bg-primary/5",
    note: "border-primary bg-primary/5 · the wash composites to #252119",
  },
  {
    label: "Brand edge, neutral lift",
    checkedClass: "border-primary bg-accent",
    note: "border-primary bg-accent · body on the lift 13.75:1",
  },
  {
    label: "Thicker brand edge",
    checkedClass: "border-2 border-primary bg-transparent",
    note: "border-2 border-primary · no ground at all",
  },
  {
    label: "Leading brand bar, neutral lift",
    checkedClass: "border-input border-l-4 border-l-primary bg-accent",
    note: "border-l-4 border-l-primary bg-accent · normal edge elsewhere",
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
 *     strength axis's Label tier, which is redrawn above in its ruled form.
 *   - **Washed grounds under full-value ink** — bound; `bg-primary/10` becomes
 *     `bg-muted`, edge and ink unchanged. Nine sites. The chip-scale icon-accent
 *     tile (`border-yty-<family>-strong/30 bg-yty-<family>-strong/10` under a
 *     full-value glyph) stays exempt, per the home tile ruling.
 *   - **Hover darkening of the primary fill** — bound. "These buttons don't
 *     need a 90% alpha": `hover:bg-primary/90` comes out of the button recipe,
 *     and the hover affordance becomes a **non-colour** one — a shadow or a
 *     ring, implementer's call at wiring, since the recipe is one line and the
 *     choice does not want a per-surface decision.
 *   - **Selection grounds** — rejected in both forms and moved *up* to the
 *     strength axis, where it is that axis's third tier. One home per
 *     comparison; the 22 call sites follow whatever is picked there.
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

/**
 * **The trophy, in something real** (owner: "it loses its color. But maybe I
 * need to see it in something real").
 *
 * The sprite's rows come from the exported `TROPHY_CUP`, so the artwork here
 * cannot drift from the artwork the admin dashboard draws. Only the *shade*
 * glyph's class varies, which is the whole of what is being ruled — the cup's
 * full-value pixels stay `bg-primary` and its base stays `bg-muted-foreground`
 * in all three. It is drawn through a local cell renderer rather than through
 * `PixelSprite` because that component's colour map is a module constant with
 * no way in; one renderer for all three is what keeps the three cells
 * comparable.
 *
 * The card around it is the real all-clear panel — the wordmark title, the
 * in-fiction line, the cup, the check — re-set in the ruled Poppins, since
 * Press Start 2P is retired.
 *
 * The candidate resolution to pose beside the two corrections: **pixel art is
 * artwork, not a UI surface**, so it takes an art exemption the way a photograph
 * does, and the shipped cell is what the exemption ships. The third cell is the
 * other answer — a correction that keeps the colour by reaching for a second
 * brand family at full value instead of mixing the first one down.
 */
const TROPHY_SHADES: readonly {
  label: string;
  shade: string;
  note: string;
}[] = [
  {
    label: "As shipped — and what an art exemption keeps",
    shade: "bg-primary/55",
    note: "bg-primary/55 · composites to #95690c, 3.57:1 on the card",
  },
  {
    label: "The rejected correction",
    shade: "bg-muted-foreground",
    note: "bg-muted-foreground · #a6a6a6, 7.15:1 — the same grey as the base row",
  },
  {
    label: "A different correction — a second family, full value",
    shade: "bg-yty-valor-strong",
    note: "bg-yty-valor-strong · #FD700D, 6.22:1, nothing mixed",
  },
];

/**
 * **Low-alpha edges and hover edge-lifts, merged into one choice** (owner, of
 * both classes: "I didn't even know these borders had color. It's so subtle I
 * don't even see it").
 *
 * They were two rows asking the same question about the same value, so they are
 * one exhibit now: the browse card's "Free" price chip at rest, and the browse
 * card itself drawn *at* its hover value, under three edge treatments. Drawing
 * the hover state statically is deliberate — a state you pass through cannot be
 * compared in passing.
 *
 * Chips quote `public/products/status-chip.tsx` (the `primary` outline tone at
 * `md`); the card quotes `public/products/browse-card-shell.tsx`'s openable
 * feedback. Ink is held constant at `text-primary` in every column, so the only
 * thing changing is the edge.
 */
const EDGE_TREATMENTS: readonly {
  label: string;
  chip: string;
  card: string;
  note: string;
}[] = [
  {
    label: "As shipped — the /40 brand edge",
    chip: "border-primary/40 text-primary",
    card: "border-primary/40 shadow-lg",
    note: "composites to #745310 · 2.48:1 against the card",
  },
  {
    label: "Full-value brand edge",
    chip: "border-primary text-primary",
    card: "border-primary shadow-lg",
    note: "#FAA901 · 8.90:1 against the card",
  },
  {
    label: "Neutral edge",
    chip: "border-border text-primary",
    card: "border-border shadow-lg",
    note: "#333333 · 1.38:1 — the hover is then the shadow alone",
  },
];

/**
 * **The gradient wash may be the one exception** (owner: "a gradient on card,
 * for example the product card in My SOG, gives it wanted attention beyond what
 * only the Live label provides. Either you keep the gradient or you come up with
 * ideas that keep the vibrancy without violating a shading rule").
 *
 * So this row stops being a violation-and-replacement pair and becomes a
 * three-way choice on the real live enrollment card. The complaint being tested
 * is *loss of attention*, which means a candidate that reads flat loses the
 * argument by rendering rather than by anything written here.
 *
 * The shipped gradient is read live from `family/enrollment-tones.ts` rather
 * than restated. The Live chip is drawn in its **ruled** form in the first two
 * candidates — the chip ruling landed this batch, so a tinted brand ground is no
 * longer available to it — and the third spends its vibrancy differently: a
 * solid glow fill on the chip, and the approved chip-scale icon-accent tile
 * carrying the family on a wholly neutral card.
 */
const LIVE_CARD_CANDIDATES: readonly {
  label: string;
  shell: string;
  badge: string;
  tile: string | null;
  note: string;
}[] = [
  {
    label: "The gradient kept",
    shell: ENROLLMENT_TONES.current.live,
    badge: "border-yty-glow-strong bg-muted text-yty-glow-soft",
    tile: null,
    note: `${ENROLLMENT_TONES.current.live} · would become a named sanctioned class, like the hero band`,
  },
  {
    label: "Solid edge + leading accent strip",
    shell: "border-primary border-l-4 border-l-primary",
    badge: "border-yty-glow-strong bg-muted text-yty-glow-soft",
    tile: null,
    note: "border-primary border-l-4 border-l-primary · neutral card ground",
  },
  {
    label: "Accent tile + solid glow chip",
    shell: "border-border",
    badge: "border-yty-glow-strong bg-yty-glow-strong text-background",
    tile: "border-yty-glow-strong/30 bg-yty-glow-strong/10 text-yty-glow-soft",
    note: "the approved icon-accent tile · ink on the glow fill 6.63:1",
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
  note: string;
}) {
  return (
    <div className="w-48 space-y-2">
      <span className={cn(STRENGTH_SHAPE, STRENGTH_TYPE_RULED, className)}>
        {sample}
      </span>
      <div className="text-sm font-semibold text-foreground">{word}</div>
      <Annotation>{note}</Annotation>
    </div>
  );
}

/**
 * The real consent row — `ui/checkbox-row.tsx`'s container, box, sentence column
 * and info-toned hint, at the registration form's own copy. The container class
 * is the only thing a caller varies, because it is the only thing under
 * decision.
 */
function ConsentRow({
  checked,
  containerClass,
}: {
  checked: boolean;
  containerClass: string;
}) {
  return (
    <div
      className={cn(
        "flex w-72 items-start gap-3 rounded-md border p-3 text-sm",
        containerClass,
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
        {checked ? <Check className="h-3 w-3" strokeWidth={3} aria-hidden /> : null}
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
}

/**
 * The trophy cup, drawn from the exported artwork with one glyph's colour under
 * decision. `cell` is the screen size of one art pixel: the card draws it at the
 * shipped 3px, and the magnified copy beneath at 7px, because a 27x30 sprite is
 * not a size anybody can judge a colour at.
 */
function TrophySprite({ shade, cell }: { shade: string; cell: string }) {
  return (
    <div className="flex shrink-0 flex-col" aria-hidden>
      {TROPHY_CUP.rows.map((row, y) => (
        <div key={y} className="flex">
          {[...row].map((glyph, x) => (
            <span
              key={x}
              className={cn(
                cell,
                glyph === "P" && "bg-primary",
                glyph === "p" && shade,
                glyph === "f" && "bg-muted-foreground",
              )}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

/**
 * The admin dashboard's all-clear panel, at its real composition and copy, with
 * the title re-set in the ruled Poppins. The sprite inside it is at the shipped
 * 3px; the magnified copy sits beneath the card.
 */
function AllClearSample({ shade }: { shade: string }) {
  return (
    <div className="w-full max-w-sm rounded-lg border bg-card text-card-foreground shadow-sm">
      <div className="flex flex-row flex-wrap items-center justify-between gap-x-6 gap-y-3 p-6">
        <h3 className="text-base font-semibold leading-none text-primary">
          All clear
        </h3>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-x-3 gap-y-2">
          <p className="text-sm text-muted-foreground">
            Sogverse is at peace. You may rest now, admin adventurer.
          </p>
          <TrophySprite shade={shade} cell="h-[3px] w-[3px]" />
          <CircleCheck className="h-5 w-5 shrink-0 text-success" aria-hidden />
        </div>
      </div>
    </div>
  );
}

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

/** A public browse card, drawn statically at its hover value. */
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
 * and the Join at the foot. Only the shell, the badge and the optional leading
 * tile vary; everything else is constant, so the three candidates differ in
 * exactly the thing being ruled.
 */
function LiveEnrollmentCard({
  shell,
  badge,
  tile,
}: {
  shell: string;
  badge: string;
  tile: string | null;
}) {
  return (
    <div
      className={cn("w-72 overflow-hidden rounded-lg border bg-card", shell)}
    >
      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-start justify-between gap-2">
          <div className="flex min-w-0 items-start gap-3">
            {tile === null ? null : (
              <span
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-md border",
                  tile,
                )}
              >
                <AudioLines className="h-5 w-5" aria-hidden />
              </span>
            )}
            <div className="min-w-0 space-y-1">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                Club
              </p>
              <p className="text-lg font-semibold leading-tight">
                Explorers Club
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <span
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-0 text-[10px] font-semibold uppercase tracking-wide",
                badge,
              )}
            >
              <Radio className="h-3 w-3" aria-hidden />
              Live
            </span>
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

      {/* ----------------------------------------------------------- 2 */}
      <Slide id="strength">
        <div className="space-y-3">
          <Marker>Two tiers, ruled</Marker>
          <div className="flex flex-wrap gap-6">
            {STRENGTH_STEPS.map((step) => (
              <StrengthCell key={step.word} {...step} />
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <Marker>The third tier — selection, and the 22 call sites</Marker>
          <div className="flex flex-wrap gap-6">
            {SELECTION_CANDIDATES.map((candidate) => (
              <div key={candidate.label} className="space-y-2">
                <Marker>{candidate.label}</Marker>
                <ConsentRow checked containerClass={candidate.checkedClass} />
                <ConsentRow checked={false} containerClass="border-input" />
                <Annotation>{candidate.note}</Annotation>
              </div>
            ))}
          </div>
        </div>
        <Caption>
          Each candidate sits above an untouched unchecked row, because the
          question is whether the whole box reads as chosen — not whether the
          checkbox does.
        </Caption>

        <Ruling>
          <p>
            Act and Label are ruled great; Label&rsquo;s ground is redrawn on
            the chip ruling.
          </p>
          <p>
            Pick the selection treatment — it binds this axis&rsquo;s third tier
            and all 22 selection grounds. (recommended: brand edge + neutral
            lift)
          </p>
        </Ruling>
      </Slide>

      {/* ----------------------------------------------------------- 3 */}
      <Slide id="shading">
        <div className="space-y-3">
          <Marker>The admin all-clear trophy — the real sprite</Marker>
          <div className="flex flex-wrap gap-8">
            {TROPHY_SHADES.map((variant) => (
              <div
                key={variant.label}
                className="w-full max-w-sm space-y-3"
              >
                <Marker>{variant.label}</Marker>
                <AllClearSample shade={variant.shade} />
                <TrophySprite shade={variant.shade} cell="h-[7px] w-[7px]" />
                <Annotation>{variant.note}</Annotation>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-3">
          <Marker>Brand edges — at rest, and at hover</Marker>
          <div className="flex flex-wrap gap-8">
            {EDGE_TREATMENTS.map((treatment) => (
              <div key={treatment.label} className="space-y-3">
                <Marker>{treatment.label}</Marker>
                <FreeChip className={treatment.chip} />
                <BrowseCard className={treatment.card} />
                <Annotation>{treatment.note}</Annotation>
              </div>
            ))}
          </div>
          <Caption>
            An edge nobody can see as brand colour was never doing brand work.
          </Caption>
        </div>

        <div className="space-y-3">
          <Marker>The live card — the gradient, or vibrancy without it</Marker>
          <div className="flex flex-wrap gap-8">
            {LIVE_CARD_CANDIDATES.map((candidate) => (
              <div key={candidate.label} className="w-72 space-y-3">
                <Marker>{candidate.label}</Marker>
                <LiveEnrollmentCard
                  shell={candidate.shell}
                  badge={candidate.badge}
                  tile={candidate.tile}
                />
                <Annotation>{candidate.note}</Annotation>
              </div>
            ))}
          </div>
        </div>

        <Ruling>
          <p>
            Closed this batch: dimmed brand ink, tinted label chips
            (&rarr;&nbsp;<code>bg-muted</code>), washed grounds
            (&rarr;&nbsp;<code>bg-muted</code>), and hover darkening (the primary
            fill stops darkening; the affordance goes non-colour).
          </p>
          <p>
            The trophy — art exemption (pixel art is artwork, like a photo), or
            one of the two corrections.
          </p>
          <p>
            The edge — full-value brand, or neutral. Ruling neutral retires the
            brand edge everywhere it is currently spoken at low alpha.
          </p>
          <p>
            The live card — keep the gradient as a named sanctioned class, or
            name the alternative.
          </p>
          <p>
            Selection grounds moved up to the strength axis, where the third
            tier lives.
          </p>
        </Ruling>
      </Slide>

      {/* ----------------------------------------------------------- 4 */}
      <Slide id="you-are-here">
        <div className="flex flex-wrap gap-8">
          {NAV_TREATMENTS.map((treatment) => (
            <div key={treatment.label} className="space-y-2">
              <Marker>{treatment.label}</Marker>
              <SidebarSample active={treatment.active} />
              <Annotation>{treatment.note}</Annotation>
            </div>
          ))}
        </div>
        <Caption>
          The real sidebar&rsquo;s items, icons, shape and width — only the
          active item&rsquo;s fill differs.
        </Caption>

        <Ruling>
          <p>
            Confirm the inverted fill from the real composition, or keep
            today&rsquo;s amber. (recommended: the inverted fill)
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

      {/* ----------------------------------------------------------- 5 */}
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

      {/* ----------------------------------------------------------- 6 */}
      <Slide id="recap">
        <ol className="max-w-prose list-decimal space-y-1.5 pl-5 text-sm text-foreground">
          <li>
            The selection treatment — binds the strength axis&rsquo;s third tier
            and all 22 selection grounds.
          </li>
          <li>
            The gradient exception — keep the live card&rsquo;s wash as a
            sanctioned class, or name the alternative.
          </li>
          <li>The edge — full-value brand, or neutral.</li>
          <li>
            The trophy — art exemption, or one of the two corrections.
          </li>
          <li>
            &ldquo;You are here&rdquo; — confirm the inverted fill from the real
            sidebar.
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
