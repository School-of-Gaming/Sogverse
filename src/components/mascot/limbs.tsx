/**
 * Arms and legs, shared by every concept.
 *
 * A limb is one thick rounded stroke with a round cap and a disc on the end.
 * That is the entire model, and it is deliberately crude: chunky noodle limbs
 * read at 32 pixels, survive being re-posed by moving one coordinate, and
 * never need an illustrator to fix a crease. A jointed arm would give a better
 * elbow and cost every pose two more numbers plus a rotation nobody can
 * eyeball from source.
 */

import type { ReactElement } from "react";

import type { LimbPaint } from "./concept";
import type { LegStyle } from "./poses";
import { limbPath, type Point, type Rig } from "./rig";

/** Where each sole lands, and how much the leg bows getting there. */
function footTargets(rig: Rig, legs: LegStyle): { foot: Point; bow: number }[] {
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
  }
}

function Foot({ rig, at, fill }: { rig: Rig; at: Point; fill: string }): ReactElement {
  if (rig.footStyle === "boot") {
    return (
      <rect
        x={at.x - rig.limbW * 1.15}
        y={at.y - rig.limbW * 0.62}
        width={rig.limbW * 2.3}
        height={rig.limbW * 1.24}
        rx={rig.limbW * 0.5}
        fill={fill}
      />
    );
  }
  return (
    <ellipse
      cx={at.x}
      cy={at.y - rig.limbW * 0.1}
      rx={rig.limbW * 1.02}
      ry={rig.limbW * 0.66}
      fill={fill}
    />
  );
}

export function Legs({
  rig,
  paint,
  legs,
}: {
  rig: Rig;
  paint: LimbPaint;
  legs: LegStyle;
}): ReactElement {
  const targets = footTargets(rig, legs);
  const sockets: Point[] = [
    { x: rig.hip.x - rig.hipSpread * 0.55, y: rig.hip.y },
    { x: rig.hip.x + rig.hipSpread * 0.55, y: rig.hip.y },
  ];
  return (
    <g>
      {targets.map((target, i) => (
        <path
          key={i}
          d={limbPath(sockets[i], target.foot, target.bow)}
          fill="none"
          stroke={paint.leg}
          strokeWidth={rig.limbW}
          strokeLinecap="round"
        />
      ))}
      {targets.map((target, i) => (
        <Foot key={i} rig={rig} at={target.foot} fill={paint.foot} />
      ))}
    </g>
  );
}

export function ArmLimb({
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
      d={limbPath(from, to, bow)}
      fill="none"
      stroke={paint.arm}
      strokeWidth={rig.limbW}
      strokeLinecap="round"
    />
  );
}

export function Hand({
  rig,
  paint,
  at,
}: {
  rig: Rig;
  paint: LimbPaint;
  at: Point;
}): ReactElement {
  return <circle cx={at.x} cy={at.y} r={rig.handR} fill={paint.hand} />;
}
