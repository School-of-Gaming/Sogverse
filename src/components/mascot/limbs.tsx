/**
 * Arms and legs, shared by every concept.
 *
 * A limb is two straight tapered segments meeting at a joint, capped with a
 * disc at each end and at the joint itself. Three properties come out of that
 * shape and all three were missing from round one's single curved stroke:
 *
 * - **It has an elbow, unless its species says otherwise.** A waving arm folds,
 *   a pointing arm extends, a hand held overhead has something under it. Where
 *   the joint goes is `jointFor`'s problem, and the styles it supports are what
 *   let a person, a droplet, a stack of cubes and a one-eyed bean share this
 *   renderer without any of them looking wrong — the last of those asks for
 *   `straight`, which puts the joint on the line and leaves it there.
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
 * A limb's end and joint caps: a disc normally, a square for a blocky species.
 *
 * The cap is what stops a two-segment limb showing a notch at its own elbow,
 * so it cannot simply be dropped — it has to become the right shape instead.
 * A square of the same half-extent fills the corner at least as well as a disc
 * and leaves nothing round on a body that has no curves anywhere else.
 */
function Cap({ at, r, blocky }: { at: Point; r: number; blocky: boolean }): ReactElement {
  return blocky ? (
    <rect x={at.x - r} y={at.y - r} width={r * 2} height={r * 2} />
  ) : (
    <circle cx={at.x} cy={at.y} r={r} />
  );
}

/** Segment half-widths at socket, joint and wrist. A blocky limb never tapers. */
function widths(style: LimbStyle, width: number): [number, number, number] {
  return style === "blocky"
    ? [width / 2, width / 2, width / 2]
    : [width / 2, width * 0.43, width * 0.35];
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
  const [r1, rm, r2] = widths(style, width);
  const blocky = style === "blocky";
  return (
    <g fill={fill}>
      <path d={segment(from, joint, r1, rm)} />
      <path d={segment(joint, to, rm, r2)} />
      <Cap at={from} r={r1} blocky={blocky} />
      <Cap at={joint} r={rm} blocky={blocky} />
      <Cap at={to} r={r2} blocky={blocky} />
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
  if (rig.footStyle === "block") {
    return (
      <rect
        x={at.x - rig.limbW * 1.16}
        y={at.y - rig.limbW * 0.62}
        width={rig.limbW * 2.32}
        height={rig.limbW * 1.32}
        fill={fill}
      />
    );
  }
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
  if (rig.footStyle === "stem") {
    // A lobe that swells to one side of the leg and is flush with it on the
    // other — the `d` and `b` the legacy mascot's feet make. Measured off
    // `alas.png`: the leg column is 32 px of a 283 px body and the foot under
    // it is 62 px long and 49 px tall, so the lobe is about 1.9 leg-widths
    // long and 1.5 tall, overhanging on one side only.
    //
    // Which side each lobe swells to is a decision, because the source does not
    // agree with itself: `Minion_Pink` and `Minion_Green` swell outward and
    // symmetrically, `eteen` and `alas` point both feet viewer-right, and
    // `Minion_Red` points both viewer-left. A pair that leans one way reads as
    // a character mid-turn, which is wrong under a standing idle and worse at
    // avatar size, so both lobes here swell outward, away from the centre.
    const len = rig.limbW * 1.9;
    const h = rig.limbW * 1.5;
    const outward = at.x < rig.hip.x ? -1 : 1;
    const left = outward === 1 ? at.x - rig.limbW / 2 : at.x + rig.limbW / 2 - len;
    return (
      <rect x={left} y={at.y - h / 2} width={len} height={h} rx={h / 2} fill={fill} />
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
  const [r1, rm, r2] = widths(rig.limbStyle, rig.limbW);
  const blocky = rig.limbStyle === "blocky";
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
          <Cap at={socket} r={r1} blocky={blocky} />
          <Cap at={target.knee} r={rm} blocky={blocky} />
          <Cap at={target.foot} r={r2} blocky={blocky} />
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
  // Most bodies want the legs to splay a little between hip and sole, which is
  // what the 0.55 does. A species whose limbs are declared `straight` is asking
  // for the opposite: sockets directly above the soles, so a standing leg is a
  // vertical column rather than a shallow V. Nothing else uses `straight`, so
  // every other species keeps the splay it had.
  const spread = rig.limbStyle === "straight" ? rig.hipSpread : rig.hipSpread * 0.55;
  const sockets: [Point, Point] = [
    { x: rig.hip.x - spread, y: rig.hip.y },
    { x: rig.hip.x + spread, y: rig.hip.y },
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
  if (rig.limbStyle === "blocky") {
    return (
      <rect
        x={at.x - rig.handR}
        y={at.y - rig.handR}
        width={rig.handR * 2}
        height={rig.handR * 2}
        fill={paint.hand}
      />
    );
  }
  if (rig.handStyle === "mitten") {
    // One disc and one much smaller one for the thumb, on the inner side and
    // a little above — the arrangement `back_minion` and `maalari` use. It
    // stays a thumb rather than becoming fingers because a mitten is what
    // reads at 24 pixels, and because the source has nothing else on it.
    const inward = at.x > MASCOT_CENTRE_X ? -1 : 1;
    return (
      <g fill={paint.hand}>
        <circle cx={at.x} cy={at.y} r={rig.handR} />
        <circle
          cx={at.x + inward * rig.handR * 0.82}
          cy={at.y - rig.handR * 0.62}
          r={rig.handR * 0.44}
        />
      </g>
    );
  }
  return <circle cx={at.x} cy={at.y} r={rig.handR} fill={paint.hand} />;
}
