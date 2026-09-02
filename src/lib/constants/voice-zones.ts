import {
  Home,
  Rocket,
  Gamepad2,
  Flame,
  Droplet,
  Sailboat,
  Ghost,
  Birdhouse,
  Anvil,
  Axe,
  Bone,
  BowArrow,
  Box,
  Castle,
  LandPlot,
  Pickaxe,
  Skull,
  Sprout,
  Swords,
  Wand,
  Wrench,
  Shovel,
  Joystick,
  Dices,
  Puzzle,
  Bot,
  Cat,
  Dog,
  Rabbit,
  Rat,
  Turtle,
  Bird,
  Fish,
  Rainbow,
  Snowflake,
  TreePine,
  Flower2,
  Mountain,
  Pizza,
  IceCream,
  Coffee,
  type LucideIcon,
} from "lucide-react";
import { YTY_ELEMENTS, type YtyElementId } from "./yty";

/**
 * The discrete-zone voice model (see src/components/voice/CLAUDE.md).
 *
 * A participant is simply "in zone X" — no coordinates. There are four *kinds*
 * of zone; only the custom/locked kind is persisted (in `voice_zones`). Lobby
 * and the 4 Yty elements are virtual/hardcoded here and rendered the same way
 * everywhere, including instant rooms (which get lobby + Yty only — no group to
 * tie custom zones to).
 *
 * Every zone has a stable string `zoneId`, stamped onto a participant's Daily
 * `userData` for normal zones:
 *   - Lobby           → "lobby"
 *   - Yty             → "yty-harmony" | "yty-glow" | "yty-valor" | "yty-wit"
 *   - Custom / locked → the voice_zones.id UUID
 */

export const LOBBY_ZONE_ID = "lobby";

/** Default zone every participant joins into until their `userData` says otherwise. */
export const DEFAULT_ZONE_ID = LOBBY_ZONE_ID;

/** Yty zone ids, derived from the canonical element list so they can't drift. */
export const YTY_ZONE_IDS = YTY_ELEMENTS.map(
  (e) => `yty-${e.id}` as const,
);
export type YtyZoneId = (typeof YTY_ZONE_IDS)[number];

/**
 * Avatar pixel size. Relocated here from the deleted spatial config so
 * `VoiceAvatar` keeps a single source of truth for its dimensions after the
 * spatial canvas is gone.
 */
export const AVATAR_SIZE = 56;

// ---------------------------------------------------------------------------
// Custom-zone palette — the icons + colors a moderator can pick, chosen to be
// instantly recognizable to a 7-year-old.
//
// THIS IS THE SOURCE OF TRUTH for the valid icon/color sets. The `voice_zones`
// `icon`/`color` columns are plain `text` (not DB enums), so adding, removing,
// or renaming an entry here is a pure code change — no migration. The KEYS tuple
// drives both the type and the picker order; the map below must cover exactly
// those keys (the `Record<…>` type enforces it, so the two can't drift). The
// renderer falls back to a default glyph/color for any key not in the map
// (`zoneIconFor` / `zoneColorFor`), so a row pointing at a removed key is safe.
// ---------------------------------------------------------------------------

/** Ordered icon keys — source of truth for the valid set and picker order.
 *  Grouped by category so the picker reads as a tidy 8-per-row grid. */
export const VOICE_ZONE_ICON_KEYS = [
  // Play & gaming
  "rocket", "gamepad", "joystick", "dice", "puzzle", "robot",
  // Tools & building
  "wrench", "pickaxe", "axe", "shovel", "anvil", "box",
  // Adventure & fantasy
  "swords", "bow-arrow", "wand", "castle", "skull", "bone", "birdhouse", "ghost",
  // Animals
  "cat", "dog", "rabbit", "rat", "turtle", "bird", "fish",
  // Plants & terrain
  "sprout", "tree", "flower", "mountain", "land-plot",
  // Weather & elements
  "flame", "droplet", "rainbow", "snowflake",
  // Food & leisure
  "pizza", "ice-cream", "coffee", "sailboat",
] as const;

/** A custom-zone icon key — derived from the key tuple so the type can't drift. */
export type VoiceZoneIcon = (typeof VOICE_ZONE_ICON_KEYS)[number];

// Same grouping/order as VOICE_ZONE_ICON_KEYS above.
export const VOICE_ZONE_ICONS: Record<VoiceZoneIcon, LucideIcon> = {
  // Play & gaming
  rocket: Rocket,
  gamepad: Gamepad2,
  joystick: Joystick,
  dice: Dices,
  puzzle: Puzzle,
  robot: Bot,
  // Tools & building
  wrench: Wrench,
  pickaxe: Pickaxe,
  axe: Axe,
  shovel: Shovel,
  anvil: Anvil,
  box: Box,
  // Adventure & fantasy
  swords: Swords,
  "bow-arrow": BowArrow,
  wand: Wand,
  castle: Castle,
  skull: Skull,
  bone: Bone,
  birdhouse: Birdhouse,
  ghost: Ghost,
  // Animals
  cat: Cat,
  dog: Dog,
  rabbit: Rabbit,
  rat: Rat,
  turtle: Turtle,
  bird: Bird,
  fish: Fish,
  // Plants & terrain
  sprout: Sprout,
  tree: TreePine,
  flower: Flower2,
  mountain: Mountain,
  "land-plot": LandPlot,
  // Weather & elements
  flame: Flame,
  droplet: Droplet,
  rainbow: Rainbow,
  snowflake: Snowflake,
  // Food & leisure
  pizza: Pizza,
  "ice-cream": IceCream,
  coffee: Coffee,
  sailboat: Sailboat,
};

/** A custom-zone color, expressed as six literal class strings (never built by
 *  string templating, so Tailwind's source scanner can see every utility):
 *  - `tile`   — soft-tint background for the zone-card icon tile (`bg-zone-X/15`)
 *  - `border` — the icon tile's edge. The Yty zones draw the ruled accent tile
 *               (tint ground, full-value family edge, soft glyph), so theirs is
 *               the element's own colour; lobby and the custom palette take the
 *               neutral `border-border`, because their colour is a moderator's
 *               label rather than a brand family and a second edge colour per
 *               zone would compete with the active card's own coloured border
 *  - `glyph`  — the icon color (`text-zone-X`), readable on the dark ground
 *  - `ring`   — the picker's selection ring (`ring-zone-X`)
 *  - `glow`   — the active-zone treatment: the shared `.zone-glow` class (the
 *               inset-shadow geometry, defined once in globals.css) plus an
 *               arbitrary-property class binding this color into `--glow-color`,
 *               so the color spills in from the border and fades toward center
 *  - `solid`  — the full-saturation fill (`bg-zone-X`) the picker shows as a
 *               vibrant swatch (the card uses the soft `tile` tint instead) */
export interface ZoneColorClasses {
  tile: string;
  border: string;
  glyph: string;
  ring: string;
  glow: string;
  solid: string;
}

/** The neutral tile edge every non-Yty zone takes. A literal the scanner sees
 *  once, then referenced — the ban is on *computed* class names, not on naming
 *  a literal that sixteen entries share. */
const NEUTRAL_ZONE_BORDER = "border-border";

/** Ordered color keys — source of truth for the valid set and picker order.
 *  A vibrant warm→cool rainbow that fills the picker's 2 rows of 8. See the
 *  `--color-zone-*` tokens in globals.css for the hues and why they avoid the
 *  Yty element colors. */
export const VOICE_ZONE_COLOR_KEYS = [
  // warm
  "red", "orange", "amber", "yellow",
  // green
  "lime", "green", "emerald", "teal",
  // blue
  "cyan", "sky", "blue", "indigo",
  // violet → pink
  "violet", "purple", "fuchsia", "pink",
] as const;

/** A custom-zone color key — derived from the key tuple so the type can't drift. */
export type VoiceZoneColor = (typeof VOICE_ZONE_COLOR_KEYS)[number];

// Literal per-key class strings — NOT built as `bg-zone-${key}` (Tailwind can't
// scan a template); every value is a literal the source scanner sees. The glow
// pairs the shared `.zone-glow` class (geometry — defined once in globals.css)
// with an arbitrary-property class that binds this color into `--glow-color`.
export const VOICE_ZONE_COLORS: Record<VoiceZoneColor, ZoneColorClasses> = {
  red: { tile: "bg-zone-red/15", border: NEUTRAL_ZONE_BORDER, glyph: "text-zone-red", ring: "ring-zone-red", glow: "zone-glow [--glow-color:var(--color-zone-red)]", solid: "bg-zone-red" },
  orange: { tile: "bg-zone-orange/15", border: NEUTRAL_ZONE_BORDER, glyph: "text-zone-orange", ring: "ring-zone-orange", glow: "zone-glow [--glow-color:var(--color-zone-orange)]", solid: "bg-zone-orange" },
  amber: { tile: "bg-zone-amber/15", border: NEUTRAL_ZONE_BORDER, glyph: "text-zone-amber", ring: "ring-zone-amber", glow: "zone-glow [--glow-color:var(--color-zone-amber)]", solid: "bg-zone-amber" },
  yellow: { tile: "bg-zone-yellow/15", border: NEUTRAL_ZONE_BORDER, glyph: "text-zone-yellow", ring: "ring-zone-yellow", glow: "zone-glow [--glow-color:var(--color-zone-yellow)]", solid: "bg-zone-yellow" },
  lime: { tile: "bg-zone-lime/15", border: NEUTRAL_ZONE_BORDER, glyph: "text-zone-lime", ring: "ring-zone-lime", glow: "zone-glow [--glow-color:var(--color-zone-lime)]", solid: "bg-zone-lime" },
  green: { tile: "bg-zone-green/15", border: NEUTRAL_ZONE_BORDER, glyph: "text-zone-green", ring: "ring-zone-green", glow: "zone-glow [--glow-color:var(--color-zone-green)]", solid: "bg-zone-green" },
  emerald: { tile: "bg-zone-emerald/15", border: NEUTRAL_ZONE_BORDER, glyph: "text-zone-emerald", ring: "ring-zone-emerald", glow: "zone-glow [--glow-color:var(--color-zone-emerald)]", solid: "bg-zone-emerald" },
  teal: { tile: "bg-zone-teal/15", border: NEUTRAL_ZONE_BORDER, glyph: "text-zone-teal", ring: "ring-zone-teal", glow: "zone-glow [--glow-color:var(--color-zone-teal)]", solid: "bg-zone-teal" },
  cyan: { tile: "bg-zone-cyan/15", border: NEUTRAL_ZONE_BORDER, glyph: "text-zone-cyan", ring: "ring-zone-cyan", glow: "zone-glow [--glow-color:var(--color-zone-cyan)]", solid: "bg-zone-cyan" },
  sky: { tile: "bg-zone-sky/15", border: NEUTRAL_ZONE_BORDER, glyph: "text-zone-sky", ring: "ring-zone-sky", glow: "zone-glow [--glow-color:var(--color-zone-sky)]", solid: "bg-zone-sky" },
  blue: { tile: "bg-zone-blue/15", border: NEUTRAL_ZONE_BORDER, glyph: "text-zone-blue", ring: "ring-zone-blue", glow: "zone-glow [--glow-color:var(--color-zone-blue)]", solid: "bg-zone-blue" },
  indigo: { tile: "bg-zone-indigo/15", border: NEUTRAL_ZONE_BORDER, glyph: "text-zone-indigo", ring: "ring-zone-indigo", glow: "zone-glow [--glow-color:var(--color-zone-indigo)]", solid: "bg-zone-indigo" },
  violet: { tile: "bg-zone-violet/15", border: NEUTRAL_ZONE_BORDER, glyph: "text-zone-violet", ring: "ring-zone-violet", glow: "zone-glow [--glow-color:var(--color-zone-violet)]", solid: "bg-zone-violet" },
  purple: { tile: "bg-zone-purple/15", border: NEUTRAL_ZONE_BORDER, glyph: "text-zone-purple", ring: "ring-zone-purple", glow: "zone-glow [--glow-color:var(--color-zone-purple)]", solid: "bg-zone-purple" },
  fuchsia: { tile: "bg-zone-fuchsia/15", border: NEUTRAL_ZONE_BORDER, glyph: "text-zone-fuchsia", ring: "ring-zone-fuchsia", glow: "zone-glow [--glow-color:var(--color-zone-fuchsia)]", solid: "bg-zone-fuchsia" },
  pink: { tile: "bg-zone-pink/15", border: NEUTRAL_ZONE_BORDER, glyph: "text-zone-pink", ring: "ring-zone-pink", glow: "zone-glow [--glow-color:var(--color-zone-pink)]", solid: "bg-zone-pink" },
};

/** Type guard: is this free-text key a valid icon? Body is a literal `hasOwn`
 *  check (a trusted type predicate — no cast), so the value narrows safely. */
export function isZoneIcon(key: string): key is VoiceZoneIcon {
  return Object.hasOwn(VOICE_ZONE_ICONS, key);
}

/** Type guard: is this free-text key a valid color? */
export function isZoneColor(key: string): key is VoiceZoneColor {
  return Object.hasOwn(VOICE_ZONE_COLORS, key);
}

/** Resolve an icon key (free text from the DB) to its glyph, falling back to a
 *  default for an unknown/removed key so an old row never renders nothing. */
export function zoneIconFor(key: string): LucideIcon {
  return isZoneIcon(key) ? VOICE_ZONE_ICONS[key] : VOICE_ZONE_ICONS.gamepad;
}

/** Resolve a color key (free text from the DB) to its class set, falling back to
 *  a default for an unknown/removed key. */
export function zoneColorFor(key: string): ZoneColorClasses {
  return isZoneColor(key) ? VOICE_ZONE_COLORS[key] : VOICE_ZONE_COLORS.sky;
}

/** Narrow a free-text icon key to a valid `VoiceZoneIcon`, defaulting to the
 *  first palette entry for an unknown/removed key. Use when seeding picker state
 *  from a stored (text) value. */
export function asZoneIcon(key: string): VoiceZoneIcon {
  return isZoneIcon(key) ? key : VOICE_ZONE_ICON_KEYS[0];
}

/** Narrow a free-text color key to a valid `VoiceZoneColor`. */
export function asZoneColor(key: string): VoiceZoneColor {
  return isZoneColor(key) ? key : VOICE_ZONE_COLOR_KEYS[0];
}

/** A random icon + color for a *new* custom zone — each new zone opens on a
 *  fresh random appearance, which keeps zones visually varied and a little
 *  surprising. Zones may freely share an icon/color, so no de-duplication: a
 *  moderator can change either afterward. */
export function pickRandomZoneAppearance(): { icon: VoiceZoneIcon; color: VoiceZoneColor } {
  return {
    icon: VOICE_ZONE_ICON_KEYS[Math.floor(Math.random() * VOICE_ZONE_ICON_KEYS.length)],
    color: VOICE_ZONE_COLOR_KEYS[Math.floor(Math.random() * VOICE_ZONE_COLOR_KEYS.length)],
  };
}

// ---------------------------------------------------------------------------
// Virtual zone presentation (lobby + Yty). These keep their own identity and
// must not reuse the custom palette in a confusing way (§8). Names are
// translation keys under the `voice` namespace, resolved in the component.
// ---------------------------------------------------------------------------

export interface VirtualZonePresentation {
  id: string;
  /** Full dotted message key, resolved with the root `useTranslations()`. */
  nameKey: string;
  icon: LucideIcon;
  color: ZoneColorClasses;
}

/** Lobby / Clubhouse — the default "home" zone. A neutral white-ish identity
 *  (the theme `foreground`, near-white on our dark ground) so it reads as the
 *  calm home base and stays distinct from all 16 colorful custom zones. */
export const LOBBY_PRESENTATION: VirtualZonePresentation = {
  id: LOBBY_ZONE_ID,
  nameKey: "voice.zoneLobby",
  icon: Home,
  color: {
    tile: "bg-foreground/10",
    // Neutral, like the custom palette: the lobby's identity is the calm home
    // base, and an edge in the theme foreground would out-shout every zone
    // under it.
    border: NEUTRAL_ZONE_BORDER,
    glyph: "text-foreground",
    ring: "ring-foreground",
    glow: "zone-glow [--glow-color:var(--color-foreground)]",
    solid: "bg-foreground",
  },
};

/** Yty active-zone glow tokens, keyed by element id. Kept here (not in yty.ts)
 *  because the inset-shadow blur is a voice-room presentational choice, not a
 *  brand token. Strong, like every other non-text slot: a glow carries no
 *  words, and strong is the truer brand hue. Literal strings so Tailwind
 *  generates each utility. */
const YTY_ZONE_GLOW: Record<YtyElementId, string> = {
  harmony: "zone-glow [--glow-color:var(--color-yty-harmony-strong)]",
  glow: "zone-glow [--glow-color:var(--color-yty-glow-strong)]",
  valor: "zone-glow [--glow-color:var(--color-yty-valor-strong)]",
  wit: "zone-glow [--glow-color:var(--color-yty-wit-strong)]",
};

/** Yty solid fills, keyed by element id — literal `bg-yty-*-strong` so Tailwind
 *  scans them. Yty zones never appear in the picker (only custom colors do), but
 *  `ZoneColorClasses` requires `solid`, so they carry their full-saturation fill. */
const YTY_ZONE_SOLID: Record<YtyElementId, string> = {
  harmony: "bg-yty-harmony-strong",
  glow: "bg-yty-glow-strong",
  valor: "bg-yty-valor-strong",
  wit: "bg-yty-wit-strong",
};

/** The 4 Yty zones, reusing the existing Yty icons + theme tokens (yty.ts) and
 *  the existing `yty.elements.*.name` translations.
 *
 *  The strong/soft split is the one the contrast script settled and the Yty
 *  element map applies: **soft carries text and glyphs on the dark ground,
 *  strong fills, borders, rings and glows.** The zone card is exactly that
 *  division — a 10% tint behind a soft glyph, inside a full-value family edge,
 *  with a strong ring and a strong colour spilling in from the active card's
 *  border — so the tile's three classes come straight off the element map and
 *  nothing here re-decides them. The tile is the ruled Yty accent tile, drawn
 *  here exactly as the About page's element cards draw it. */
export const YTY_PRESENTATIONS: VirtualZonePresentation[] = YTY_ELEMENTS.map(
  (e) => ({
    id: `yty-${e.id}`,
    nameKey: `yty.elements.${e.id}.name`,
    icon: e.icon,
    color: {
      tile: e.color.bg,
      border: e.color.border,
      glyph: e.color.accent,
      // Literal tokens (not `ring-yty-${id}`/`shadow-[...${id}...]` templates) so
      // Tailwind's source scanner generates the utilities — a dynamic class name
      // is emitted to the DOM but has no CSS rule, falling back to a default.
      ring: e.color.ring,
      glow: YTY_ZONE_GLOW[e.id],
      solid: YTY_ZONE_SOLID[e.id],
    },
  }),
);
