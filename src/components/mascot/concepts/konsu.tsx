/**
 * Konsu — the console bot.
 *
 * A handheld games console that grew limbs. Its head is the screen and its
 * face is what the screen is showing, which is why it is the one concept whose
 * expressions are drawn as lit glyphs rather than as eyeballs: it is not
 * pretending to have a face, it is displaying one.
 *
 * That also makes it the most brand-native of the five. The lit colour is the
 * brand amber or the brand purple, glowing out of a dark chassis on a dark
 * page — the same two colours the product already uses, doing the job they are
 * best at.
 */

import type { ReactElement } from "react";

import type { ConceptDef, PartProps } from "../concept";
import { showsFiligree } from "../detail";
import { KONSU_VARIANTS, MASCOT_INK } from "../palette";
import type { Rig } from "../rig";

const RIG: Rig = {
  shadow: { cx: 100, cy: 186, rx: 42, ry: 6.5 },
  hip: { x: 100, y: 150 },
  hipSpread: 20,
  footY: 180,
  footStyle: "boot",
  shoulderL: { x: 60, y: 114 },
  shoulderR: { x: 140, y: 114 },
  head: { x: 100, y: 64, r: 43 },
  eyeDx: 17,
  eyeY: 62,
  eyeR: 8,
  mouthY: 82,
  crown: { x: 100, y: 32 },
  crownW: 80,
  reach: 8,
  limbW: 10,
  handR: 9,
  torso: { x: 64, y: 106, w: 72, h: 52 },
  fusedHead: false,
};

function Body({ colors, detail }: PartProps): ReactElement {
  return (
    <g>
      <rect x={62} y={104} width={76} height={58} rx={20} fill={colors.bodyTop} />
      <rect x={62} y={132} width={76} height={30} rx={20} fill={colors.bodyBottom} opacity={0.7} />
      <rect x={72} y={114} width={56} height={38} rx={14} fill={colors.panel} />
      <rect x={81} y={129} width={17} height={6} rx={3} fill={colors.accent} />
      <rect x={86.5} y={123.5} width={6} height={17} rx={3} fill={colors.accent} />
      <circle cx={114} cy={128} r={4.6} fill={colors.accent} />
      <circle cx={123} cy={137} r={4.6} fill={colors.spark} />
      {showsFiligree(detail) && (
        <>
          <rect x={107} y={144} width={16} height={3} rx={1.5} fill={colors.spark} opacity={0.45} />
          <rect x={107} y={149} width={11} height={3} rx={1.5} fill={colors.spark} opacity={0.3} />
        </>
      )}
    </g>
  );
}

function Head({ colors, detail }: PartProps): ReactElement {
  return (
    <g>
      <rect x={49} y={54} width={11} height={24} rx={5.5} fill={colors.limb} />
      <rect x={140} y={54} width={11} height={24} rx={5.5} fill={colors.limb} />
      <rect x={57} y={30} width={86} height={70} rx={24} fill={colors.bodyTop} />
      <rect x={65} y={38} width={70} height={56} rx={18} fill={colors.panel} />
      {showsFiligree(detail) && (
        <path
          d="M 72 92 L 92 40 L 102 40 L 82 92 Z"
          fill={colors.sclera}
          opacity={0.08}
        />
      )}
    </g>
  );
}

function Crown({ colors, floatClass }: PartProps): ReactElement {
  return (
    <g
      className={floatClass}
      style={{ transformBox: "view-box", transformOrigin: "100px 32px" }}
    >
      <path
        d="M 100 32 L 100 17"
        stroke={colors.limb}
        strokeWidth={5}
        strokeLinecap="round"
        fill="none"
      />
      <circle
        cx={100}
        cy={12}
        r={6.5}
        fill={colors.accent}
        stroke={MASCOT_INK.line}
        strokeWidth={2}
      />
    </g>
  );
}

export const KONSU: ConceptDef = {
  id: "konsu",
  species: "Konsu",
  kind: "Robot / gadget — a handheld console that grew limbs",
  origin: "fresh",
  pitch:
    "The nerdiest of the five and the most obviously ours. Konsu's face is a screen, so its expressions are lit pixels rather than eyeballs — which means the brand amber and the brand purple are doing the emoting, glowing out of a dark chassis on a dark page. Kids read it as a device that came alive. Parents read it as a product, not a cartoon animal, which is exactly right on a billing page. Gedus find it funny because it is unmistakably the class pet of a games club.",
  caveat:
    "Hardest of the five to make warm. A machine consoling a worried parent is a tonal risk, and the screen face means it cannot blush its way out of a difficult message. It is also the concept most likely to date, because it looks like hardware.",
  landmark: "The rounded-rectangle head with a dark screen and two lit eyes; the antenna ball.",
  slots: ["hat", "face", "torso", "back", "extra"],
  wardrobeLimit:
    "Wears everything, and everything reads as a costume rather than as clothing — which is half the charm and half the problem. A hat also hides the antenna, so the two identity cues compete.",
  rig: RIG,
  faceMode: "screen",
  variants: KONSU_VARIANTS,
  limbs: (c) => ({ arm: c.limb, leg: c.limb, hand: c.bodyTop, foot: c.accent }),
  Body,
  Head,
  Crown,
  fleet: [
    {
      name: "Ykko",
      job: "The introducer — home hero, onboarding, the 404",
      variantId: "amber",
      role: "none",
      pose: "wave",
      expression: "happy",
      blurb: "Unit one, and \"ykkonen\" is Finnish for the number one. The amber chassis is the one that greets you.",
    },
    {
      name: "Piksu",
      job: "Gamer helper — club pages, achievements, voice rooms",
      variantId: "violet",
      role: "gamer",
      pose: "controller",
      expression: "focused",
      blurb: "Pixel plus \"piksu\", which sounds like someone small and sharp. The one that plays alongside you.",
    },
    {
      name: "Turva",
      job: "Parent helper — safeguarding, PIN, permissions",
      variantId: "mint",
      role: "parent",
      pose: "point-right",
      expression: "happy",
      blurb: "\"Turva\" is safety. Cool chassis, calm face — the one that appears next to anything a parent has to approve.",
    },
    {
      name: "Opas",
      job: "Gedu expert — the gedu workspace and its docs",
      variantId: "amber",
      role: "gedu",
      pose: "point-left",
      expression: "thinking",
      prop: "pointer",
      blurb: "\"Opas\" is a guide. The unit with the specs and the pointer, permanently mid-explanation.",
    },
  ],
};
