/**
 * Level of detail — how a character survives being small.
 *
 * An SVG scales to any size; a *design* does not. At 24 pixels a lanyard is
 * three grey pixels, a 2px outline is a smudge, and an eye highlight is noise
 * that eats the pupil it sits on. The identity has to be carried by the things
 * that still exist at that size: the silhouette, the head shape, the eye
 * shape, and one strong block of colour. Everything else is decoration that
 * should get out of the way rather than degrade in place.
 *
 * So each concept is drawn in three passes' worth of parts, and the level
 * decides which passes run:
 *
 * - `full` — everything. Fold lines, seams, freckles, key caps, brows,
 *   blush, the mic on the headset, the writing on the badge.
 * - `simple` — the picture without its filigree. Big shapes, costume, props,
 *   expression; no hairline detail, no highlights, no blush.
 * - `icon` — silhouette plus landmarks. Head shape, eyes, mouth, and at most
 *   one chunky costume cue. No props at all: a controller at 24px is a grey
 *   pill that makes the character harder to recognise, not easier.
 *
 * The level is a prop so a caller can force it, and is otherwise derived from
 * the rendered size. Deriving is the common case and the thresholds below are
 * the contract: under 40px is an icon, under 96px is simple, above that is
 * full. They are stated here rather than guessed at each call site.
 */

export const DETAIL_LEVELS = ["full", "simple", "icon"] as const;
export type DetailLevel = (typeof DETAIL_LEVELS)[number];

export const DETAIL_LABELS: Record<DetailLevel, string> = {
  full: "Full",
  simple: "Simple",
  icon: "Icon",
};

/** The size thresholds, as the single source of truth for the derivation. */
export const DETAIL_BREAKPOINTS = { icon: 40, simple: 96 } as const;

export function detailForSize(size: number): DetailLevel {
  if (size < DETAIL_BREAKPOINTS.icon) return "icon";
  if (size < DETAIL_BREAKPOINTS.simple) return "simple";
  return "full";
}

/** True when hairline decoration should be drawn at all. */
export function showsFiligree(detail: DetailLevel): boolean {
  return detail === "full";
}

/** True when the character may hold something. */
export function showsProps(detail: DetailLevel): boolean {
  return detail !== "icon";
}

/**
 * How much to fatten the features that carry identity. At icon size the eyes
 * and the mouth are most of what a viewer has to go on, so they grow rather
 * than shrinking with everything else.
 */
export function featureScale(detail: DetailLevel): number {
  return detail === "icon" ? 1.22 : 1;
}

/** How a character is framed. `bust` and `head` are the avatar crops. */
export const MASCOT_CROPS = ["full", "bust", "head"] as const;
export type MascotCrop = (typeof MASCOT_CROPS)[number];
