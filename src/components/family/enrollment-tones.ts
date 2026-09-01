import type { YtyPalette } from "@/lib/constants/yty";

/**
 * **Design-pass draft — the enrollment card's state colours under the ruled
 * grammar.**
 *
 * The grammar assigns one meaning per family: amber = act, harmony = people,
 * glow = growth, wit = knowledge, valor = adventure. Every entry below is now a
 * *ruled* form rather than a proposal — the rulings are recorded in
 * `docs/plans/brand-palette-and-type-design-pass.md`, directions 24–31:
 *
 * - **The live card ignites a glow ring.** Liveness is glow (ruled), and the
 *   ring is the approved gradient border: strong → soft, so every pixel of it
 *   is an authored brand value or a point on the straight line between two of
 *   them. The wash it replaces was the violation — a `primary/5` fade is amber
 *   mixed down toward the card, and a brand colour darkened past its authored
 *   pair is no longer a brand colour. The amber edge went with it: the Join
 *   inside the card is still the act and still amber, which is where the act
 *   colour belongs.
 * - **The Live badge takes the glow family, on a neutral ground.** It carried
 *   `--success` and a `/10` tint; the status convergence makes success glow, and
 *   the tinted-label-chip ruling makes the ground `bg-muted` under full-value
 *   family ink.
 * - **Awaiting placement takes the wit family, at full value and with no
 *   wash.** Knowledge is "we are telling you something", which is exactly what
 *   that state's sentence does. Strong on the edge, soft on the glyph — the
 *   split the element cards were signed off on, because wit-strong cannot carry
 *   body text on this ground.
 *
 * The queue place is deliberately still uncoloured. Warning amber is reserved
 * for it in the grammar, but nothing is wrong with a place in line, and the card
 * has said so in muted body text since it was designed — colouring it now would
 * make the grammar louder than the meaning.
 *
 * **How the ignition holds the layout still, which is the condition the owner
 * accepted it under** ("so long as it doesn't shift the card's size or the
 * layout of its content… these cards update in real time when the session
 * opens"). A session opening is data arriving on its own schedule, so ignition
 * may not move a pixel, and it does not — by construction rather than by care:
 *
 *   - The ring is a **painted overlay** inside the card's own bounds — a
 *     gradient span at `inset-0` under a `bg-card` cover at `inset-[2px]`, both
 *     beneath the content — so it is painted, never laid out.
 *   - The card keeps its 1px `border` class in **both** states and swaps only
 *     the colour (`border-transparent` when lit). With border-box sizing,
 *     dropping the class would grow the content box by 1px.
 *   - The Live badge's slot is reserved on every card that can ever light one,
 *     at the **start of the right-packed trailing group**, so the chevron beside
 *     it holds its position to the pixel. That is a strictly stronger guarantee
 *     than the approved exhibit's late mount, which grows the group leftward
 *     into the title's slack; the card gets it for free because the slot is
 *     already there.
 *
 * Contrast, on the card ground: glow-soft over `bg-muted` is 7.35:1 and
 * wit-soft on the card is 7.57:1, both against the 4.5:1 body bar. Every glyph
 * clears the 3:1 bar by a wide margin.
 *
 * **There is no `current` form left.** The entry held today's rendering while
 * the drafts were under review; every class in it was a shaded brand value the
 * shading rule bans, so it converts rather than survives as a comparison. All
 * three keys point at the one ruled set, and the map itself retires when the
 * palette machinery collapses.
 *
 * Classes are literal strings because Tailwind scans source text.
 *
 * **It lives in a module of its own rather than beside the card**, and that is
 * load-bearing: the card is a `"use client"` module, so every export of it
 * becomes a client reference when a server component imports it, and a server
 * component that needs to *read* these strings would throw on the dot. Both this
 * file and the card retire together at promotion.
 */
export interface EnrollmentDraftTones {
  /**
   * The openable card's hover and focus feedback. Identical in both entries —
   * the edge sweep is a branch-wide correction rather than a draft, so there is
   * nothing here for a scenario to vary. It stays a slot so the one place the
   * card's feedback is written down is this map.
   */
  openable: string;
  /** The live card's edge — transparent, because the ignition ring paints it. */
  live: string;
  /**
   * The ignition ring's gradient, or `null` where the palette paints none.
   * `null` is also what tells the card not to render the overlay at all. No
   * palette answers `null` any more; the slot stays nullable until the palette
   * machinery collapses.
   */
  liveRing: string | null;
  /** The awaiting-placement card's edge. */
  awaiting: string;
  /** The Live badge's border, ground and label. */
  liveBadge: string;
  /** The awaiting-placement glyph in the footer. */
  awaitingGlyph: string;
}

/** The hover/focus feedback, one string for both palettes — see `openable`. */
/*
 * Neutral on purpose (owner, 2026-09-01). The amber hover border was authored
 * blind — the pre-fix layer bug meant it never rendered — and the moment it
 * became visible it collided with the live card's green state edge: two
 * meanings fighting for one border. Hover is functional feedback and stays in
 * the neutral idiom (the app's own gray lift); a border that carries *state*
 * is never repainted by a hover. Colour spent only behind hover also never
 * reaches the mobile-first family audience.
 */
const OPENABLE =
  "hover:border-foreground/30 hover:shadow-lg focus-within:border-foreground/30 focus-within:shadow-lg";

/** The ruled draft, shared by both draft slugs — see the note on `brand-lively`. */
const BRAND_TONES: EnrollmentDraftTones = {
  openable: OPENABLE,
  live: "border-transparent",
  liveRing: "bg-gradient-to-r from-yty-glow-strong to-yty-glow-soft",
  awaiting: "border-yty-wit-strong",
  liveBadge:
    "gap-1 border-yty-glow-strong bg-muted px-2 py-0 text-[10px] uppercase tracking-wide text-yty-glow-soft",
  awaitingGlyph: "mt-0.5 h-4 w-4 shrink-0 text-yty-wit-soft",
};

export const ENROLLMENT_TONES: Record<YtyPalette, EnrollmentDraftTones> = {
  /**
   * The ruled form is now the only form. What `current` used to hold — an amber
   * edge over a `primary/5` fade, an `info/40` edge over an `info/5` fade, and a
   * `success/10` badge ground — was three shaded brand values, all of which the
   * shading rule bans; there is no compliant "today" left to compare against, so
   * every key points at the one ruled set until the palette machinery collapses.
   */
  current: BRAND_TONES,
  brand: BRAND_TONES,
  /** Dose is a home-page question; a dashboard card takes the one draft. */
  "brand-lively": BRAND_TONES,
};
