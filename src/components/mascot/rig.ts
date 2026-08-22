/**
 * The skeleton every mascot concept hangs off.
 *
 * All five concepts draw into the same `0 0 200 200` viewBox with the same
 * ground line, so a Ytymo and a Kaveri are drop-in replacements for each other
 * in any layout — same footprint, same optical size, same baseline. What
 * differs between them is where the joints sit, and that is exactly what a
 * `Rig` records. Poses, props, expressions and role costumes all read their
 * positions from the rig rather than from constants of their own, which is why
 * one pose table drives five different bodies.
 */

export type Point = { x: number; y: number };

/** How a concept's feet are drawn — a paw/nub, or a boot/shoe. */
export type FootStyle = "round" | "boot";

export type Rig = {
  /** The ground shadow ellipse. Outside the bob animation so it stays put. */
  shadow: { cx: number; cy: number; rx: number; ry: number };
  /** Where the legs leave the body, and where the soles rest. */
  hip: Point;
  hipSpread: number;
  footY: number;
  footStyle: FootStyle;
  /** Arm sockets, in viewer order. */
  shoulderL: Point;
  shoulderR: Point;
  /** Head centre plus the nominal radius accessories scale against. */
  head: Point & { r: number };
  /** Eye offset from the head's centre line, absolute eye row, eye radius. */
  eyeDx: number;
  eyeY: number;
  eyeR: number;
  /** Where the mouth is centred. */
  mouthY: number;
  /**
   * Where a hat sits, and how wide the head is at that height. Kept as its own
   * pair rather than derived from `head` because the top of a silhouette is
   * rarely a circle's north pole — a droplet tapers, a hexagon comes to a
   * point, and a bear has ears in the way.
   */
  crown: Point;
  crownW: number;
  /**
   * How far this species' hands are pushed out from the centre line, in
   * viewBox units. A wide body swallows its own arms — a hand that the pose
   * table puts at the hip lands *inside* a droplet or a chassis, and the arm
   * disappears into the silhouette. Rather than fork the pose table per
   * species, a wide concept declares how much further out its hands need to be
   * and every pose gets the correction for free.
   *
   * It applies only to hands that are already close to the body. A pointing
   * arm or a star jump is deliberately far out and must not be pushed further,
   * or a wide species points off the edge of the canvas.
   */
  reach: number;
  /** Stroke width of a limb, and the radius of the hand on the end of it. */
  limbW: number;
  handR: number;
  /** The chest box a badge, lanyard or cardigan is fitted to. */
  torso: { x: number; y: number; w: number; h: number };
  /**
   * True when the head and body are one shape. A fused head must not be
   * tilted independently in the idle animation — there is no neck to tilt at,
   * and rotating the face alone slides it off its own body.
   */
  fusedHead: boolean;
};

/** Two decimals is plenty at this scale and keeps the exported markup small. */
function n(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/**
 * A limb, as one quadratic curve from socket to hand. `bow` bends it sideways
 * off the straight line — positive bows one way, negative the other — which is
 * the whole of the elbow model. It is enough because the arms are thick
 * rounded strokes: a real two-segment elbow would add joints to every pose
 * entry and read as a crease nobody asked for.
 */
export function limbPath(from: Point, to: Point, bow: number): string {
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  const scale = len === 0 ? 0 : bow / len;
  return `M ${n(from.x)} ${n(from.y)} Q ${n(mx - dy * scale)} ${n(my + dx * scale)} ${n(to.x)} ${n(to.y)}`;
}

/** Beyond this horizontal distance from the centre, a hand is already out. */
const REACH_CUTOFF = 55;

/** Applies a species' reach correction to one pose-supplied hand position. */
export function reachedHand(rig: Rig, hand: Point): Point {
  const dx = hand.x - 100;
  if (rig.reach === 0 || Math.abs(dx) >= REACH_CUTOFF) return hand;
  return { x: hand.x + Math.sign(dx) * rig.reach, y: hand.y };
}

/** Midpoint of two points — where a two-handed prop wants to sit. */
export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Formats a point pair for a `transform-origin` in user (viewBox) units. */
export function originOf(p: Point): string {
  return `${n(p.x)}px ${n(p.y)}px`;
}

/** The canonical drawing surface. Every concept, every pose, every prop. */
export const MASCOT_VIEWBOX = "0 0 200 200";
/** The bottom of the character, used as the origin of the breathe scale. */
export const MASCOT_BASELINE: Point = { x: 100, y: 182 };
