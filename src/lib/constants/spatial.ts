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

/** Logical canvas dimensions (scaled to fit container via CSS) */
export const CANVAS_WIDTH = 800;
export const CANVAS_HEIGHT = 600;

/** Avatar size in logical pixels */
export const AVATAR_SIZE = 56;

/** Zone layout rectangles (in logical coordinates) */
export const ZONE_RECTS: ZoneRect[] = [
  // General space — large center area
  { id: "general", label: "General", x: 200, y: 140, width: 400, height: 340 },
  // Breakout rooms — near corners with padding
  { id: "breakout_1", label: "Breakout 1", x: 20, y: 20, width: 160, height: 160 },
  { id: "breakout_2", label: "Breakout 2", x: 620, y: 20, width: 160, height: 160 },
  { id: "breakout_3", label: "Breakout 3", x: 20, y: 420, width: 160, height: 160 },
  { id: "breakout_4", label: "Breakout 4", x: 620, y: 420, width: 160, height: 160 },
  // Broadcast zone — top-center
  { id: "broadcast", label: "Broadcast", x: 280, y: 20, width: 240, height: 100 },
];

/** Colors for each zone */
export const ZONE_COLORS: Record<ZoneId, { bg: string; border: string; accent: string }> = {
  general: { bg: "bg-blue-500/10", border: "border-blue-500/30", accent: "text-blue-400" },
  breakout_1: { bg: "bg-emerald-500/10", border: "border-emerald-500/30", accent: "text-emerald-400" },
  breakout_2: { bg: "bg-amber-500/10", border: "border-amber-500/30", accent: "text-amber-400" },
  breakout_3: { bg: "bg-rose-500/10", border: "border-rose-500/30", accent: "text-rose-400" },
  breakout_4: { bg: "bg-violet-500/10", border: "border-violet-500/30", accent: "text-violet-400" },
  broadcast: { bg: "bg-yellow-500/15", border: "border-yellow-500/40", accent: "text-yellow-400" },
};

/** Determine which zone a position falls within. Returns "general" if no zone matches. */
export function getZoneAtPosition(x: number, y: number): ZoneId {
  // Check non-general zones first (they overlap with general conceptually)
  for (const zone of ZONE_RECTS) {
    if (zone.id === "general") continue;
    if (
      x >= zone.x &&
      x <= zone.x + zone.width - AVATAR_SIZE &&
      y >= zone.y &&
      y <= zone.y + zone.height - AVATAR_SIZE
    ) {
      return zone.id;
    }
  }
  // Check general zone
  const general = ZONE_RECTS.find((z) => z.id === "general")!;
  if (
    x >= general.x &&
    x <= general.x + general.width - AVATAR_SIZE &&
    y >= general.y &&
    y <= general.y + general.height - AVATAR_SIZE
  ) {
    return "general";
  }
  // Fallback
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

/** Get a random position within a zone */
export function getRandomPositionInZone(zoneId: ZoneId): { x: number; y: number } {
  const zone = ZONE_RECTS.find((z) => z.id === zoneId)!;
  const padding = AVATAR_SIZE;
  const x = zone.x + padding / 2 + Math.random() * (zone.width - padding * 1.5);
  const y = zone.y + padding / 2 + Math.random() * (zone.height - padding * 1.5);
  return { x: Math.round(x), y: Math.round(y) };
}
