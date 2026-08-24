/**
 * Jalo — the brand mark that grew feet.
 *
 * *Jalokivi* is Finnish for a gemstone, and *jalo* on its own means noble. The
 * concept is one sentence: **take the thing the company already puts in a
 * browser tab and give it a face, a pair of legs and somewhere to be.**
 *
 * ## What it is made of
 *
 * The body is the favicon candidate `N8-gem-chevron.svg`, character for
 * character. `GEM_PATH` below is that file's own hexagon path string, copied
 * out of it and translated by `(36, 22)` into this module's `0 0 200 200`
 * canvas — **no scale, no re-drawing, no re-fitting**. That is the strongest
 * form of "keeps the logo's corner rounding exactly" available: it is not a
 * proportional match, it is the same curve. If the mark's rounding is retuned,
 * the new path string replaces this one and every Jalo in the fleet moves with
 * it.
 *
 * Measured off the source file, in its own 128 box:
 *
 * | measured                          | in the 128 box | here (200 box) |
 * | --------------------------------- | -------------- | -------------- |
 * | hexagon, corner to corner         | 120 × 124      | 120 × 124      |
 * | flat left/right flanks            | y 49 → 79      | y 71 → 101     |
 * | corner rounding, along each edge  | 11             | 11             |
 * | top and bottom vertices           | y 2 / y 126    | y 24 / y 148   |
 * | blunted apex (the curve's own top)| y 4.83         | y 26.83        |
 * | chevron, the dark mark inside     | x 52–80        | x 88–116       |
 *
 * The last row is the one that decides where the face goes: the eyes and the
 * mouth land in the same optical patch of the hexagon the chevron occupies, so
 * a Jalo bust and the favicon are the same picture with the mark swapped for a
 * face rather than two different pictures that happen to share a silhouette.
 *
 * ## Anatomy: Silmu's, on purpose
 *
 * Stem legs with `d`/`b` feet, arms only when a pose or a prop needs them,
 * ending in a thumbed mitten. All three of those are rig *styles* the legacy
 * rebuild already added (`footStyle: "stem"`, `limbStyle: "straight"`,
 * `handStyle: "mitten"`, `armsOnDemand`), so this species declares them and
 * draws none of them — there is no second implementation of a stem foot in
 * this directory and there must not be.
 *
 * Reusing that anatomy is a claim rather than a shortcut: the shape School of
 * Gaming has always drawn its characters with is a blunt body on two stubs,
 * and a gem standing on the same two stubs is visibly a member of the same
 * family. What separates the two is the face — **Jalo has two eyes.** Silmu's
 * one enormous eye is its whole identity, and a cyclops gem would read as a
 * Silmu that had been ironed rather than as its own character.
 *
 * That was tested rather than assumed: both faces were rasterised on the dark
 * ground at 200px and as 40px busts. The two-eyed one wins at both sizes and
 * wins for the same reason each time — at 40px a cyclops pupil is a single
 * dark blob in the middle of the hexagon, which is exactly where the mark's
 * chevron is, so the eye reads as *a botched chevron* rather than as an eye.
 * Two eyes are unmistakably a face at any size, and the amber hexagon around
 * them is doing the recognising anyway.
 *
 * ## Simplicity
 *
 * **There is exactly one mark on this body: the hexagon.** No underside plane,
 * no facets, no contour, no sheen. A gem is the one shape in the world whose
 * decoration would be facets, which is precisely why it has none — faceting
 * for looks is the embellishment the simplicity ruling names, and the mark
 * itself is a single flat amber fill. The species is a silhouette, a colour
 * and a face, and every colourway keeps it that way.
 *
 * No contour is needed either, unlike Silmu: the darkest body in the set is
 * the brand purple at about 0.11 relative luminance against the page's 0.006,
 * which is an edge you can see. Nothing here is ever the same colour as the
 * page.
 */

import type { ReactElement } from "react";

import type { ConceptDef, PartProps } from "../concept";
import {
  colorwayFromSwatch,
  JALO_VARIANTS,
  MASCOT_INK,
  MASCOT_SWATCHES,
  shadeHex,
  tintHex,
  type VariantDef,
} from "../palette";
import type { Rig } from "../rig";

/**
 * The mark's own hexagon, lifted verbatim out of `N8-gem-chevron.svg`.
 *
 * Left exactly as the file writes it — the `Q` corner rounding, the decimal
 * places and all — so that a diff against the brand file is a diff of two
 * identical strings rather than a judgement call about whether someone
 * re-typed it faithfully. It is in the logo's own 128 coordinate space and is
 * translated into place by `GEM_ORIGIN`; the exploration page draws it raw at
 * 128 to put a real favicon beside a Jalo bust.
 */
export const GEM_PATH =
  "M54.57,7.66Q64.00,2.00 73.43,7.66L114.57,32.34Q124.00,38.00 124.00,49.00L124.00,79.00Q124.00,90.00 114.57,95.66L73.43,120.34Q64.00,126.00 54.57,120.34L13.43,95.66Q4.00,90.00 4.00,79.00L4.00,49.00Q4.00,38.00 13.43,32.34Z";

/**
 * The chevron the favicon cuts into the gem, also verbatim. Nothing in the
 * character draws it — its place on the body is where the face goes — but the
 * exploration page needs the untouched mark to compare a bust against, and
 * the `chevron` prop is this shape put in a hand.
 */
export const GEM_CHEVRON = "M52 42L80 64L52 86";

/**
 * Where the logo's 128 box sits inside the mascot's 200 one.
 *
 * Chosen so the hexagon occupies x 40–160 and y 24–148: the same 120 units of
 * width Silmu's bean has, the same 24 units of headroom above it for a hat,
 * and a bottom point 25 units above the shared ground line for the legs to
 * hang from. The scale factor is 1 and is meant to stay 1.
 */
const GEM_ORIGIN = { x: 36, y: 22 };

/**
 * The skeleton.
 *
 * Every number is read off the hexagon rather than chosen, because on a fused
 * body the silhouette *is* the anatomy:
 *
 * - `hip` at y 136 is two units above where the body's own edge crosses the
 *   outermost leg column (y 139.6 at x 86 and x 114), so both stems leave from
 *   inside the shape whatever the walk cycle does to them.
 * - `shoulderL/R` sit on the flat flanks, twelve units inside the edge, at the
 *   height the flanks run vertical — the only band of this silhouette where an
 *   arm can leave the body without crossing a diagonal.
 * - `head.r` is a crop radius, not a head: 35.5 puts the bust window
 *   (3.6 r across, centred half a radius below `head.y`) on x 36–164, y 22–150,
 *   which is the hexagon plus a four-unit margin — the favicon's own framing.
 * - `crown` at y 42 with `crownW` 60 is where the silhouette is *exactly* 60
 *   units wide, so a hat's base line lands on the outline instead of floating
 *   over it or cutting into it. It is 18 units below the point, which is the
 *   whole trick for hatting a pointed head: the point goes *into* the hat, the
 *   way a head does.
 * - `torso` matches the taper: 40 wide from y 110 to y 136, where the body
 *   narrows from 100 across to 34, so a belt or a scarf band sits flush at the
 *   bottom edge rather than hanging off the diagonal. It starts a couple of
 *   units lower than the taper alone would ask, because on a fused body the
 *   chest box is also the only clearance the *mouth* has: at y 106 a chest
 *   crest touches the smile and reads as a chin strap.
 */
const RIG: Rig = {
  shadow: { cx: 100, cy: 186, rx: 44, ry: 7 },
  hip: { x: 100, y: 136 },
  hipSpread: 14,
  footY: 173,
  footStyle: "stem",
  shoulderL: { x: 52, y: 98 },
  shoulderR: { x: 148, y: 98 },
  head: { x: 100, y: 68, r: 35.5 },
  eyeDx: 19,
  eyeY: 78,
  eyeR: 12,
  mouthY: 108,
  crown: { x: 100, y: 42 },
  crownW: 60,
  // A wide body swallows its own arms, exactly as the bean does.
  reach: 4,
  limbW: 14,
  handR: 8,
  limbStyle: "straight",
  handStyle: "mitten",
  armsOnDemand: true,
  armLen: 46,
  legLen: 44,
  torso: { x: 80, y: 110, w: 40, h: 26 },
  fusedHead: true,
};

/**
 * WCAG relative luminance of a `#rrggbb`.
 *
 * The same private helper the bean has, for the same two-line reason: the
 * question "can this body carry the shared near-black line" cannot be answered
 * by naming colours once there are twenty-six of them. The palette module's
 * own `relLuma` is a cheaper approximation that orders these particular
 * swatches differently — it puts emerald below sky, where the perceptual
 * answer is the other way round — so it cannot be borrowed for this. The two
 * copies collapse into the palette module at the cull, together.
 */
function luminance(hex: string): number {
  const v = hex.replace("#", "");
  const channel = (i: number): number => {
    const c = Number.parseInt(v.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
}

/**
 * Below this the shared near-black line loses against the body and the face's
 * drawn parts switch to paper. The threshold falls in the same gap the bean's
 * does — between the deep cool hues (indigo 0.23, violet 0.25, red 0.26, blue
 * 0.26, purple 0.26) and everything warmer (fuchsia 0.31, event 0.32 and up) —
 * because it is the same question about the same twenty-four swatches.
 */
const LIGHT_INK_BELOW = 0.3;

/** The gem. One path, one fill, and that is the entire species. */
function Body({ colors }: PartProps): ReactElement {
  return (
    <g transform={`translate(${GEM_ORIGIN.x} ${GEM_ORIGIN.y})`}>
      <path d={GEM_PATH} fill={colors.bodyTop} />
    </g>
  );
}

/** Head and body are one shape, so there is nothing left to draw. */
function Head(): ReactElement {
  return <g />;
}

/** What a swatch's own source is called under its swatch. */
const SOURCE_LABEL = { zone: "Voice zone", yty: "Yty element", product: "Product type" };

/**
 * Every swatch, as a gem.
 *
 * Generated the way the bean's are, from the same twenty-four-colour table, so
 * a Jalo and a Silmu painted from `teal` agree about what teal is. Two rules
 * are applied on top of `colorwayFromSwatch`, and both are decided by
 * measuring the colour rather than by naming it:
 *
 * - **The face's drawn parts take whichever ink the body can carry** — the
 *   shared near-black on a light body, paper on a dark one.
 * - **The limbs move away from the body in whichever direction the page
 *   leaves room for.** A light gem's stems are deepened; a dark one's are
 *   lifted, because a shaded indigo stem on a `#121212` page has a body above
 *   it and a background behind it and separates from neither. The bean shades
 *   all of its, which is right for a species whose darkest bodies still carry
 *   a contour; nothing here has one.
 *
 * The default hat colour is the swatch eight places along the table — the same
 * arbitrary-but-uniform rule the bean uses, so twenty-four defaults are one
 * decision rather than twenty-four opinions. Anything that cares names its own
 * garment.
 */
const SWATCH_VARIANTS: readonly VariantDef[] = MASCOT_SWATCHES.map((s, i) => {
  const hatHex = MASCOT_SWATCHES[(i + 8) % MASCOT_SWATCHES.length].hex;
  const dark = luminance(s.hex) < LIGHT_INK_BELOW;
  return {
    id: s.id,
    label: s.label,
    note: `${SOURCE_LABEL[s.source]} — ${s.hex}`,
    colors: colorwayFromSwatch(
      s.hex,
      { clothing: hatHex, clothingAccent: tintHex(hatHex, 0.84) },
      {
        limb: dark ? tintHex(s.hex, 0.22) : shadeHex(s.hex, 0.28),
        ...(dark ? { ink: MASCOT_INK.paper } : {}),
      },
    ),
  };
});

/** The two brand pairs first, then the product's own colours. */
const VARIANTS: readonly VariantDef[] = [...JALO_VARIANTS, ...SWATCH_VARIANTS];

export const JALO: ConceptDef = {
  id: "jalo",
  species: "Jalo",
  kind: "Geometric — the brand gem, with a face and two legs",
  origin: "fresh",
  pitch:
    "The simplest character this company could possibly have, because it is already drawn: the gem in the favicon, given two eyes and a pair of legs. Nothing has to be taught to a parent, a partner or a seven-year-old — they have seen this shape in a browser tab, on a badge and at the top of an email before they ever meet the mascot, and the mascot is the mark waving at them. It is also the cheapest thing here to render at any size, being one path and a face, and it is the only concept whose bust crop is a company asset rather than a drawing of one.",
  caveat:
    "It is a logo with a face, and that cuts both ways. It cannot be a child, a parent or a Gedu — it has no build, no age and no body language below the eyes — so it can introduce the product and point at things and it can never fill the person-shaped hole the fleet exists for. Standing beside the real mark it competes with it: two amber hexagons on one page, one of them blinking. And a species whose identity is a brand colour has a shorter colour ladder than it looks — twenty-four swatch bodies exist, but a green gem is a green hexagon with eyes, which is a different company's mark rather than a different member of ours. The honest set is the amber, the purple and the handful of hues far enough from both to read as deliberate.",
  landmark: "The mark's own rounded hexagon, with two eyes where the chevron goes.",
  slots: ["hat", "face", "torso", "back", "extra", "scene"],
  wardrobeLimit:
    "No sleeves — like the bean, it has no shoulders, and a hoodie on a hexagon reads as a bib. Hats work, and they work by covering the top point rather than sitting on it, which is why the crown line is eighteen units down the silhouette instead of at the vertex.",
  rig: RIG,
  faceMode: "eyes",
  variants: VARIANTS,
  limbs: (c) => ({ arm: c.limb, leg: c.limb, hand: c.limb, foot: c.limb }),
  Body,
  Head,
  fleet: [
    {
      name: "Jalo",
      job: "The introducer — home hero, calls to action, the 404",
      variantId: "jalo",
      role: "none",
      pose: "point-right",
      expression: "excited",
      prop: "chevron",
      outfit: { torso: "sog-crest" },
      blurb:
        "The mark itself, in the favicon's own pair, holding the favicon's own chevron out towards whatever it wants you to click, with the stripe-S on its chest — the mark wearing the mark. It names no garment swatch on purpose: the colourway's own clothing pair is the brand purple and the shared paper, so the crest comes out as the white-on-purple lockup rather than as a hat colour that happened to be free. The one character in the set that can stand next to a button and be part of the brand rather than decoration on it.",
    },
    {
      name: "Siru",
      job: "Gamer helper — the gamer dashboard, achievements, anything in a session",
      variantId: "cyan",
      role: "gamer",
      pose: "controller",
      expression: "happy",
      outfit: { hat: "swept-cap" },
      garment: "purple",
      blurb:
        "A *siru* is a chip — the thing inside every machine a gamer here touches, and a small piece off something bigger, which is what a cyan gem in the family's amber is. Wears the legacy swept cap so the two species are visibly related.",
    },
    {
      name: "Helmi",
      job: "Parent-facing — My SOG for families, billing, anything being explained to a grown-up",
      variantId: "teal",
      role: "parent",
      pose: "idle",
      expression: "happy",
      prop: "mug",
      garment: "amber",
      blurb:
        "A *helmi* is a pearl: the calm one in the jewellery box, and the only gem on this list that was never cut. Teal because it is the furthest this species gets from the brand amber while still reading as the same shape — a parent's page should feel like the product without shouting the logo at them.",
    },
    {
      name: "Opaali",
      job: "Gedu expert — session notes, the gedu workspace, anything being taught",
      variantId: "violet",
      role: "gedu",
      pose: "point-left",
      expression: "thinking",
      prop: "pointer",
      garment: "lime",
      blurb:
        "An opal is the gem that shows a different colour depending on where you stand, which is the nicest thing you can say about a good teacher. Violet is dark enough that the mouth and brows invert to paper, so this is also the member that proves the ink rule works.",
    },
    {
      name: "Reksi — the Princi-Pal",
      job: "Principal gamer — the headmaster's voice: welcomes, announcements, the occasional dad joke",
      variantId: "jalo",
      role: "none",
      pose: "idle",
      expression: "happy",
      prop: "briefcase",
      // The whole entry is four items on the brand mark, and it exists to ask
      // one question: is Reksi a *body* or a *set of marks*? The beard, the
      // shades and the case are the marks Kyle names as stable; the crown is
      // the disputed one and is here so the same test can be run on this body
      // as on the other four. Nothing about the gem changed to carry them.
      outfit: { hat: "crown", face: "beard-shades" },
      blurb:
        "The Princi-Pal with no animal under him at all — the company's own gem, wearing his beard, his shades, his crown and his briefcase. It is the cheapest Reksi in the set and the sharpest version of the question the study asks: if four accessories on a hexagon still read as him, then Reksi is a set of marks and the body is free; if they do not, the body is the character and the marks are decoration on it.",
    },
    {
      name: "Chief Engineer Kyle",
      job: "CTO — the engine room; scientist, builder, architect, engineer",
      variantId: "jalo",
      role: "none",
      pose: "idle",
      expression: "focused",
      prop: "wrench",
      outfit: { hat: "hardhat", torso: "tool-belt" },
      // No garment swatch, and the reason is a raster rather than a taste: the
      // engineer's kit is gold everywhere else in this fleet, and gold kit on
      // a gold body is a belt you cannot see. The colourway's own pair — the
      // brand purple against the brand amber — is the only two-colour choice
      // this body can wear that is still School of Gaming's own.
      blurb:
        "The candidate this species puts up: a hardhat balanced on the top point, a belt round the taper and a spanner in hand, on the brand amber that is already engineering gold — with the kit itself in the brand purple, because gold on gold is invisible. The argument for it over the other candidates is that the Chief Engineer is the person who maintains the thing the company is made of, and this character *is* the thing the company is made of.",
    },
  ],
};
