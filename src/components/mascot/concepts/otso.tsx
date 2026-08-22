/**
 * Otso — the cub.
 *
 * Otso is the old Finnish name for the bear, used when you did not want to say
 * the bear's real name out loud. Ours is a round cub with ears too big for its
 * head, which is the single cheapest way to make a shape read as young,
 * harmless and pleased to see you.
 *
 * The two ear circles are the whole identity. They survive down to sixteen
 * pixels, they read at any angle, and nothing else in the fleet has them.
 */

import type { ReactElement } from "react";

import type { ConceptDef, PartProps } from "../concept";
import { showsFiligree } from "../detail";
import { MASCOT_INK, OTSO_VARIANTS } from "../palette";
import type { Rig } from "../rig";

const RIG: Rig = {
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
  torso: { x: 68, y: 112, w: 64, h: 46 },
  fusedHead: false,
};

function Body({ colors, detail }: PartProps): ReactElement {
  return (
    <g>
      <circle cx={138} cy={148} r={9} fill={colors.bodyBottom} />
      <ellipse cx={100} cy={132} rx={36} ry={30} fill={colors.bodyTop} />
      <ellipse cx={100} cy={139} rx={25} ry={21} fill={colors.panel} />
      {showsFiligree(detail) && (
        <ellipse cx={82} cy={116} rx={9} ry={6} fill={MASCOT_INK.paper} opacity={0.18} />
      )}
    </g>
  );
}

function Head({ colors, detail }: PartProps): ReactElement {
  return (
    <g>
      <circle cx={72} cy={42} r={15} fill={colors.bodyTop} />
      <circle cx={128} cy={42} r={15} fill={colors.bodyTop} />
      <circle cx={72} cy={43} r={7.5} fill={colors.panel} />
      <circle cx={128} cy={43} r={7.5} fill={colors.panel} />
      <circle cx={100} cy={70} r={40} fill={colors.bodyTop} />
      <ellipse cx={100} cy={88} rx={22} ry={15} fill={colors.panel} />
      <ellipse cx={100} cy={80} rx={7.5} ry={5.5} fill={MASCOT_INK.line} />
      {showsFiligree(detail) && (
        <>
          <path
            d="M 100 85 L 100 89"
            stroke={MASCOT_INK.line}
            strokeWidth={2}
            strokeLinecap="round"
          />
          <ellipse cx={97} cy={78.5} rx={2.2} ry={1.6} fill={MASCOT_INK.paper} opacity={0.7} />
        </>
      )}
    </g>
  );
}

export const OTSO: ConceptDef = {
  id: "otso",
  species: "Otso",
  kind: "Animal / creature — a round Finnish bear cub",
  origin: "fresh",
  pitch:
    "The warmest of the five, and the only one a seven-year-old will hug. Otso is the old Finnish word for bear, the one you used instead of the bear's real name; ours is a cub with ears two sizes too big. Kids love it on sight. Parents trust it, because a round animal with a muzzle is the single most legible \"this place is safe for your child\" signal available. Gedus get the dry joke that the national animal has joined the club and brought a clipboard.",
  caveat:
    "Least ownable. Every children's brand in the Nordics has a bear, and a cub says nothing about gaming on its own — the controller has to do all that work. It is also the one most likely to read as \"for little kids\" to a twelve-year-old.",
  landmark: "Two oversized ear circles and a pale muzzle. Recognisable as a flat shape alone.",
  slots: ["hat", "face", "torso", "back", "extra"],
  wardrobeLimit:
    "Everything fits, but a hat has to clear the ears, so brims sit high and the ears stay visible either side. That is the right trade: the ears are the identity and a hat that covered them would erase it.",
  rig: RIG,
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
      role: "none",
      pose: "wave",
      expression: "happy",
      blurb: "The species and the flagship share a name, the way a mascot usually does. Honey coat, no costume, always waving.",
    },
    {
      name: "Mesi",
      job: "Gamer helper — clubs, camps, the gamer dashboard",
      variantId: "honey",
      role: "gamer",
      pose: "controller",
      expression: "excited",
      blurb: "\"Mesi\" is nectar, and what a bear is always after. The cub who is already three matches in.",
    },
    {
      name: "Tuuli",
      job: "Parent helper — schedules, pickups, the family calendar",
      variantId: "frost",
      role: "parent",
      pose: "idle",
      expression: "happy",
      prop: "mug",
      blurb: "\"Tuuli\" is wind. Scarf, mug, entirely unbothered — the one who tells you the club is at six.",
    },
    {
      name: "Professori Karhu",
      job: "Gedu expert — training, session write-ups, the docs",
      variantId: "berry",
      role: "gedu",
      pose: "reading",
      expression: "thinking",
      blurb: "\"Karhu\" is the plain word for bear, which is exactly the joke: the professor uses the formal name.",
    },
  ],
};
