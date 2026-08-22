/**
 * Otso — the cub, and the six animals that turned out to be the same drawing.
 *
 * Otso is the old Finnish name for the bear, used when you did not want to say
 * the bear's real name out loud. Ours is a round cub with ears too big for its
 * head, which is the single cheapest way to make a shape read as young,
 * harmless and pleased to see you.
 *
 * ## Why this is a family and not seven concepts
 *
 * Round one's note said an animal-per-role fleet was "charming and completely
 * unmaintainable: five species means five pose sheets". That was wrong, and
 * the reason it was wrong is worth writing down, because it is the same
 * mistake anyone would make again.
 *
 * A pose sheet is not per *animal*. It is per **body plan**. A bear, a fox, a
 * lynx, a hare, a moose and an owl are all "round torso, four limbs, head on
 * top" — they differ above the neck and in one appendage. Once the pose table,
 * the limbs, the wardrobe and the animation are shared, an extra species costs
 * a head and a tail: about thirty lines. Seven of them cost less than two of
 * round one's concepts did.
 *
 * The Saimaa ringed seal is the exception that proves the rule — it has no
 * ears, no visible legs and no tail worth drawing, so it is the one whose
 * silhouette genuinely fights the rig. It is here anyway because it is the
 * most Finnish animal on the list and because a fleet needs one member that is
 * shaped wrong on purpose.
 */

import type { ReactElement } from "react";

import type { ConceptDef, FormDef, PartProps } from "../concept";
import { showsFiligree } from "../detail";
import { MASCOT_INK, OTSO_VARIANTS } from "../palette";
import type { Rig } from "../rig";

export const OTSO_FORMS: readonly FormDef[] = [
  { id: "bear", label: "Karhu — bear", note: "The flagship. Two oversized ear circles." },
  { id: "fox", label: "Kettu — fox", note: "Sharp ears, ruffed cheeks, an enormous tail." },
  { id: "moose", label: "Hirvi — elk", note: "Palmate antlers. The widest silhouette here." },
  { id: "owl", label: "Pöllö — owl", note: "A facial disc and a beak. No muzzle at all." },
  { id: "lynx", label: "Ilves — lynx", note: "Tufted ears and a ruff. The cool one." },
  { id: "hare", label: "Jänis — hare", note: "Ears twice the height of the head." },
  { id: "seal", label: "Norppa — ringed seal", note: "No ears, no tail, flippers. The odd one." },
];

const BASE: Rig = {
  shadow: { cx: 100, cy: 186, rx: 42, ry: 7 },
  hip: { x: 100, y: 150 },
  hipSpread: 19,
  footY: 180,
  footStyle: "round",
  shoulderL: { x: 66, y: 120 },
  shoulderR: { x: 134, y: 120 },
  head: { x: 100, y: 70, r: 40 },
  eyeDx: 16,
  eyeY: 64,
  eyeR: 7.5,
  mouthY: 91,
  crown: { x: 100, y: 44 },
  crownW: 58,
  reach: 6,
  limbW: 12,
  handR: 10,
  // A round animal has no visible elbow, and giving it one turns a cub into a
  // small bodybuilder. Soft noodle limbs, all seven of them.
  limbStyle: "tapered",
  armLen: 44,
  legLen: 36,
  torso: { x: 68, y: 112, w: 64, h: 46 },
  fusedHead: false,
};

/** Only the hat line and the eyes move between species. */
function rigFor(form: string): Rig {
  switch (form) {
    case "moose":
      return { ...BASE, crown: { x: 100, y: 26 }, crownW: 74 };
    case "hare":
      return { ...BASE, crown: { x: 100, y: 20 }, crownW: 40, head: { x: 100, y: 72, r: 36 } };
    case "owl":
      return { ...BASE, crown: { x: 100, y: 36 }, crownW: 62, eyeDx: 18, eyeR: 9, mouthY: 86 };
    case "seal":
      return {
        ...BASE,
        crown: { x: 100, y: 38 },
        crownW: 52,
        head: { x: 100, y: 72, r: 37 },
        mouthY: 92,
      };
    case "fox":
    case "lynx":
      return { ...BASE, crown: { x: 100, y: 40 }, crownW: 54 };
    case "bear":
    default:
      return BASE;
  }
}

/** The tail, which is the only part of the body that varies. */
function Tail({ colors, form }: PartProps): ReactElement | null {
  switch (form) {
    case "fox":
      return (
        <g>
          <path
            d="M 136 146 C 158 146 172 128 168 108 C 166 96 154 94 150 106 C 146 118 142 132 132 138 Z"
            fill={colors.bodyBottom}
          />
          <path
            d="M 168 108 C 166 96 154 94 150 106 C 154 104 162 104 166 114 Z"
            fill={colors.panel}
          />
        </g>
      );
    case "hare":
      return <circle cx={140} cy={150} r={11} fill={colors.panel} />;
    case "lynx":
      return (
        <path
          d="M 134 142 C 148 142 152 132 150 124"
          fill="none"
          stroke={colors.bodyBottom}
          strokeWidth={11}
          strokeLinecap="round"
        />
      );
    case "seal":
      return (
        <>
          <ellipse cx={52} cy={152} rx={18} ry={9} fill={colors.bodyBottom} transform="rotate(-22 52 152)" />
          <ellipse cx={148} cy={152} rx={18} ry={9} fill={colors.bodyBottom} transform="rotate(22 148 152)" />
        </>
      );
    case "owl":
      return (
        <>
          <path d="M 70 118 C 58 130 60 150 72 158 C 76 146 76 130 74 118 Z" fill={colors.bodyBottom} />
          <path d="M 130 118 C 142 130 140 150 128 158 C 124 146 124 130 126 118 Z" fill={colors.bodyBottom} />
        </>
      );
    case "moose":
    case "bear":
    default:
      return <circle cx={138} cy={148} r={9} fill={colors.bodyBottom} />;
  }
}

function Body(props: PartProps): ReactElement {
  const { colors, detail, form } = props;
  return (
    <g>
      <Tail {...props} />
      <ellipse cx={100} cy={132} rx={36} ry={30} fill={colors.bodyTop} />
      <ellipse cx={100} cy={139} rx={25} ry={21} fill={colors.panel} />
      {form === "seal" && showsFiligree(detail) && (
        <g fill="none" stroke={colors.bodyBottom} strokeWidth={2} opacity={0.55}>
          <ellipse cx={80} cy={124} rx={6} ry={4.5} />
          <ellipse cx={120} cy={122} rx={5} ry={4} />
          <ellipse cx={104} cy={112} rx={5.5} ry={4} />
        </g>
      )}
      {form === "owl" && showsFiligree(detail) && (
        <g fill="none" stroke={colors.bodyBottom} strokeWidth={2} strokeLinecap="round" opacity={0.4}>
          <path d="M 90 128 q 10 7 20 0" />
          <path d="M 86 140 q 14 8 28 0" />
        </g>
      )}
      {showsFiligree(detail) && form !== "seal" && (
        <ellipse cx={82} cy={116} rx={9} ry={6} fill={MASCOT_INK.paper} opacity={0.18} />
      )}
    </g>
  );
}

/** A muzzle: the pale patch, the nose, and the crease under it. */
function Muzzle({
  x,
  y,
  rx,
  ry,
  noseRx,
  colors,
  detail,
}: {
  x: number;
  y: number;
  rx: number;
  ry: number;
  noseRx: number;
  colors: { panel: string };
  detail: PartProps["detail"];
}): ReactElement {
  return (
    <g>
      <ellipse cx={x} cy={y} rx={rx} ry={ry} fill={colors.panel} />
      <ellipse cx={x} cy={y - ry * 0.55} rx={noseRx} ry={noseRx * 0.72} fill={MASCOT_INK.line} />
      {/* The philtrum, and nothing else. A glint on the nose is the same
          specular cue the face rules threw out — the fact that it was on a
          muzzle rather than on an eye did not make it a different mistake. */}
      {showsFiligree(detail) && (
        <path
          d={`M ${x} ${y - ry * 0.2} L ${x} ${y + ry * 0.15}`}
          stroke={MASCOT_INK.line}
          strokeWidth={2}
          strokeLinecap="round"
        />
      )}
    </g>
  );
}

function Head(props: PartProps): ReactElement {
  const { rig, colors, form, detail } = props;
  const { x, y, r } = rig.head;
  switch (form) {
    case "fox":
      return (
        <g>
          <path d={`M ${x - 34} ${y - 22} L ${x - 40} ${y - 58} L ${x - 8} ${y - 36} Z`} fill={colors.bodyTop} />
          <path d={`M ${x + 34} ${y - 22} L ${x + 40} ${y - 58} L ${x + 8} ${y - 36} Z`} fill={colors.bodyTop} />
          <path d={`M ${x - 30} ${y - 27} L ${x - 34} ${y - 49} L ${x - 15} ${y - 35} Z`} fill={colors.bodyBottom} />
          <path d={`M ${x + 30} ${y - 27} L ${x + 34} ${y - 49} L ${x + 15} ${y - 35} Z`} fill={colors.bodyBottom} />
          <circle cx={x} cy={y} r={r} fill={colors.bodyTop} />
          <path d={`M ${x - r} ${y + 2} q 10 20 26 22 q -20 8 -30 -6 Z`} fill={colors.panel} opacity={0.8} />
          <path d={`M ${x + r} ${y + 2} q -10 20 -26 22 q 20 8 30 -6 Z`} fill={colors.panel} opacity={0.8} />
          <Muzzle x={x} y={y + 20} rx={17} ry={13} noseRx={6.5} colors={colors} detail={detail} />
        </g>
      );
    case "lynx":
      return (
        <g>
          <path d={`M ${x - 32} ${y - 24} L ${x - 34} ${y - 52} L ${x - 10} ${y - 36} Z`} fill={colors.bodyTop} />
          <path d={`M ${x + 32} ${y - 24} L ${x + 34} ${y - 52} L ${x + 10} ${y - 36} Z`} fill={colors.bodyTop} />
          <path
            d={`M ${x - 34} ${y - 52} l -3 -13`}
            stroke={MASCOT_INK.line}
            strokeWidth={3}
            strokeLinecap="round"
          />
          <path
            d={`M ${x + 34} ${y - 52} l 3 -13`}
            stroke={MASCOT_INK.line}
            strokeWidth={3}
            strokeLinecap="round"
          />
          <circle cx={x} cy={y} r={r} fill={colors.bodyTop} />
          <path d={`M ${x - r - 4} ${y + 8} q 14 22 30 20 q -22 12 -34 -4 Z`} fill={colors.panel} opacity={0.75} />
          <path d={`M ${x + r + 4} ${y + 8} q -14 22 -30 20 q 22 12 34 -4 Z`} fill={colors.panel} opacity={0.75} />
          <Muzzle x={x} y={y + 19} rx={16} ry={11} noseRx={6} colors={colors} detail={detail} />
        </g>
      );
    case "moose":
      return (
        <g>
          {/* Antlers as a beam plus three tines a side. Strokes rather than a
              filled palm: a palmate blade at this scale turns into a mitten. */}
          <g
            fill="none"
            stroke={colors.bodyBottom}
            strokeWidth={7}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d={`M ${x - 20} ${y - 26} C ${x - 34} ${y - 34} ${x - 46} ${y - 42} ${x - 60} ${y - 44}`} />
            <path d={`M ${x - 34} ${y - 34} L ${x - 38} ${y - 52}`} strokeWidth={5} />
            <path d={`M ${x - 47} ${y - 41} L ${x - 52} ${y - 58}`} strokeWidth={5} />
            <path d={`M ${x - 59} ${y - 44} L ${x - 66} ${y - 58}`} strokeWidth={5} />
            <path d={`M ${x + 20} ${y - 26} C ${x + 34} ${y - 34} ${x + 46} ${y - 42} ${x + 60} ${y - 44}`} />
            <path d={`M ${x + 34} ${y - 34} L ${x + 38} ${y - 52}`} strokeWidth={5} />
            <path d={`M ${x + 47} ${y - 41} L ${x + 52} ${y - 58}`} strokeWidth={5} />
            <path d={`M ${x + 59} ${y - 44} L ${x + 66} ${y - 58}`} strokeWidth={5} />
          </g>
          <ellipse cx={x - 38} cy={y - 14} rx={12} ry={7} fill={colors.bodyBottom} transform={`rotate(-20 ${x - 38} ${y - 14})`} />
          <ellipse cx={x + 38} cy={y - 14} rx={12} ry={7} fill={colors.bodyBottom} transform={`rotate(20 ${x + 38} ${y - 14})`} />
          <ellipse cx={x} cy={y - 2} rx={r * 0.82} ry={r * 0.86} fill={colors.bodyTop} />
          <Muzzle x={x} y={y + 26} rx={20} ry={16} noseRx={8} colors={colors} detail={detail} />
        </g>
      );
    case "owl":
      return (
        <g>
          <circle cx={x} cy={y} r={r} fill={colors.bodyTop} />
          <path d={`M ${x - 30} ${y - 30} l -4 -16 l 16 8 Z`} fill={colors.bodyTop} />
          <path d={`M ${x + 30} ${y - 30} l 4 -16 l -16 8 Z`} fill={colors.bodyTop} />
          <circle cx={x - 18} cy={y - 4} r={19} fill={colors.panel} />
          <circle cx={x + 18} cy={y - 4} r={19} fill={colors.panel} />
          <path d={`M ${x} ${y + 6} l -8 -8 l 16 0 Z`} fill={MASCOT_INK.line} />
          {showsFiligree(detail) && (
            <g fill="none" stroke={colors.bodyBottom} strokeWidth={1.6} opacity={0.5}>
              <path d={`M ${x - 30} ${y - 20} q 12 -6 22 2`} />
              <path d={`M ${x + 30} ${y - 20} q -12 -6 -22 2`} />
            </g>
          )}
        </g>
      );
    case "hare":
      return (
        <g>
          <ellipse cx={x - 14} cy={y - 54} rx={9} ry={30} fill={colors.bodyTop} transform={`rotate(-8 ${x - 14} ${y - 54})`} />
          <ellipse cx={x + 14} cy={y - 54} rx={9} ry={30} fill={colors.bodyTop} transform={`rotate(8 ${x + 14} ${y - 54})`} />
          <ellipse cx={x - 14} cy={y - 54} rx={4.5} ry={21} fill={colors.panel} transform={`rotate(-8 ${x - 14} ${y - 54})`} />
          <ellipse cx={x + 14} cy={y - 54} rx={4.5} ry={21} fill={colors.panel} transform={`rotate(8 ${x + 14} ${y - 54})`} />
          <circle cx={x} cy={y} r={r} fill={colors.bodyTop} />
          {/* No buck teeth. They were the hare's one bit of charm and they
              were also teeth sitting on top of the mouth glyph, which is the
              exact detail cue the face rules exist to keep off. The ears do
              the identifying anyway. */}
          <Muzzle x={x} y={y + 17} rx={14} ry={10} noseRx={5} colors={colors} detail={detail} />
        </g>
      );
    case "seal":
      return (
        <g>
          <ellipse cx={x} cy={y} rx={r * 1.02} ry={r * 0.94} fill={colors.bodyTop} />
          <Muzzle x={x} y={y + 20} rx={18} ry={12} noseRx={6.5} colors={colors} detail={detail} />
          {showsFiligree(detail) && (
            <g stroke={MASCOT_INK.line} strokeWidth={1.3} strokeLinecap="round" opacity={0.55}>
              <path d={`M ${x - 16} ${y + 20} l -14 -3`} />
              <path d={`M ${x - 16} ${y + 24} l -14 3`} />
              <path d={`M ${x + 16} ${y + 20} l 14 -3`} />
              <path d={`M ${x + 16} ${y + 24} l 14 3`} />
            </g>
          )}
        </g>
      );
    case "bear":
    default:
      return (
        <g>
          <circle cx={x - 28} cy={y - 28} r={15} fill={colors.bodyTop} />
          <circle cx={x + 28} cy={y - 28} r={15} fill={colors.bodyTop} />
          <circle cx={x - 28} cy={y - 27} r={7.5} fill={colors.panel} />
          <circle cx={x + 28} cy={y - 27} r={7.5} fill={colors.panel} />
          <circle cx={x} cy={y} r={r} fill={colors.bodyTop} />
          <Muzzle x={x} y={y + 20} rx={22} ry={15} noseRx={7.5} colors={colors} detail={detail} />
        </g>
      );
  }
}

export const OTSO: ConceptDef = {
  id: "otso",
  species: "Otso",
  kind: "Animal family — one rig, seven Finnish species",
  origin: "fresh",
  pitch:
    "The warmest concept here, and the only one a seven-year-old will hug. Otso is the old Finnish word for bear, the one you used instead of the bear's real name. Round two answered the obvious objection — that a bear on its own says nothing about gaming and every Nordic children's brand already has one — by making the bear a *member* rather than the whole idea. Seven Finnish animals share one body plan, so a fox can be the fast one, an owl can be the gedu, a hare can be the beginner, and none of it costs a second pose sheet.",
  caveat:
    "Least ownable, still. The forms differ above the neck and in the tail, which is enough to tell them apart and not enough to make any one of them ours. And a cub is the concept most likely to read as \"for little kids\" to a twelve-year-old — a fox or a lynx buys that back, which is half the argument for the family.",
  landmark: "Whatever is above the ears: two round discs, two sharp triangles, antlers, or nothing at all.",
  slots: ["hat", "face", "torso", "back", "extra", "scene"],
  wardrobeLimit:
    "Everything fits, but a hat has to clear whatever is on top — the crown line moves per species, so a beanie sits low on a seal and high on a moose. That is the right trade: the ears are the identity and a hat that covered them would erase it.",
  rig: BASE,
  forms: OTSO_FORMS,
  rigFor,
  faceMode: "eyes",
  variants: OTSO_VARIANTS,
  limbs: (c) => ({ arm: c.bodyBottom, leg: c.bodyBottom, hand: c.panel, foot: c.panel }),
  Body,
  Head,
  fleet: [
    {
      name: "Otso",
      job: "The introducer — home hero, the face of the brand",
      variantId: "honey",
      form: "bear",
      role: "none",
      pose: "wave",
      expression: "happy",
      blurb: "The species and the flagship share a name, the way a mascot usually does. Honey coat, no costume, always waving.",
    },
    {
      name: "Repo",
      job: "Gamer helper — clubs, camps, the gamer dashboard",
      variantId: "honey",
      form: "fox",
      role: "gamer",
      pose: "controller",
      expression: "excited",
      blurb: "\"Repo\" is the old word for fox, from the same taboo-name habit that gave us Otso. Three matches in already.",
    },
    {
      name: "Tuuli",
      job: "Parent helper — schedules, pickups, the family calendar",
      variantId: "frost",
      form: "seal",
      role: "parent",
      pose: "idle",
      expression: "happy",
      prop: "mug",
      blurb: "A Saimaa ringed seal with a mug. Entirely unbothered, and the one who tells you the club is at six.",
    },
    {
      name: "Professori Pöllö",
      job: "Gedu expert — training, session write-ups, the docs",
      variantId: "berry",
      form: "owl",
      role: "gedu",
      pose: "reading",
      expression: "thinking",
      blurb: "The owl was always going to be the professor. Nobody has ever resisted this joke and we are not starting now.",
    },
  ],
};
