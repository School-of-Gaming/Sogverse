/**
 * Kide — the folded one, grown up and lit from inside.
 *
 * The second branch off Taitto. "Kide" is Finnish for a crystal.
 *
 * **What it concedes:** almost no curvature. This is the branch that answers
 * "push game + tech + art one step further" instead of "make it softer", so
 * the only curves are the two that stop a crystal reading as a rock — a
 * rounded shoulder line and the glow core.
 *
 * **What it changes instead is proportion.** A Taitto is a chunky
 * five-heads-tall cartoon; a Kide is slender, longer-limbed, and carries its
 * head high. That single change moves it from "toy" to "character in the
 * game", which is the register a twelve-year-old takes seriously and the one a
 * cub can never reach.
 *
 * **The core is the idea.** There is a lit facet at the chest that every other
 * plane refracts, so the character has an internal light source rather than an
 * applied colour. It is the one feature here that would make a Kide instantly
 * recognisable in silhouette-plus-one-colour, and it is also the natural place
 * to hang a Yty element without turning the species into a Ytymo.
 *
 * ## The simplicity pass (2026-08-23)
 *
 * **Removed:** the refraction lines off the core, the crease strokes across the
 * chest, the brow and down the face, and the shard's second facet — all
 * hairline strokes behind `showsFiligree`, none of them present at 40px. And
 * the core's *second, smaller* diamond: this concept's own `landmark` says
 * "one lit diamond at the chest", and it was drawing two.
 *
 * **Kept as identity:** the prism planes, on the head and on the body. They
 * are flat colour blocks and they are the entire species — a Kide with one
 * flat colour on it is a hexagon. And the core, now a single diamond in the
 * accent: it is the idea, and one shape says it better than two nested ones
 * did, because at 40px the inner one was two pixels of a colour nobody could
 * name.
 */

import type { ReactElement } from "react";

import type { ConceptDef, PartProps } from "../concept";
import { TAITTO_VARIANTS } from "../palette";
import type { Rig } from "../rig";

const RIG: Rig = {
  shadow: { cx: 100, cy: 187, rx: 30, ry: 5 },
  hip: { x: 100, y: 142 },
  hipSpread: 13,
  footY: 182,
  footStyle: "boot",
  shoulderL: { x: 76, y: 92 },
  shoulderR: { x: 124, y: 92 },
  head: { x: 100, y: 52, r: 26 },
  eyeDx: 11,
  eyeY: 52,
  eyeR: 5.6,
  mouthY: 66,
  crown: { x: 100, y: 28 },
  crownW: 40,
  reach: 0,
  limbW: 6.5,
  handR: 6,
  limbStyle: "jointed",
  armLen: 70,
  legLen: 48,
  torso: { x: 78, y: 88, w: 44, h: 54 },
  fusedHead: false,
};

function Body({ colors }: PartProps): ReactElement {
  return (
    <g>
      {/* Two long planes meeting at a ridge, narrowing to the waist. */}
      <path d="M 100 84 L 122 96 L 116 142 L 100 152 L 84 142 L 78 96 Z" fill={colors.bodyTop} />
      <path d="M 100 84 L 122 96 L 116 142 L 100 152 Z" fill={colors.bodyBottom} />
      {/* The core: the one lit thing on the character, and one shape. */}
      <path d="M 100 104 L 110 116 L 100 130 L 90 116 Z" fill={colors.accent} />
    </g>
  );
}

function Head({ colors }: PartProps): ReactElement {
  return (
    <g>
      {/* A tall prism rather than a squat hexagon: six sides, longer axis up. */}
      <path d="M 100 24 L 124 40 L 124 68 L 100 80 L 76 68 L 76 40 Z" fill={colors.bodyTop} />
      <path d="M 100 24 L 124 40 L 100 54 L 76 40 Z" fill={colors.spark} opacity={0.32} />
      <path d="M 124 40 L 124 68 L 100 80 L 100 54 Z" fill={colors.bodyBottom} opacity={0.45} />
    </g>
  );
}

function Crown({ colors, floatClass }: PartProps): ReactElement {
  return (
    <g className={floatClass} style={{ transformBox: "view-box", transformOrigin: "100px 24px" }}>
      <path d="M 100 4 L 108 16 L 100 24 L 92 16 Z" fill={colors.accent} />
    </g>
  );
}

export const KIDE: ConceptDef = {
  id: "kide",
  species: "Kide",
  kind: "Taitto branch — slender crystal with a lit core",
  origin: "fresh",
  branchOf: "taitto",
  pitch:
    "The branch that goes further into the idea instead of retreating from it. Longer limbs and a taller head plate move it out of toy proportions and into game-character proportions, and the lit core at the chest gives it something no other concept here has: an internal light source, which is the most game-native visual idea in the whole exploration. It is also the only design in the set that a twelve-year-old would not feel talked down to by.",
  caveat:
    "Coldest of the four folds, and the least suited to a parent-facing page — slender and lit is \"cool\", and cool is not the register a safeguarding page wants. Thin limbs are also the first thing to disappear at small sizes: below about forty pixels this is a head and a glowing dot.",
  landmark: "A tall prism head and one lit diamond at the chest.",
  slots: ["hat", "face", "torso", "back", "extra", "scene"],
  wardrobeLimit:
    "The narrowest wardrobe here. Anything bulky swamps the proportions that are the entire point, and a hat competes with the floating shard. Shades, capes and ground props only.",
  rig: RIG,
  faceMode: "eyes",
  variants: TAITTO_VARIANTS,
  limbs: (c) => ({ arm: c.limb, leg: c.limb, hand: c.accent, foot: c.bodyBottom }),
  Body,
  Head,
  Crown,
  fleet: [
    {
      name: "Kide",
      job: "The introducer — hero, loader, the brand mark in motion",
      variantId: "prism",
      role: "none",
      pose: "hold-up",
      expression: "focused",
      prop: "sign",
      blurb: "The crystal. Holds up whatever the page needs read first.",
    },
    {
      name: "Särmä",
      job: "Gamer helper — competitive pages, leaderboards, achievements",
      variantId: "ember",
      role: "gamer",
      pose: "controller",
      expression: "focused",
      blurb: "\"Särmä\" is an edge, and also slang for sharp in the admiring sense. Both meanings intended.",
    },
    {
      name: "Hohde",
      job: "Gedu expert — training, the deep explanations",
      variantId: "aurora",
      role: "gedu",
      pose: "point-right",
      expression: "thinking",
      blurb: "\"Hohde\" is a glow. The one whose core gets brighter when the explanation gets longer.",
    },
  ],
};
