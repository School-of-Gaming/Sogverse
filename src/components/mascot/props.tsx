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

import {
  brandRadius,
  MASCOT_INK,
  MASCOT_SCENERY,
  shadeHex,
  swatchHex,
  tintHex,
  type Colorway,
} from "./palette";
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
      {/* The brand's own corner rounding: a board a character holds up is a
          plate with School of Gaming's name on it, and the wordmark says what
          radius one of those takes. See `BRAND_RADIUS`. */}
      <rect
        x={at.x - 48}
        y={at.y - 62}
        width={74}
        height={46}
        rx={brandRadius(74, 46)}
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

/**
 * The engineer's kit - four objects that say "the person who makes the thing
 * work", drawn to be told apart from each other and from what this table
 * already holds.
 *
 * They share one decision. A tool is *metal*, so the shafts and jaws take the
 * scenery neutrals rather than the device plastic every gadget here is
 * moulded from - a spanner the colour of a controller reads as a toy - and
 * only the grip takes the character's own accent, which is the same split the
 * controller already makes between its shell and its buttons.
 */

/**
 * A combination spanner: an open jaw at one end, a ring at the other.
 *
 * Held at a tilt for the reason the brush is: a tool pointing straight up is
 * an object being presented rather than one being used. The tilt is shallower
 * than the brush's because a spanner is half as long again, and a steep one
 * puts its ring end through the character's own foot.
 *
 * It leans the *opposite* way to the brush, and that is not a taste call. The
 * brush is drawn at the up-left grip, out in clear canvas; a spanner hangs at
 * the side grip, where the hand sits about fifteen units off the body's own
 * edge. Rasterising the first version settled it: tilted anticlockwise, the
 * jaw swung inboard and spent its whole length behind the torso, leaving a
 * grey stub and a ring. Leaning outboard puts every part of it against the
 * page. Any long prop drawn for this grip has to lean away from the body.
 *
 * The jaw is **one path with a slot cut into it**, not a shoulder with two
 * prongs stacked on it. Three overlapping rounded rectangles each carrying
 * the shared outline rasterised as a lumpy grey mass with seams through it;
 * a single U-shaped outline with a nine-unit slot is legible at a glance,
 * and the slot shows the page through it, which is the thing that says tool
 * rather than lollipop. The ring end is a *stroked* circle for the same
 * reason - a stroke has a hole down the middle of it, and nothing else this
 * module may reach for does (there are no clip paths and no masks anywhere in
 * this art, because the markup has to stand alone inside an email).
 *
 * The character's own colour goes on a collar under the jaw rather than on
 * the grip, which is where a hand-held tool would really carry it. The grip
 * is exactly where the hand is drawn, so an accent there is a colour nobody
 * ever sees; the collar sits in clear air above the fist.
 */
function Wrench({ at, colors }: PropProps): ReactElement {
  const { x, y } = at;
  const steel = tintHex(MASCOT_SCENERY.stone, 0.22);
  return (
    <g transform={`rotate(26 ${x} ${y})`}>
      <rect x={x - 5} y={y - 16} width={10} height={30} rx={5} fill={steel} {...OUTLINE} />
      <path
        d={[
          `M ${x - 13} ${y - 10}`,
          `L ${x - 13} ${y - 34}`,
          `L ${x - 4.5} ${y - 34}`,
          `L ${x - 4.5} ${y - 24}`,
          `L ${x + 4.5} ${y - 24}`,
          `L ${x + 4.5} ${y - 34}`,
          `L ${x + 13} ${y - 34}`,
          `L ${x + 13} ${y - 10}`,
          'Z',
        ].join(' ')}
        fill={steel}
        {...OUTLINE}
      />
      <rect x={x - 12} y={y - 14} width={24} height={7} rx={3} fill={colors.accent} />
      <circle cx={x} cy={y + 22} r={7} fill="none" stroke={steel} strokeWidth={6} />
      <circle cx={x} cy={y + 22} r={10} fill="none" stroke={MASCOT_INK.line} strokeWidth={1.8} />
      <circle cx={x} cy={y + 22} r={4} fill="none" stroke={MASCOT_INK.line} strokeWidth={1.8} />
    </g>
  );
}

/**
 * A rolled drawing, carried at the character's side.
 *
 * It is the one prop here painted from a *fixed* swatch rather than from the
 * character's colourway, and the name is the reason: a blueprint that is not
 * blue is a poster. The band keeping it rolled is a tint of the same blue
 * rather than a garment colour, so the object stays one material - a paper
 * tube with a paper band, not a tube with a ribbon round it.
 *
 * Slender and long rather than fat and short, which the first raster decided:
 * at sixteen units across with a pale band round its waist it was a vacuum
 * flask. Paper rolls tightly, so thirteen across and sixty-two long is the
 * proportion, and the band sits high on it like the elastic that is actually
 * holding it shut rather than centred like a label.
 *
 * The near end is three shapes, and each one is load-bearing. A single
 * ellipse is a capsule end and reads as a baguette; a darker ellipse inside
 * it is the hole down the middle, which is the whole difference between a
 * tube and a stick; and a short light arc across the mouth is the free edge
 * of the sheet, which is the difference between a tube and a pipe. A hairline
 * run down the side is the same free edge seen along the roll - without it a
 * blue capsule with a white collar is a torch, and a torch is what the first
 * two rasters both showed.
 *
 * It leans outboard for the same reason the spanner does - see there.
 */
function Blueprint({ at }: PropProps): ReactElement {
  const { x, y } = at;
  const paper = swatchHex("blue");
  const band = tintHex(paper, 0.62);
  return (
    <g transform={`rotate(24 ${x} ${y})`}>
      <rect x={x - 6.5} y={y - 34} width={13} height={62} rx={6.5} fill={paper} {...OUTLINE} />
      <rect x={x - 8.5} y={y - 22} width={17} height={11} rx={3} fill={band} {...OUTLINE} />
      <ellipse cx={x} cy={y - 34} rx={6.5} ry={2.9} fill={band} {...OUTLINE} />
      <ellipse cx={x} cy={y - 34} rx={2.4} ry={1.1} fill={shadeHex(paper, 0.45)} />
      <path
        d={`M ${x + 3.4} ${y - 30} L ${x + 3.4} ${y + 23}`}
        stroke={band}
        strokeWidth={1.6}
        strokeLinecap="round"
        opacity={0.6}
      />
      <path
        d={`M ${x - 5} ${y - 36.5} Q ${x} ${y - 39} ${x + 5} ${y - 36.5}`}
        fill="none"
        stroke={band}
        strokeWidth={2.2}
        strokeLinecap="round"
      />
    </g>
  );
}

/**
 * A conical flask with something in it.
 *
 * Drawn as a cone rather than as the straight-sided cylinder its name says,
 * because this table already contains a `mug`: at the size a held prop is
 * actually seen, a cylinder with liquid in it *is* the mug, and two props
 * that render the same shape are one prop with two names. The cone is the
 * silhouette that says laboratory, so the cone is what it gets.
 *
 * The liquid is a second path repeating the cone's own side lines rather than
 * a rectangle behind a clip. Its top corners are the cone's half-width at the
 * fill line, interpolated between the shoulder and the base: 5.5 units across
 * at y-10 and 17 at y+18, so 10.4 at a surface sitting at y+2.
 *
 * It is held upright while the spanner and the roll are tilted, which is the
 * only reason three longish objects in one hand are still three objects.
 */
function Beaker({ at, colors }: PropProps): ReactElement {
  const { x, y } = at;
  const cone = `M ${x - 5.5} ${y - 10} L ${x - 17} ${y + 14} Q ${x - 17} ${y + 19} ${x - 12} ${y + 19} L ${x + 12} ${y + 19} Q ${x + 17} ${y + 19} ${x + 17} ${y + 14} L ${x + 5.5} ${y - 10} Z`;
  return (
    <g>
      <path d={cone} fill={MASCOT_INK.paper} opacity={0.22} />
      <path
        d={`M ${x - 10.4} ${y + 2} L ${x + 10.4} ${y + 2} L ${x + 17} ${y + 14} Q ${x + 17} ${y + 19} ${x + 12} ${y + 19} L ${x - 12} ${y + 19} Q ${x - 17} ${y + 19} ${x - 17} ${y + 14} Z`}
        fill={colors.accent}
      />
      <path d={cone} fill="none" {...OUTLINE} />
      <rect x={x - 5.5} y={y - 24} width={11} height={15} fill={MASCOT_INK.paper} opacity={0.22} />
      <rect x={x - 5.5} y={y - 24} width={11} height={15} fill="none" {...OUTLINE} />
      <rect
        x={x - 7.5}
        y={y - 27}
        width={15}
        height={5.5}
        rx={2.5}
        fill={MASCOT_INK.paper}
        {...OUTLINE}
      />
      <circle cx={x - 1.5} cy={y - 14} r={2.2} fill={colors.accent} opacity={0.8} />
      <circle cx={x + 1.8} cy={y - 19} r={1.5} fill={colors.accent} opacity={0.6} />
    </g>
  );
}

/**
 * A handheld reader: a landscape slab with a small screen and three readouts.
 *
 * Every choice in it is about not being the `phone` five entries above. That
 * one is portrait, taller than it is wide, and its screen is nearly the whole
 * face. This one is landscape, has its screen in one corner with instrument
 * readouts beside it, a grip on the near edge and a sensor nub on top. Those
 * are the cues that survive being small; a different tint on the same rounded
 * rectangle is not.
 *
 * It carries no mark of any kind - no badge, no insignia, no name plate. A
 * generic instrument is the point: the character is a person who measures
 * things, not a person out of a particular fiction.
 */
function Scanner({ at, colors }: PropProps): ReactElement {
  const { x, y } = at;
  return (
    <g>
      <rect
        x={x + 10}
        y={y - 22}
        width={11}
        height={7}
        rx={3}
        fill={MASCOT_INK.deviceLight}
        {...OUTLINE}
      />
      <circle cx={x + 15.5} cy={y - 19} r={2.4} fill={colors.spark} />
      <rect
        x={x - 28}
        y={y - 7}
        width={6}
        height={15}
        rx={3}
        fill={MASCOT_INK.deviceLight}
        {...OUTLINE}
      />
      <rect x={x - 24} y={y - 16} width={48} height={32} rx={6} fill={MASCOT_INK.device} {...OUTLINE} />
      <rect x={x - 19} y={y - 11} width={24} height={19} rx={2.5} fill={colors.panel} />
      <path
        d={`M ${x - 15} ${y + 3} L ${x - 9} ${y - 4} L ${x - 4} ${y} L ${x + 1} ${y - 7}`}
        fill="none"
        stroke={MASCOT_INK.line}
        strokeWidth={2}
        strokeLinecap="round"
        opacity={0.55}
      />
      <rect x={x + 9} y={y - 10} width={12} height={4} rx={2} fill={colors.accent} />
      <rect x={x + 9} y={y - 2} width={12} height={4} rx={2} fill={colors.spark} />
      <rect x={x + 9} y={y + 6} width={7} height={4} rx={2} fill={colors.accent} opacity={0.6} />
    </g>
  );
}

/**
 * A storm lantern, hung from the hand rather than held out in front of it.
 *
 * Every other prop in this file is a *device* — a thing with buttons, moulded
 * out of the shared dark plastic. This one is the opposite and is here for the
 * nocturnal species: the only light source in the library, and the only object
 * that draws with the character's accent at full strength. It is deliberately
 * five flat shapes and no texture, because it turns up in scenes that are
 * themselves flat silhouettes and a rendered brass lantern in front of a
 * cut-paper spruce would be the only real object on the page.
 *
 * It hangs *below* the anchor for the same reason a bag would: a lantern held
 * at eye level is a torch, and the whole point of one is the pool of light it
 * makes at knee height.
 */
function Lantern({ at, colors }: PropProps): ReactElement {
  const { x, y } = at;
  return (
    <g>
      <path
        d={`M ${x - 7} ${y - 2} Q ${x} ${y - 17} ${x + 7} ${y - 2}`}
        fill="none"
        stroke={MASCOT_INK.lineSoft}
        strokeWidth={2.2}
        strokeLinecap="round"
      />
      <rect x={x - 9} y={y - 4} width={18} height={6} rx={2} fill={MASCOT_INK.lineSoft} />
      <path
        d={`M ${x - 7} ${y + 2} L ${x + 7} ${y + 2} L ${x + 9} ${y + 20} L ${x - 9} ${y + 20} Z`}
        fill={MASCOT_INK.paper}
        opacity={0.9}
        {...OUTLINE}
      />
      <ellipse cx={x} cy={y + 12} rx={4} ry={6} fill={colors.accent} />
      <rect x={x - 10} y={y + 19} width={20} height={5} rx={2} fill={MASCOT_INK.lineSoft} />
    </g>
  );
}

/**
 * A kantele - five strings on a flat box, and the one prop here that is
 * Finnish rather than generic.
 *
 * It is drawn as the instrument's own outline and nothing else: a trapezoid
 * (wide at the tuning end, tapering towards the point the strings gather at),
 * a soundhole, and five strings. Five is the count the oldest ones have, and
 * it is also the most that survive as separate lines at this size - a
 * thirty-string concert kantele would be a hatched rectangle.
 *
 * The box is scenery wood rather than the character's colourway, for the same
 * reason a controller is moulded out of the device neutrals: an instrument
 * tinted to match whoever is holding it stops being an object in the world.
 */
function Kantele({ at }: { at: Point }): ReactElement {
  const { x, y } = at;
  return (
    <g>
      <path
        d={`M ${x - 26} ${y - 9} L ${x + 22} ${y - 1} L ${x + 22} ${y + 11} L ${x - 26} ${y + 11} Z`}
        fill={tintHex(MASCOT_SCENERY.wood, 0.34)}
        {...OUTLINE}
      />
      <path
        d={`M ${x - 26} ${y + 11} L ${x + 22} ${y + 11} L ${x + 22} ${y + 15} L ${x - 26} ${y + 15} Z`}
        fill={MASCOT_SCENERY.woodDark}
      />
      <circle cx={x - 4} cy={y + 4} r={3.4} fill={MASCOT_SCENERY.woodDark} />
      {/* Dark strings on a pale top rather than the other way round. The first
          version was scenery wood with paper strings, and against an amber
          villager the whole instrument disappeared into the garment. */}
      <g stroke={MASCOT_SCENERY.woodLine} strokeWidth={1.2} opacity={0.75} strokeLinecap="round">
        {[0, 1, 2, 3, 4].map((i) => (
          <path key={i} d={`M ${x - 23} ${y - 6 + i * 3.4} L ${x + 19} ${y + 1 + i * 1.7}`} />
        ))}
      </g>
      {/* The tuning pins, as three dots on the wide end. */}
      <g fill={MASCOT_SCENERY.woodLine}>
        <circle cx={x - 23.5} cy={y - 4} r={1.3} />
        <circle cx={x - 23.5} cy={y + 2} r={1.3} />
        <circle cx={x - 23.5} cy={y + 8} r={1.3} />
      </g>
    </g>
  );
}

/**
 * The mark's chevron, on a plate, held out as a pointer.
 *
 * The one prop in this library that is a piece of brand rather than a piece of
 * furniture. `N8-gem-chevron.svg` is a rounded amber hexagon with a near-black
 * chevron cut into it, and the chevron on its own is the part that means
 * *this way* — so it comes off the gem, onto a plate with the wordmark's own
 * corner rounding, and into a hand. A mascot beside a call to action can then
 * point at it with the company's own arrow instead of with a generic one.
 *
 * The proportions are the favicon's, scaled: the source chevron is 28 across
 * and 44 down with a 15-unit stroke, which is 0.43 of what is drawn here, and
 * the round cap and join are the source's too. Amber comes from the swatch
 * table rather than from the character's colourway on purpose — a chevron
 * dyed to match whoever is holding it is not the brand's chevron any more.
 */
function Chevron({ at }: PropProps): ReactElement {
  const { x, y } = at;
  const w = 40;
  const h = 44;
  return (
    <g>
      {/* The outline is not decoration: the character most likely to be holding
          this is the amber one, and an amber plate on an amber body has no
          edge. Every other plate in this library carries the same line for the
          same reason. */}
      <rect
        x={x - w / 2}
        y={y - h / 2}
        width={w}
        height={h}
        rx={brandRadius(w, h)}
        fill={swatchHex("amber")}
        {...OUTLINE}
      />
      <path
        d={`M ${x - 6} ${y - 11} L ${x + 8} ${y} L ${x - 6} ${y + 11}`}
        fill="none"
        stroke={MASCOT_INK.line}
        strokeWidth={7.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </g>
  );
}

/**
 * A berry picker's basket — two flat tones and three berries over the rim.
 *
 * There is no weave on it. A basket is the one object in this library whose
 * real-world texture is its whole appearance, which makes it the sharpest test
 * of the simplicity ruling in the prop table: cross-hatching a twelve-unit
 * trapezoid produces a grey smudge at 40px and a busy one at 200, and the
 * shape — wide mouth, tapered base, one arched handle — already says basket on
 * its own. So it is a wood block, a darker rim, and the handle as a stroke.
 *
 * The berries take the character's own `bodyTop`, which is a joke that pays
 * for itself on the species this was drawn for: a Marja carrying one is a berry
 * carrying a basket of its own kind.
 */
function Basket({ at, colors }: PropProps): ReactElement {
  const { x, y } = at;
  return (
    <g>
      <path
        d={`M ${x - 13} ${y - 3} Q ${x} ${y - 26} ${x + 13} ${y - 3}`}
        fill="none"
        stroke={MASCOT_SCENERY.woodDark}
        strokeWidth={3.2}
        strokeLinecap="round"
      />
      <path
        d={`M ${x - 19} ${y - 2} L ${x + 19} ${y - 2} L ${x + 14} ${y + 21} L ${x - 14} ${y + 21} Z`}
        fill={MASCOT_SCENERY.wood}
        {...OUTLINE}
      />
      <g fill={colors.bodyTop}>
        <circle cx={x - 8} cy={y - 6} r={5.5} />
        <circle cx={x + 1} cy={y - 8} r={5.5} />
        <circle cx={x + 9} cy={y - 5} r={5.5} />
      </g>
      <rect x={x - 21} y={y - 4} width={42} height={7} rx={3} fill={MASCOT_SCENERY.woodDark} />
    </g>
  );
}

/**
 * The archipelago kit: an oar, a spyglass and a rod.
 *
 * All three are long objects held at the side grip, which puts the anchor at
 * about y=148 with only fifty units of canvas below it. So none of them can
 * hang down the way a real one would; each leans its length *upward and
 * outboard*, away from the body's centre line, which is also the only strip of
 * canvas no species' silhouette reaches into.
 */

/**
 * A shouldered oar — blade up and outboard, loom down past the hip.
 *
 * The blade started at the bottom, where an oar's blade belongs, and the first
 * raster settled it: the side grip is at y=148 and the boat's near hull covers
 * everything below y=166, so the blade was either hidden by the hull or off
 * the canvas, and what was left read as a wooden spoon. Carried blade-up over
 * the shoulder it is unmistakable at 200px, it clears every head in the set
 * (the tip lands around x=166, and the widest head here stops at 140), and it
 * is what somebody walking down to the water actually does with an oar.
 *
 * The loom is scenery wood and the blade is the character's garment colour —
 * boat gear in this country is painted, and the blade is the only part of the
 * object with room to carry a colour.
 */
function Oar({ at, colors }: PropProps): ReactElement {
  const { x, y } = at;
  return (
    <g transform={`rotate(24 ${x} ${y})`}>
      <rect x={x - 4.5} y={y - 48} width={9} height={84} rx={4.5} fill={MASCOT_SCENERY.wood} />
      <rect x={x - 6} y={y + 28} width={12} height={9} rx={4} fill={MASCOT_SCENERY.woodDark} />
      <path
        d={`M ${x - 4} ${y - 44} C ${x - 13} ${y - 52} ${x - 12} ${y - 68} ${x} ${y - 78} C ${x + 12} ${y - 68} ${x + 13} ${y - 52} ${x + 4} ${y - 44} Z`}
        fill={colors.clothing}
      />
    </g>
  );
}

/**
 * A spyglass: three tubes, two rings and a lens.
 *
 * Drawn as a stepped cone rather than as one tube, because a plain cylinder at
 * this size is a pencil. The steps are what say "this pulls out", and two of
 * them is the fewest that reads as a telescope.
 *
 * Leather and brass rather than the device neutrals every other instrument
 * here is moulded from. Those are near-black by design, and the first raster
 * of one against `#121212` was a dark cylinder with a pale dot on the end; a
 * spyglass is an *old* object and the warm browns are both the honest material
 * and the only ones that read on this ground. The two rings still take the
 * character's accent, which is the split the controller already makes.
 */
function Spyglass({ at, colors }: PropProps): ReactElement {
  const { x, y } = at;
  return (
    <g transform={`rotate(-26 ${x} ${y})`}>
      <rect x={x - 38} y={y - 3.5} width={26} height={7} rx={2} fill={MASCOT_SCENERY.leatherDark} />
      <rect x={x - 14} y={y - 6.5} width={26} height={13} rx={2.5} fill={MASCOT_SCENERY.leather} />
      <rect x={x + 10} y={y - 10.5} width={28} height={21} rx={3} fill={MASCOT_SCENERY.leatherDark} />
      <rect x={x - 15} y={y - 7} width={5} height={14} rx={2} fill={colors.accent} />
      <rect x={x + 9} y={y - 11} width={5} height={22} rx={2} fill={colors.accent} />
      <ellipse cx={x + 36} cy={y} rx={3} ry={9.5} fill={MASCOT_INK.paper} opacity={0.9} />
    </g>
  );
}

/**
 * A rod, a line and a bobber.
 *
 * The line is drawn *outside* the rod's rotation group on purpose: a line
 * hangs straight down whatever angle the rod is held at, and rotating it with
 * the rod is the fastest way to make a fishing scene look like it is happening
 * on a hillside.
 *
 * The bobber is the part that has to survive being small — the line is under
 * two units wide and stops existing below `full` — so it is a two-colour ball
 * rather than a shape, and it is the reason the prop is nameable at 200px at
 * all.
 */
const ROD_TIP = { dx: 43.1, dy: -29.1 };

function FishingRod({ at, colors }: PropProps): ReactElement {
  const { x, y } = at;
  const tipX = x + ROD_TIP.dx;
  const tipY = y + ROD_TIP.dy;
  const floatY = y + 20;
  return (
    <g>
      <g transform={`rotate(-34 ${x} ${y})`}>
        <path
          d={`M ${x - 22} ${y - 4.5} L ${x + 52} ${y - 1} L ${x + 52} ${y + 1} L ${x - 22} ${y + 4.5} Z`}
          fill={MASCOT_SCENERY.wood}
        />
        <rect x={x - 26} y={y - 5.5} width={18} height={11} rx={5} fill={colors.clothing} />
        <circle cx={x - 3} cy={y + 8} r={5.5} fill={MASCOT_INK.device} />
      </g>
      <path
        d={`M ${tipX} ${tipY} L ${tipX} ${floatY - 5}`}
        stroke={MASCOT_INK.paper}
        strokeWidth={2}
        opacity={0.75}
        fill="none"
      />
      <path
        d={`M ${tipX - 5} ${floatY} A 5 5 0 0 1 ${tipX + 5} ${floatY} Z`}
        fill={colors.clothing}
      />
      <path
        d={`M ${tipX - 5} ${floatY} A 5 5 0 0 0 ${tipX + 5} ${floatY} Z`}
        fill={MASCOT_INK.paper}
      />
    </g>
  );
}

/**
 * An arcade stick — a weighted base, a shaft and a ball on top.
 *
 * The library already has a `controller`, and this is not a second one: a pad
 * is a thing a person holds in two hands in front of them, and a stick is a
 * thing that *sits on a surface* and gets gripped. That difference is why it
 * earns a place — the alien crew fly a saucer by stick, and a crew member
 * playing a game on the same stick is the joke the species is built around.
 *
 * The base and the shaft are the shared device neutrals rather than the
 * character's own colours, which is the standing rule for anything moulded:
 * a controller tinted to match a teal alien is a teal controller on a teal
 * body. Only the ball and the two buttons take the colourway, and the ball
 * takes `clothing` rather than the `accent` every other loud thing here uses —
 * because the species this was drawn for already spends `accent` on the ball
 * on its own antenna, and a picture with two pale balls in it is one where
 * neither of them means anything.
 */
function Joystick({ at, colors }: PropProps): ReactElement {
  const { x, y } = at;
  return (
    <g>
      <rect x={x - 22} y={y + 2} width={44} height={14} rx={5} fill={MASCOT_INK.device} {...OUTLINE} />
      <rect x={x - 3.4} y={y - 14} width={6.8} height={18} rx={3.4} fill={MASCOT_INK.deviceLight} />
      <circle cx={x} cy={y - 15} r={9} fill={colors.clothing} {...OUTLINE} />
      <circle cx={x + 11} cy={y + 7} r={3.4} fill={colors.accent} />
      <circle cx={x + 11} cy={y + 13} r={3.4} fill={colors.spark} />
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
    case "wrench":
      return <Wrench at={at} colors={colors} />;
    case "blueprint":
      return <Blueprint at={at} colors={colors} />;
    case "beaker":
      return <Beaker at={at} colors={colors} />;
    case "scanner":
      return <Scanner at={at} colors={colors} />;
    case "lantern":
      return <Lantern at={at} colors={colors} />;
    case "kantele":
      return <Kantele at={at} />;
    case "chevron":
      return <Chevron at={at} colors={colors} />;
    case "oar":
      return <Oar at={at} colors={colors} />;
    case "spyglass":
      return <Spyglass at={at} colors={colors} />;
    case "fishing-rod":
      return <FishingRod at={at} colors={colors} />;
    case "basket":
      return <Basket at={at} colors={colors} />;
    case "joystick":
      return <Joystick at={at} colors={colors} />;
  }
}
