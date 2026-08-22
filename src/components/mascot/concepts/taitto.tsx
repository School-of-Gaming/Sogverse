/**
 * Taitto — the folded one. The original, unchanged in kind.
 *
 * "Taitto" is Finnish for a fold. A Taitto is a being made of flat planes
 * creased into a shape, like a paper model that got up and walked off — every
 * surface is a polygon, every colour change is a fold catching different
 * light, and there is not a curve anywhere on it.
 *
 * It is the cheapest concept in the whole directory to draw and to edit,
 * because a facet is three or four points and a model can move one of them
 * without breaking anything. It is also the most graphic: at icon size the
 * hexagonal head and the chevron torso are two hard shapes that nothing else
 * in the fleet resembles.
 *
 * Round two's verdict was that this is the most interesting direction and that
 * it "leans a tad too hard on geometry". Rather than soften this one and lose
 * what made it sharp, three branches sit beside it — Kaari, Kide and Nappi —
 * each conceding curvature somewhere different. This file is the control.
 */

import type { ReactElement } from "react";

import type { ConceptDef, PartProps } from "../concept";
import { showsFiligree } from "../detail";
import { TAITTO_VARIANTS } from "../palette";
import type { Rig } from "../rig";

const RIG: Rig = {
  shadow: { cx: 100, cy: 186, rx: 36, ry: 6 },
  hip: { x: 100, y: 150 },
  hipSpread: 16,
  footY: 180,
  footStyle: "boot",
  shoulderL: { x: 68, y: 106 },
  shoulderR: { x: 132, y: 106 },
  head: { x: 100, y: 62, r: 31 },
  eyeDx: 13,
  eyeY: 62,
  eyeR: 6.5,
  mouthY: 79,
  crown: { x: 100, y: 42 },
  crownW: 54,
  reach: 0,
  limbW: 8,
  handR: 7.5,
  // Hard angles all the way down: a folded plane bends at a crease, and an
  // IK elbow is exactly that.
  limbStyle: "jointed",
  armLen: 62,
  legLen: 40,
  torso: { x: 70, y: 98, w: 60, h: 52 },
  fusedHead: false,
};

function Body({ colors, detail }: PartProps): ReactElement {
  return (
    <g>
      <path d="M 100 98 L 132 114 L 126 154 L 100 164 L 74 154 L 68 114 Z" fill={colors.bodyTop} />
      <path d="M 100 98 L 132 114 L 126 154 L 100 164 Z" fill={colors.bodyBottom} />
      <path d="M 100 118 L 111 130 L 100 142 L 89 130 Z" fill={colors.panel} />
      {showsFiligree(detail) && (
        <>
          <path
            d="M 68 114 L 100 126 L 132 114"
            fill="none"
            stroke={colors.spark}
            strokeWidth={1.8}
            opacity={0.7}
          />
          <path
            d="M 74 154 L 100 146 L 126 154"
            fill="none"
            stroke={colors.spark}
            strokeWidth={1.8}
            opacity={0.5}
          />
        </>
      )}
    </g>
  );
}

function Head({ colors, detail }: PartProps): ReactElement {
  return (
    <g>
      <path d="M 100 30 L 131 47 L 131 79 L 100 96 L 69 79 L 69 47 Z" fill={colors.bodyTop} />
      <path d="M 100 30 L 131 47 L 100 64 L 69 47 Z" fill={colors.spark} opacity={0.3} />
      <path d="M 131 47 L 131 79 L 100 96 L 100 64 Z" fill={colors.bodyBottom} opacity={0.5} />
      {showsFiligree(detail) && (
        <path
          d="M 69 47 L 100 64 L 131 47"
          fill="none"
          stroke={colors.limb}
          strokeWidth={1.6}
          opacity={0.55}
        />
      )}
    </g>
  );
}

function Crown({ colors, floatClass }: PartProps): ReactElement {
  return (
    <g className={floatClass} style={{ transformBox: "view-box", transformOrigin: "100px 30px" }}>
      <path d="M 100 30 L 86 8 L 116 16 Z" fill={colors.limb} />
      <path d="M 100 30 L 116 16 L 108 26 Z" fill={colors.panel} opacity={0.7} />
    </g>
  );
}

export const TAITTO: ConceptDef = {
  id: "taitto",
  species: "Taitto",
  kind: "Geometric being — folded planes, no curve anywhere",
  origin: "fresh",
  pitch:
    "The one that looks designed rather than drawn. \"Taitto\" is a fold; a Taitto is a creature creased out of flat planes, and every colour on it is a facet catching different light. It is the most graphic thing here and the only one that would work as a logo, a loading shape and a character at the same time. Kids read it as a papercraft they could make. Parents read it as a considered brand rather than a cartoon. Gedus, who spend their evenings explaining polygon budgets, will get it immediately.",
  caveat:
    "The coldest, and knowingly so. Hard edges are the opposite of cuddly, and a folded plane cannot look worried, apologetic or proud of you — the emotional half of the job is most of what a parent-facing mascot is for. The three branches exist because that trade is worth testing rather than accepting.",
  landmark: "A hexagonal head plate and a chevron torso — two hard shapes nothing else here has.",
  slots: ["hat", "face", "torso", "back", "extra", "scene"],
  wardrobeLimit:
    "Anything soft fights the folds. Capes, party hats and shades work because they are planes too; a knitted beanie on origami reads as a rendering fault rather than as a hat.",
  rig: RIG,
  faceMode: "eyes",
  variants: TAITTO_VARIANTS,
  limbs: (c) => ({ arm: c.limb, leg: c.limb, hand: c.accent, foot: c.bodyBottom }),
  Body,
  Head,
  Crown,
  fleet: [
    {
      name: "Taite",
      job: "The introducer — home hero, brand animations, the loader",
      variantId: "prism",
      role: "none",
      pose: "wave",
      expression: "happy",
      blurb: "The first fold. Amber front plane, purple limbs — the brand pair standing up as a character.",
    },
    {
      name: "Kulma",
      job: "Gamer helper — club pages, achievements, leaderboards",
      variantId: "ember",
      role: "gamer",
      pose: "seated",
      expression: "focused",
      blurb: "\"Kulma\" is a corner or an angle. The sharp one, permanently three frames ahead of you.",
    },
    {
      name: "Suoja",
      job: "Parent helper — safeguarding, consent, the serious pages",
      variantId: "aurora",
      role: "parent",
      pose: "point-right",
      expression: "happy",
      blurb: "\"Suoja\" is shelter. Aurora colours, calm angles — the fold that stands between a family and a bad day.",
    },
    {
      name: "Origami",
      job: "Gedu expert — training decks, the docs, the deep explanations",
      variantId: "prism",
      role: "gedu",
      pose: "hold-up",
      expression: "thinking",
      prop: "sign",
      blurb: "The one who folds a diagram out of nothing to explain a thing you did not ask about.",
    },
  ],
};
