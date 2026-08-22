/**
 * The pose table: one entry per pose, giving where the hands go, how the legs
 * stand, and what the character is holding if the caller does not say.
 *
 * Hand positions are **absolute viewBox coordinates**, not offsets from the
 * shoulder, and that is the deliberate choice that makes the fleet
 * interchangeable. Every concept has its sockets in roughly the same band, so
 * an absolute hand means the controller lands in the same place on the page
 * whichever character is holding it — the arm simply comes out a little longer
 * or shorter to reach it. Offsets would have put the prop somewhere different
 * for every species and made a lineup impossible to align.
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
  | "wide";

export type PoseSpec = {
  grip: Grip;
  legs: LegStyle;
  handL: Point;
  handR: Point;
  /** Elbow bend for each arm; sign picks which way the curve bows. */
  bowL: number;
  bowR: number;
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
  /**
   * Which arm, if either, gets the idle wave rotation. Only ever set on poses
   * whose hand is empty and free — rotating an arm that is gripping something
   * tears the prop away from the hand.
   */
  waveArm?: "L" | "R";
};

export const POSES: Record<PoseId, PoseSpec> = {
  idle: {
    grip: "side",
    legs: "stand",
    handL: { x: 66, y: 148 },
    handR: { x: 134, y: 148 },
    bowL: 9,
    bowR: -9,
    defaultProp: "none",
    freeHand: true,
  },
  wave: {
    grip: "side",
    legs: "stand",
    handL: { x: 68, y: 148 },
    handR: { x: 154, y: 62 },
    bowL: 8,
    bowR: -14,
    defaultProp: "none",
    freeHand: false,
    waveArm: "R",
  },
  "point-left": {
    grip: "side",
    legs: "stand",
    handL: { x: 32, y: 84 },
    handR: { x: 132, y: 150 },
    bowL: 12,
    bowR: -8,
    defaultProp: "none",
    freeHand: true,
  },
  "point-right": {
    grip: "side",
    legs: "stand",
    handL: { x: 68, y: 150 },
    handR: { x: 168, y: 84 },
    bowL: 8,
    bowR: -12,
    defaultProp: "none",
    freeHand: false,
  },
  "hold-up": {
    grip: "up",
    legs: "stand",
    handL: { x: 72, y: 150 },
    handR: { x: 146, y: 56 },
    bowL: 8,
    bowR: -12,
    defaultProp: "sign",
    freeHand: false,
  },
  controller: {
    grip: "front",
    legs: "wide",
    handL: { x: 84, y: 132 },
    handR: { x: 116, y: 132 },
    bowL: 8,
    bowR: -8,
    defaultProp: "controller",
    freeHand: false,
  },
  "keyboard-mouse": {
    grip: "desk",
    legs: "wide",
    handL: { x: 86, y: 148 },
    handR: { x: 124, y: 148 },
    bowL: 6,
    bowR: -6,
    defaultProp: "keyboard-mouse",
    freeHand: false,
  },
  reading: {
    grip: "front",
    legs: "stand",
    handL: { x: 74, y: 126 },
    handR: { x: 126, y: 126 },
    bowL: 9,
    bowR: -9,
    defaultProp: "book",
    freeHand: false,
  },
  laptop: {
    grip: "desk",
    legs: "wide",
    handL: { x: 80, y: 142 },
    handR: { x: 114, y: 136 },
    bowL: 7,
    bowR: -5,
    defaultProp: "laptop",
    freeHand: false,
  },
  walking: {
    grip: "side",
    legs: "stride",
    handL: { x: 58, y: 130 },
    handR: { x: 142, y: 152 },
    bowL: 10,
    bowR: -10,
    defaultProp: "none",
    freeHand: true,
  },
  jumping: {
    grip: "side",
    legs: "jump",
    handL: { x: 42, y: 54 },
    handR: { x: 158, y: 54 },
    bowL: 14,
    bowR: -14,
    defaultProp: "none",
    freeHand: false,
  },
};

/**
 * Where the held object sits, derived from the grip rather than stored
 * per-pose. Storing it would be a second place for the same fact and would
 * let a pose move its hands without moving what is in them.
 */
export function propAnchor(pose: PoseSpec): Point {
  switch (pose.grip) {
    case "front":
      return { x: (pose.handL.x + pose.handR.x) / 2, y: (pose.handL.y + pose.handR.y) / 2 - 4 };
    case "desk":
      return { x: (pose.handL.x + pose.handR.x) / 2, y: (pose.handL.y + pose.handR.y) / 2 + 2 };
    case "up":
      return pose.handR;
    case "side":
      return pose.handR;
  }
}
