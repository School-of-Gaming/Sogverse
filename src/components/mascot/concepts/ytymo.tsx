/**
 * Ytymo — the Yty-compatible one.
 *
 * A droplet of condensed Yty that has decided to have a face. It is the only
 * concept that extends the lore already in the product rather than starting
 * clean: the four colourways are the four elements, drawn in the exact hues
 * the Yty section already spends, and the thing floating over its head is that
 * element's own sign.
 *
 * Head and body are one shape, which is what makes this the cheapest concept
 * to draw and the strongest at small sizes — an egg with two big eyes is still
 * an egg with two big eyes at sixteen pixels.
 */

import type { ReactElement } from "react";

import type { ConceptDef, PartProps } from "../concept";
import { showsFiligree } from "../detail";
import { MASCOT_INK, YTYMO_VARIANTS } from "../palette";
import type { Rig } from "../rig";

const RIG: Rig = {
  shadow: { cx: 100, cy: 186, rx: 44, ry: 7 },
  hip: { x: 100, y: 156 },
  hipSpread: 20,
  footY: 178,
  footStyle: "round",
  shoulderL: { x: 62, y: 118 },
  shoulderR: { x: 138, y: 118 },
  head: { x: 100, y: 86, r: 50 },
  eyeDx: 19,
  eyeY: 87,
  eyeR: 9.5,
  mouthY: 111,
  crown: { x: 100, y: 48 },
  crownW: 60,
  reach: 16,
  limbW: 11,
  handR: 9.5,
  torso: { x: 74, y: 130, w: 52, h: 30 },
  fusedHead: true,
};

/** The droplet. One closed path, four curves, no gradients, no clip paths. */
const DROPLET =
  "M 100 34 C 128 34 152 66 152 104 C 152 142 130 164 100 164 C 70 164 48 142 48 104 C 48 66 72 34 100 34 Z";

function Body({ colors, detail }: PartProps): ReactElement {
  return (
    <g>
      <path d={DROPLET} fill={colors.bodyTop} />
      <path
        d="M 51 116 C 62 148 78 164 100 164 C 122 164 138 148 149 116 C 152 142 130 164 100 164 C 70 164 48 142 51 116 Z"
        fill={colors.bodyBottom}
        opacity={0.55}
      />
      <ellipse cx={100} cy={138} rx={30} ry={16} fill={colors.panel} opacity={0.55} />
      {showsFiligree(detail) && (
        <ellipse
          cx={76}
          cy={68}
          rx={12}
          ry={19}
          fill={MASCOT_INK.paper}
          opacity={0.22}
          transform="rotate(-24 76 68)"
        />
      )}
    </g>
  );
}

/** Head and body are the same shape, so there is nothing left to draw here. */
function Head(): ReactElement {
  return <g />;
}

/**
 * The element sign, floating overhead, plus a few loose motes. Four glyphs,
 * each a handful of anchors — the point is that they are readable at a glance
 * and editable in a text editor, not that they are the lucide icons redrawn.
 */
function Crown({ colors, variantId, floatClass, detail }: PartProps): ReactElement {
  const outline = { stroke: colors.spark, strokeWidth: 2.6, strokeLinejoin: "round" as const };
  let glyph: ReactElement;
  switch (variantId) {
    case "glow":
      glyph = (
        <g>
          <circle cx={100} cy={18} r={8.5} fill={colors.accent} {...outline} />
          {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
            <path
              key={deg}
              d="M 100 5.5 L 100 0.5"
              stroke={colors.accent}
              strokeWidth={3.2}
              strokeLinecap="round"
              transform={`rotate(${deg} 100 18)`}
            />
          ))}
        </g>
      );
      break;
    case "valor":
      glyph = (
        <g>
          <path d="M 100 0 L 105 8 L 105 24 L 95 24 L 95 8 Z" fill={colors.accent} {...outline} />
          <rect x={87} y={24} width={26} height={5.5} rx={2.75} fill={colors.accent} {...outline} />
          <rect x={96} y={29} width={8} height={7} rx={3.5} fill={colors.accent} {...outline} />
        </g>
      );
      break;
    case "wit":
      glyph = (
        <g>
          <circle cx={93} cy={16} r={8.5} fill={colors.accent} {...outline} />
          <circle cx={107} cy={16} r={8.5} fill={colors.accent} {...outline} />
          <circle cx={100} cy={26} r={7.5} fill={colors.accent} {...outline} />
          <path
            d="M 94 14 q 6 4 12 0"
            fill="none"
            stroke={colors.spark}
            strokeWidth={2.2}
            strokeLinecap="round"
          />
        </g>
      );
      break;
    default:
      glyph = (
        <path
          d="M 100 31 C 91 23 83 18 83 12 C 83 5 92 3 100 11 C 108 3 117 5 117 12 C 117 18 109 23 100 31 Z"
          fill={colors.accent}
          {...outline}
        />
      );
  }
  return (
    <g>
      <g className={floatClass}>{glyph}</g>
      {showsFiligree(detail) && (
        <g fill={colors.accent} opacity={0.75}>
          <circle cx={156} cy={62} r={3.6} />
          <circle cx={48} cy={56} r={2.6} />
          <circle cx={152} cy={140} r={3} />
          <circle cx={44} cy={132} r={2.2} />
        </g>
      )}
    </g>
  );
}

export const YTYMO: ConceptDef = {
  id: "ytymo",
  species: "Ytymo",
  kind: "Abstract critter — a droplet of Yty with a face",
  origin: "yty",
  pitch:
    "The one that costs nothing to explain, because the product already told this story. A Ytymo is a condensed drop of Yty, and the four of them are the four elements you already earn: Harmony, Glow, Valor and Wit, in the section's own colours, each carrying its own sign overhead. Kids get a set to collect and a favourite to pick. Parents meet a shape so friendly it reads as safe before they have read a word. Gedus get the joke instantly, because they are the ones who hand the Yty out.",
  caveat:
    "It is an egg. Charming, but the least distinctive silhouette of the five, and the four element variants will always fight the brand amber a little — the palette is the lore's, not the logo's.",
  landmark: "The egg silhouette, two very large eyes, and the sign floating overhead.",
  slots: ["hat", "face", "torso", "back", "extra"],
  wardrobeLimit:
    "No hoodie and no tee — a droplet has no shoulders, so a sleeved garment reads as a bib. Scarves, lanyards, hats, capes and ground props all fit, and the element sign overhead has to yield to a hat.",
  rig: RIG,
  faceMode: "eyes",
  variants: YTYMO_VARIANTS,
  limbs: (c) => ({ arm: c.spark, leg: c.spark, hand: c.spark, foot: c.spark }),
  Body,
  Head,
  Crown,
  fleet: [
    {
      name: "Alku",
      job: "The introducer — home hero, first-visit tours",
      variantId: "glow",
      role: "none",
      pose: "wave",
      expression: "excited",
      blurb: "\"Alku\" is Finnish for beginning. Glow is the element about other people, so the greeter is the Glow one.",
    },
    {
      name: "Nappi",
      job: "Gamer helper — the gamer dashboard, empty states, streaks",
      variantId: "wit",
      role: "gamer",
      pose: "controller",
      expression: "focused",
      blurb: "\"Nappi\" is a button, and also Finnish for \"spot on\". Wit is the media-and-tech element, so the gaming buddy wears it.",
    },
    {
      name: "Vakaa",
      job: "Parent helper — billing, consent, the calm explanations",
      variantId: "harmony",
      role: "parent",
      pose: "point-right",
      expression: "happy",
      blurb: "\"Vakaa\" means steady. The one that turns up when a parent is being asked to decide something.",
    },
    {
      name: "Roihu",
      job: "Gedu expert — session notes, gedu onboarding, certification",
      variantId: "valor",
      role: "gedu",
      pose: "hold-up",
      expression: "laughing",
      prop: "clipboard",
      blurb: "\"Roihu\" is a blaze. Valor is the element about the world, which is what a gedu spends their day on.",
    },
  ],
};
