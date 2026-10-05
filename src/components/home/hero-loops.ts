import type { StaticImageData } from "next/image";
import wideFirstFrame from "@/assets/marketing/hero-calm-wide-poster.jpg";
import closeFirstFrame from "@/assets/marketing/hero-calm-close-poster.jpg";
import verticalFirstFrame from "@/assets/marketing/hero-calm-vertical-poster.jpg";

/**
 * The three deliveries of the "Calm" loop, each a whole cut of its own: they
 * are framed differently on purpose and are never cropped from one another.
 * Each one is a video served from `public/media/` and the still of that
 * encode's own first frame, so the swap from still to moving picture shows no
 * seam. `src/assets/marketing/CLAUDE.md` holds how both are made.
 */
export const HERO_LOOPS = {
  wide: { video: "/media/hero-calm-wide-v1.mp4", firstFrame: wideFirstFrame },
  close: { video: "/media/hero-calm-close-v1.mp4", firstFrame: closeFirstFrame },
  vertical: { video: "/media/hero-calm-vertical-v1.mp4", firstFrame: verticalFirstFrame },
} as const satisfies Record<string, { video: string; firstFrame: StaticImageData }>;

export type HeroLoopId = keyof typeof HERO_LOOPS;

/**
 * Which cut fills the hero, by the viewport's shape, first match wins. The hero
 * covers the full width, so the viewport's proportions are what decide how much
 * of a cut `object-cover` throws away: a portrait phone takes the vertical cut,
 * a squarer window (a tablet, a narrow desktop window) the close one, which
 * keeps its subject when its sides are cut off, and anything wider the wide one.
 *
 * The still and the video read this one list, so they always show the same
 * cut. The last entry has no query: it is the fallback.
 */
export const HERO_LOOP_BY_SHAPE: readonly { media: string | null; loop: HeroLoopId }[] = [
  { media: "(max-aspect-ratio: 2/3)", loop: "vertical" },
  { media: "(max-aspect-ratio: 5/4)", loop: "close" },
  { media: null, loop: "wide" },
];

export const REDUCED_MOTION_QUERY = "(prefers-reduced-motion: reduce)";
