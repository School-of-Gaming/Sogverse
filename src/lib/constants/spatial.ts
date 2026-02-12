export type ZoneId =
  | "general"
  | "breakout_1"
  | "breakout_2"
  | "breakout_3"
  | "breakout_4"
  | "broadcast";

export interface ZoneRect {
  id: ZoneId;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SpatialPosition {
  x: number;
  y: number;
  zone: ZoneId;
}

// Re-export config values so consumers can import everything from one place
export {
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  AVATAR_SIZE,
  ZONE_RECTS,
  ZONE_COLORS,
  GENERAL_AREA,
} from "./spatial.config";

import {
  AVATAR_SIZE,
  ZONE_RECTS,
  GENERAL_AREA,
} from "./spatial.config";

/** Determine which zone a position falls within. Returns "general" if not inside any explicit zone. */
export function getZoneAtPosition(x: number, y: number): ZoneId {
  for (const zone of ZONE_RECTS) {
    if (
      x >= zone.x &&
      x <= zone.x + zone.width - AVATAR_SIZE &&
      y >= zone.y &&
      y <= zone.y + zone.height - AVATAR_SIZE
    ) {
      return zone.id;
    }
  }
  return "general";
}

/** Calculate audio gain based on zone-based isolation */
export function calculateGain(localZone: ZoneId, remoteZone: ZoneId): number {
  // Broadcast zone: speaker heard by everyone, listener hears everyone
  if (remoteZone === "broadcast" || localZone === "broadcast") return 1;
  // Same zone: full volume
  if (localZone === remoteZone) return 1;
  // Different zones: silent
  return 0;
}

/** Get a random position within a zone. For "general", scatters across the open canvas area. */
export function getRandomPositionInZone(zoneId: ZoneId): { x: number; y: number } {
  if (zoneId === "general") {
    const x = GENERAL_AREA.x + Math.random() * (GENERAL_AREA.width - AVATAR_SIZE);
    const y = GENERAL_AREA.y + Math.random() * (GENERAL_AREA.height - AVATAR_SIZE);
    return { x: Math.round(x), y: Math.round(y) };
  }
  const zone = ZONE_RECTS.find((z) => z.id === zoneId)!;
  const padding = AVATAR_SIZE;
  const x = zone.x + padding / 2 + Math.random() * (zone.width - padding * 1.5);
  const y = zone.y + padding / 2 + Math.random() * (zone.height - padding * 1.5);
  return { x: Math.round(x), y: Math.round(y) };
}
