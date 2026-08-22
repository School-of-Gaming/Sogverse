/**
 * Nappi — the folded one, shrunk to two heads tall.
 *
 * The third branch off Taitto. "Nappi" is Finnish for a button, and also what
 * you say when something lands perfectly.
 *
 * **What it concedes:** nothing about the geometry. Every plane is still flat
 * and every corner is still a corner. The only change is **proportion**, in
 * the opposite direction from Kide: an enormous head plate, a body barely
 * bigger than the hands, and stubby limbs.
 *
 * That is the whole experiment, and it is the cheapest way to test the most
 * useful hypothesis in the set: **is Taitto cold because it is angular, or
 * because it is adult-shaped?** If Nappi reads as cute while staying as hard
 * edged as its parent, then the warmth problem was never about curves and
 * Kaari conceded a corner it did not have to.
 *
 * The practical bonus is that a two-heads-tall character is by far the best of
 * the four at small sizes — the head is most of the drawing, so the avatar
 * crop and the full body converge.
 */

import type { ReactElement } from "react";

import type { ConceptDef, PartProps } from "../concept";
import { showsFiligree } from "../detail";
import { TAITTO_VARIANTS } from "../palette";
import type { Rig } from "../rig";

const RIG: Rig = {
  shadow: { cx: 100, cy: 186, rx: 34, ry: 6 },
  hip: { x: 100, y: 160 },
  hipSpread: 11,
  footY: 180,
  footStyle: "boot",
  shoulderL: { x: 78, y: 138 },
  shoulderR: { x: 122, y: 138 },
  head: { x: 100, y: 72, r: 48 },
  eyeDx: 19,
  eyeY: 74,
  eyeR: 9.6,
  mouthY: 102,
  crown: { x: 100, y: 22 },
  crownW: 70,
  reach: 0,
  limbW: 10,
  handR: 9,
  limbStyle: "jointed",
  armLen: 38,
  legLen: 20,
  torso: { x: 80, y: 132, w: 40, h: 30 },
  fusedHead: false,
};

function Body({ colors, detail }: PartProps): ReactElement {
  return (
    <g>
      <path d="M 100 128 L 122 137 L 119 162 L 100 169 L 81 162 L 78 137 Z" fill={colors.bodyTop} />
      <path d="M 100 128 L 122 137 L 119 162 L 100 169 Z" fill={colors.bodyBottom} />
      <path d="M 100 140 L 107 147 L 100 155 L 93 147 Z" fill={colors.panel} />
      {showsFiligree(detail) && (
        <path
          d="M 79 138 L 100 146 L 121 138"
          fill="none"
          stroke={colors.spark}
          strokeWidth={1.6}
          opacity={0.6}
        />
      )}
    </g>
  );
}

function Head({ colors, detail }: PartProps): ReactElement {
  return (
    <g>
      {/* A wide, squat hexagon — the same six sides as a Taitto, turned so the
          long axis runs across rather than down. */}
      <path d="M 100 22 L 148 48 L 148 96 L 100 122 L 52 96 L 52 48 Z" fill={colors.bodyTop} />
      <path d="M 100 22 L 148 48 L 100 74 L 52 48 Z" fill={colors.spark} opacity={0.28} />
      <path d="M 148 48 L 148 96 L 100 122 L 100 74 Z" fill={colors.bodyBottom} opacity={0.42} />
      {showsFiligree(detail) && (
        <path
          d="M 52 48 L 100 74 L 148 48"
          fill="none"
          stroke={colors.limb}
          strokeWidth={1.6}
          opacity={0.5}
        />
      )}
    </g>
  );
}

function Crown({ colors, floatClass }: PartProps): ReactElement {
  return (
    <g className={floatClass} style={{ transformBox: "view-box", transformOrigin: "100px 22px" }}>
      <path d="M 100 22 L 86 2 L 114 8 Z" fill={colors.limb} />
      <path d="M 100 22 L 114 8 L 107 18 Z" fill={colors.panel} opacity={0.75} />
    </g>
  );
}

export const NAPPI: ConceptDef = {
  id: "nappi",
  species: "Nappi",
  kind: "Taitto branch — same folds, two heads tall",
  origin: "fresh",
  branchOf: "taitto",
  pitch:
    "The cheapest possible test of the most useful question: is Taitto cold because it is angular, or because it is adult-shaped? Nappi changes nothing but the proportions and comes out reading as a toy you would want. It is also, by some distance, the best small-size performer in the whole exploration — at two heads tall the full body and the avatar crop are nearly the same picture, so one drawing serves a hero and a 28-pixel list row.",
  caveat:
    "Chibi proportions age down hard. This is the concept most likely to delight a seven-year-old and embarrass a twelve-year-old, which is a real problem for a product whose gamers span exactly that range. It is also the least useful for standing in for an adult: shrink the head and it stops being a Nappi.",
  landmark: "A head plate wider than the whole body under it.",
  slots: ["hat", "face", "torso", "back", "extra", "scene"],
  wardrobeLimit:
    "Hats are enormous on it, which is mostly an advantage — a beanie on a Nappi is a beanie you can read at 24 pixels. Torso garments have almost no surface to sit on.",
  rig: RIG,
  faceMode: "eyes",
  variants: TAITTO_VARIANTS,
  limbs: (c) => ({ arm: c.limb, leg: c.limb, hand: c.accent, foot: c.bodyBottom }),
  Body,
  Head,
  Crown,
  fleet: [
    {
      name: "Nappi",
      job: "The introducer — empty states, the 404, anywhere small",
      variantId: "prism",
      role: "none",
      pose: "wave",
      expression: "excited",
      blurb: "The button. Turns up at exactly the sizes the other three stop working at.",
    },
    {
      name: "Pikku",
      job: "Gamer helper — avatars, achievement pips, the gamer dashboard",
      variantId: "ember",
      role: "gamer",
      pose: "jumping",
      expression: "laughing",
      blurb: "\"Pikku\" is little. Has never once been on the ground when a screenshot was taken.",
    },
    {
      name: "Nyppy",
      job: "Loading and progress — the one that fills the waiting",
      variantId: "aurora",
      role: "none",
      pose: "walking",
      expression: "happy",
      blurb: "Walks across a progress bar. That is the entire job and it is a good one.",
    },
  ],
};
