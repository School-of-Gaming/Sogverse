/**
 * The symbol face, rewritten in blocks.
 *
 * This is not a fourth face *design* — `face-legacy.tsx` and `face-warm.tsx`
 * are the two rejected rounds and this is neither. It is the round-three
 * grammar spoken in a different alphabet, the same way the screen face is:
 * four dials, flat primitives, nothing with an interior, no realism cue
 * anywhere. What changes is that every primitive is an axis-aligned
 * rectangle, because it is worn by a species built entirely out of cubes and
 * an ellipse on that head reads as a sticker somebody put there.
 *
 * The four dials, block by block:
 *
 * 1. **Eye size and shape** — a white *square* and how big it is. Focused
 *    squashes it to a wide bar, exactly as the ellipse squeezes to a lens.
 * 2. **Pupil position** — a smaller dark square inside it, clamped so it can
 *    never leave its own white. The clamp is new and is not a stylistic
 *    choice: a square pupil has corners, so the ellipse version's "the
 *    numbers happen to fit" is not good enough here.
 * 3. **Brow angle** — a brow cannot be a rotated line in this idiom, so the
 *    angle becomes a **stair**: three blocks at different heights, and which
 *    way they step is the slope. Arched up in the middle is delight, stepping
 *    down towards the nose is concentration, one brow up and one flat is
 *    thinking about it.
 * 4. **Mouth shape** — a stepped run of blocks. A smile is a shallow valley,
 *    a laugh is the same valley filled in, surprise is a single square.
 *
 * The one thing deliberately *not* translated is the closed eye. An arc has no
 * blocky spelling, so a shut eye is a three-step arch of blocks — the same
 * "this eye has closed, so there is no white and no pupil" shape change the
 * ellipse face makes, rather than a lidded eye, which would be a realism cue.
 */

import type { ReactElement } from "react";

import type { DetailLevel } from "./detail";
import type { Colorway } from "./palette";
import type { Rig } from "./rig";
import type { ExpressionId } from "./vocabulary";

type Centre = { x: number; y: number; side: -1 | 1 };

export type VoxelEyeProps = {
  centres: Centre[];
  colors: Colorway;
  expression: ExpressionId;
  /** The eye radius the rest of the face works in. Half a square's side here. */
  r: number;
  /** Brow, closed-eye and mouth colour. */
  ink: string;
  /**
   * Where the pupil sits relative to its own white, already resolved from the
   * mood and the gaze. Passed in rather than recomputed so the precedence rule
   * lives in exactly one place — see `pupilOffset`.
   */
  pupil: { dx: number; dy: number };
};

/**
 * Half-extents of the white and the pupil, in multiples of the eye radius.
 *
 * The numbers are the ellipse face's own, so an expression is the same size on
 * a cube head as on a round one and a lineup of both stays visually level.
 */
const EYE_BLOCK: Record<Exclude<ExpressionId, "laughing">, { w: number; h: number; p: number }> = {
  happy: { w: 1, h: 1, p: 0.56 },
  excited: { w: 1.22, h: 1.22, p: 0.7 },
  thinking: { w: 1, h: 1, p: 0.56 },
  surprised: { w: 1.16, h: 1.16, p: 0.42 },
  focused: { w: 1.06, h: 0.54, p: 0.44 },
};

function clamp(value: number, limit: number): number {
  return Math.min(limit, Math.max(-limit, value));
}

export function VoxelEyes({
  centres,
  colors,
  expression,
  r,
  ink,
  pupil,
}: VoxelEyeProps): ReactElement {
  return (
    <>
      {centres.map(({ x, y, side }) => {
        if (expression === "laughing") {
          const w = r * 0.74;
          const t = r * 0.46;
          return (
            <g key={side} fill={ink}>
              <rect x={x - w * 1.5} y={y + r * 0.06} width={w} height={t} />
              <rect x={x - w * 0.5} y={y - r * 0.42} width={w} height={t} />
              <rect x={x + w * 0.5} y={y + r * 0.06} width={w} height={t} />
            </g>
          );
        }
        const { w, h, p } = EYE_BLOCK[expression];
        // A square pupil in a square white has corners to lose, so the offset
        // is clamped to the slack that actually exists rather than trusted to
        // be small enough.
        const dx = clamp(pupil.dx, Math.max(0, (w - p) * r));
        const dy = clamp(pupil.dy, Math.max(0, (h - p) * r));
        return (
          <g key={side}>
            <rect
              x={x - w * r}
              y={y - h * r}
              width={w * 2 * r}
              height={h * 2 * r}
              fill={colors.sclera}
            />
            <rect
              x={x + dx - p * r}
              y={y + dy - p * r}
              width={p * 2 * r}
              height={p * 2 * r}
              fill={colors.pupil}
            />
          </g>
        );
      })}
    </>
  );
}

/**
 * One brow as a stair, given the heights of its three blocks in multiples of
 * the eye radius. Negative is higher, matching SVG's own sense of down.
 */
type Stair = { y: number; steps: readonly [number, number, number] };

/**
 * Which stair each mood climbs. `focused` and `thinking` are mirrored per eye
 * so that the *inner* end — the one nearest the centre line — is the end that
 * moves, which is what turns a stair into a scowl rather than into a slant.
 */
function stairFor(expression: ExpressionId, side: -1 | 1): Stair | null {
  switch (expression) {
    case "happy":
    case "laughing":
      return null;
    case "excited":
      return { y: -1.7, steps: [0.4, -0.28, 0.4] };
    case "surprised":
      return { y: -2.1, steps: [0.28, -0.2, 0.28] };
    case "focused":
      return side === -1
        ? { y: -1.5, steps: [-0.45, 0, 0.45] }
        : { y: -1.5, steps: [0.45, 0, -0.45] };
    case "thinking":
      // One up, one level: the asymmetry is the whole gesture, and on a
      // cyclops (one centre, `side` always 1) it becomes a single raised brow,
      // which is the same joke told with half the parts.
      return side === 1
        ? { y: -2.1, steps: [0, 0, 0] }
        : { y: -1.55, steps: [0.16, 0, -0.16] };
  }
}

export function VoxelBrows({
  centres,
  expression,
  r,
  ink,
}: {
  centres: Centre[];
  expression: ExpressionId;
  r: number;
  ink: string;
}): ReactElement | null {
  const w = r * 0.72;
  const h = Math.max(2.6, r * 0.42);
  return (
    <>
      {centres.map(({ x, y, side }) => {
        const stair = stairFor(expression, side);
        if (stair === null) return null;
        return (
          <g key={side} fill={ink}>
            {stair.steps.map((step, i) => (
              <rect
                key={i}
                x={x + (i - 1.5) * w}
                y={y + (stair.y + step) * r}
                width={w}
                height={h}
              />
            ))}
          </g>
        );
      })}
    </>
  );
}

/**
 * The mouth, as blocks on a grid. Each entry is `[x, y, w, h]` in grid units
 * from the mouth's own centre, so an expression is a shape rather than a
 * curve and the whole set stays on one grid.
 */
const MOUTH_BLOCKS: Record<ExpressionId, readonly (readonly [number, number, number, number])[]> = {
  // A shallow valley: the ends sit a step above the middle.
  happy: [
    [-2.5, -1, 1, 1],
    [-1.5, 0, 3, 1],
    [1.5, -1, 1, 1],
  ],
  // The same valley, two steps deep and two units wider.
  excited: [
    [-3.5, -2, 1, 1],
    [-2.5, -1, 1, 1],
    [-1.5, 0, 3, 1],
    [1.5, -1, 1, 1],
    [2.5, -2, 1, 1],
  ],
  // The valley filled in — an open mouth, one solid stepped shape with no
  // interior, no teeth and no tongue.
  laughing: [
    [-3, -1, 6, 1],
    [-2, 0, 4, 1],
    [-1, 1, 2, 1],
  ],
  // Off to one side, which is the same gesture the curve version makes.
  thinking: [[-1, 0, 3.5, 1]],
  focused: [[-2.5, 0, 5, 1]],
  surprised: [[-1, -0.6, 2, 2]],
};

export function VoxelMouth({
  rig,
  expression,
  detail,
  ink,
}: {
  rig: Rig;
  expression: ExpressionId;
  detail: DetailLevel;
  ink: string;
}): ReactElement {
  // The grid coarsens at icon size for the same reason the ellipse face's
  // stroke thickens there: at 24 pixels a mouth is either chunky or absent.
  const u = detail === "icon" ? 3.8 : 3.2;
  const x = rig.head.x;
  const y = rig.mouthY - u * 0.5;
  return (
    <g fill={ink}>
      {MOUTH_BLOCKS[expression].map(([bx, by, bw, bh], i) => (
        <rect key={i} x={x + bx * u} y={y + by * u} width={bw * u} height={bh * u} />
      ))}
    </g>
  );
}
