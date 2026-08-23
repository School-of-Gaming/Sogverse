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

/**
 * How a concept's feet are drawn — a paw/nub, a boot/shoe, or a square-cornered
 * block for a species whose whole body is cubes and on which a rounded sole
 * would be the only curve in the drawing.
 */
/**
 * How a concept's feet are drawn — a paw/nub, a boot/shoe, a voxel block, or a
 * `stem` foot: a straight leg ending in a rounded lobe that swells to one side
 * only, so the pair reads as a lowercase `d` and `b`. That last one is traced
 * off the legacy SOG mascot, where the leg is a constant-width column about a
 * ninth of the body's width and the foot under it is a lobe about a fifth of it
 * across — see the measurements at the top of `concepts/silmu.tsx`.
 */
export type FootStyle = "round" | "boot" | "block" | "stem";

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
 *
 * - `blocky` is `jointed`'s geometry with the drawing squared off: the elbow
 *   is solved the same anatomical way, but the segments keep one width instead
 *   of tapering and every cap is a square instead of a disc. It exists because
 *   a species made of cubes cannot have the only round things on it be its own
 *   arms — the taper and the three discs are precisely the cues that say
 *   "drawn with a brush", and they fight a body that says "stacked out of
 *   blocks". It shares `jointed`'s solve rather than inventing one, so it
 *   inherits every pose in the table with no elbow data of its own.
 *
 * - `straight` has no joint at all: the limb is one tapered wedge from socket
 *   to hand, and the "joint" is simply the point halfway along that line with
 *   nothing done to it. It is not a simplification of the others — it is what
 *   the legacy SOG mascot's arms actually are, in the three files that have
 *   any (`maalari`, `hello_minion_SOG@2x`, `back_minion`): a wide wedge
 *   leaving the body and narrowing to a mitten, dead straight, with no bend
 *   anywhere along it. Even `tapered`'s soft midpoint nudge is wrong for that,
 *   because a seven-unit bow on a short arm reads as a bent one.
 */
export type LimbStyle = "jointed" | "tapered" | "blocky" | "straight";

/**
 * What is on the end of an arm.
 *
 * `disc` is the default and is what every concept had before there was a
 * choice. `mitten` adds one small circle for a thumb, on the *inner* side of
 * the hand — towards the body's centre line — which is where the legacy
 * mascot's arms put theirs and is the whole of what makes a black blob on the
 * end of a black wedge read as a hand rather than as a knob.
 */
export type HandStyle = "disc" | "mitten";

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
  /** What the arms end in. Absent means `disc`, which is what everything was. */
  handStyle?: HandStyle;
  /**
   * True when this species leaves the ground at rest **on purpose**.
   *
   * The idle is grounded for everything else: a character standing in a scene
   * breathes and shifts its weight with its soles where they were, because
   * lifting the whole figure and setting it back down reads as hovering and a
   * hovering character is pasted onto the scene rather than standing in it.
   * That makes hovering a statement about the species rather than a default of
   * the rig — a spark of condensed element, a winged bug — so it is declared
   * here, once, and only the concepts that fly turn it on.
   *
   * It lives on the rig rather than on the concept because it is a property of
   * the *build*: an animal family has one form with wings and a dozen without,
   * and those share everything else.
   */
  hovers?: boolean;
  /**
   * True when this species only has arms while it is *using* them.
   *
   * Most concepts have arms the way a person does: always there, hanging at
   * the side when idle. The legacy SOG mascot does not — thirteen of its
   * sixteen files have no arms at all, and the three that do are painting,
   * waving hello, or reaching up. Arms on that body are not anatomy, they are
   * something it grows to do a job and puts away afterwards, and drawing two
   * stubs at its hips in every idle render is both wrong about the character
   * and, at 150 pixels, competing with the one eye that is supposed to be the
   * whole design.
   *
   * The renderer decides "using them" from the pose the caller asked for
   * rather than from a list kept here: a pose whose hands both sit at the hip
   * line is a rest pose, and a pose holding a prop needs hands whatever its
   * hands' coordinates say. That keeps the pose table free of a per-species
   * flag and means a pose added later — one holding a paintbrush, say — gets
   * the right answer without anybody remembering this exists.
   */
  armsOnDemand?: boolean;
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

  // No joint: the midpoint of the line, untouched. Both segments are then
  // collinear and the limb is one straight wedge.
  if (style === "straight") {
    return { x: from.x + dx / 2, y: from.y + dy / 2 };
  }

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

/**
 * How far below `footY` each foot style's sole actually reaches, as a multiple
 * of `limbW`.
 *
 * `footY` is where a foot is *anchored*, which is its middle rather than its
 * underside, so it is the wrong line to turn a breath about — a body scaled
 * about it slides its own soles a fraction of a unit every cycle. These are
 * the bottom edges of the four foot shapes drawn in `limbs.tsx`; change one
 * there and change it here, because the drawing and the motion are two
 * questions about the same four numbers and only one of them can be measured
 * at render time.
 */
export const SOLE_DEPTH: Record<FootStyle, number> = {
  round: 0.56,
  boot: 0.62,
  block: 0.7,
  stem: 0.75,
};

/**
 * The ground line: the y the soles rest on, and therefore the origin every
 * grounded idle turns about. A scale or a shear anchored here cannot move a
 * sole, which is the whole property the idle is built on.
 */
export function groundY(rig: Rig): number {
  return rig.footY + rig.limbW * SOLE_DEPTH[rig.footStyle];
}

/** Formats a point pair for a `transform-origin` in user (viewBox) units. */
export function originOf(p: Point): string {
  return `${n(p.x)}px ${n(p.y)}px`;
}

/** The canonical drawing surface. Every concept, every pose, every prop. */
export const MASCOT_VIEWBOX = "0 0 200 200";
/**
 * The nominal bottom of the character — the line every concept arranges its
 * feet around. The motion does not use it: a breath has to turn about the
 * species' own soles, which is `groundY` and is a unit or two lower.
 */
export const MASCOT_BASELINE: Point = { x: 100, y: 182 };
/** The vertical centre line every "outward" decision is measured against. */
export const MASCOT_CENTRE_X = 100;
