/**
 * Arms and legs, shared by every concept.
 *
 * A limb is two straight tapered segments meeting at a joint, capped with a
 * disc at each end and at the joint itself. Three properties come out of that
 * shape and all three were missing from round one's single curved stroke:
 *
 * - **It has an elbow.** A waving arm folds, a pointing arm extends, a hand
 *   held overhead has something under it. Where the joint goes is `jointFor`'s
 *   problem, and the two styles it supports (`jointed`, `tapered`) are what
 *   lets a person and a droplet share this renderer without either looking
 *   wrong.
 * - **It tapers.** A limb that is the same width at the wrist as at the
 *   shoulder reads as a pipe. Narrowing to about seventy percent is enough to
 *   read as an arm and cheap enough to cost nothing.
 * - **It is made of discs and quads, not strokes.** Every piece is a filled
 *   shape, so nothing depends on stroke rendering and a limb survives being
 *   scaled to sixteen pixels.
 *
 * Each leg is wrapped in its own group anchored at its hip socket, because the
 * walk cycle rotates them independently and a rotation needs something to
 * rotate.
 */

import type { ReactElement } from "react";

import type { LimbPaint } from "./concept";
import type { LegStyle } from "./poses";
import { jointFor, MASCOT_CENTRE_X, n, type LimbStyle, type Point, type Rig } from "./rig";

/** One tapered segment: a quad between two circles, plus the circles. */
function segment(from: Point, to: Point, r1: number, r2: number): string {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.001) return "";
  const px = (-dy / len);
  const py = (dx / len);
  return [
    `M ${n(from.x + px * r1)} ${n(from.y + py * r1)}`,
    `L ${n(to.x + px * r2)} ${n(to.y + py * r2)}`,
    `L ${n(to.x - px * r2)} ${n(to.y - py * r2)}`,
    `L ${n(from.x - px * r1)} ${n(from.y - py * r1)}`,
    "Z",
  ].join(" ");
}

/**
 * The whole limb as one filled group. Drawn as separate shapes rather than one
 * path because overlapping fills of the same colour are indistinguishable from
 * a union and need no boolean geometry to compute.
 */
export function Limb({
  from,
  to,
  style,
  totalLen,
  width,
  fill,
}: {
  from: Point;
  to: Point;
  style: LimbStyle;
  totalLen: number;
  width: number;
  fill: string;
}): ReactElement {
  const joint = jointFor(style, from, to, totalLen, MASCOT_CENTRE_X);
  const r1 = width / 2;
  const rm = width * 0.43;
  const r2 = width * 0.35;
  return (
    <g fill={fill}>
      <path d={segment(from, joint, r1, rm)} />
      <path d={segment(joint, to, rm, r2)} />
      <circle cx={from.x} cy={from.y} r={r1} />
      <circle cx={joint.x} cy={joint.y} r={rm} />
      <circle cx={to.x} cy={to.y} r={r2} />
    </g>
  );
}

/** Where each sole lands, and where the knee goes if the pose dictates one. */
type LegTarget = { foot: Point; knee?: Point };

function footTargets(rig: Rig, legs: LegStyle): [LegTarget, LegTarget] {
  const { hip, hipSpread, footY } = rig;
  switch (legs) {
    case "stand":
      return [
        { foot: { x: hip.x - hipSpread, y: footY } },
        { foot: { x: hip.x + hipSpread, y: footY } },
      ];
    case "wide":
      return [
        { foot: { x: hip.x - hipSpread - 11, y: footY } },
        { foot: { x: hip.x + hipSpread + 11, y: footY } },
      ];
    case "stride":
      return [
        { foot: { x: hip.x - hipSpread - 15, y: footY } },
        { foot: { x: hip.x + hipSpread + 13, y: footY - 5 } },
      ];
    case "jump":
      return [
        { foot: { x: hip.x - hipSpread - 20, y: footY - 20 } },
        { foot: { x: hip.x + hipSpread + 20, y: footY - 20 } },
      ];
    case "sit":
      // Thighs forward and level, shins straight down: the shape a chair makes
      // of a leg. The knee is given rather than solved because IK would pick
      // the outboard bend and put the knee out sideways, which is a squat.
      return [
        {
          knee: { x: hip.x - hipSpread - 16, y: hip.y + 4 },
          foot: { x: hip.x - hipSpread - 14, y: footY - 6 },
        },
        {
          knee: { x: hip.x + hipSpread + 16, y: hip.y + 4 },
          foot: { x: hip.x + hipSpread + 14, y: footY - 6 },
        },
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

/** One leg, in its own group so a walk cycle can rotate it at the hip. */
function Leg({
  rig,
  paint,
  socket,
  target,
}: {
  rig: Rig;
  paint: LimbPaint;
  socket: Point;
  target: LegTarget;
}): ReactElement {
  const r1 = rig.limbW / 2;
  const rm = rig.limbW * 0.43;
  const r2 = rig.limbW * 0.35;
  return (
    <g>
      {target.knee === undefined ? (
        <Limb
          from={socket}
          to={target.foot}
          style={rig.limbStyle}
          totalLen={rig.legLen}
          width={rig.limbW}
          fill={paint.leg}
        />
      ) : (
        <g fill={paint.leg}>
          <path d={segment(socket, target.knee, r1, rm)} />
          <path d={segment(target.knee, target.foot, rm, r2)} />
          <circle cx={socket.x} cy={socket.y} r={r1} />
          <circle cx={target.knee.x} cy={target.knee.y} r={rm} />
          <circle cx={target.foot.x} cy={target.foot.y} r={r2} />
        </g>
      )}
      <Foot rig={rig} at={target.foot} fill={paint.foot} />
    </g>
  );
}

export function Legs({
  rig,
  paint,
  legs,
  classL,
  classR,
}: {
  rig: Rig;
  paint: LimbPaint;
  legs: LegStyle;
  /** Walk-cycle classes. Each leg rotates about its own hip socket. */
  classL?: string;
  classR?: string;
}): ReactElement {
  const targets = footTargets(rig, legs);
  const sockets: [Point, Point] = [
    { x: rig.hip.x - rig.hipSpread * 0.55, y: rig.hip.y },
    { x: rig.hip.x + rig.hipSpread * 0.55, y: rig.hip.y },
  ];
  const classes = [classL, classR];
  return (
    <g>
      {targets.map((target, i) => (
        <g
          key={i}
          className={classes[i]}
          style={{ transformOrigin: `${n(sockets[i].x)}px ${n(sockets[i].y)}px` }}
        >
          <Leg rig={rig} paint={paint} socket={sockets[i]} target={target} />
        </g>
      ))}
    </g>
  );
}

export function ArmLimb({
  rig,
  paint,
  from,
  to,
}: {
  rig: Rig;
  paint: LimbPaint;
  from: Point;
  to: Point;
}): ReactElement {
  return (
    <Limb
      from={from}
      to={to}
      style={rig.limbStyle}
      totalLen={rig.armLen}
      width={rig.limbW}
      fill={paint.arm}
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
