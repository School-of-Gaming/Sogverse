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
import { PICKS, type PickId } from "@sog/ui";
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
// Custom-zone appearance — the icon and the colour a moderator picks for a zone
// they made, chosen to be instantly recognizable to a 7-year-old.
//
// THIS FILE IS THE SOURCE OF TRUTH FOR THE ICONS. It is NOT the source of the
// colours: those are @sog/ui's sixteen picks — the colours a person may choose
// for their own thing — and all this file decides is how one of them is painted
// onto a zone. A zone colour therefore means "a moderator picked this", never a
// status, a kind or a meaning the app assigned.
//
// The `voice_zones` `icon`/`color` columns are plain `text` (not DB enums), so
// adding, removing, or renaming an entry is a pure code change — no migration
// (docs/investigations/enum-candidates.md §D, which still holds: the value set
// is presentational and mod-gated, not a security boundary). The KEYS tuple
// drives both the type and the picker order; the map below must cover exactly
// those keys (the `Record<…>` type enforces it, so the two can't drift). The
// renderer falls back to a default glyph/colour for any key not in the map
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

/** A custom-zone colour, expressed as five literal class strings (never built by
 *  string templating, so Tailwind's source scanner can see every utility):
 *  - `tile`  — soft-tint background for the zone-card icon tile (`bg-pick-N/15`)
 *  - `glyph` — the icon colour (`text-pick-N`), readable on the dark ground
 *  - `ring`  — the picker's selection ring (`ring-pick-N`)
 *  - `glow`  — the active-zone treatment: the shared `.zone-glow` class (the
 *              inset-shadow geometry, defined once in globals.css) plus an
 *              arbitrary-property class binding this colour into `--glow-color`,
 *              so the colour spills in from the border and fades toward center
 *  - `solid` — the full-saturation fill (`bg-pick-N`) the picker shows as a
 *              vibrant swatch
 *
 *  **There is no `tile` any more.** A zone's glyph used to sit on a 15% wash of
 *  its own colour; a colour exists at its authored value or not at all, and a
 *  fraction of it over the dark ground is a duller colour than the one the
 *  moderator chose. The glyph carries the colour at full value and the square
 *  behind it is the lifted grey every other tile in the app sits on, written
 *  where it is drawn rather than repeated sixteen times here. */
export interface ZoneColorClasses {
  glyph: string;
  ring: string;
  glow: string;
  solid: string;
}

/**
 * A custom-zone colour key: the id of one of @sog/ui's sixteen picks, spelled
 * as text.
 *
 * **Text rather than a number, because the column is text.** `voice_zones.color`
 * is `text NOT NULL` by design, and a stored value arrives as free text at every
 * read; keying the map by exactly the strings that can be stored means the
 * `Record` below is exhaustive over the storable set, the guard is a plain
 * `hasOwn` on the value as it comes out of the database, and nothing converts at
 * the boundary. Numeric keys would put a `String()` on every write and a
 * `Number()` on every read, and would leave the guard hand-rejecting the
 * spellings that parse to a valid id but are not one (`"07"`, `"1.0"`, `" 1"`).
 *
 * The id is a stable identifier and not a position: a pick retuned to a
 * different hue keeps its id, so every zone that chose it keeps its choice.
 */
export type VoiceZoneColor = `${PickId}`;

/** Ordered colour keys — the valid set and the picker order, both from the
 *  library's list, which is already in picker order. */
export const VOICE_ZONE_COLOR_KEYS: readonly VoiceZoneColor[] = PICKS.map(
  // `as const` keeps the template literal at its literal type; without it the
  // expression widens to `string` and the key type stops meaning anything.
  (pick) => `${pick.id}` as const,
);

// Literal per-key class strings — NOT built as `bg-pick-${id}` (Tailwind can't
// scan a template); every value is a literal the source scanner sees. The glow
// pairs the shared `.zone-glow` class (geometry — defined once in globals.css)
// with an arbitrary-property class that binds this colour into `--glow-color`.
//
export const VOICE_ZONE_COLORS: Record<VoiceZoneColor, ZoneColorClasses> = {
  "1": { glyph: "text-pick-1", ring: "ring-pick-1", glow: "zone-glow [--glow-color:var(--color-pick-1)]", solid: "bg-pick-1" },
  "2": { glyph: "text-pick-2", ring: "ring-pick-2", glow: "zone-glow [--glow-color:var(--color-pick-2)]", solid: "bg-pick-2" },
  "3": { glyph: "text-pick-3", ring: "ring-pick-3", glow: "zone-glow [--glow-color:var(--color-pick-3)]", solid: "bg-pick-3" },
  "4": { glyph: "text-pick-4", ring: "ring-pick-4", glow: "zone-glow [--glow-color:var(--color-pick-4)]", solid: "bg-pick-4" },
  "5": { glyph: "text-pick-5", ring: "ring-pick-5", glow: "zone-glow [--glow-color:var(--color-pick-5)]", solid: "bg-pick-5" },
  "6": { glyph: "text-pick-6", ring: "ring-pick-6", glow: "zone-glow [--glow-color:var(--color-pick-6)]", solid: "bg-pick-6" },
  "7": { glyph: "text-pick-7", ring: "ring-pick-7", glow: "zone-glow [--glow-color:var(--color-pick-7)]", solid: "bg-pick-7" },
  "8": { glyph: "text-pick-8", ring: "ring-pick-8", glow: "zone-glow [--glow-color:var(--color-pick-8)]", solid: "bg-pick-8" },
  "9": { glyph: "text-pick-9", ring: "ring-pick-9", glow: "zone-glow [--glow-color:var(--color-pick-9)]", solid: "bg-pick-9" },
  "10": { glyph: "text-pick-10", ring: "ring-pick-10", glow: "zone-glow [--glow-color:var(--color-pick-10)]", solid: "bg-pick-10" },
  "11": { glyph: "text-pick-11", ring: "ring-pick-11", glow: "zone-glow [--glow-color:var(--color-pick-11)]", solid: "bg-pick-11" },
  "12": { glyph: "text-pick-12", ring: "ring-pick-12", glow: "zone-glow [--glow-color:var(--color-pick-12)]", solid: "bg-pick-12" },
  "13": { glyph: "text-pick-13", ring: "ring-pick-13", glow: "zone-glow [--glow-color:var(--color-pick-13)]", solid: "bg-pick-13" },
  "14": { glyph: "text-pick-14", ring: "ring-pick-14", glow: "zone-glow [--glow-color:var(--color-pick-14)]", solid: "bg-pick-14" },
  "15": { glyph: "text-pick-15", ring: "ring-pick-15", glow: "zone-glow [--glow-color:var(--color-pick-15)]", solid: "bg-pick-15" },
  "16": { glyph: "text-pick-16", ring: "ring-pick-16", glow: "zone-glow [--glow-color:var(--color-pick-16)]", solid: "bg-pick-16" },
};

/** Type guard: is this free-text key a valid icon? Body is a literal `hasOwn`
 *  check (a trusted type predicate — no cast), so the value narrows safely. */
export function isZoneIcon(key: string): key is VoiceZoneIcon {
  return Object.hasOwn(VOICE_ZONE_ICONS, key);
}

/** Type guard: is this free-text key a valid colour? */
export function isZoneColor(key: string): key is VoiceZoneColor {
  return Object.hasOwn(VOICE_ZONE_COLORS, key);
}

/** The colour a zone falls back to: the first pick, which is simply the first
 *  swatch in the picker. Nothing is being said by it — an unresolvable key means
 *  we do not know what the moderator chose, and the fallback only has to render
 *  something a person could have chosen. */
const DEFAULT_ZONE_COLOR: VoiceZoneColor = VOICE_ZONE_COLOR_KEYS[0];

/** Resolve an icon key (free text from the DB) to its glyph, falling back to a
 *  default for an unknown/removed key so an old row never renders nothing. */
export function zoneIconFor(key: string): LucideIcon {
  return isZoneIcon(key) ? VOICE_ZONE_ICONS[key] : VOICE_ZONE_ICONS.gamepad;
}

/** Resolve a colour key (free text from the DB) to its class set, falling back
 *  to the default for an unknown/removed key. */
export function zoneColorFor(key: string): ZoneColorClasses {
  return VOICE_ZONE_COLORS[isZoneColor(key) ? key : DEFAULT_ZONE_COLOR];
}

/** Narrow a free-text icon key to a valid `VoiceZoneIcon`, defaulting to the
 *  first palette entry for an unknown/removed key. Use when seeding picker state
 *  from a stored (text) value. */
export function asZoneIcon(key: string): VoiceZoneIcon {
  return isZoneIcon(key) ? key : VOICE_ZONE_ICON_KEYS[0];
}

/** Narrow a free-text colour key to a valid `VoiceZoneColor`. */
export function asZoneColor(key: string): VoiceZoneColor {
  return isZoneColor(key) ? key : DEFAULT_ZONE_COLOR;
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
    glyph: "text-foreground",
    ring: "ring-foreground",
    glow: "zone-glow [--glow-color:var(--color-foreground)]",
    solid: "bg-foreground",
  },
};

/** Yty active-zone glow tokens, keyed by element id. Kept here (not in yty.ts)
 *  because the inset-shadow blur is a voice-room presentational choice, not a
 *  brand token. Literal strings so Tailwind generates each utility. */
const YTY_ZONE_GLOW: Record<YtyElementId, string> = {
  harmony: "zone-glow [--glow-color:var(--color-yty-harmony)]",
  glow: "zone-glow [--glow-color:var(--color-yty-glow)]",
  valor: "zone-glow [--glow-color:var(--color-yty-valor)]",
  wit: "zone-glow [--glow-color:var(--color-yty-wit)]",
};

/** Yty solid fills, keyed by element id — literal `bg-yty-*` so Tailwind scans
 *  them. Yty zones never appear in the picker (only custom colors do), but
 *  `ZoneColorClasses` requires `solid`, so they carry the family's own fill. */
const YTY_ZONE_SOLID: Record<YtyElementId, string> = {
  harmony: "bg-yty-harmony",
  glow: "bg-yty-glow",
  valor: "bg-yty-valor",
  wit: "bg-yty-wit",
};

/** The 4 Yty zones, reusing the existing Yty icons + theme tokens (yty.ts) and
 *  the existing `yty.elements.*.name` translations. */
export const YTY_PRESENTATIONS: VirtualZonePresentation[] = YTY_ELEMENTS.map(
  (e) => ({
    id: `yty-${e.id}`,
    nameKey: `yty.elements.${e.id}.name`,
    icon: e.icon,
    color: {
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
