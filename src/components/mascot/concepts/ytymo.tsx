/**
 * Ytymo — the Yty-compatible one, re-silhouetted.
 *
 * A spark of condensed Yty that has decided to have a face. It is the only
 * concept that extends the lore already in the product rather than starting
 * clean: the four colourways are the four elements, drawn in the exact hues
 * the Yty section already spends, and the thing floating over its head is that
 * element's own sign.
 *
 * ## Why it is no longer an egg
 *
 * Round one drew this as a droplet, and the verdict was blunt: it reads as an
 * egg, an egg reads as babyish rather than cool, and in Finnish an egg is
 * *muna*, which is a word this product does not want anywhere near a mascot
 * aimed at eleven-year-olds. None of that is fixable by tinting a droplet.
 *
 * So the silhouette was rebuilt around the one thing an ovoid cannot have: a
 * **broken top line**. Two flame licks rise from a central notch, and the
 * bottom stays wide and round. The result is a spark rather than a drop —
 * still one closed path, still head and body fused, still the cheapest thing
 * here to draw and the strongest at sixteen pixels, but with an outline no
 * longer describable as any kind of egg.
 *
 * The notch is doing more work than it looks like. A smooth dome is the shape
 * of something that has not happened yet; a broken top is the shape of
 * something in motion. That is the whole difference between a droplet and a
 * spark, and it is why the change is one of silhouette rather than of colour
 * or costume.
 */

import type { ReactElement } from "react";

import type { ConceptDef, PartProps } from "../concept";
import { showsFiligree } from "../detail";
import { MASCOT_INK, YTYMO_VARIANTS } from "../palette";
import type { Rig } from "../rig";

const RIG: Rig = {
  shadow: { cx: 100, cy: 186, rx: 44, ry: 7 },
  hip: { x: 100, y: 158 },
  hipSpread: 20,
  footY: 178,
  footStyle: "round",
  shoulderL: { x: 60, y: 126 },
  shoulderR: { x: 140, y: 126 },
  head: { x: 100, y: 104, r: 50 },
  eyeDx: 19,
  eyeY: 101,
  eyeR: 9.5,
  mouthY: 126,
  crown: { x: 100, y: 44 },
  crownW: 76,
  reach: 16,
  limbW: 11,
  handR: 9.5,
  limbStyle: "tapered",
  armLen: 46,
  legLen: 28,
  torso: { x: 74, y: 132, w: 52, h: 30 },
  fusedHead: true,
};

/**
 * The spark. One closed path: two licks off a central notch, a wide round
 * base. No gradients, no clip paths, nothing that a rasteriser or an email
 * client would have to think about.
 */
const SPARK =
  "M 100 80 C 96 62 84 48 66 40 C 52 34 43 46 45 63 C 47 78 48 92 46 106 C 42 140 66 168 100 168 C 134 168 158 140 154 106 C 152 92 153 78 155 63 C 157 46 148 34 134 40 C 116 48 104 62 100 80 Z";

function Body({ colors, detail }: PartProps): ReactElement {
  return (
    <g>
      <path d={SPARK} fill={colors.bodyTop} />
      {/* The underside plane, clipped to the base curve by simply retracing it. */}
      <path
        d="M 47 118 C 52 150 74 168 100 168 C 126 168 148 150 153 118 C 158 146 134 168 100 168 C 66 168 42 146 47 118 Z"
        fill={colors.bodyBottom}
        opacity={0.6}
      />
      <ellipse cx={100} cy={144} rx={29} ry={15} fill={colors.panel} opacity={0.5} />
      {showsFiligree(detail) && (
        <ellipse
          cx={70}
          cy={86}
          rx={10}
          ry={17}
          fill={MASCOT_INK.paper}
          opacity={0.2}
          transform="rotate(-20 70 86)"
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
      {/* The notch is at the centre of the top line, so the sign has the whole
          middle of the canvas to itself and needs no clearance. */}
      <g className={floatClass}>{glyph}</g>
      {showsFiligree(detail) && (
        <g fill={colors.accent} opacity={0.75}>
          <circle cx={166} cy={78} r={3.6} />
          <circle cx={34} cy={72} r={2.6} />
          <circle cx={160} cy={148} r={3} />
          <circle cx={38} cy={142} r={2.2} />
        </g>
      )}
    </g>
  );
}

export const YTYMO: ConceptDef = {
  id: "ytymo",
  species: "Ytymo",
  kind: "Abstract critter — a spark of Yty with a face",
  origin: "yty",
  pitch:
    "The one that costs nothing to explain, because the product already told this story. A Ytymo is a condensed spark of Yty, and the four of them are the four elements you already earn: Harmony, Glow, Valor and Wit, in the section's own colours, each carrying its own sign overhead. Kids get a set to collect and a favourite to pick. Parents meet a shape so friendly it reads as safe before they have read a word. Gedus get the joke instantly, because they are the ones who hand the Yty out.",
  caveat:
    "The reshape fixed the egg and did not fix everything. A fused head-and-body still cannot wear anything tailored and still cannot turn to look at something, and the four element hues will always fight the brand amber a little — the palette is the lore's, not the logo's. It is best read as a companion that stands next to a bigger character rather than as the character.",
  landmark: "Two licks off a notched top, and the element sign floating above them.",
  slots: ["hat", "face", "torso", "back", "extra", "scene"],
  wardrobeLimit:
    "No hoodie and no tee — a spark has no shoulders, so a sleeved garment reads as a bib. Scarves, lanyards, hats, capes and ground props all fit, and a hat has to sit across both licks rather than between them.",
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
      name: "Osuma",
      job: "Gamer helper — the gamer dashboard, empty states, streaks",
      variantId: "wit",
      role: "gamer",
      pose: "controller",
      expression: "focused",
      blurb: "\"Osuma\" is a hit — the one that lands. Wit is the media-and-tech element, so the gaming buddy wears it.",
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
