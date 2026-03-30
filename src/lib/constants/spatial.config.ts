import type { VisualZoneId, ZoneRect } from "./spatial";
import { YTY_ELEMENTS } from "./yty";

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
  { id: "breakout_1", label: YTY_ELEMENTS[0].name, icon: YTY_ELEMENTS[0].icon, x: 10, y: 10, width: 280, height: 200 },
  { id: "breakout_2", label: YTY_ELEMENTS[1].name, icon: YTY_ELEMENTS[1].icon, x: 830, y: 10, width: 280, height: 200 },
  { id: "breakout_3", label: YTY_ELEMENTS[2].name, icon: YTY_ELEMENTS[2].icon, x: 10, y: 270, width: 280, height: 200 },
  { id: "breakout_4", label: YTY_ELEMENTS[3].name, icon: YTY_ELEMENTS[3].icon, x: 830, y: 270, width: 280, height: 200 },
  { id: "broadcast", label: "Broadcast", x: 485, y: 10, width: 150, height: 100 },
];

// ── Avatar speaking glow ─────────────────────────────────────────────
/** Dynamic glow driven by audio level. Color is RGB for use in rgba(). */
export const SPEAKING_GLOW = {
  color: "255, 255, 255",
  maxSpread: 14,
  threshold: 0.05,
};

/** Compute inline glow styles for a given audio level (0–1).
 *  Returns empty object when below threshold (no glow). */
export function computeGlowStyle(level: number): React.CSSProperties {
  if (level <= SPEAKING_GLOW.threshold) return {};
  const spread = level * SPEAKING_GLOW.maxSpread;
  const opacity = 0.3 + level * 0.5;
  return {
    boxShadow: `0 0 ${spread}px rgba(${SPEAKING_GLOW.color}, ${opacity})`,
    borderColor: `rgba(${SPEAKING_GLOW.color}, ${0.5 + level * 0.5})`,
  };
}

// ── Zone colours (Tailwind classes) ─────────────────────────────────
export const ZONE_COLORS: Record<VisualZoneId, { bg: string; border: string; accent: string }> = {
  breakout_1: YTY_ELEMENTS[0].color,
  breakout_2: YTY_ELEMENTS[1].color,
  breakout_3: YTY_ELEMENTS[2].color,
  breakout_4: YTY_ELEMENTS[3].color,
  broadcast: { bg: "bg-warning/15", border: "border-warning/40", accent: "text-warning" },
};
