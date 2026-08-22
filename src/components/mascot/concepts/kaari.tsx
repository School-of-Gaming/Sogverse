/**
 * Kaari — the folded one, with the corners taken off.
 *
 * The first branch off Taitto, and the most direct answer to "leans a tad too
 * hard on geometry". "Kaari" is Finnish for an arc.
 *
 * **What it concedes:** a round head, and limbs that bend like rope instead of
 * like a crease. Those are the two places a body reads as *alive* rather than
 * as constructed, so they are where a curve buys the most.
 *
 * **What it keeps:** the body is still facets. The chevron torso, the fold
 * lines catching a different light on each plane, and the shard floating over
 * the head all survive — so the silhouette from the shoulders down is still
 * unmistakably the same species, and it still reads as *made* rather than
 * drawn.
 *
 * The bet is that the warmth of a mascot lives above the neck and in how it
 * moves, and that everything below can stay as graphic as you like. If Kaari
 * reads as cuddly and Taitto reads as cold, the bet paid.
 */

import type { ReactElement } from "react";

import type { ConceptDef, PartProps } from "../concept";
import { showsFiligree } from "../detail";
import { TAITTO_VARIANTS } from "../palette";
import type { Rig } from "../rig";

const RIG: Rig = {
  shadow: { cx: 100, cy: 186, rx: 36, ry: 6 },
  hip: { x: 100, y: 148 },
  hipSpread: 16,
  footY: 180,
  footStyle: "round",
  shoulderL: { x: 70, y: 104 },
  shoulderR: { x: 130, y: 104 },
  head: { x: 100, y: 60, r: 30 },
  eyeDx: 12.5,
  eyeY: 60,
  eyeR: 7,
  mouthY: 78,
  crown: { x: 100, y: 34 },
  crownW: 52,
  reach: 0,
  limbW: 10,
  handR: 8.5,
  // The other half of the concession: soft limbs on a hard body.
  limbStyle: "tapered",
  armLen: 58,
  legLen: 40,
  torso: { x: 70, y: 98, w: 60, h: 50 },
  fusedHead: false,
};

/**
 * The facets are the same construction as a Taitto's, drawn with a joined
 * rounded stroke over the fill. Rounding a polygon's corners by stroking it in
 * its own colour is the cheapest possible curve — no path maths, no second
 * shape, and the corner radius is one number.
 */
function Facet({ d, fill, round }: { d: string; fill: string; round: number }): ReactElement {
  return <path d={d} fill={fill} stroke={fill} strokeWidth={round} strokeLinejoin="round" />;
}

/** The polygons, named so the geometry reads as data rather than as copy. */
const PLANES = {
  torso: "M 100 100 L 130 116 L 124 150 L 100 160 L 76 150 L 70 116 Z",
  torsoShade: "M 100 100 L 130 116 L 124 150 L 100 160 Z",
  chest: "M 100 120 L 110 131 L 100 142 L 90 131 Z",
  shard: "M 100 30 L 87 9 L 115 17 Z",
  shardShade: "M 100 30 L 115 17 L 108 26 Z",
} as const;

function Body({ colors, detail }: PartProps): ReactElement {
  return (
    <g>
      <Facet d={PLANES.torso} fill={colors.bodyTop} round={9} />
      <Facet d={PLANES.torsoShade} fill={colors.bodyBottom} round={8} />
      <Facet d={PLANES.chest} fill={colors.panel} round={6} />
      {showsFiligree(detail) && (
        <path
          d="M 71 117 L 100 128 L 129 117"
          fill="none"
          stroke={colors.spark}
          strokeWidth={1.8}
          strokeLinecap="round"
          opacity={0.7}
        />
      )}
    </g>
  );
}

function Head({ colors, detail }: PartProps): ReactElement {
  return (
    <g>
      <circle cx={100} cy={60} r={30} fill={colors.bodyTop} />
      {/* One fold survives on the head: a soft crescent where the plane turns. */}
      <path
        d="M 70 60 A 30 30 0 0 1 130 60 A 40 40 0 0 0 70 60 Z"
        fill={colors.spark}
        opacity={0.28}
      />
      <path
        d="M 130 60 A 30 30 0 0 1 100 90 L 100 60 Z"
        fill={colors.bodyBottom}
        opacity={0.35}
      />
      {showsFiligree(detail) && (
        <path
          d="M 72 52 Q 100 68 128 52"
          fill="none"
          stroke={colors.limb}
          strokeWidth={1.6}
          strokeLinecap="round"
          opacity={0.5}
        />
      )}
    </g>
  );
}

function Crown({ colors, floatClass }: PartProps): ReactElement {
  return (
    <g className={floatClass} style={{ transformBox: "view-box", transformOrigin: "100px 30px" }}>
      <Facet d={PLANES.shard} fill={colors.limb} round={4} />
      <Facet d={PLANES.shardShade} fill={colors.panel} round={3} />
    </g>
  );
}

export const KAARI: ConceptDef = {
  id: "kaari",
  species: "Kaari",
  kind: "Taitto branch — faceted body, round head, soft limbs",
  origin: "fresh",
  branchOf: "taitto",
  pitch:
    "The warmest thing you can do to a folded plane without stopping it being one. A round head and rope limbs put the softness exactly where a viewer looks for it, and the chevron body underneath keeps the whole design looking made rather than doodled. This is the branch to pick if Taitto was right and only ever needed to be huggable.",
  caveat:
    "The compromise is visible: a perfect circle on top of a hard polygon is a join you can see, and at some sizes it reads as two design languages rather than one. It is also the branch that gives up the most of what made Taitto ownable — take enough corners off and you have a mascot with a ball for a head, of which there are thousands.",
  landmark: "A plain circle head over a chevron body — the join itself is the recognisable thing.",
  slots: ["hat", "face", "torso", "back", "extra", "scene"],
  wardrobeLimit:
    "More forgiving than Taitto: a round head takes a knitted hat happily, so the whole winter wardrobe opens up. The body still refuses anything tailored.",
  rig: RIG,
  faceMode: "eyes",
  variants: TAITTO_VARIANTS,
  limbs: (c) => ({ arm: c.limb, leg: c.limb, hand: c.accent, foot: c.bodyBottom }),
  Body,
  Head,
  Crown,
  fleet: [
    {
      name: "Kaari",
      job: "The introducer — home hero, the tour",
      variantId: "prism",
      role: "none",
      pose: "wave",
      expression: "happy",
      blurb: "The arc. Same brand pair as Taite, half the edges, twice as approachable.",
    },
    {
      name: "Pyöre",
      job: "Gamer helper — clubs and camps",
      variantId: "aurora",
      role: "gamer",
      pose: "seated",
      expression: "excited",
      blurb: "\"Pyöreä\" is round. The one who is already in the lobby and has saved you a slot.",
    },
    {
      name: "Nojaa",
      job: "Parent helper — the calm pages",
      variantId: "ember",
      role: "parent",
      pose: "idle",
      expression: "happy",
      prop: "mug",
      blurb: "\"Nojaa\" is to lean on. Turns up where a parent needs a straight answer and a soft edge.",
    },
  ],
};
