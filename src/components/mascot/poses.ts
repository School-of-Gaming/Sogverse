/**
 * The pose table: one entry per pose, giving where the hands go, how the legs
 * stand, how far off the ground the whole figure sits, and what the character
 * is holding if the caller does not say.
 *
 * Hand positions are **absolute viewBox coordinates**, not offsets from the
 * shoulder, and that is the deliberate choice that makes the fleet
 * interchangeable. Every concept has its sockets in roughly the same band, so
 * an absolute hand means the controller lands in the same place on the page
 * whichever character is holding it — the arm simply comes out a little longer
 * or shorter to reach it. Offsets would have put the prop somewhere different
 * for every species and made a lineup impossible to align.
 *
 * There is no elbow data here. Round one carried a `bow` per arm that decided
 * which way the curve bulged, and it was wrong in every pose where the hand
 * left the character's side. The limb renderer now derives the joint from the
 * geometry — outboard of the centre line — so a pose says where the hand is
 * and nothing about how the arm gets there.
 */

import type { Point } from "./rig";
import type { Grip, PoseId, PropId } from "./vocabulary";

/** How the legs are arranged under the body. */
export type LegStyle =
  /** Planted, both soles down. */
  | "stand"
  /**
   * The walk stance: both feet on the ground line and directly under their own
   * hip sockets, knees carrying a shallow outward bow.
   *
   * It looks like a narrow stand and that is the point. Every concept here is
   * drawn front-on, so a stride cannot be shown by putting one foot in front of
   * the other — there is no "in front" on this canvas. The old geometry moved
   * the feet fifteen units apart in x and then the walk cycle rotated each leg
   * about its hip, which swings a foot sideways: two legs scissoring outward
   * and back is a jumping jack, not a walk. The gait is in the animation
   * instead, as a per-leg vertical foreshortening about the hip — the stepping
   * leg at full extension with its sole on the ground line, the trailing one
   * shortened with its sole lifted — which is what a leg going away from the
   * viewer actually does to a front-on drawing. A leg scaled in y about its own
   * socket cannot move its foot in x, so the scissor is structurally impossible
   * rather than merely tuned away.
   */
  | "stride"
  /**
   * The hop stance: feet under the hips and on the ground line, knees bowed.
   *
   * It is drawn *standing* on purpose, even though the pose it belongs to is
   * airborne, and the reason is that one shared keyframe cannot pin two things
   * at once. The body keyframe translates the whole figure by a fixed number
   * of viewBox units, so it can put the soles on the ground line or the body
   * back at its standing height, and it can only do both if the feet are drawn
   * where a standing figure's feet go. An earlier pass drew them ten units up,
   * which landed the soles perfectly and sank a bear's belly seven units
   * through the floor.
   *
   * The tuck is the animation's, not the drawing's: the legs run their own
   * keyframe that folds them while the figure is in the air and returns to
   * *identity* — no transform at all — for the takeoff and landing frames, so
   * the exactness costs nothing and the tuck comes free.
   */
  | "jump"
  /** Planted but braced apart — the stance you take to do something. */
  | "wide"
  /** Thighs forward, shins down: sitting on something. */
  | "sit";

export type PoseSpec = {
  grip: Grip;
  legs: LegStyle;
  handL: Point;
  handR: Point;
  /**
   * How far the whole figure sits off its default baseline, positive up. Round
   * one's jump lifted the legs and left the body where it was, which reads as
   * a star jump rather than as air; a jump is a pose whose body is *higher*,
   * and a seat is one whose body is lower.
   */
  lift: number;
  /** What lands in the hands when the caller passes no prop and no role. */
  defaultProp: PropId;
  /**
   * True when the right hand is free, low, and could plausibly be carrying
   * something. It is what lets a role fill an empty pose — a gamer standing
   * idle holds their controller — without putting a mug in the hand of a
   * character who is mid-jump or mid-wave, where a prop would read as
   * something they had just thrown.
   */
  freeHand: boolean;
};

export const POSES: Record<PoseId, PoseSpec> = {
  idle: {
    grip: "side",
    legs: "stand",
    handL: { x: 66, y: 148 },
    handR: { x: 134, y: 148 },
    lift: 0,
    defaultProp: "none",
    freeHand: true,
  },
  wave: {
    grip: "side",
    legs: "stand",
    handL: { x: 68, y: 148 },
    handR: { x: 156, y: 58 },
    lift: 0,
    defaultProp: "none",
    freeHand: false,
  },
  "point-left": {
    grip: "side",
    legs: "stand",
    handL: { x: 34, y: 88 },
    handR: { x: 132, y: 150 },
    lift: 0,
    defaultProp: "none",
    freeHand: true,
  },
  "point-right": {
    grip: "side",
    legs: "stand",
    handL: { x: 68, y: 150 },
    handR: { x: 166, y: 88 },
    lift: 0,
    defaultProp: "none",
    freeHand: false,
  },
  "hold-up": {
    grip: "up",
    legs: "stand",
    handL: { x: 72, y: 150 },
    handR: { x: 146, y: 74 },
    lift: 0,
    defaultProp: "sign",
    freeHand: false,
  },
  controller: {
    grip: "front",
    legs: "wide",
    handL: { x: 78, y: 136 },
    handR: { x: 122, y: 136 },
    lift: 0,
    defaultProp: "controller",
    freeHand: false,
  },
  "keyboard-mouse": {
    grip: "desk",
    legs: "wide",
    handL: { x: 80, y: 150 },
    handR: { x: 126, y: 150 },
    lift: 0,
    defaultProp: "keyboard-mouse",
    freeHand: false,
  },
  reading: {
    grip: "front",
    legs: "stand",
    handL: { x: 74, y: 126 },
    handR: { x: 126, y: 126 },
    lift: 0,
    defaultProp: "book",
    freeHand: false,
  },
  laptop: {
    grip: "desk",
    legs: "wide",
    handL: { x: 78, y: 144 },
    handR: { x: 120, y: 140 },
    lift: 0,
    defaultProp: "laptop",
    freeHand: false,
  },
  /**
   * Out for a walk, coming towards you.
   *
   * Both hands hang at the hip, and symmetrically, which is a change from the
   * asymmetric reach round two used to suggest a stride. Two things wanted it.
   * The swing belongs to the animation — an arm counter-swinging about its own
   * shoulder says "walking" and a hand parked forward in the still does not —
   * and a species with `armsOnDemand` reads a pair of hands at the hip line as
   * a rest and grows no arms at all, which is the correct answer for an
   * armless Silmu out for a stroll: it walks on its legs and its lean.
   */
  walking: {
    grip: "side",
    legs: "stride",
    handL: { x: 66, y: 146 },
    handR: { x: 134, y: 146 },
    lift: 0,
    defaultProp: "none",
    freeHand: true,
  },
  /**
   * The jumppa hop — the register here is the mid-club exercise break, where a
   * room of kids gets off the computers and jumps about for two minutes, not a
   * weightless video-game leap. Snappy, physical and cheerful: the still frame
   * is the apex, arms thrown up and feet tucked, and the animation around it is
   * crouch, pop, hang, land.
   *
   * `lift` is how far the figure has to come back down to stand on the ground
   * line and the jump keyframe is written from it, so raising the apex is a
   * one-number change here. Mind the canvas when doing it: the still frame is
   * the apex, and a tall hat on a tall build is already near the top edge.
   *
   * The hands are eight units lower than round two put them, and no further in,
   * and both halves of that are about the *swing* rather than the still. The
   * arms come all the way down to the sides on the ground frames — a rotation
   * of about a hundred and forty degrees about the shoulder — and a rotation
   * is a circle of whatever radius the pose asked for, so a long reach put a
   * bear's paw below the ground line at the bottom of it. Dropping the hands
   * shortens that radius. Pulling them *inward* would shorten it further and
   * is the thing not to do: past x=44 they cross the reach cutoff, so a wide
   * species has them nudged outward again by its own reach — a different
   * answer per species — and on the widest of them the whole arm ends up
   * drawn inside the body's own silhouette, which is an armless jump with the
   * cost of two arms.
   */
  jumping: {
    grip: "side",
    legs: "jump",
    handL: { x: 44, y: 60 },
    handR: { x: 156, y: 60 },
    lift: 22,
    defaultProp: "none",
    freeHand: false,
  },
  seated: {
    grip: "desk",
    legs: "sit",
    handL: { x: 80, y: 142 },
    handR: { x: 124, y: 142 },
    lift: -6,
    defaultProp: "keyboard-mouse",
    freeHand: false,
  },
  /**
   * At work on a surface beside them: brush hand up and out to the viewer's
   * left at head height, the other hand down at the hip.
   *
   * The hand is at x=44 rather than a rounder number for a reason worth
   * knowing about before moving it. `reachedHand` pushes any hand within 55
   * units of the centre line further out by the species' reach, so that a
   * wide body does not swallow its own arm; a painting hand at, say, 50 would
   * be *corrected* on Silmu and Konsu and land somewhere different on them
   * than on Kaveri, which is exactly the thing a scene beside the character
   * cannot survive. Past the cutoff every species agrees.
   */
  painting: {
    grip: "up-left",
    legs: "stand",
    handL: { x: 44, y: 84 },
    handR: { x: 134, y: 148 },
    lift: 0,
    defaultProp: "paintbrush",
    freeHand: false,
  },
};

/**
 * How far the jump keyframe must translate the whole figure to stand it back
 * on the ground.
 *
 * The pose draws the apex, so the ground is `lift` below where the still frame
 * puts it — in viewBox units, identically for every species, because the legs
 * are drawn standing. Read from the table rather than typed into the keyframe,
 * because a keyframe carrying a hand-copied 22 is a keyframe that silently
 * stops touching the floor the day somebody raises the hop.
 */
export const JUMP_GROUND_DROP = POSES.jumping.lift;

/**
 * Where the held object sits, derived from the grip and from the hands as they
 * finally landed — after the species' reach correction, not before. Storing an
 * anchor per pose would be a second place for the same fact, and would let a
 * wide character's hands move without the thing they are holding following.
 */
export function propAnchor(grip: Grip, handL: Point, handR: Point): Point {
  switch (grip) {
    case "front":
      return { x: (handL.x + handR.x) / 2, y: (handL.y + handR.y) / 2 - 4 };
    case "desk":
      return { x: (handL.x + handR.x) / 2, y: (handL.y + handR.y) / 2 + 2 };
    case "up":
      return handR;
    case "up-left":
      return handL;
    case "side":
      return handR;
  }
}
