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
  /** Mid-step: one foot forward, one trailing. */
  | "stride"
  /** Both feet off the ground and kicked outward. */
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
  walking: {
    grip: "side",
    legs: "stride",
    handL: { x: 60, y: 132 },
    handR: { x: 142, y: 150 },
    lift: 0,
    defaultProp: "none",
    freeHand: true,
  },
  jumping: {
    grip: "side",
    legs: "jump",
    handL: { x: 44, y: 52 },
    handR: { x: 156, y: 52 },
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
