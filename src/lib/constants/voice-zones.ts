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

/** A color rendered as the soft-tint avatar treatment (`bg-avatar-X/15` tile +
 *  `text-avatar-X` glyph). `ring` is the picker's selection token; `glow` is the
 *  active-zone treatment — an inset box-shadow that spills the color in from the
 *  border and fades toward the center (paired with a high-contrast border).
 *  Both are literal class strings (the `var(--color-X)` in `glow` references the
 *  same theme token) so Tailwind's source scanner generates the utilities. */
export interface ZoneColorClasses {
  tile: string;
  glyph: string;
  ring: string;
  glow: string;
}

/** Ordered color keys — source of truth for the valid set and picker order. */
export const VOICE_ZONE_COLOR_KEYS = [
  "red", "orange", "green", "teal", "sky", "indigo", "violet", "pink",
] as const;

/** A custom-zone color key — derived from the key tuple so the type can't drift. */
export type VoiceZoneColor = (typeof VOICE_ZONE_COLOR_KEYS)[number];

export const VOICE_ZONE_COLORS: Record<VoiceZoneColor, ZoneColorClasses> = {
  red: { tile: "bg-avatar-red/15", glyph: "text-avatar-red", ring: "ring-avatar-red", glow: "shadow-[inset_0_0_1.25rem_-0.25rem_var(--color-avatar-red)]" },
  orange: { tile: "bg-avatar-orange/15", glyph: "text-avatar-orange", ring: "ring-avatar-orange", glow: "shadow-[inset_0_0_1.25rem_-0.25rem_var(--color-avatar-orange)]" },
  green: { tile: "bg-avatar-green/15", glyph: "text-avatar-green", ring: "ring-avatar-green", glow: "shadow-[inset_0_0_1.25rem_-0.25rem_var(--color-avatar-green)]" },
  teal: { tile: "bg-avatar-teal/15", glyph: "text-avatar-teal", ring: "ring-avatar-teal", glow: "shadow-[inset_0_0_1.25rem_-0.25rem_var(--color-avatar-teal)]" },
  sky: { tile: "bg-avatar-sky/15", glyph: "text-avatar-sky", ring: "ring-avatar-sky", glow: "shadow-[inset_0_0_1.25rem_-0.25rem_var(--color-avatar-sky)]" },
  indigo: { tile: "bg-avatar-indigo/15", glyph: "text-avatar-indigo", ring: "ring-avatar-indigo", glow: "shadow-[inset_0_0_1.25rem_-0.25rem_var(--color-avatar-indigo)]" },
  violet: { tile: "bg-avatar-violet/15", glyph: "text-avatar-violet", ring: "ring-avatar-violet", glow: "shadow-[inset_0_0_1.25rem_-0.25rem_var(--color-avatar-violet)]" },
  pink: { tile: "bg-avatar-pink/15", glyph: "text-avatar-pink", ring: "ring-avatar-pink", glow: "shadow-[inset_0_0_1.25rem_-0.25rem_var(--color-avatar-pink)]" },
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

/** Lobby — the default "general" zone, neutral semantic theme color. */
export const LOBBY_PRESENTATION: VirtualZonePresentation = {
  id: LOBBY_ZONE_ID,
  nameKey: "voice.zoneLobby",
  icon: Home,
  color: {
    tile: "bg-primary/10",
    glyph: "text-primary",
    ring: "ring-primary",
    glow: "shadow-[inset_0_0_1.25rem_-0.25rem_var(--color-primary)]",
  },
};

/** Yty active-zone glow tokens, keyed by element id. Kept here (not in yty.ts)
 *  because the inset-shadow blur is a voice-room presentational choice, not a
 *  brand token. Literal strings so Tailwind generates each utility. */
const YTY_ZONE_GLOW: Record<YtyElementId, string> = {
  harmony: "shadow-[inset_0_0_1.25rem_-0.25rem_var(--color-yty-harmony)]",
  glow: "shadow-[inset_0_0_1.25rem_-0.25rem_var(--color-yty-glow)]",
  valor: "shadow-[inset_0_0_1.25rem_-0.25rem_var(--color-yty-valor)]",
  wit: "shadow-[inset_0_0_1.25rem_-0.25rem_var(--color-yty-wit)]",
};

/** The 4 Yty zones, reusing the existing Yty icons + theme tokens (yty.ts) and
 *  the existing `yty.elements.*.name` translations. */
export const YTY_PRESENTATIONS: VirtualZonePresentation[] = YTY_ELEMENTS.map(
  (e) => ({
    id: `yty-${e.id}`,
    nameKey: `yty.elements.${e.id}.name`,
    icon: e.icon,
    color: {
      tile: e.color.bg,
      glyph: e.color.accent,
      // Literal tokens (not `ring-yty-${id}`/`shadow-[...${id}...]` templates) so
      // Tailwind's source scanner generates the utilities — a dynamic class name
      // is emitted to the DOM but has no CSS rule, falling back to a default.
      ring: e.color.ring,
      glow: YTY_ZONE_GLOW[e.id],
    },
  }),
);
