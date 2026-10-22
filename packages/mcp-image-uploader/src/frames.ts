/*
 * How the uploader judges a picked picture against the frames its opening
 * offers. Pure, with no DOM, so the rules are tested on their own.
 *
 * The view never crops a picture to a frame it is not already the shape of:
 * a picture whose ratio is within `RATIO_TOLERANCE` of a frame's is that
 * frame's shape, and is only scaled to the frame's exact size — trimming the
 * sliver of under 1% the two ratios differ by, which nobody can see. Any
 * other picture is refused, with a sentence saying why.
 */

/** One frame the opening offers: a catalogue purpose's exact size, how it is named, and whether this destination takes it. */
export interface Frame {
  purpose: string;
  /** How the admin is told the shape: `wide 16:9`. */
  name: string;
  width: number;
  height: number;
  /** Why this destination does not take this shape, or null when it does. */
  refusal: string | null;
}

/** How far a picture's ratio may be from a frame's and still be that frame's shape: 1%. */
export const RATIO_TOLERANCE = 0.01;

/** How far apart two ratios are, as a share of the second. */
function ratioDistance(width: number, height: number, frame: Frame): number {
  return Math.abs(width / height / (frame.width / frame.height) - 1);
}

/** The frame a picture of this size is already the shape of, within the tolerance, or null. The nearest wins. */
export function matchFrame(width: number, height: number, frames: readonly Frame[]): Frame | null {
  let best: Frame | null = null;
  for (const frame of frames) {
    const distance = ratioDistance(width, height, frame);
    if (distance > RATIO_TOLERANCE) continue;
    if (best === null || distance < ratioDistance(width, height, best)) best = frame;
  }
  return best;
}

function greatestCommonDivisor(a: number, b: number): number {
  return b === 0 ? a : greatestCommonDivisor(b, a % b);
}

/**
 * A picture's ratio as an admin would say it: in lowest terms when those are
 * small (`3:2`, `4:3`, `9:16`), otherwise to two places against 1, the longer
 * side first (`1.73:1`, `1:2.16`).
 */
export function describeRatio(width: number, height: number): string {
  const divisor = greatestCommonDivisor(width, height);
  const across = width / divisor;
  const down = height / divisor;
  if (across <= 32 && down <= 32) return `${across}:${down}`;
  return width >= height
    ? `${(width / height).toFixed(2)}:1`
    : `1:${(height / width).toFixed(2)}`;
}

/** What the view makes of a picked picture. */
export type Verdict =
  | { kind: "fits"; frame: Frame }
  | { kind: "refused"; reason: string };

/**
 * Whether a picture of this size can be uploaded here, and as which frame:
 * a picture of an offered shape that this destination takes fits; one of an
 * offered shape it does not take, or of no offered shape, is refused with a
 * sentence naming its size, its shape and the rule.
 */
export function judgePicture(
  width: number,
  height: number,
  opening: { frames: readonly Frame[]; noFrame: string },
): Verdict {
  const frame = matchFrame(width, height, opening.frames);
  if (frame !== null && frame.refusal === null) return { kind: "fits", frame };
  const size = `${width} × ${height}`;
  return frame === null
    ? { kind: "refused", reason: `This picture is ${describeRatio(width, height)} (${size}). ${opening.noFrame}` }
    : { kind: "refused", reason: `This picture is ${frame.name} (${size}). ${frame.refusal}` };
}

/**
 * The part of a picture drawn into a frame it fits: the whole picture, less
 * the sliver its ratio differs from the frame's by, taken evenly from both
 * ends of the longer side.
 */
export function sourceRect(
  width: number,
  height: number,
  frame: Pick<Frame, "width" | "height">,
): { sx: number; sy: number; sw: number; sh: number } {
  const ratio = frame.width / frame.height;
  let sw = width;
  let sh = height;
  if (sw / sh > ratio) sw = Math.round(sh * ratio);
  else sh = Math.round(sw / ratio);
  return { sx: Math.round((width - sw) / 2), sy: Math.round((height - sh) / 2), sw, sh };
}
