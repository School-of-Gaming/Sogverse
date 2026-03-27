export type ZoneId =
  | "general"
  | "breakout_1"
  | "breakout_2"
  | "breakout_3"
  | "breakout_4"
  | "broadcast";

/** Zones that have a visual rect and color on the canvas (everything except "general"). */
export type VisualZoneId = Exclude<ZoneId, "general">;

export interface ZoneRect {
  id: VisualZoneId;
  label: string;
  icon?: import("lucide-react").LucideIcon;
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
  CANVAS_WIDTH,
  CANVAS_HEIGHT,
  AVATAR_SIZE,
  ZONE_RECTS,
  GENERAL_AREA,
} from "./spatial.config";

/** Determine which zone a position falls within based on avatar center point. Returns "general" if not inside any explicit zone. */
export function getZoneAtPosition(x: number, y: number): ZoneId {
  const cx = x + AVATAR_SIZE / 2;
  const cy = y + AVATAR_SIZE / 2;
  for (const zone of ZONE_RECTS) {
    if (
      cx >= zone.x &&
      cx <= zone.x + zone.width &&
      cy >= zone.y &&
      cy <= zone.y + zone.height
    ) {
      return zone.id;
    }
  }
  return "general";
}

/** Can the local user hear the remote user based on their zones? */
export function canHearZone(localZone: ZoneId, remoteZone: ZoneId): boolean {
  // Broadcast zone: speaker heard by everyone, listener hears everyone
  if (remoteZone === "broadcast" || localZone === "broadcast") return true;
  // Same zone: audible
  if (localZone === remoteZone) return true;
  // Different zones: silent
  return false;
}

/** Minimum separation (per axis) to keep avatars at most ~25% overlapping. */
const MIN_SEP = Math.ceil(AVATAR_SIZE * 0.75);

/** Nudge a proposed position so it doesn't overlap more than ~50% with any other avatar.
 *  Both avatars remain visible and selectable. */
export function resolveOverlap(
  x: number,
  y: number,
  others: { x: number; y: number }[],
): { x: number; y: number } {
  let cx = x;
  let cy = y;

  for (let iter = 0; iter < 5; iter++) {
    let nudged = false;
    for (const other of others) {
      const dx = cx - other.x;
      const dy = cy - other.y;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);

      // Only a conflict when BOTH axes are closer than MIN_SEP
      if (absDx >= MIN_SEP || absDy >= MIN_SEP) continue;

      // Push in the axis that needs the least additional movement
      if (absDx >= absDy) {
        const dir = dx > 0 ? 1 : dx < 0 ? -1 : 1;
        cx += (MIN_SEP - absDx) * dir;
      } else {
        const dir = dy > 0 ? 1 : dy < 0 ? -1 : 1;
        cy += (MIN_SEP - absDy) * dir;
      }
      nudged = true;
    }
    if (!nudged) break;
  }

  // Clamp to canvas bounds
  cx = Math.max(0, Math.min(CANVAS_WIDTH - AVATAR_SIZE, cx));
  cy = Math.max(0, Math.min(CANVAS_HEIGHT - AVATAR_SIZE, cy));

  return { x: Math.round(cx), y: Math.round(cy) };
}

/** Push a position so the entire avatar is outside the broadcast zone.
 *  Ejects to the nearest side (left, right, or below) — never upward since the
 *  broadcast zone sits near the top of the canvas. Returns unchanged if already outside. */
export function ejectFromBroadcastZone(
  x: number,
  y: number,
): { x: number; y: number } {
  const zone = ZONE_RECTS.find((z) => z.id === "broadcast");
  if (!zone) return { x, y };

  // Check if avatar rectangle overlaps zone rectangle
  const overlapsX = x < zone.x + zone.width && x + AVATAR_SIZE > zone.x;
  const overlapsY = y < zone.y + zone.height && y + AVATAR_SIZE > zone.y;
  if (!overlapsX || !overlapsY) return { x, y };

  // Distance to push the entire avatar clear of the zone in each direction.
  // Skip upward — not enough room above the broadcast zone.
  const pushLeft = x - (zone.x - AVATAR_SIZE);
  const pushRight = (zone.x + zone.width) - x;
  const pushDown = (zone.y + zone.height) - y;
  const minPush = Math.min(pushLeft, pushRight, pushDown);

  let newX = x;
  let newY = y;

  if (minPush === pushLeft) {
    newX = zone.x - AVATAR_SIZE;
  } else if (minPush === pushRight) {
    newX = zone.x + zone.width;
  } else {
    newY = zone.y + zone.height;
  }

  // Clamp to canvas bounds
  newX = Math.max(0, Math.min(CANVAS_WIDTH - AVATAR_SIZE, newX));
  newY = Math.max(0, Math.min(CANVAS_HEIGHT - AVATAR_SIZE, newY));

  return { x: Math.round(newX), y: Math.round(newY) };
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
