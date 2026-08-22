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
  shoulderL: { x: 74, y: 98 },
  shoulderR: { x: 126, y: 98 },
  head: { x: 100, y: 56, r: 26 },
  eyeDx: 11.5,
  eyeY: 57,
  eyeR: 5.8,
  mouthY: 70,
  crown: { x: 100, y: 34 },
  crownW: 50,
  limbW: 11,
  handR: 8,
  torso: { x: 74, y: 92, w: 52, h: 54 },
  fusedHead: false,
};

function Body({ colors, detail }: PartProps): ReactElement {
  return (
    <g>
      <rect x={93} y={74} width={14} height={20} rx={5} fill={colors.bodyBottom} />
      <path
        d="M 74 100 C 74 90 84 86 100 86 C 116 86 126 90 126 100 L 126 144 C 126 150 118 152 100 152 C 82 152 74 150 74 144 Z"
        fill={colors.accent}
      />
      <ellipse cx={100} cy={91} rx={24} ry={9} fill={colors.panel} />
      <rect x={86} y={120} width={28} height={17} rx={8} fill={colors.panel} opacity={0.6} />
      {showsFiligree(detail) && (
        <>
          <path
            d="M 93 96 L 92 110"
            stroke={colors.panel}
            strokeWidth={3}
            strokeLinecap="round"
          />
          <path
            d="M 107 96 L 108 108"
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
      <circle cx={75} cy={60} r={6.5} fill={colors.bodyBottom} />
      <circle cx={125} cy={60} r={6.5} fill={colors.bodyBottom} />
      <rect x={76} y={30} width={48} height={52} rx={22} fill={colors.bodyTop} />
      <path
        d="M 75 58 C 75 27 125 27 125 58 C 119 44 111 39 100 39 C 88 39 81 46 75 58 Z"
        fill={colors.limb}
      />
      {showsFiligree(detail) && (
        <g fill={colors.bodyBottom} opacity={0.55}>
          <circle cx={88} cy={66} r={1.5} />
          <circle cx={93} cy={69} r={1.3} />
          <circle cx={112} cy={66} r={1.5} />
          <circle cx={107} cy={69} r={1.3} />
        </g>
      )}
      {detail !== "icon" && (
        <path
          d="M 82 33 C 90 27 110 27 118 33"
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
  limbs: (c) => ({ arm: c.accent, leg: c.limb, hand: c.bodyTop, foot: c.pupil }),
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
