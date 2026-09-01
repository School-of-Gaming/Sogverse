/* eslint-disable i18next/no-literal-string -- temporary admin-only review deck for the brand design pass; every string here is owner-facing walkthrough narration about drafts, never product copy that ships in any locale, and the whole page is deleted before the wiring phase merges */

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
 * being spoken. **Every system question the deck could answer is now ruled**:
 * the palette, the grammar, the strength axis, the shading rule and all five of
 * its scope classes, the gradient and the active nav mark. Two things are left,
 * and neither is a slide: the coloured borders, which are being seen for the
 * first time in the app itself (the layer bug had killed every one of them
 * since the initial commit) and are therefore reviewed *there* rather than in a
 * box on this page, and the per-page sign-offs from the refreshed preview
 * scenes. Three slides: the palette for context, the scene hub and the recap.
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
 * its own copy reads as the defect it is. Every exhibit that was drawn that way
 * has now been ruled and dropped; what is left of the principle is that the two
 * open threads are judged on real pages — the scenes below, and the app itself
 * for the borders.
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
 * **Every comparison rendered the real components inline** — never a screenshot
 * and never an iframed page. Where a map or a sprite was importable from a
 * server component it was read here directly, so the sample was the draft's
 * real presentation rather than a picture of it; where the source was private
 * to a client module the classes were **restated literally** and the sample
 * named the file they came from, so a reader could tell a quotation from a live
 * read. Every such exhibit has now been ruled and dropped, and the rule is
 * recorded because it governs the border deck that follows this one.
 *
 * **One home per comparison**, which is why the pages are links to their scenes
 * rather than boxes on this page.
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
  // The edge is full value for the same reason: the tint half of the edge
  // question is ruled, so a /40 edge here would be the deck shipping the
  // violation it recorded. A ruling card is a brand construct asking for an
  // action, which is amber's own job, so it keeps the colour rather than going
  // neutral — and whether other edges do is exactly what the owner is now
  // reviewing in the app.
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

/*
 * `Annotation` stood here — the class string or contrast figure printed under
 * the exhibit it described. The last exhibits that carried one dropped with the
 * shading and you-are-here slides; the swatch's own `note` slot does the same
 * job for the one comparison left.
 */

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
/*  Dropped — the shading rule                                         */
/* ------------------------------------------------------------------ */

/**
 * **The slide drops, 2026-09-01 — every row is either ruled or has moved off
 * the deck into the app.** The principle stands and all five scope classes plus
 * the gradient are closed; what follows is the record the wiring phase reads.
 *
 * **The edge: half ruled, half moved.** The *tint* half is ruled and bound —
 * no `border-primary/N` survives anywhere, because a shaded brand colour is not
 * a brand colour. What is **open** is colour versus neutral, and it is open for
 * a reason the deck cannot serve: the layer bug meant every coloured border in
 * the product was dead from the initial commit, so nobody has ever seen one in
 * situ. "Now that I see borders with color I am wondering if maybe we should
 * keep them. I agree they shouldn't be tinted. But now I get to review them for
 * the first time." So this branch converts every census hit to **full value**
 * (`border-primary/40` → `border-primary`, prefixes kept, shadows and accent
 * lifts untouched) and the keep-or-neutralize call is made per site by browsing
 * the app — which is why the three-way rest comparison and the hover pair drop
 * with the slide rather than being redrawn. Their samples (the browse card and
 * its price chip) go with them; the real browse card in its own scene is the
 * honest exhibit now.
 *
 * **The gradient border is APPROVED with the ignition pair** ("Yes looks
 * identical. Approved."). The wash and the leading strip are dead. The
 * mechanism binds at wiring, and it binds by construction rather than by care:
 * the ring is a **painted overlay** inside the card's own bounds (a gradient
 * span at `inset-0` under a `bg-card` cover at `inset-[2px]`, both beneath the
 * content), the card keeps its 1px border class in both states with only its
 * colour swapped (`border-border` → `border-transparent`, because with
 * border-box sizing dropping the class moves the content box 1px), and the Live
 * chip sits **first in the right-packed trailing group** so it grows the group
 * leftward into the title's slack and the chevron never moves. Glow is the
 * family because liveness is glow, so the ramp runs strong → soft
 * (`#1AB061 → #6AC66B`) and never leaves the authored palette's line. Ignition
 * is a paint swap and may fade in through opacity.
 *
 * The refreshed preview scenes are where this is now seen: the enrollment tone
 * map carries the ring, and the live card is judged in its own page.
 *
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
 * `BUTTON_SHAPE` stood here — the real button recipe at its default size in the
 * ruled CTA type (Poppins 16px / 600), quoted so the ignition exhibit's Join
 * wore the type it will ship on. It goes with the exhibit; the CTA-type ruling
 * is carried by the one line in the shared recipe at wiring.
 */

/* ------------------------------------------------------------------ */
/*  Dropped — the all-clear trophy                                     */
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
 * The edge exhibits and the ignition pair stood here — `EDGE_REST`,
 * `EDGE_HOVER` and `IGNITION_STATES`. See the shading rule's comment above: the
 * gradient border is approved with the paint-only ignition mechanism, and the
 * edge's tint half is ruled while its colour-versus-neutral half moved off the
 * deck into the app, where the borders can be seen for the first time. Their
 * samples — the browse card, its price chip and the live enrollment card — go
 * with them; both are now judged in their own preview scenes, in the pages they
 * belong to.
 */

/* ------------------------------------------------------------------ */
/*  Dropped — "you are here" is not "act"                              */
/* ------------------------------------------------------------------ */

/**
 * **RULED 2026-09-01, both tiers — the slide drops.** The admin sidebar's
 * active item takes the **inverted fill** ("That's fine for the admin side
 * panel"): `bg-foreground text-background`, 16.00:1, the same emphasis tier
 * already ruled for violet's replacement — the app's own ink at fill weight —
 * so choosing it spends no new vocabulary. It replaces the amber fill, which
 * existed on exactly this one surface (`navItemsByRole` is keyed by role and
 * only `admin` has entries, so no other role renders a sidebar nav at all).
 *
 * **The header's active nav link keeps its amber text**, ruled the round
 * before: the neutral alternative's grey-vs-white "are not enough contrast to
 * see where a user currently is — parents will get lost", and no rule required
 * the change — the you-are-here argument binds the *fill* tier, and the ruled
 * grammar lists links among amber's jobs.
 *
 * **Riding with the sidebar ruling, a standing colour-budget principle** to be
 * codified with the grammar at wiring: "Parent, gamer, and gedu surfaces
 * deserve more color than admin surfaces in general."
 *
 * `SIDEBAR_ITEMS`, `SIDEBAR_ACTIVE_LABEL`, `NAV_TREATMENTS` and `SidebarSample`
 * stood here — the sidebar's real item order, labels, icons, shape and width,
 * quoted from `layout/sidebar.tsx` and the `sidebar` message namespace.
 *
 * The argument the exhibit made, kept because it is what the wiring phase acts
 * on: amber is the act colour, and an active nav item is not an act — it is the
 * one place you cannot go, because you are already there. Drawing it in the CTA
 * fill spends the loudest colour in the palette on the least actionable element
 * on screen.
 */

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
 * enrollment card in the parent and gamer dashboard scenes draws it in its
 * ruled form — `bg-muted` under full-value glow ink, inside the ignition ring.
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
 * `BUTTON_SHAPE` was defined here; it moved to the shading rule with the live
 * enrollment card that consumed it, and retired when that exhibit dropped.
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

/**
 * `FreeChip`, `BrowseCard` and `LiveEnrollmentCard` stood here — the browse
 * card's price chip, the public browse card, and the live enrollment card that
 * carried the ignition pair. All three belonged to the ruled-and-dropped
 * shading slide and go with it.
 */


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
          the Guidebook? Every system question this deck could put in a box is
          now ruled — a settled slide is dropped, and its ruling survives as a
          comment where it stood. What is left is judged on real pages: the
          coloured borders, in the app itself, and the surfaces below, in their
          own scenes. Type is already ruled, on the other deck at{" "}
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

      {/* Dropped — the shading rule. The five scope classes are closed. The
          GRADIENT BORDER is APPROVED with the paint-only ignition ("Yes looks
          identical. Approved"); the wash and the leading strip are dead and the
          enrollment tone map now carries the ring. The EDGE's tint half is
          ruled — no border-primary/N survives — and its colour-versus-neutral
          half left the deck for the app: the layer bug had killed every
          coloured border since the initial commit, so this branch takes them to
          full value and the owner reviews them in situ for the first time. The
          all-clear trophy dropped from here earlier — artwork gets its own
          hexes, not brand tokens. See the comment at the constants' old
          position. */}

      {/* Dropped — "you are here" is not "act". Both tiers are RULED. The
          admin sidebar's active item takes the INVERTED FILL ("That's fine for
          the admin side panel"), which is the same emphasis tier already ruled
          for violet's replacement — the app's own ink at fill weight — and it
          is the amber fill's only home in the product. The header's active nav
          link keeps its AMBER TEXT (the neutral alternative's grey-vs-white
          "are not enough contrast to see where a user currently is — parents
          will get lost"), which no rule forbids: the you-are-here argument
          binds the fill tier, and the ruled grammar lists links among amber's
          jobs. Riding with the sidebar ruling, the standing colour-budget
          principle: "Parent, gamer, and gedu surfaces deserve more color than
          admin surfaces in general." See the comment at the constants' old
          position. */}

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

      {/* ----------------------------------------------------------- 2 */}
      <Slide id="scenes">
        <Links>
          <DeckLink href="/preview/parent-dashboard/busy-family">
            My SOG as it ships
          </DeckLink>
          <DeckLink href="/preview/parent-dashboard/brand-palette">
            My SOG under the grammar
          </DeckLink>
          <DeckLink href="/preview/parent-club/active-club">
            The family product page as it ships
          </DeckLink>
          <DeckLink href="/preview/parent-club/brand-palette">
            The family product page under the grammar
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

      {/* ----------------------------------------------------------- 3 */}
      <Slide id="recap">
        <ol className="max-w-prose list-decimal space-y-1.5 pl-5 text-sm text-foreground">
          <li>
            The coloured borders, now at full value across the branch — browse
            the app and say, per site, keep the colour or go neutral.
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
