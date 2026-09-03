/**
 * The brand's colours, defined once.
 *
 * This is the foundations tier's single typed source of truth for colour, and
 * the only file in the package that spells a hex. `theme.css` beside it is
 * generated from here (`npm run tokens --workspace=@sog/ui`), so a value moves
 * in one place; anything that cannot read CSS — an email, a canvas, an OG image
 * — imports these constants instead.
 *
 * Every colour is authored as hex, uppercase, six digits. Anything derived from
 * one — a contrast ratio, an HSL triple, a composited tint — is computed by a
 * function, never rounded by hand: a hue hand-converted twice is two hues, and
 * the drift is invisible until somebody puts the two next to each other.
 *
 * **Nothing is defined here before something consumes it.** The hues and the
 * families are the brand's identity and exist on their own account; everything
 * else — a scale, a state colour, a semantic alias — arrives with the component
 * that spends it. A token defined ahead of need is a token whose first real use
 * inherits a decision nobody made for it.
 *
 * **There is one theme and it is dark.** The grounds are near-black, the ink on
 * them is a step down from white, and every text-on-ground pairing the library
 * offers is measured in `contrast.ts` against the grounds it actually sits on.
 * A colour the library offers for text on a ground is safe there; a pairing the
 * library does not offer is not available.
 *
 * ## How colour is spent
 *
 * The palette is loud on purpose, and the loudness is placed rather than
 * banned. A surface written for parents, partners, safety or billing takes
 * amber as its single accent, on neutral grounds with grey for support: colour
 * arrives there only where a mark has a job — a state, a date, a name — and
 * decorative colour stays out, because calm surfaces are what carry
 * credibility. A surface telling a story to a mixed audience takes amber plus
 * one family, two accents at most. A surface built for gamers, the community,
 * the shop or the world itself takes the full palette; that is where the
 * loudness belongs.
 *
 * ## The rules that hold everywhere
 *
 * - Amber wins the primary call to action and the moments meant to feel like
 *   us.
 * - Violet sets the tone of the world, for electric, high-energy moments, and
 *   never for quiet, safety-focused or trust-building copy addressed to a
 *   parent.
 * - A family accents content; it is never the ground under a long passage of
 *   text.
 * - Never all six colours on one page. Amber plus one supporting family is the
 *   default.
 * - Text is ink, white, or a family's soft variant on a neutral ground — never
 *   coloured text on a coloured ground, and never at a ratio nobody measured.
 * - Meaning never travels by hue alone. A colour-coded element also carries a
 *   glyph and a label, because a meaningful share of gamers are colourblind.
 * - A brand colour exists at exactly the values authored below, never at an
 *   alpha step: over a near-black ground an alpha step composites to a darker,
 *   duller hue, so what the reader sees is no longer the brand. A ground that
 *   needs to lift goes to a neutral.
 *
 * These are opinions with no renderable form, which is why they are written
 * here rather than exported as data. Each one the API can enforce — a component
 * that takes a meaning instead of a hue, a variant that cannot be handed an
 * alpha — is enforced there instead of restated in a page.
 */

/** A six-digit uppercase hex colour. The only colour literal shape this package accepts. */
export type Hex = `#${string}`;

// ---------------------------------------------------------------- neutrals

/**
 * The neutrals the theme declares.
 *
 * Named as a union rather than derived from `NEUTRALS` below, so the object is
 * checked against the list instead of defining it: a neutral in one and not the
 * other is a compile error, and every entry is forced to satisfy the surface
 * contract rather than inferring its way out of it.
 */
export type NeutralId =
  | "background"
  | "foreground"
  | "card"
  | "mutedForeground"
  | "border";

/**
 * The neutrals a component **fills** — a ground with text on it — and so the
 * exact set that carries an `on`.
 *
 * Two, because two are what a page is built from: the page itself and the lift
 * a card takes off it. A third ground arrives with the component that needs one.
 */
type SurfaceId = "background" | "card";

/**
 * A surface names the token that reads *on* it; anything else does not.
 *
 * The split is the point. `on` is the surface contract — a ground and its text
 * are one decision rather than two — so a surface without one and a non-surface
 * that grows one both fail to compile, and `on` can only ever name a neutral
 * that exists.
 */
type NeutralEntry<Id extends NeutralId> = Id extends SurfaceId
  ? { readonly name: string; readonly hex: Hex; readonly on: NeutralId }
  : { readonly name: string; readonly hex: Hex };

/** The ground, the ink on it, and the greys between. */
export const NEUTRALS = {
  /**
   * The page. A soft near-black rather than pure black, which is harsh under a
   * full screen of type and reads as a hole rather than as a surface.
   */
  background: { name: "Ground", hex: "#121212", on: "foreground" },
  /**
   * Primary text. Not pure white: one step down, so a full page of body copy
   * does not glare against the near-black ground.
   */
  foreground: { name: "Ink", hex: "#EDEDED" },
  /**
   * Section backgrounds and cards — the one lift off the page, and the lighter
   * of the two grounds, which makes it the one every contrast measurement is
   * bound by. A colour safe here is safe on the page.
   */
  card: { name: "Card", hex: "#1A1A1A", on: "foreground" },
  /** Secondary text: captions, metadata, the line under a title. */
  mutedForeground: { name: "Muted ink", hex: "#A6A6A6" },
  /**
   * Borders and dividers. Furniture edges are neutral; colour arrives on an
   * edge only where the border is the construct.
   */
  border: { name: "Border", hex: "#333333" },
} as const satisfies { readonly [Id in NeutralId]: NeutralEntry<Id> };

// ------------------------------------------------------------- brand pair

/**
 * The two signature colours and the ink each one carries.
 *
 * A fill and its foreground are one decision, not two: amber is a light colour
 * and only a dark label reads on it, violet is a dark colour and only a light
 * label reads on it. A button that swaps its fill and keeps its label has not
 * changed colour, it has broken.
 */
export const BRAND = {
  /**
   * **Act.**
   *
   * The signature colour, and the one most associated with School of Gaming:
   * the logo badge, the primary call to action, the highlights and the moments
   * meant to feel like us. Amber always wins the main action.
   */
  primary: { name: "Amber", hex: "#FAA901", foreground: "#121212" },
  /**
   * **World.**
   *
   * The energy colour, the force that powers Sogverse. Launches, big news,
   * anything electric. It carries lore, display and identity, and nothing else:
   * it is never the colour of quiet, safety or trust-building copy written for
   * a parent.
   */
  secondary: { name: "Violet", hex: "#8F00E2", foreground: "#FFFFFF" },
} as const satisfies Record<
  string,
  { name: string; hex: Hex; foreground: Hex }
>;

export type BrandId = keyof typeof BRAND;

// ---------------------------------------------------------- Yty families

/**
 * The four Yty-Element colours, as the strong/soft pairs the brand fixes.
 *
 * Which variant a use reaches for is settled by measurement, not taste:
 * **strong fills, borders, rings and glows; soft carries text and glyphs.**
 * Wit is what makes that a rule rather than a habit — wit-strong clears the
 * glyph floor on both grounds and the body floor on neither — so wit's text and
 * ink always take soft, and the same recipe then holds for the other three so
 * that one rule covers the set. See `contrast.ts`.
 */
export const YTY_FAMILIES = {
  /**
   * **People.**
   *
   * The relationship with yourself: balance, emotional control, rest. Reach for
   * it for community, friendship and testimonials.
   */
  harmony: { name: "Harmony", hue: "Pink", strong: "#F55B9A", soft: "#FA7FA3" },
  /**
   * **Growth.**
   *
   * The relationship with others: empathy, kindness, belonging. Reach for it
   * for growth, milestones and progress.
   */
  glow: { name: "Glow", hue: "Green", strong: "#1AB061", soft: "#6AC66B" },
  /**
   * **Adventure.**
   *
   * The relationship with society: teamwork, innovation, civic courage. Reach
   * for it for challenges, camps and courage.
   */
  valor: { name: "Valor", hue: "Orange", strong: "#FD700D", soft: "#FF993D" },
  /**
   * **Knowledge.**
   *
   * The relationship with technology: critical thinking, media literacy. Reach
   * for it for learning, tips and how-to.
   */
  wit: { name: "Wit", hue: "Blue", strong: "#3A71DE", soft: "#4DB3F5" },
} as const satisfies Record<
  string,
  { name: string; hue: string; strong: Hex; soft: Hex }
>;

export type YtyFamilyId = keyof typeof YTY_FAMILIES;
