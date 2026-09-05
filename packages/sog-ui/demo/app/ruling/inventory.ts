/**
 * Every colour Sogverse defines today, what it is worth, and what is proposed
 * for it.
 *
 * This is a temporary file behind a temporary page: it exists so an owner can
 * rule on the theme adoption by looking, and it is deleted with the page once
 * the ruling is made. Nothing here is a token and nothing here is imported by
 * the library — the hexes below are Sogverse's current values and this page's
 * candidates, written out so the two can be drawn side by side.
 *
 * **Where the "today" hexes come from.** Sogverse authors its theme as HSL
 * triples in `src/app/globals.css`. Each hex below is that triple converted at
 * eight bits per channel, which is what the browser renders — so `0 0% 15%` is
 * `#262626` here rather than a value read off a screenshot.
 *
 * **Where the use counts come from.** Regenerate them rather than trusting the
 * numbers, which are a snapshot:
 *
 *     grep -rEoh "(bg|text|border|ring|from|to|via|fill|stroke|outline|shadow|decoration|divide|caret|placeholder|accent)-<token>(/[0-9]+)?([^a-zA-Z0-9/_-]|$)" src --include=*.tsx --include=*.ts | wc -l
 *     grep -rEoh "var\(--color-<token>\)" src --include=*.tsx --include=*.ts --include=*.css | wc -l
 *
 * **The bug that changes what "today" means.** `src/app/globals.css` carries an
 * unlayered `* { border-color: hsl(var(--border)) }`, which outranks every
 * `border-*` utility because utilities live in a cascade layer. So no coloured
 * border in Sogverse has ever rendered: `border-yty-harmony/30`,
 * `border-destructive/50` and the rest have all drawn the grey `--border`. This
 * page therefore draws two "today" columns wherever a coloured border is
 * authored — what the code says, and what the reader has actually been seeing.
 */

export type Fate =
  /** The library already ships this exact value under this exact name. */
  | "already"
  /** Sogverse's token duplicates a library token's value; the call sites move to that name. */
  | "alias"
  /** A value the library does not have and should take unchanged. */
  | "admit"
  /** A value the library should take, but not at the number it has today. */
  | "retune"
  /** A choice this page exists to put in front of the owner. */
  | "ruling"
  /** Defined and unused — deleted rather than moved. */
  | "delete";

export interface TokenRow {
  /** The Tailwind token, without the `--color-` prefix. */
  readonly token: string;
  /** What the browser paints for it today. */
  readonly today: string;
  /** Utility-class uses in `src/`, at the time of writing. */
  readonly uses: number;
  readonly fate: Fate;
  /** One line: the proposal, and what settles it. */
  readonly note: string;
}

/** Sogverse's neutrals, which the library already owns at identical values. */
export const NEUTRAL_ROWS: readonly TokenRow[] = [
  {
    token: "background",
    today: "#121212",
    uses: 63,
    fate: "already",
    note: "The library's Ground, to the byte.",
  },
  {
    token: "foreground",
    today: "#EDEDED",
    uses: 176,
    fate: "already",
    note: "The library's Ink, to the byte.",
  },
  {
    token: "card",
    today: "#1A1A1A",
    uses: 45,
    fate: "already",
    note: "The library's Card, to the byte.",
  },
  {
    token: "muted-foreground",
    today: "#A6A6A6",
    uses: 713,
    fate: "already",
    note: "The library's Muted ink, to the byte. The single most-used colour in the app.",
  },
  {
    token: "border",
    today: "#333333",
    uses: 154,
    fate: "already",
    note: "The library's Border, to the byte.",
  },
  {
    token: "primary",
    today: "#FAA901",
    uses: 226,
    fate: "already",
    note: "Amber. Sogverse keeps the fractional HSL triple precisely so it round-trips to this hex.",
  },
  {
    token: "primary-foreground",
    today: "#121212",
    uses: 21,
    fate: "already",
    note: "Ink on amber.",
  },
  {
    token: "secondary",
    today: "#8F00E2",
    uses: 19,
    fate: "already",
    note: "Violet.",
  },
  {
    token: "secondary-foreground",
    today: "#FFFFFF",
    uses: 7,
    fate: "already",
    note: "White on violet.",
  },
  {
    token: "card-foreground",
    today: "#EDEDED",
    uses: 1,
    fate: "alias",
    note: "Same value as foreground; the library already emits the alias.",
  },
  {
    token: "muted",
    today: "#262626",
    uses: 171,
    fate: "admit",
    note: "A second lift above the card. The library has no neutral here and needs one.",
  },
  {
    token: "accent",
    today: "#212121",
    uses: 70,
    fate: "admit",
    note: "The hover ground, one step under muted. Also new to the library.",
  },
  {
    token: "accent-foreground",
    today: "#EDEDED",
    uses: 33,
    fate: "alias",
    note: "Same value as foreground. Not a token, a second name for one.",
  },
  {
    token: "popover",
    today: "#1A1A1A",
    uses: 6,
    fate: "alias",
    note: "Byte-identical to card. A popover is a card that floats.",
  },
  {
    token: "popover-foreground",
    today: "#EDEDED",
    uses: 2,
    fate: "alias",
    note: "Same value as foreground.",
  },
  {
    token: "input",
    today: "#333333",
    uses: 81,
    fate: "alias",
    note: "Byte-identical to border. A field's edge is an edge.",
  },
  {
    token: "ring",
    today: "#FAA901",
    uses: 55,
    fate: "alias",
    note: "Byte-identical to primary. The focus ring is the act colour.",
  },
];

/** The sidebar's seven, all but one of which are another neutral under a second name. */
export const SIDEBAR_ROWS: readonly TokenRow[] = [
  {
    token: "sidebar-background",
    today: "#171717",
    uses: 2,
    fate: "ruling",
    note: "The only sidebar value that is its own. It sits between background (#121212) and card (#1A1A1A).",
  },
  {
    token: "sidebar-foreground",
    today: "#EDEDED",
    uses: 3,
    fate: "alias",
    note: "foreground.",
  },
  {
    token: "sidebar-primary",
    today: "#FAA901",
    uses: 1,
    fate: "alias",
    note: "primary.",
  },
  {
    token: "sidebar-primary-foreground",
    today: "#121212",
    uses: 1,
    fate: "alias",
    note: "primary-foreground.",
  },
  {
    token: "sidebar-accent",
    today: "#262626",
    uses: 2,
    fate: "alias",
    note: "muted — not accent, despite the name.",
  },
  {
    token: "sidebar-accent-foreground",
    today: "#EDEDED",
    uses: 2,
    fate: "alias",
    note: "foreground.",
  },
  {
    token: "sidebar-border",
    today: "#333333",
    uses: 3,
    fate: "alias",
    note: "border.",
  },
];

/** A status colour as Sogverse defines it, and the candidate this page proposes. */
export interface StatusRow {
  readonly id: string;
  readonly label: string;
  /** Today's fill. */
  readonly today: string;
  /** Today's label colour on that fill. */
  readonly todayForeground: string;
  readonly uses: number;
  /** The candidate fill. */
  readonly candidate: string;
  /** Which library colour it sits nearest in hue, and how far. */
  readonly collidesWith: { readonly name: string; readonly hex: string };
  /** Why this candidate, in one line the owner can argue with. */
  readonly why: string;
}

/**
 * The four status colours, today and retuned.
 *
 * Three findings shape every candidate below.
 *
 * **One.** Three of the four foregrounds fail the body floor outright today:
 * white on destructive is 3.78:1, white on info 3.48:1, white on success
 * 2.52:1. Only warning's dark label passes. That is not a near miss, it is the
 * wrong label colour on a light fill — exactly the mistake the library's brand
 * pair exists to prevent ("amber is light and takes only a dark label"). So
 * every candidate takes ink, and the white foregrounds go.
 *
 * **Two.** Ink is the same hex as the page ground, so one measurement settles
 * two uses: a status colour that clears 4.5:1 against the card also clears it
 * as a fill under ink. Every candidate is therefore tuned against the card, the
 * lighter of the two grounds, and is then safe as text, as a glyph and as a
 * fill.
 *
 * **Three.** There is no free hue for info. Wit owns blue at 204 and 220, the
 * product palette owns cyan at 191 and indigo at 243; a blue that reads as
 * information is inside that range wherever it is put. The candidate is
 * honest about it rather than pretending a few degrees fixes it, and the
 * alternative — an informational note drawn as a neutral panel with a glyph and
 * no hue at all — is rendered beside it.
 */
export const STATUS_ROWS: readonly StatusRow[] = [
  {
    id: "destructive",
    label: "Destructive",
    today: "#EF4343",
    todayForeground: "#FFFFFF",
    uses: 160,
    candidate: "#FF5C5C",
    collidesWith: { name: "Valor strong", hex: "#FD700D" },
    // Red is the one status hue with room: valor's orange is 25 degrees away
    // and harmony's pink 18, and red reads as neither. What moves is the value,
    // not the hue — today's #EF4343 clears the card by only 0.10, so a dark
    // label on it lands at 4.95 with nothing to spare and the text variant is
    // borderline everywhere. Lifting it to #FF5C5C buys 1.2 on both.
    why: "Hue held at red, value lifted so both the text use and the ink label clear the body floor with room.",
  },
  {
    id: "success",
    label: "Success",
    today: "#2EB88A",
    todayForeground: "#FFFFFF",
    uses: 85,
    candidate: "#1FC79B",
    collidesWith: { name: "Glow strong", hex: "#1AB061" },
    // Glow is the growth family and its strong variant is a leaf green at 148.
    // Today's success sits at 160, twelve degrees off it — close enough that a
    // success chip beside a Glow badge reads as the same fact twice. Pushing to
    // 164 and lifting the value turns it into a teal-green that still reads as
    // "done" and no longer reads as Glow.
    why: "Pushed off Glow's leaf green toward teal, so a success mark and a Glow mark are not the same colour.",
  },
  {
    id: "info",
    label: "Info",
    today: "#308CE8",
    todayForeground: "#FFFFFF",
    uses: 57,
    candidate: "#5FA8FF",
    collidesWith: { name: "Wit soft", hex: "#4DB3F5" },
    // Wit soft is 204 and wit strong 220; today's info is 210, sitting between
    // them. No blue escapes that, so the candidate does not pretend to: it only
    // fixes the legibility (white 3.48 becomes ink 7.61) and leaves the hue
    // question to the alternative rendered beside it.
    why: "No free blue exists. The candidate fixes the label and leaves the collision; the neutral alternative beside it removes the hue instead.",
  },
  {
    id: "warning",
    label: "Warning",
    today: "#E7B008",
    todayForeground: "#121212",
    uses: 75,
    candidate: "#DFCB25",
    collidesWith: { name: "Amber (primary)", hex: "#FAA901" },
    // The worst collision in the set: warning at 45 against the brand's act
    // colour at 40. A warning badge and a call to action are the same colour,
    // which is the one confusion the tone grammar cannot afford. Moving to 54
    // and dropping the saturation turns it into a caution yellow that is
    // visibly not the brand gold; going further lands in chartreuse, which
    // stops reading as caution at all.
    why: "Moved off the brand amber toward a caution yellow, because a warning must not read as a call to action.",
  },
];

/** Sogverse's four Yty hues today, and the library family that replaces each. */
export interface YtyRow {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  /** Sogverse's single hue, spent at alpha steps. */
  readonly today: string;
  readonly strong: string;
  readonly soft: string;
  readonly uses: number;
}

/**
 * The four elements.
 *
 * The names and descriptions are the canonical English from Sogverse's Yty
 * constants; the app renders the same words from its message catalogue.
 *
 * Every one of the four changes hue family, not shade: Harmony goes green to
 * pink, Glow amber to green, Valor pink to orange, Wit violet to blue. Two of
 * today's four are also collisions the library's set removes — today's Glow
 * (#FBBF24) is within a few degrees of the brand amber, and today's Wit
 * (#A78BFA) is a violet sitting beside the brand's own.
 */
export const YTY_ROWS: readonly YtyRow[] = [
  {
    id: "harmony",
    name: "Harmony",
    description: "Your relationship with yourself",
    today: "#34D399",
    strong: "#F55B9A",
    soft: "#FA7FA3",
    uses: 8,
  },
  {
    id: "glow",
    name: "Glow",
    description: "Your relationship with others",
    today: "#FBBF24",
    strong: "#1AB061",
    soft: "#6AC66B",
    uses: 8,
  },
  {
    id: "valor",
    name: "Valor",
    description: "Your relationship with society",
    today: "#FB7185",
    strong: "#FD700D",
    soft: "#FF993D",
    uses: 8,
  },
  {
    id: "wit",
    name: "Wit",
    description: "Your relationship with technology",
    today: "#A78BFA",
    strong: "#3A71DE",
    soft: "#4DB3F5",
    uses: 8,
  },
];

/** A named entry in a categorical palette. */
export interface PaletteEntry {
  readonly token: string;
  readonly label: string;
  readonly hex: string;
}

/** The four admin product types. Two utility uses each — a glyph tint and a tile wash. */
export const PRODUCT_PALETTE: readonly PaletteEntry[] = [
  { token: "product-consumer-club", label: "Consumer club", hex: "#20C4E9" },
  { token: "product-municipality-club", label: "Municipality club", hex: "#EB70D0" },
  { token: "product-camp", label: "Camp", hex: "#74C639" },
  { token: "product-event", label: "Event", hex: "#938EF6" },
];

/** The sixteen voice-zone colours a moderator picks from. Four utility uses each, plus a glow var. */
export const ZONE_PALETTE: readonly PaletteEntry[] = [
  { token: "zone-red", label: "Red", hex: "#F4504E" },
  { token: "zone-orange", label: "Orange", hex: "#FB8B3C" },
  { token: "zone-amber", label: "Amber", hex: "#F7A31F" },
  { token: "zone-yellow", label: "Yellow", hex: "#E8C21F" },
  { token: "zone-lime", label: "Lime", hex: "#9FC92E" },
  { token: "zone-green", label: "Green", hex: "#46CF5A" },
  { token: "zone-emerald", label: "Emerald", hex: "#18CF86" },
  { token: "zone-teal", label: "Teal", hex: "#1CCCBE" },
  { token: "zone-cyan", label: "Cyan", hex: "#25CFEE" },
  { token: "zone-sky", label: "Sky", hex: "#38B0F7" },
  { token: "zone-blue", label: "Blue", hex: "#5B86F0" },
  { token: "zone-indigo", label: "Indigo", hex: "#7A72F5" },
  { token: "zone-violet", label: "Violet", hex: "#A36BF6" },
  { token: "zone-purple", label: "Purple", hex: "#C45FF2" },
  { token: "zone-fuchsia", label: "Fuchsia", hex: "#E85FE0" },
  { token: "zone-pink", label: "Pink", hex: "#F767A8" },
];

/** Colours Sogverse spells inline, with no token behind them at all. */
export interface LooseColour {
  readonly label: string;
  readonly value: string;
  readonly where: string;
  readonly uses: number;
  readonly proposal: string;
}

export const LOOSE_COLOURS: readonly LooseColour[] = [
  {
    label: "Scrim",
    value: "#000000",
    where: "bg-black/50 on the dialog and sheet overlays; bg-black/60 on a profile tile's busy state",
    uses: 3,
    proposal: "A named neutral the library owns, with one opacity rather than two.",
  },
  {
    label: "Media ground",
    value: "#000000",
    where: "bg-black behind a shared screen",
    uses: 1,
    proposal: "A named neutral. True black is right behind video and wrong as a page ground.",
  },
  {
    label: "On-media ink",
    value: "#FFFFFF",
    where: "text-white on a busy tile and on a zone colour swatch",
    uses: 2,
    proposal: "A named neutral: the ink that reads on a scrim or a saturated swatch, where the app's Ink is too dim.",
  },
  {
    label: "Klingon red",
    value: "#DD0000",
    where: "the tlh easter egg's heading, table rules and code column",
    uses: 6,
    proposal: "Artwork carrying its own palette — the Empire's flag, not the brand's. Stays out of the library.",
  },
  {
    label: "Klingon ground",
    value: "#0A0A0A",
    where: "the tlh easter egg's card",
    uses: 1,
    proposal: "Same exemption as above.",
  },
  {
    label: "Easter-egg ink",
    value: "#FFFFFF",
    where: "text-white/30 to /70 across the tlh easter egg's table",
    uses: 8,
    proposal: "Not artwork — ordinary secondary text drawn from a colour the palette does not name. Muted ink instead.",
  },
  {
    label: "Identicon white",
    value: "#FFFFFF",
    where: "the third cell colour, beside amber and violet",
    uses: 1,
    proposal: "Ink (#EDEDED), which is what every other light mark in the product is drawn in.",
  },
  {
    label: "Identicon ground",
    value: "#000000",
    where: "the square behind the cells",
    uses: 1,
    proposal: "Ground (#121212), so an avatar is a hole in the page rather than a hole in the theme.",
  },
  {
    label: "Lynx cyan",
    value: "#009FE3",
    where: "the Lynx Educate wordmark in the OG marks and the two partner SVGs",
    uses: 6,
    proposal: "A partner's mark colour, not ours. It must not enter the palette — recolouring it is what the partner rules forbid.",
  },
];

/** One Press Start 2P placement, the copy it renders, and what is proposed for it. */
export interface FaceSite {
  readonly where: string;
  readonly copy: string;
  /** The library step proposed for it. */
  readonly step: string;
  /** The Tailwind utility for that step. */
  readonly stepClass: string;
  /** Whether the platform is naming one of its own places, which is Space Mono's whole remit. */
  readonly worldVoice: boolean;
  readonly why: string;
}

/**
 * Every site that sets `font-display`, with the English it renders.
 *
 * The copy is verbatim from `messages/en.json`, with the rich-text tags
 * resolved: `<br>` becomes a line break, and `<primary>` / `<secondary>` mark
 * the words the app tints amber and violet. Two sites render the *same* string
 * — the home hero and the call-ended screen both draw `home.hero.title` — which
 * is why the vision statement appears twice.
 */
export const FACE_SITES: readonly FaceSite[] = [
  {
    where: "Home hero, h1",
    copy: "Where\nScreen Time\nBecomes\nQuality Time",
    step: "H1",
    stepClass: "text-h1",
    worldVoice: false,
    why: "The brand's vision statement, spoken to a stranger. The hero step is what it is for; the pixel face made a promise about calm gaming look like an arcade cabinet.",
  },
  {
    where: "Gamer dashboard greeting, h2",
    copy: "Welcome, Aino!",
    step: "H2",
    stepClass: "text-h2",
    worldVoice: false,
    why: "A greeting naming a child, not a place. The app face reads it as a welcome; the pixel face makes a name that a translator cannot shorten overflow at 360.",
  },
  {
    where: "Roblox hero, h1",
    copy: "Build It\nPlay It\nOwn It",
    step: "H1",
    stepClass: "text-h1",
    worldVoice: false,
    why: "A partner page, and a slogan about the programme rather than about Sogverse. The two size scales the pixel face forced (English fits at 8 characters, French does not) go with it.",
  },
  {
    where: "Call ended screen, h2",
    copy: "Where\nScreen Time\nBecomes\nQuality Time",
    step: "H3",
    stepClass: "text-h3",
    worldVoice: false,
    why: "The same vision statement, inside a card rather than across a page, so it takes the card step rather than the hero one.",
  },
  {
    where: "Admin all-clear, card title",
    copy: "All clear",
    step: "H3",
    stepClass: "text-h3",
    worldVoice: false,
    why: "A card title that is fighting its own component today — leading, tracking and size are all cancelling what the pixel face does to a heading. At the card step none of that is needed.",
  },
  {
    where: "Admin all-clear, the line beside it",
    copy: "Sogverse is at peace. You may rest now, admin adventurer.",
    step: "Body S",
    stepClass: "text-body-s",
    worldVoice: true,
    why: "Not a `font-display` site today, but the one line on the list where the platform names its own place and addresses a reader inside it. If Space Mono is ever spent in the app, this is the sentence it was written for.",
  },
];

/**
 * The `font-mono` sites, which are not part of this ruling.
 *
 * The library keeps `--font-mono` as Tailwind's own utility for machine text so
 * it cannot silently become branded. Every site below is machine text — a room
 * code, a Minecraft credential, a raw JSON dump — and the proposal is that they
 * all stay exactly as they are.
 */
export const MONO_SITES: readonly string[] = [
  "Instant-room join code chip and the room-not-found screen",
  "Minecraft password-reset card and its copy button",
  "A marketing id echoed back on the admin user card",
  "The admin testing page's two raw output panes",
  "The Klingon easter egg's transliteration column",
];

/**
 * Identicon fixtures.
 *
 * Real generated UUIDs, hardcoded as literals: the identicon derives its grid
 * and its per-cell colours from the id's hex bytes, so a readable stand-in
 * renders a degenerate pattern rather than a different-looking one, and a
 * generator called at render time gives the same person a different face on
 * every reload.
 */
export const IDENTICON_IDS: readonly string[] = [
  "f6c7f52f-f644-4d2b-aee6-ffa5cbbe3a09",
  "45f1d090-c4e6-432c-852d-d5c3a159d994",
  "9a328d11-3fe2-41f4-8698-183caee9c0ac",
  "fdab6467-8c20-4be8-87ee-a148824c119e",
];
