import {
  Home,
  Star,
  Rocket,
  Gamepad2,
  Crown,
  Trophy,
  Flame,
  Ghost,
  Music,
  type LucideIcon,
} from "lucide-react";
import { Constants, type VoiceZoneIcon, type VoiceZoneColor } from "@/types";
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
// Custom-zone palette (§8) — 8 icons + 8 colors, chosen to be instantly
// recognizable to a 7-year-old. Keys are identical to the DB enum values
// (voice_zone_icon / voice_zone_color) so the picker, the card renderer, and
// the row round-trip cleanly.
// ---------------------------------------------------------------------------

export const VOICE_ZONE_ICONS: Record<VoiceZoneIcon, LucideIcon> = {
  star: Star,
  rocket: Rocket,
  gamepad: Gamepad2,
  crown: Crown,
  trophy: Trophy,
  flame: Flame,
  ghost: Ghost,
  music: Music,
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

/** The ordered list of color keys, for the create/edit zone color picker.
 *  Derived from the generated DB enum so it can't drift from the migration. */
export const VOICE_ZONE_COLOR_KEYS = Constants.public.Enums.voice_zone_color;
/** The ordered list of icon keys, for the create/edit zone icon picker. */
export const VOICE_ZONE_ICON_KEYS = Constants.public.Enums.voice_zone_icon;

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
