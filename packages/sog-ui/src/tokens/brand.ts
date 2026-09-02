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
 * one (a contrast ratio, an HSL triple, a composited tint) is computed by a
 * function whose output a test checks, never rounded by hand: the reference
 * branch's amber drifted a full shade off brand exactly once by hand-rounded
 * HSL, and that is the mistake this shape exists to make impossible.
 *
 * **The `role` and `usage` strings here are Guidebook quotations, and they are
 * documentation rather than product copy.** They exist so the demo can show
 * what a colour is *for* as data rather than as a paragraph. No component may
 * render one: the library ships no user-visible string (see the package's
 * CLAUDE.md, "Strings: every word is a prop").
 *
 * **The dark ground is the app's reading of a palette the Guidebook draws on
 * white**, an owner ruling recorded in `docs/brand-guidebook-deviations.md`
 * under "The dark-theme palette". Where a Guidebook value inverts on the dark
 * ground rather than carrying over, the entry says so in `deviation`.
 */

/** A six-digit uppercase hex colour. The only colour literal shape this package accepts. */
export type Hex = `#${string}`;

/**
 * Where a value came from, recorded beside it so a reader can tell a brand fact
 * from our reading of one.
 *
 * The Guidebook draws its palette on white and says nothing about a dark ground,
 * a focus ring, a status set or a radius scale. Those answers had to be invented,
 * and marking which is which is what keeps a later reader from citing us back to
 * the brand as though it were the brand's own ruling.
 */
export type Source =
  /** Stated in the School of Gaming Brand Voice & Identity Guidebook v2.0. */
  | "Guidebook"
  /** The dark-ground reading, settled by the design pass (`ref/brand-palette-design-pass`). */
  | "design pass"
  /** An owner decision, recorded in `docs/brand-guidebook-deviations.md`. */
  | "owner ruling";

/**
 * The grammar words. A colour family means one thing everywhere, and a
 * component that carries a family takes the *word*, never the hue — which is
 * what makes the wrong usage an impossible prop value rather than a comment.
 */
export type Tone =
  | "act"
  | "people"
  | "growth"
  | "knowledge"
  | "adventure"
  | "world";

export const TONES = [
  "act",
  "people",
  "growth",
  "knowledge",
  "adventure",
  "world",
] as const satisfies readonly Tone[];

// ---------------------------------------------------------------- neutrals

/**
 * The ground, the ink on it, and the greys between.
 *
 * `on` names the token that reads *on* this one, so a surface and its text are
 * one decision rather than two. The Guidebook's neutrals are drawn for a white
 * page — off-white cards, light-grey borders, mid-grey secondary text — and
 * each of ours is the same job read against the dark ground; `guidebook` names
 * the swatch it corresponds to so the inversion is legible rather than lost.
 */
export const NEUTRALS = {
  background: {
    name: "Ground",
    hex: "#121212",
    on: "foreground",
    role: "Primary background. The Guidebook's Ink — a soft near-black, never pure #000000 — read as the page rather than as the text.",
    guidebook: { swatch: "Ink #121212", role: "Primary text and the “black” of the black logo." },
    source: "Guidebook",
    deviation:
      "The Guidebook's primary background is White #FFFFFF. There is one theme and it is dark, so ink and white trade places — see “The dark-theme palette” in docs/brand-guidebook-deviations.md.",
  },
  foreground: {
    name: "Ink",
    hex: "#EDEDED",
    on: "background",
    role: "Primary text on the dark ground.",
    guidebook: { swatch: "White #FFFFFF", role: "Primary background." },
    source: "design pass",
    deviation:
      "Not pure white: #EDEDED sits one step down so a full page of body copy does not glare on the near-black ground.",
  },
  card: {
    name: "Card",
    hex: "#1A1A1A",
    on: "foreground",
    role: "Section backgrounds, cards.",
    guidebook: { swatch: "Off-white #F7F7F7", role: "Section backgrounds, cards." },
    deviation: null,
    source: "design pass",
  },
  muted: {
    name: "Muted",
    hex: "#262626",
    on: "mutedForeground",
    role: "The universal alert, banner and label-chip ground. The lightest surface in the set, so it is the binding one for every contrast measurement.",
    guidebook: null,
    deviation: null,
    source: "design pass",
  },
  mutedForeground: {
    name: "Muted ink",
    hex: "#A6A6A6",
    on: "background",
    role: "Secondary text, captions, metadata.",
    guidebook: { swatch: "Mid grey #9E9E9E", role: "Secondary text, captions, metadata." },
    deviation: null,
    source: "design pass",
  },
  accent: {
    name: "Accent",
    hex: "#212121",
    on: "foreground",
    role: "The neutral lift a hover or a selected row takes, so a brand colour never has to shade itself to signal state.",
    guidebook: null,
    deviation: null,
    source: "design pass",
  },
  border: {
    name: "Border",
    hex: "#333333",
    on: "foreground",
    role: "Borders, dividers, disabled states. Furniture edges are neutral; colour arrives on an edge only where the border is the construct.",
    guidebook: { swatch: "Light grey #EBEBEB", role: "Borders, dividers, disabled states." },
    deviation: null,
    source: "design pass",
  },
  input: {
    name: "Input",
    hex: "#333333",
    on: "foreground",
    role: "A form control's resting edge. Its own token rather than an alias, because validation moves it and furniture edges do not.",
    guidebook: null,
    deviation: null,
    source: "design pass",
  },
  ring: {
    name: "Ring",
    hex: "#FAA901",
    on: "background",
    role: "The focus ring. Amber, because focus is the act about to happen. The Guidebook gives no focus or keyboard-state guidance at all, so the hue is ours.",
    guidebook: null,
    deviation: null,
    source: "design pass",
  },
} as const;

export type NeutralId = keyof typeof NEUTRALS;

// ------------------------------------------------------------- brand pair

/**
 * The two signature colours and the ink each one carries.
 *
 * A fill and its foreground are one decision, not two: the amber is a light
 * colour and only a dark label reads on it, the violet is a dark colour and
 * only a light label reads on it. A button that swaps its fill and keeps its
 * label has not changed colour, it has broken.
 */
export const BRAND = {
  primary: {
    name: "Amber",
    tone: "act",
    hex: "#FAA901",
    foreground: "#121212",
    role: "The signature color. The logo badge, and the color most associated with School of Gaming. Primary accent: highlights, key CTAs, moments that should feel like us.",
    usage: "Amber always wins for the main call to action.",
    source: "Guidebook",
    deviation:
      "The Guidebook rules amber unsafe for text because it fails on white. On the dark ground it measures 9.58:1, so amber text and amber links are safe here — measured, not assumed.",
  },
  secondary: {
    name: "Violet",
    tone: "world",
    hex: "#8F00E2",
    foreground: "#FFFFFF",
    role: "The Energy color, the force that powers Sogverse. Use for high-energy, electric, exciting moments (launches, big news).",
    usage:
      "Not for quiet, safety, or trust-building parent content. It carries lore, display and identity, and nothing else.",
    source: "Guidebook",
    deviation: null,
  },
} as const;

export type BrandId = keyof typeof BRAND;

// ---------------------------------------------------------- Yty families

/**
 * The four Yty-Element colours, as the strong/soft pairs the brand fixes.
 *
 * Which variant a use reaches for is settled by measurement, not taste:
 * **strong fills, borders, rings and glows; soft carries text and glyphs.**
 * Wit is what makes that a rule rather than a habit — wit-strong measures
 * 3.31:1 on the lightest ground, clearing 3:1 for a glyph and missing 4.5:1 for
 * body copy — so wit's text and ink always take soft. See `contrast.ts`.
 */
export const YTY_FAMILIES = {
  harmony: {
    name: "Harmony",
    hue: "Pink",
    tone: "people",
    strong: "#F55B9A",
    soft: "#FA7FA3",
    relationship: "With yourself — balance, emotional control, rest.",
    role: "Harmony/pink for community, friendship, and testimonials.",
    source: "Guidebook",
  },
  glow: {
    name: "Glow",
    hue: "Green",
    tone: "growth",
    strong: "#1AB061",
    soft: "#6AC66B",
    relationship: "With others — empathy, kindness, belonging, friendship.",
    role: "Glow/green for growth, milestones, and progress.",
    source: "Guidebook",
  },
  valor: {
    name: "Valor",
    hue: "Orange",
    tone: "adventure",
    strong: "#FD700D",
    soft: "#FF993D",
    relationship: "With society — teamwork, innovation, civic courage.",
    role: "Valor/orange for challenges, camps, and courage.",
    source: "Guidebook",
  },
  wit: {
    name: "Wit",
    hue: "Blue",
    tone: "knowledge",
    strong: "#3A71DE",
    soft: "#4DB3F5",
    relationship: "With technology — critical thinking, media literacy.",
    role: "Wit/blue for learning, tips, and how-to.",
    source: "Guidebook",
  },
} as const;

export type YtyFamilyId = keyof typeof YTY_FAMILIES;

/** Every family a tone can name — the four Yty elements plus the two signature colours. */
export type FamilyId = YtyFamilyId | BrandId;

/**
 * The grammar, as a lookup. A caller holding a `Tone` gets the family that
 * carries it; nothing chooses a hue directly.
 */
export const TONE_TO_FAMILY = {
  act: "primary",
  people: "harmony",
  growth: "glow",
  knowledge: "wit",
  adventure: "valor",
  world: "secondary",
} as const satisfies Record<Tone, FamilyId>;

/** True for the four Yty elements, which are the families that have a strong/soft pair. */
export function isYtyFamilyId(id: FamilyId): id is YtyFamilyId {
  return id in YTY_FAMILIES;
}

// -------------------------------------------------------------- statuses

/**
 * The four status fills and the ink each carries.
 *
 * `success` and `info` are not colours of their own: they converge onto
 * glow-strong and wit-strong, so the palette carries one green and one blue
 * with one meaning each rather than a status colour sitting a step away from an
 * element colour nobody can tell it from. `warning` was moved off amber and
 * into an orange, because the amber it replaced sat close enough to the brand
 * primary to be read as it; the resulting nearness to valor is accepted,
 * because a warning mark always carries a glyph and hue alone is never the
 * signal.
 *
 * **The whole set is ours.** The Guidebook states no error, success or warning
 * semantics — and its "text is always ink or white" rule forbids the usual
 * coloured-error-text answer outright — so every value here is the design pass's,
 * and none of it may be cited back to the brand as a brand ruling.
 */
export const STATUS = {
  success: {
    name: "Success",
    hex: "#1AB061",
    foreground: "#121212",
    role: "Converged onto glow-strong — one green, one meaning.",
    source: "design pass",
    /**
     * The reference branch pairs this fill with white, which measures 2.83:1 and
     * clears neither the 4.5:1 body floor nor the 3:1 glyph floor. Its own
     * button recipe fills glow with dark ink at 6.63:1, so dark ink is what the
     * palette actually ships and what is recorded here. Flagged to the owner as
     * a value corrected by measurement rather than carried over.
     */
    deviation:
      "Dark ink, not the white the reference branch's --success-foreground carries: white on this green is 2.83:1 and fails both thresholds.",
  },
  info: {
    name: "Info",
    hex: "#3A71DE",
    foreground: "#FFFFFF",
    role: "Converged onto wit-strong — one blue, one meaning.",
    source: "design pass",
    deviation: null,
  },
  warning: {
    name: "Warning",
    hex: "#E2761B",
    foreground: "#121212",
    role: "An orange rather than an amber, so a warning can never be read as the brand's act colour.",
    source: "design pass",
    deviation: null,
  },
  destructive: {
    name: "Destructive",
    hex: "#EF4444",
    foreground: "#FFFFFF",
    role: "Deletion, irreversible actions and form validation.",
    source: "design pass",
    /**
     * White on this red measures 3.76:1 — over the 3:1 glyph floor, under the
     * 4.5:1 body floor a button label sits at. The design pass ruled
     * destructive's classes untouched, so the value is carried rather than
     * retuned, and the shortfall is recorded in `contrast.ts` where it is
     * measurable instead of remembered.
     */
    deviation:
      "White on this red is 3.76:1 — a real AA miss on a body-size label, inherited from a value the design pass ruled untouched. Flagged, not laundered.",
  },
} as const;

export type StatusId = keyof typeof STATUS;

// ---------------------------------------------------------------- radius

/**
 * The corner scale, in CSS pixels. `lg` is the base every other step is an
 * offset from, and it is what an unqualified rounded corner takes.
 *
 * **The scale is ours.** The Guidebook has no radius scale — it suggests 4-8px
 * for a button, calls chips "pill" and cards "rounded rectangles", and adds
 * "confirm final specs in the design system". The four steps below bracket the
 * suggestion, with `xl` reserved for the largest surfaces (a dialog, a hero
 * card) where 8px reads as a square corner at size.
 */
export const RADIUS_SCALE = [
  { id: "sm", px: 4, source: "design pass" },
  { id: "md", px: 6, source: "design pass" },
  { id: "lg", px: 8, source: "design pass" },
  { id: "xl", px: 12, source: "design pass" },
] as const satisfies readonly { id: string; px: number; source: Source }[];

export type RadiusId = (typeof RADIUS_SCALE)[number]["id"];

/** The Guidebook's own words on corner radius, kept beside the scale it justifies. */
export const RADIUS_GUIDANCE =
  "Suggested radius 4-8px (slightly rounded, not pill).";

// ------------------------------------------------------- how colour is spent

/**
 * The Guidebook rations colour by lore level, and the reason is register: a
 * parent-facing surface awash in six vivid hues undercuts the calm, credible
 * voice the quiet levels are written in. The loudness is not banned, it is
 * placed.
 *
 * Typed as data rather than written as a paragraph so the demo can render the
 * rationing as a table a reader can scan, which is the whole point of a level.
 *
 * **Levels 0-1 are followed in spirit and not to the letter.** The owner ruled
 * the palette comes in on billing, safeguarding and legal surfaces wherever a
 * mark has a job — a status chip, a date, a name — while colour that is merely
 * decorative still stays out. That is the "calm ring" Rejection in
 * `docs/brand-guidebook-deviations.md`, and `restraint` below is what we
 * actually hold ourselves to.
 */
export const LORE_LEVELS = [
  {
    id: "0-1",
    audience: "Parents, partners, safety, billing",
    allowance: "Amber as the single accent",
    rule: "Ink text, neutral grounds, grey for support. Introduce a second palette colour only with intent. Calm surfaces carry credibility.",
    restraint:
      "Colour with a job comes in — a status chip, a date, a name. Decorative colour stays out.",
  },
  {
    id: "2",
    audience: "Families, story to a mixed audience",
    allowance: "Amber plus one palette family",
    rule: "Two accents maximum.",
    restraint: null,
  },
  {
    id: "3",
    audience: "Gamers, community, store, in-world",
    allowance: "The full palette",
    rule: "This is where the loudness belongs.",
    restraint: null,
  },
] as const;

export type LoreLevelId = (typeof LORE_LEVELS)[number]["id"];

/**
 * The colour rules that hold at every level, quoted from the Guidebook, with a
 * note wherever the dark ground changes what the rule means in practice.
 */
export const COLOUR_RULES = [
  {
    rule: "Amber always wins for primary CTAs and brand moments.",
    onDarkGround: null,
    source: "Guidebook",
  },
  {
    rule: "Violet sets the tone of the Sogverse world, for electric, high-energy moments. Never for quiet, safety-focused, or trust-building parent content.",
    onDarkGround: null,
    source: "Guidebook",
  },
  {
    rule: "Yty-Element colours accent content, they are not backgrounds for long text.",
    onDarkGround: null,
    source: "Guidebook",
  },
  {
    rule: "Never use all six colours on one page. Amber plus one supporting colour is the default.",
    onDarkGround: null,
    source: "Guidebook",
  },
  {
    rule: "Text is always ink or white, never coloured text on a coloured background.",
    onDarkGround:
      "The ban is on a coloured ground under coloured text. Our grounds are neutral, so a family's soft variant carries text on them — at a measured ratio, never an assumed one.",
    source: "Guidebook",
  },
  {
    rule: "Never carry meaning by color alone. A color-coded element also needs a label, because a meaningful share of gamers are colorblind.",
    onDarkGround: null,
    source: "Guidebook",
  },
  {
    rule: "A brand colour exists at exactly the values it was authored at, never at an alpha step.",
    onDarkGround:
      "An expansion on the Guidebook: over a near-black ground an alpha step composites to a darker, duller hue, so what the reader sees is no longer the brand. A ground that needs to lift goes to a neutral.",
    source: "design pass",
  },
] as const;
