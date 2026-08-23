/**
 * The prop library — everything a mascot can be holding.
 *
 * Each prop draws itself around a single anchor point, and the anchor comes
 * from the pose (see `propAnchor`). That indirection is what keeps the two
 * tables independent: a new pose gets every prop for free, and a new prop
 * works in every pose, without either table gaining a row about the other.
 *
 * Props take their colours from the character's own colourway so a held object
 * reads as part of the same illustration rather than as clip art dropped on
 * top. Nothing here carries a logo, a real device silhouette, or any mark that
 * could be mistaken for a specific product — a controller is a controller.
 */

import type { ReactElement } from "react";

import { MASCOT_INK, MASCOT_SCENERY, type Colorway } from "./palette";
import type { Point } from "./rig";
import type { PropId } from "./vocabulary";

type PropProps = { at: Point; colors: Colorway };

const OUTLINE = {
  stroke: MASCOT_INK.line,
  strokeWidth: 2.4,
  strokeLinejoin: "round" as const,
};

function Sign({ at, colors }: PropProps): ReactElement {
  return (
    <g>
      <rect x={at.x - 3} y={at.y - 18} width={6} height={22} rx={3} fill={MASCOT_INK.lineSoft} />
      <rect
        x={at.x - 48}
        y={at.y - 62}
        width={74}
        height={46}
        rx={9}
        fill={MASCOT_INK.paper}
        {...OUTLINE}
      />
      <rect x={at.x - 38} y={at.y - 51} width={54} height={7} rx={3.5} fill={colors.accent} />
      <rect
        x={at.x - 38}
        y={at.y - 39}
        width={38}
        height={6}
        rx={3}
        fill={MASCOT_INK.lineSoft}
        opacity={0.45}
      />
      <rect
        x={at.x - 38}
        y={at.y - 29}
        width={26}
        height={6}
        rx={3}
        fill={MASCOT_INK.lineSoft}
        opacity={0.45}
      />
    </g>
  );
}

function Controller({ at, colors }: PropProps): ReactElement {
  const { x, y } = at;
  return (
    <g>
      <path
        d={`M ${x - 34} ${y - 6} C ${x - 34} ${y - 17} ${x - 22} ${y - 17} ${x - 14} ${y - 13} L ${x + 14} ${y - 13} C ${x + 22} ${y - 17} ${x + 34} ${y - 17} ${x + 34} ${y - 6} C ${x + 34} ${y + 13} ${x + 24} ${y + 17} ${x + 18} ${y + 10} L ${x + 10} ${y + 2} L ${x - 10} ${y + 2} L ${x - 18} ${y + 10} C ${x - 24} ${y + 17} ${x - 34} ${y + 13} ${x - 34} ${y - 6} Z`}
        fill={MASCOT_INK.device}
        {...OUTLINE}
      />
      <rect x={x - 26} y={y - 7} width={15} height={5} rx={2.5} fill={colors.accent} />
      <rect x={x - 21} y={y - 12} width={5} height={15} rx={2.5} fill={colors.accent} />
      <circle cx={x + 14} cy={y - 8} r={3.4} fill={colors.accent} />
      <circle cx={x + 23} cy={y - 2} r={3.4} fill={colors.spark} />
    </g>
  );
}

function KeyboardMouse({ at, colors }: PropProps): ReactElement {
  const { x, y } = at;
  const keys = [0, 1, 2, 3, 4, 5];
  return (
    <g>
      <rect x={x - 54} y={y + 9} width={108} height={7} rx={3.5} fill={MASCOT_INK.lineSoft} />
      <rect x={x - 46} y={y - 9} width={64} height={19} rx={4} fill={MASCOT_INK.device} {...OUTLINE} />
      {keys.map((i) => (
        <rect
          key={`a${i}`}
          x={x - 41 + i * 9.5}
          y={y - 5}
          width={6.5}
          height={4.5}
          rx={1.6}
          fill={colors.accent}
          opacity={0.85}
        />
      ))}
      {keys.map((i) => (
        <rect
          key={`b${i}`}
          x={x - 41 + i * 9.5}
          y={y + 2}
          width={6.5}
          height={4.5}
          rx={1.6}
          fill={colors.accent}
          opacity={0.55}
        />
      ))}
      <path
        d={`M ${x + 36} ${y + 10} C ${x + 27} ${y + 10} ${x + 27} ${y - 9} ${x + 36} ${y - 9} C ${x + 45} ${y - 9} ${x + 45} ${y + 10} ${x + 36} ${y + 10} Z`}
        fill={MASCOT_INK.deviceLight}
        {...OUTLINE}
      />
      <path
        d={`M ${x + 36} ${y - 8} L ${x + 36} ${y - 1}`}
        stroke={colors.accent}
        strokeWidth={2.2}
        strokeLinecap="round"
      />
    </g>
  );
}

function Book({ at, colors }: PropProps): ReactElement {
  const { x, y } = at;
  const lines = [0, 1, 2];
  return (
    <g>
      <path
        d={`M ${x} ${y - 13} L ${x - 34} ${y - 8} L ${x - 34} ${y + 16} L ${x} ${y + 11} Z`}
        fill={MASCOT_INK.paper}
        {...OUTLINE}
      />
      <path
        d={`M ${x} ${y - 13} L ${x + 34} ${y - 8} L ${x + 34} ${y + 16} L ${x} ${y + 11} Z`}
        fill={MASCOT_INK.paper}
        {...OUTLINE}
      />
      <path
        d={`M ${x - 34} ${y - 8} L ${x - 38} ${y - 4} L ${x - 38} ${y + 20} L ${x - 34} ${y + 16} Z`}
        fill={colors.accent}
        {...OUTLINE}
      />
      <path
        d={`M ${x + 34} ${y - 8} L ${x + 38} ${y - 4} L ${x + 38} ${y + 20} L ${x + 34} ${y + 16} Z`}
        fill={colors.accent}
        {...OUTLINE}
      />
      {lines.map((i) => (
        <g key={i} fill={MASCOT_INK.lineSoft} opacity={0.4}>
          <rect x={x - 29} y={y - 3 + i * 6} width={22} height={3} rx={1.5} />
          <rect x={x + 7} y={y - 3 + i * 6} width={22} height={3} rx={1.5} />
        </g>
      ))}
    </g>
  );
}

function Laptop({ at, colors }: PropProps): ReactElement {
  const { x, y } = at;
  return (
    <g>
      <g transform={`rotate(-7 ${x} ${y})`}>
        <rect x={x - 30} y={y - 38} width={60} height={40} rx={5} fill={MASCOT_INK.device} {...OUTLINE} />
        <rect
          x={x - 25}
          y={y - 33}
          width={50}
          height={30}
          rx={3}
          fill={colors.sclera}
          opacity={0.85}
        />
        <rect x={x - 20} y={y - 27} width={26} height={4} rx={2} fill={MASCOT_INK.line} opacity={0.5} />
        <rect x={x - 20} y={y - 19} width={36} height={4} rx={2} fill={MASCOT_INK.line} opacity={0.35} />
        <rect x={x - 20} y={y - 11} width={20} height={4} rx={2} fill={MASCOT_INK.line} opacity={0.35} />
      </g>
      <rect x={x - 36} y={y + 1} width={72} height={10} rx={5} fill={MASCOT_INK.deviceLight} {...OUTLINE} />
      <rect x={x - 8} y={y + 4} width={16} height={3} rx={1.5} fill={MASCOT_INK.lineSoft} />
    </g>
  );
}

function Mug({ at, colors }: PropProps): ReactElement {
  const { x, y } = at;
  return (
    <g>
      <path
        d={`M ${x + 11} ${y - 6} C ${x + 21} ${y - 6} ${x + 21} ${y + 8} ${x + 11} ${y + 8}`}
        fill="none"
        stroke={MASCOT_INK.line}
        strokeWidth={3.2}
        strokeLinecap="round"
      />
      <path
        d={`M ${x - 12} ${y - 13} L ${x + 12} ${y - 13} L ${x + 10} ${y + 10} C ${x + 9} ${y + 15} ${x - 9} ${y + 15} ${x - 10} ${y + 10} Z`}
        fill={colors.accent}
        {...OUTLINE}
      />
      <ellipse cx={x} cy={y - 13} rx={12} ry={3.6} fill={MASCOT_INK.lineSoft} />
      <path
        d={`M ${x - 5} ${y - 22} q 4 -5 0 -10`}
        fill="none"
        stroke={MASCOT_INK.paper}
        strokeWidth={2.4}
        strokeLinecap="round"
        opacity={0.55}
      />
      <path
        d={`M ${x + 5} ${y - 20} q 4 -4 0 -9`}
        fill="none"
        stroke={MASCOT_INK.paper}
        strokeWidth={2.4}
        strokeLinecap="round"
        opacity={0.4}
      />
    </g>
  );
}

function Phone({ at, colors }: PropProps): ReactElement {
  const { x, y } = at;
  return (
    <g>
      <rect x={x - 9} y={y - 16} width={18} height={31} rx={4.5} fill={MASCOT_INK.line} />
      <rect x={x - 6.5} y={y - 12} width={13} height={22} rx={2} fill={colors.sclera} />
      <circle cx={x} cy={y + 12} r={1.6} fill={MASCOT_INK.paper} opacity={0.6} />
    </g>
  );
}

function Clipboard({ at, colors }: PropProps): ReactElement {
  const { x, y } = at;
  const lines = [0, 1, 2];
  return (
    <g>
      <rect
        x={x - 16}
        y={y - 22}
        width={32}
        height={42}
        rx={4}
        fill={MASCOT_INK.paper}
        {...OUTLINE}
      />
      <rect x={x - 7} y={y - 26} width={14} height={8} rx={3} fill={colors.accent} {...OUTLINE} />
      {lines.map((i) => (
        <rect
          key={i}
          x={x - 10}
          y={y - 10 + i * 9}
          width={i === 2 ? 12 : 20}
          height={3.4}
          rx={1.7}
          fill={MASCOT_INK.lineSoft}
          opacity={0.45}
        />
      ))}
    </g>
  );
}

function Pointer({ at, colors }: PropProps): ReactElement {
  const { x, y } = at;
  const tx = x + 20;
  const ty = y - 38;
  return (
    <g>
      <path
        d={`M ${x - 5} ${y + 11} L ${tx} ${ty}`}
        stroke={MASCOT_INK.lineSoft}
        strokeWidth={4}
        strokeLinecap="round"
      />
      <path
        d={`M ${tx} ${ty - 9} L ${tx + 6} ${ty} L ${tx} ${ty + 9} L ${tx - 6} ${ty} Z`}
        fill={colors.accent}
        {...OUTLINE}
      />
    </g>
  );
}

function Dumbbell({ at, colors }: PropProps): ReactElement {
  const { x, y } = at;
  return (
    <g>
      <rect x={x - 18} y={y - 4} width={36} height={8} rx={4} fill={MASCOT_INK.lineSoft} />
      <rect x={x - 27} y={y - 12} width={11} height={24} rx={4.5} fill={colors.accent} {...OUTLINE} />
      <rect x={x + 16} y={y - 12} width={11} height={24} rx={4.5} fill={colors.accent} {...OUTLINE} />
    </g>
  );
}

function Trophy({ at, colors }: PropProps): ReactElement {
  const { x, y } = at;
  const top = y - 46;
  return (
    <g>
      <path
        d={`M ${x - 15} ${top} C ${x - 26} ${top + 2} ${x - 26} ${top + 18} ${x - 14} ${top + 17}`}
        fill="none"
        stroke={MASCOT_INK.line}
        strokeWidth={3}
        strokeLinecap="round"
      />
      <path
        d={`M ${x + 15} ${top} C ${x + 26} ${top + 2} ${x + 26} ${top + 18} ${x + 14} ${top + 17}`}
        fill="none"
        stroke={MASCOT_INK.line}
        strokeWidth={3}
        strokeLinecap="round"
      />
      <path
        d={`M ${x - 15} ${top} L ${x + 15} ${top} L ${x + 12} ${top + 20} C ${x + 11} ${top + 28} ${x - 11} ${top + 28} ${x - 12} ${top + 20} Z`}
        fill={colors.accent}
        {...OUTLINE}
      />
      <rect x={x - 3.5} y={top + 27} width={7} height={9} rx={2} fill={colors.accent} {...OUTLINE} />
      <rect x={x - 13} y={top + 35} width={26} height={7} rx={3} fill={colors.accent} {...OUTLINE} />
      <path
        d={`M ${x} ${top + 6} L ${x + 3} ${top + 12} L ${x + 9} ${top + 12} L ${x + 4} ${top + 16} L ${x + 6} ${top + 22} L ${x} ${top + 18} L ${x - 6} ${top + 22} L ${x - 4} ${top + 16} L ${x - 9} ${top + 12} L ${x - 3} ${top + 12} Z`}
        fill={MASCOT_INK.paper}
        opacity={0.8}
      />
    </g>
  );
}

/**
 * The painter's brush, off `maalari`.
 *
 * Held at an angle rather than upright, because a brush pointing straight up
 * is a lollipop: the diagonal is what says *in use*. The handle is wood
 * rather than a device neutral, because a brush is a tool and not a gadget.
 *
 * The paint is `clothing`, which is the slot a fleet member's `garment`
 * swatch and the legacy strip's own garment helper both write a real swatch
 * hex into. `clothingAccent` was the other candidate and is wrong for this
 * one job: both of those derive it as a pale tint of the garment, so five
 * painters carrying five different swatches would come out holding five
 * near-white brushes.
 *
 * One swatch therefore dyes the cap, the bristles, the drips and the tin at
 * once, which is the point rather than a compromise. The old mascot was one
 * body told apart by its hat; a fleet of painters is one body told apart by
 * which of the product's own colours it is painting in today.
 *
 * The drips hang outside the rotated group so they fall straight down.
 * Gravity does not tilt with the brush, and two drops that leaned would read
 * as bristles rather than as paint coming off. Their x and y are the rotation
 * applied to the bristle tip by hand rather than by a transform, for exactly
 * that reason: the drops have to know where the tip ended up without
 * inheriting the tilt that put it there. Rasterising the first version caught
 * this - drops left at the anchor landed on the character's own body a head's
 * width from the brush, and read as a stain rather than as paint falling.
 */
const BRUSH_TILT = (-26 * Math.PI) / 180;
const BRUSH_TIP = 37;

function Paintbrush({ at, colors }: PropProps): ReactElement {
  const { x, y } = at;
  const tipX = x + Math.sin(BRUSH_TILT) * BRUSH_TIP;
  const tipY = y - Math.cos(BRUSH_TILT) * BRUSH_TIP;
  return (
    <g>
      <g transform={`rotate(-26 ${x} ${y})`}>
        <rect
          x={x - 4.5}
          y={y - 4}
          width={9}
          height={30}
          rx={4.5}
          fill={MASCOT_SCENERY.wood}
          {...OUTLINE}
        />
        <rect
          x={x - 7}
          y={y - 17}
          width={14}
          height={14}
          rx={2.5}
          fill={MASCOT_INK.deviceLight}
          {...OUTLINE}
        />
        <path
          d={`M ${x - 8.5} ${y - 16} L ${x + 8.5} ${y - 16} L ${x + 7} ${y - 35} Q ${x} ${y - 39} ${x - 7} ${y - 35} Z`}
          fill={colors.clothing}
          {...OUTLINE}
        />
      </g>
      <ellipse cx={tipX + 1} cy={tipY + 9} rx={2.8} ry={4} fill={colors.clothing} />
      <circle cx={tipX + 3} cy={tipY + 19} r={2.2} fill={colors.clothing} opacity={0.8} />
    </g>
  );
}

/**
 * The headmaster's briefcase, off `REKSI`.
 *
 * Drawn hanging *below* the anchor with its handle looped over it, because
 * every other prop in this table sits centred on the hand and a case that did
 * that would be gripped through its middle. The handle is the part that has
 * to land on the hand; the weight goes underneath, which is also what stops
 * it colliding with the character's own legs at the side grip.
 */
function Briefcase({ at, colors }: PropProps): ReactElement {
  const { x, y } = at;
  const top = y + 4;
  return (
    <g>
      <path
        d={`M ${x - 8} ${top + 2} C ${x - 8} ${y - 9} ${x + 8} ${y - 9} ${x + 8} ${top + 2}`}
        fill="none"
        stroke={MASCOT_SCENERY.leatherDark}
        strokeWidth={3.4}
        strokeLinecap="round"
      />
      <rect
        x={x - 20}
        y={top}
        width={40}
        height={29}
        rx={4}
        fill={MASCOT_SCENERY.leather}
        {...OUTLINE}
      />
      <rect x={x - 20} y={top + 8} width={40} height={5} rx={2.5} fill={MASCOT_SCENERY.leatherDark} />
      <rect x={x - 5} y={top + 6} width={10} height={9} rx={2} fill={colors.accent} {...OUTLINE} />
      <circle cx={x - 13} cy={top + 22} r={2.4} fill={MASCOT_SCENERY.leatherDark} />
      <circle cx={x + 13} cy={top + 22} r={2.4} fill={MASCOT_SCENERY.leatherDark} />
    </g>
  );
}

/**
 * The gardener's watering can.
 *
 * The rose (the sprinkler head) is the whole silhouette - a can without one
 * is a kettle - so it is drawn large and angled up, and the spout is a thick
 * taper rather than a stroke so it survives being small. The first version
 * was a third of this size and rasterised as a lunchbox with a wire on it:
 * at the sizes a fleet card and an avatar crop actually use, a prop that is
 * merely *correct* is not yet legible.
 *
 * The drops are drawn at every detail level rather than behind a filigree
 * check, because a held prop is already gone by icon size: the component
 * stops drawing props below forty pixels, so there is no size at which these
 * are three grey specks. They are the only thing that says the can is *being
 * used* rather than carried.
 */
function WateringCan({ at, colors }: PropProps): ReactElement {
  const { x, y } = at;
  return (
    <g>
      <path
        d={`M ${x - 2} ${y - 2} L ${x - 27} ${y - 19} L ${x - 33} ${y - 9} L ${x - 8} ${y + 8} Z`}
        fill={MASCOT_INK.deviceLight}
        {...OUTLINE}
      />
      <path
        d={`M ${x - 24} ${y - 32} L ${x - 43} ${y - 21} L ${x - 36} ${y - 4} L ${x - 18} ${y - 15} Z`}
        fill={MASCOT_INK.device}
        {...OUTLINE}
      />
      <rect
        x={x - 8}
        y={y - 16}
        width={36}
        height={32}
        rx={7}
        fill={colors.accent}
        {...OUTLINE}
      />
      <path
        d={`M ${x + 3} ${y - 16} C ${x + 3} ${y - 34} ${x + 25} ${y - 34} ${x + 25} ${y - 16}`}
        fill="none"
        stroke={colors.accent}
        strokeWidth={5}
        strokeLinecap="round"
      />
      <rect x={x - 5} y={y - 9} width={30} height={5} rx={2.5} fill={colors.spark} opacity={0.5} />
      <g fill={colors.sclera} opacity={0.75}>
        <ellipse cx={x - 40} cy={y + 3} rx={2} ry={2.8} />
        <ellipse cx={x - 33} cy={y + 11} rx={1.8} ry={2.6} />
        <ellipse cx={x - 25} cy={y + 16} rx={1.5} ry={2.3} />
      </g>
    </g>
  );
}

export function HeldProp({
  prop,
  at,
  colors,
}: {
  prop: PropId;
  at: Point;
  colors: Colorway;
}): ReactElement | null {
  switch (prop) {
    case "none":
      return null;
    case "sign":
      return <Sign at={at} colors={colors} />;
    case "controller":
      return <Controller at={at} colors={colors} />;
    case "keyboard-mouse":
      return <KeyboardMouse at={at} colors={colors} />;
    case "book":
      return <Book at={at} colors={colors} />;
    case "laptop":
      return <Laptop at={at} colors={colors} />;
    case "mug":
      return <Mug at={at} colors={colors} />;
    case "phone":
      return <Phone at={at} colors={colors} />;
    case "clipboard":
      return <Clipboard at={at} colors={colors} />;
    case "pointer":
      return <Pointer at={at} colors={colors} />;
    case "dumbbell":
      return <Dumbbell at={at} colors={colors} />;
    case "trophy":
      return <Trophy at={at} colors={colors} />;
    case "paintbrush":
      return <Paintbrush at={at} colors={colors} />;
    case "briefcase":
      return <Briefcase at={at} colors={colors} />;
    case "watering-can":
      return <WateringCan at={at} colors={colors} />;
  }
}
