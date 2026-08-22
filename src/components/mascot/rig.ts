/**
 * The skeleton every mascot concept hangs off.
 *
 * All concepts draw into the same `0 0 200 200` viewBox with the same ground
 * line, so a Ytymo and a Kaveri are drop-in replacements for each other in any
 * layout — same footprint, same optical size, same baseline. What differs
 * between them is where the joints sit, and that is exactly what a `Rig`
 * records. Poses, props, expressions and role costumes all read their
 * positions from the rig rather than from constants of their own, which is why
 * one pose table drives every body.
 *
 * A rig is not always a per-species constant. A concept may vary it per
 * *form* — an adult Kaveri is taller and smaller-headed than a kid one, a moose
 * carries antlers where a seal carries nothing — which is why everything
 * downstream takes the rig as an argument rather than importing one.
 */

export type Point = { x: number; y: number };

/** How a concept's feet are drawn — a paw/nub, or a boot/shoe. */
export type FootStyle = "round" | "boot";

/**
 * How a limb gets from its socket to its hand.
 *
 * Round one drew both as a single curved stroke, and it broke exactly where an
 * arm has to *do* something: a wave, a point and a hold-up all read as a
 * boneless hose flung at the target, because a quadratic curve has no elbow
 * and bows the wrong way the moment the hand leaves the character's side.
 * Both styles here are two straight tapered segments meeting at a joint; they
 * differ only in where that joint is put.
 *
 * - `jointed` solves the elbow by two-bone inverse kinematics and puts it
 *   *outboard* — away from the body's centre line, the way a real arm folds.
 *   The bend is sharp and anatomical, which is what a person, a robot or a
 *   folded plane wants.
 * - `tapered` puts the joint on the straight line's midpoint, nudged sideways.
 *   There is no anatomy in it: it is a soft noodle limb with a suggestion of a
 *   shoulder, which is what a droplet or a round animal wants — those have no
 *   visible elbow and would look wrong given one.
 *
 * Both taper from socket to wrist and cap with a disc at each end, so a limb
 * still reads as a limb at 24 pixels rather than as a line.
 */
export type LimbStyle = "jointed" | "tapered";

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
   * rarely a circle's north pole — a spark comes to a point, a hexagon has a
   * corner there, and a bear has ears in the way.
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
  /** Limb width at the socket, and the radius of the hand on the end of it. */
  limbW: number;
  handR: number;
  /** How this species' arms and legs bend. */
  limbStyle: LimbStyle;
  /**
   * Total straight length of an arm and of a leg. The inverse-kinematic solve
   * needs a bone length; without one there is no elbow to place. Set it a
   * little longer than the furthest the pose table reaches, or the arm locks
   * straight in the poses that stretch hardest.
   */
  armLen: number;
  legLen: number;
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
export function n(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/**
 * Where the joint of a two-segment limb lands.
 *
 * "Outward" is the sign convention nobody has to think about: whichever of the
 * two IK solutions puts the joint further from the body's centre line wins.
 * That is right for every pose in the table at once — an arm hanging at the
 * side bows out at the elbow, a raised waving arm bows out and down, a
 * pointing arm is nearly straight so the choice barely matters — and it means
 * the pose table carries no elbow data at all.
 */
export function jointFor(
  style: LimbStyle,
  from: Point,
  to: Point,
  totalLen: number,
  centreX: number,
): Point {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 0.001) return { x: from.x, y: from.y };
  const ux = dx / dist;
  const uy = dy / dist;
  // Perpendicular to the socket-to-hand line. Which side counts as outward is
  // decided below by distance from the centre line, so handedness is free.
  const px = -uy;
  const py = ux;

  if (style === "tapered") {
    // No anatomy: a soft bend at the midpoint, always away from the centre.
    const away = from.x + dx / 2 < centreX ? -1 : 1;
    const bend = Math.min(7, dist * 0.16);
    return { x: from.x + dx / 2 + px * bend * away, y: from.y + dy / 2 + py * bend * away };
  }

  // `totalLen` is how long this species' arm *is*, but it is only an upper
  // bound on how long it is allowed to look. A pose that puts the hand close
  // to the shoulder — a wave, a hand on a desk — would otherwise have to fold
  // the whole surplus into one elbow and come out as a folded deckchair. So
  // the bone length is clamped to a fixed slack over the distance actually
  // being covered: always some bend, never a huge one, and the number in the
  // rig stops being a value anybody has to tune per pose.
  const effective = Math.max(dist * 1.06, Math.min(totalLen, dist * 1.22));
  const upper = effective * 0.52;
  const fore = effective * 0.48;
  const reachable = Math.min(dist, upper + fore - 0.01);
  // Standard two-bone solve: how far along the line the joint projects, and
  // how far off that line it sits.
  const along = (upper * upper - fore * fore + reachable * reachable) / (2 * reachable);
  const off = Math.sqrt(Math.max(0, upper * upper - along * along));
  const baseX = from.x + ux * along;
  const baseY = from.y + uy * along;
  const a = { x: baseX + px * off, y: baseY + py * off };
  const b = { x: baseX - px * off, y: baseY - py * off };
  return Math.abs(a.x - centreX) >= Math.abs(b.x - centreX) ? a : b;
}

/** Midpoint of two points — where a two-handed prop wants to sit. */
export function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

/** Beyond this horizontal distance from the centre, a hand is already out. */
const REACH_CUTOFF = 55;

/** Applies a species' reach correction to one pose-supplied hand position. */
export function reachedHand(rig: Rig, hand: Point): Point {
  const dx = hand.x - 100;
  if (rig.reach === 0 || Math.abs(dx) >= REACH_CUTOFF) return hand;
  return { x: hand.x + Math.sign(dx) * rig.reach, y: hand.y };
}

/** Formats a point pair for a `transform-origin` in user (viewBox) units. */
export function originOf(p: Point): string {
  return `${n(p.x)}px ${n(p.y)}px`;
}

/** The canonical drawing surface. Every concept, every pose, every prop. */
export const MASCOT_VIEWBOX = "0 0 200 200";
/** The bottom of the character, used as the origin of the breathe scale. */
export const MASCOT_BASELINE: Point = { x: 100, y: 182 };
/** The vertical centre line every "outward" decision is measured against. */
export const MASCOT_CENTRE_X = 100;
