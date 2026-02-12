import type { ZoneId, ZoneRect } from "./spatial";

// ── Canvas ──────────────────────────────────────────────────────────
/** Logical canvas dimensions (scaled to fit container via CSS).
 *  21:9 ratio keeps the canvas short enough to avoid scrolling on 16:9 laptops. */
export const CANVAS_WIDTH = 1120;
export const CANVAS_HEIGHT = 480;

/** Avatar size in logical pixels */
export const AVATAR_SIZE = 56;

// ── General zone (implicit background) ──────────────────────────────
/** Bounding box used when randomly placing users in the general area.
 *  Kept away from corners/top so it doesn't overlap explicit zones. */
export const GENERAL_AREA = { x: 310, y: 120, width: 500, height: 240 };

// ── Zone rectangles ─────────────────────────────────────────────────
/** Explicit zones rendered on the canvas.
 *  "general" has no rect — it's everywhere outside these zones. */
export const ZONE_RECTS: ZoneRect[] = [
  { id: "breakout_1", label: "Breakout 1", x: 10, y: 10, width: 280, height: 200 },
  { id: "breakout_2", label: "Breakout 2", x: 830, y: 10, width: 280, height: 200 },
  { id: "breakout_3", label: "Breakout 3", x: 10, y: 270, width: 280, height: 200 },
  { id: "breakout_4", label: "Breakout 4", x: 830, y: 270, width: 280, height: 200 },
  { id: "broadcast", label: "Broadcast", x: 485, y: 10, width: 150, height: 100 },
];

// ── Avatar speaking glow ─────────────────────────────────────────────
/** Dynamic glow driven by audio level. Color is RGB for use in rgba(). */
export const SPEAKING_GLOW = {
  color: "255, 255, 255",
  maxSpread: 14,
};

// ── Zone colours (Tailwind classes) ─────────────────────────────────
export const ZONE_COLORS: Record<ZoneId, { bg: string; border: string; accent: string }> = {
  general: { bg: "bg-blue-500/10", border: "border-blue-500/30", accent: "text-blue-400" },
  breakout_1: { bg: "bg-emerald-500/10", border: "border-emerald-500/30", accent: "text-emerald-400" },
  breakout_2: { bg: "bg-amber-500/10", border: "border-amber-500/30", accent: "text-amber-400" },
  breakout_3: { bg: "bg-rose-500/10", border: "border-rose-500/30", accent: "text-rose-400" },
  breakout_4: { bg: "bg-violet-500/10", border: "border-violet-500/30", accent: "text-violet-400" },
  broadcast: { bg: "bg-yellow-500/15", border: "border-yellow-500/40", accent: "text-yellow-400" },
};
