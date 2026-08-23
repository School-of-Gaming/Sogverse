/**
 * Round one's arms and legs, kept alive only for the before/after strip on the
 * exploration page.
 *
 * A limb was one thick rounded stroke bowed sideways off the straight line by
 * a number the pose table carried. It reads acceptably for an arm hanging at
 * the character's side, which is what it was tuned against, and it falls apart
 * the moment the hand goes anywhere: the bow is a fixed sideways push rather
 * than a joint, so a raised waving arm bulges *away* from where an elbow would
 * be, a pointing arm curves like a hose, and a hand held overhead is connected
 * to the shoulder by a banana.
 *
 * The bow numbers below were the pose table's; they live here now because the
 * pose table no longer has any elbow data at all — the joint is derived from
 * the geometry instead. Delete this file with the exploration page.
 */

import type { ReactElement } from "react";

import type { LimbPaint } from "./concept";
import type { LegStyle } from "./poses";
import { n, type Point, type Rig } from "./rig";
import type { PoseId } from "./vocabulary";

/** The elbow model that was: a sideways push, per arm, per pose. */
export const LEGACY_BOWS: Record<PoseId, { l: number; r: number }> = {
  idle: { l: 9, r: -9 },
  wave: { l: 8, r: -14 },
  "point-left": { l: 12, r: -8 },
  "point-right": { l: 8, r: -12 },
  "hold-up": { l: 8, r: -12 },
  controller: { l: 8, r: -8 },
  "keyboard-mouse": { l: 6, r: -6 },
  reading: { l: 9, r: -9 },
  laptop: { l: 7, r: -5 },
  walking: { l: 10, r: -10 },
  jumping: { l: 14, r: -14 },
  // Round one had no seated pose; this is what it would have been given.
  seated: { l: 6, r: -6 },
  // Nor a painting one. Same treatment.
  painting: { l: 11, r: -9 },
};

function legacyPath(from: Point, to: Point, bow: number): string {
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  const scale = len === 0 ? 0 : bow / len;
  return `M ${n(from.x)} ${n(from.y)} Q ${n(mx - dy * scale)} ${n(my + dx * scale)} ${n(to.x)} ${n(to.y)}`;
}

export function LegacyArm({
  rig,
  paint,
  from,
  to,
  bow,
}: {
  rig: Rig;
  paint: LimbPaint;
  from: Point;
  to: Point;
  bow: number;
}): ReactElement {
  return (
    <path
      d={legacyPath(from, to, bow)}
      fill="none"
      stroke={paint.arm}
      strokeWidth={rig.limbW}
      strokeLinecap="round"
    />
  );
}

function legacyFootTargets(rig: Rig, legs: LegStyle): { foot: Point; bow: number }[] {
  const { hip, hipSpread, footY } = rig;
  switch (legs) {
    case "stand":
      return [
        { foot: { x: hip.x - hipSpread, y: footY }, bow: 2 },
        { foot: { x: hip.x + hipSpread, y: footY }, bow: -2 },
      ];
    case "wide":
      return [
        { foot: { x: hip.x - hipSpread - 11, y: footY }, bow: 5 },
        { foot: { x: hip.x + hipSpread + 11, y: footY }, bow: -5 },
      ];
    case "stride":
      return [
        { foot: { x: hip.x - hipSpread - 14, y: footY }, bow: 8 },
        { foot: { x: hip.x + hipSpread + 12, y: footY - 4 }, bow: -8 },
      ];
    case "jump":
      return [
        { foot: { x: hip.x - hipSpread - 19, y: footY - 19 }, bow: 11 },
        { foot: { x: hip.x + hipSpread + 19, y: footY - 19 }, bow: -11 },
      ];
    case "sit":
      return [
        { foot: { x: hip.x - hipSpread - 14, y: footY - 6 }, bow: 9 },
        { foot: { x: hip.x + hipSpread + 14, y: footY - 6 }, bow: -9 },
      ];
  }
}

export function LegacyLegs({
  rig,
  paint,
  legs,
}: {
  rig: Rig;
  paint: LimbPaint;
  legs: LegStyle;
}): ReactElement {
  const targets = legacyFootTargets(rig, legs);
  const sockets: Point[] = [
    { x: rig.hip.x - rig.hipSpread * 0.55, y: rig.hip.y },
    { x: rig.hip.x + rig.hipSpread * 0.55, y: rig.hip.y },
  ];
  return (
    <g>
      {targets.map((target, i) => (
        <path
          key={i}
          d={legacyPath(sockets[i], target.foot, target.bow)}
          fill="none"
          stroke={paint.leg}
          strokeWidth={rig.limbW}
          strokeLinecap="round"
        />
      ))}
      {targets.map((target, i) => (
        <ellipse
          key={i}
          cx={target.foot.x}
          cy={target.foot.y - rig.limbW * 0.1}
          rx={rig.limbW * 1.02}
          ry={rig.limbW * 0.66}
          fill={paint.foot}
        />
      ))}
    </g>
  );
}
