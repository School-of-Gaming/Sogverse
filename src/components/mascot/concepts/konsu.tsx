/**
 * Konsu — the console bot.
 *
 * A handheld games console that grew limbs. Its head is the screen and its
 * face is what the screen is showing, which is why it is the one concept whose
 * expressions are drawn as lit glyphs rather than as eyeballs: it is not
 * pretending to have a face, it is displaying one.
 *
 * That also makes it the most brand-native concept here. The lit colour is the
 * brand amber or the brand purple, glowing out of a dark chassis on a dark
 * page — the same two colours the product already uses, doing the job they are
 * best at.
 *
 * ## What round two changed, and why it is a small change
 *
 * The criticism was fair and narrow: a cool tech vibe, but a *generic* robot —
 * it could be anyone's. So two things were added, both of which only this
 * product could put on a machine, and nothing was taken away:
 *
 * - **A carry handle**, replacing the antenna. A handheld console with a
 *   handle is a thing you take to a club rather than a thing that lives in a
 *   server rack, and a robot that carries itself is a silhouette nobody else
 *   in this space has. It also settles the round-one complaint that a hat and
 *   the antenna competed for the same space: a hat now sits *under* the handle
 *   and both survive.
 * - **The four Yty elements**, as a lit marquee strip above the screen and as
 *   a single element pip on the chest. The elements are the one piece of
 *   iconography this product owns outright — a rival could copy a screen face,
 *   and could not copy Harmony, Glow, Valor and Wit in a row.
 *
 * Whether that is enough to make it ownable is exactly the thing to look at on
 * the page. It is a small change on purpose: round two's judgement was that
 * Konsu is not where the effort should go.
 */

import type { ReactElement } from "react";

import type { ConceptDef, PartProps } from "../concept";
import { showsFiligree } from "../detail";
import { KONSU_VARIANTS, MASCOT_INK, YTY_ORDER, YTY_PIPS } from "../palette";

/**
 * Which element a chassis belongs to. Arbitrary, and deliberately so — the
 * point is that every Konsu has one, not that amber implies Glow.
 */
const ELEMENT_FOR_VARIANT: Record<string, (typeof YTY_ORDER)[number]> = {
  amber: "glow",
  violet: "wit",
  mint: "harmony",
};
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
  // A machine's arm folds at a hinge, and a hinge is exactly what the IK
  // solve draws.
  limbStyle: "jointed",
  armLen: 54,
  legLen: 36,
  torso: { x: 64, y: 106, w: 72, h: 52 },
  fusedHead: false,
};

function Body({ colors, variantId, detail }: PartProps): ReactElement {
  return (
    <g>
      <rect x={62} y={104} width={76} height={58} rx={20} fill={colors.bodyTop} />
      <rect x={62} y={132} width={76} height={30} rx={20} fill={colors.bodyBottom} opacity={0.7} />
      <rect x={72} y={114} width={56} height={38} rx={14} fill={colors.panel} />
      <rect x={81} y={129} width={17} height={6} rx={3} fill={colors.accent} />
      <rect x={86.5} y={123.5} width={6} height={17} rx={3} fill={colors.accent} />
      <circle cx={114} cy={128} r={4.6} fill={colors.accent} />
      <circle cx={123} cy={137} r={4.6} fill={colors.spark} />
      {/* The element pip: one diamond in one of the four lore colours. Which
          one is a property of the chassis, so a Konsu belongs to an element
          the way a gamer does. */}
      <path
        d={`M 100 118 L 106 126 L 100 134 L 94 126 Z`}
        fill={YTY_PIPS[ELEMENT_FOR_VARIANT[variantId] ?? "glow"]}
      />
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
      {/* The marquee: four lit element pips in a row, the way an arcade
          cabinet wears its name. */}
      <rect x={68} y={35} width={64} height={9} rx={4.5} fill={colors.panel} />
      {YTY_ORDER.map((element, i) => (
        <rect
          key={element}
          x={74 + i * 14}
          y={37.5}
          width={9}
          height={4}
          rx={2}
          fill={YTY_PIPS[element]}
        />
      ))}
      <rect x={65} y={47} width={70} height={47} rx={16} fill={colors.panel} />
      {showsFiligree(detail) && (
        <path
          d="M 72 90 L 90 49 L 100 49 L 82 90 Z"
          fill={colors.sclera}
          opacity={0.08}
        />
      )}
    </g>
  );
}

/**
 * The carry handle. Drawn as a static part rather than a floating one — a
 * handle that bobbed independently of the machine it is bolted to would read
 * as broken, which is the opposite of what a solid grab handle is for.
 */
function Crown({ colors }: PartProps): ReactElement {
  return (
    <g>
      <path
        d="M 74 34 L 74 20 Q 74 10 86 10 L 114 10 Q 126 10 126 20 L 126 34"
        fill="none"
        stroke={colors.limb}
        strokeWidth={8}
        strokeLinecap="round"
      />
      <path
        d="M 84 17 L 116 17"
        stroke={colors.accent}
        strokeWidth={3.4}
        strokeLinecap="round"
      />
      <circle cx={74} cy={33} r={5} fill={colors.bodyBottom} stroke={MASCOT_INK.line} strokeWidth={1.6} />
      <circle cx={126} cy={33} r={5} fill={colors.bodyBottom} stroke={MASCOT_INK.line} strokeWidth={1.6} />
    </g>
  );
}

export const KONSU: ConceptDef = {
  id: "konsu",
  species: "Konsu",
  kind: "Robot / gadget — a portable console with a carry handle",
  origin: "fresh",
  pitch:
    "The nerdiest of the five and the most obviously ours. Konsu's face is a screen, so its expressions are lit pixels rather than eyeballs — which means the brand amber and the brand purple are doing the emoting, glowing out of a dark chassis on a dark page. Kids read it as a device that came alive. Parents read it as a product, not a cartoon animal, which is exactly right on a billing page. Gedus find it funny because it is unmistakably the class pet of a games club.",
  caveat:
    "Hardest here to make warm. A machine consoling a worried parent is a tonal risk, and the screen face means it cannot blush its way out of a difficult message. It is also the concept most likely to date, because it looks like hardware — and the handle and the element pips make it *ours* without making it any less a robot, which was the actual complaint.",
  landmark: "A carry handle over a dark screen with two lit eyes, and four element pips under it.",
  slots: ["hat", "face", "torso", "back", "extra", "scene"],
  wardrobeLimit:
    "Wears everything, and everything reads as a costume rather than as clothing — which is half the charm and half the problem. The handle sits above the hat line, so unlike round one's antenna it survives being given a beanie.",
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
