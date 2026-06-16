import type { LucideIcon } from "lucide-react";
import type { VoiceZone } from "@/types";
import {
  LOBBY_PRESENTATION,
  YTY_PRESENTATIONS,
  VOICE_ZONE_ICONS,
  VOICE_ZONE_COLORS,
  type ZoneColorClasses,
} from "@/lib/constants/voice-zones";

/**
 * A zone as the UI consumes it (docs/voice-rooms-refactor-plan.md §9). Composed
 * from the virtual lobby + 4 Yty zones and the group's custom `voice_zones`
 * rows. The UI is a pure consumer — it renders these and never reconstructs the
 * zone list itself.
 */
export interface VoiceZoneView {
  /** Stable zone id: "lobby" | "yty-*" | the voice_zones.id UUID. */
  id: string;
  kind: "lobby" | "yty" | "custom";
  /**
   * For virtual zones (lobby, yty): a translation key under the `voice`
   * namespace (resolve with `t(name)`). For custom zones: the user-entered
   * literal name (render verbatim). `nameIsKey` disambiguates.
   */
  name: string;
  nameIsKey: boolean;
  icon: LucideIcon;
  color: ZoneColorClasses;
  isLocked: boolean;
}

function virtualView(
  v: { id: string; nameKey: string; icon: LucideIcon; color: ZoneColorClasses },
  kind: "lobby" | "yty",
): VoiceZoneView {
  return {
    id: v.id,
    kind,
    name: v.nameKey,
    nameIsKey: true,
    icon: v.icon,
    color: v.color,
    isLocked: false,
  };
}

function customView(zone: VoiceZone): VoiceZoneView {
  return {
    id: zone.id,
    kind: "custom",
    name: zone.name,
    nameIsKey: false,
    icon: VOICE_ZONE_ICONS[zone.icon],
    color: VOICE_ZONE_COLORS[zone.color],
    isLocked: zone.is_locked,
  };
}

/**
 * Compose the ordered zone list the UI renders: lobby first, then the 4 Yty
 * zones, then the group's custom zones (sorted by `sort_order`, then creation
 * time as a stable tiebreaker).
 *
 * Instant rooms have no group (`groupId === null`) → lobby + Yty only; any
 * custom rows passed in are ignored. This mirrors the provider gating
 * custom/locked features on `groupId !== null`.
 */
export function composeZones(
  customZones: VoiceZone[] | null | undefined,
  groupId: string | null,
): VoiceZoneView[] {
  const base: VoiceZoneView[] = [
    virtualView(LOBBY_PRESENTATION, "lobby"),
    ...YTY_PRESENTATIONS.map((p) => virtualView(p, "yty")),
  ];

  if (groupId === null || !customZones?.length) return base;

  const sorted = [...customZones].sort(
    (a, b) =>
      a.sort_order - b.sort_order ||
      a.created_at.localeCompare(b.created_at),
  );

  return [...base, ...sorted.map(customView)];
}

/** All zone ids that a non-moderator may move *themselves* into (everything
 *  except locked zones — placement into those is mod-only and server-enforced). */
export function selfMovableZoneIds(zones: VoiceZoneView[]): string[] {
  return zones.filter((z) => !z.isLocked).map((z) => z.id);
}
