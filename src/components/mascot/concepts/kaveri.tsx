/**
 * Kaveri — the stylised person.
 *
 * "Kaveri" is Finnish for buddy, and this is the concept that exists for the
 * hardest job in the brief: standing exactly where a photograph of a child
 * would stand. It is a person shape, so a hero image with a Kaveri in it reads
 * as a hero image with a *kid* in it, which no droplet or bear can do.
 *
 * The complexions are deliberately unreal — lilac, teal, coral. That is not a
 * stylistic flourish, it is the safeguard: an illustrated person in a plausible
 * skin tone invites the question of which child it is meant to be, and an
 * illustrated person in lilac does not. Same silhouette, none of the problem.
 */

import type { ReactElement } from "react";

import type { ConceptDef, PartProps } from "../concept";
import { showsFiligree } from "../detail";
import { KAVERI_VARIANTS, MASCOT_INK } from "../palette";
import type { Rig } from "../rig";

const RIG: Rig = {
  shadow: { cx: 100, cy: 186, rx: 34, ry: 6 },
  hip: { x: 100, y: 142 },
  hipSpread: 14,
  footY: 178,
  footStyle: "boot",
  shoulderL: { x: 72, y: 100 },
  shoulderR: { x: 128, y: 100 },
  head: { x: 100, y: 55, r: 28 },
  eyeDx: 12.5,
  eyeY: 57,
  eyeR: 6.2,
  mouthY: 72,
  crown: { x: 100, y: 31 },
  crownW: 54,
  reach: 0,
  limbW: 11,
  handR: 8,
  torso: { x: 72, y: 94, w: 56, h: 52 },
  fusedHead: false,
};

function Body({ colors, detail }: PartProps): ReactElement {
  return (
    <g>
      <rect x={92} y={76} width={16} height={20} rx={5} fill={colors.bodyBottom} />
      <path
        d="M 72 102 C 72 91 82 87 100 87 C 118 87 128 91 128 102 L 128 145 C 128 151 119 153 100 153 C 81 153 72 151 72 145 Z"
        fill={colors.accent}
      />
      <ellipse cx={100} cy={93} rx={26} ry={10} fill={colors.panel} />
      <rect x={84} y={122} width={32} height={18} rx={9} fill={colors.panel} opacity={0.55} />
      {showsFiligree(detail) && (
        <>
          <path
            d="M 93 99 L 92 113"
            stroke={colors.panel}
            strokeWidth={3}
            strokeLinecap="round"
          />
          <path
            d="M 107 99 L 108 111"
            stroke={colors.panel}
            strokeWidth={3}
            strokeLinecap="round"
          />
        </>
      )}
    </g>
  );
}

function Head({ colors, detail }: PartProps): ReactElement {
  return (
    <g>
      <circle cx={73} cy={60} r={7} fill={colors.bodyBottom} />
      <circle cx={127} cy={60} r={7} fill={colors.bodyBottom} />
      <rect x={74} y={26} width={52} height={58} rx={24} fill={colors.bodyTop} />
      <path
        d="M 73 57 C 73 22 127 22 127 53 C 127 46 124 41 118 40 C 106 38 96 44 86 46 C 79 47 75 50 73 57 Z"
        fill={colors.limb}
      />
      {showsFiligree(detail) && (
        <g fill={colors.bodyBottom} opacity={0.55}>
          <circle cx={86} cy={68} r={1.6} />
          <circle cx={91} cy={71} r={1.4} />
          <circle cx={114} cy={68} r={1.6} />
          <circle cx={109} cy={71} r={1.4} />
        </g>
      )}
      {detail !== "icon" && (
        <path
          d="M 80 30 C 89 24 111 24 120 30"
          fill="none"
          stroke={MASCOT_INK.line}
          strokeWidth={2}
          strokeLinecap="round"
          opacity={0.25}
        />
      )}
    </g>
  );
}

export const KAVERI: ConceptDef = {
  id: "kaveri",
  species: "Kaveri",
  kind: "Humanoid — a stylised person in an impossible colour",
  origin: "fresh",
  pitch:
    "The one that does the job the brief actually described. No child's photograph can go on this site, so every hero, every email header and every \"here is what a session looks like\" has a person-shaped hole in it, and only a person-shaped mascot fills it. A Kaveri in a hoodie with a controller reads as a kid at a club; the same figure with a scarf and a mug reads as their parent; with specs and a lanyard, as their gedu. Same body, three completely legible people. \"Kaveri\" is Finnish for buddy.",
  caveat:
    "The least distinctive and the most crowded — the world is full of flat-illustration people, and a Kaveri will never be as ownable as a bot or a cub. It is also the weakest at icon size, because a small human head is a small circle and the hair is doing most of the work.",
  landmark: "The hair silhouette against a rounded head, and the hoodie block below it.",
  slots: ["hat", "face", "torso", "back", "extra"],
  wardrobeLimit:
    "None worth naming — it is the only one of the five where an outfit reads as clothing rather than as a costume, which is exactly why it is the best candidate for a gamer-facing customiser.",
  rig: RIG,
  faceMode: "eyes",
  variants: KAVERI_VARIANTS,
  limbs: (c) => ({ arm: c.panel, leg: c.limb, hand: c.bodyTop, foot: c.pupil }),
  Body,
  Head,
  fleet: [
    {
      name: "Vilma",
      job: "The introducer — home hero, the tour, the empty states",
      variantId: "lilac",
      role: "none",
      pose: "wave",
      expression: "excited",
      blurb: "The face of the front page. Lilac, purple hoodie, permanently pleased you turned up.",
    },
    {
      name: "Niko",
      job: "Gamer stand-in — club pages, camp galleries, marketing shots",
      variantId: "teal",
      role: "gamer",
      pose: "controller",
      expression: "focused",
      blurb: "The one that stands where a photo of a child would have gone. Headset on, mid-match, unidentifiable on purpose.",
    },
    {
      name: "Sanni",
      job: "Parent stand-in — billing, consent, safeguarding copy",
      variantId: "coral",
      role: "parent",
      pose: "idle",
      expression: "happy",
      prop: "mug",
      blurb: "Scarf and a mug. Turns up wherever a parent is being asked to read something carefully.",
    },
    {
      name: "Eero",
      job: "Gedu stand-in — gedu recruitment, training, the workspace",
      variantId: "lilac",
      role: "gedu",
      pose: "point-left",
      expression: "happy",
      prop: "clipboard",
      blurb: "Specs, lanyard, clipboard. The educator in every diagram that needs one.",
    },
  ],
};
