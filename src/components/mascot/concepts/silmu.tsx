/**
 * Silmu — the one-eyed bean, translated out of the old School of Gaming
 * mascot.
 *
 * This is the character School of Gaming actually shipped: a chunky black bean
 * with one huge eye, two stubby feet straight out of the bottom, usually no
 * arms, and a hat that told you which one it was. It ran on the site, in the
 * emails and on the door of the building for years, which makes it the only
 * concept in this directory with a claim nothing else here can make — a
 * parent who has been with us since 2020 has already met it.
 *
 * ## Why it is not called what it used to be called
 *
 * "Minion" is Universal's, and has been since 2010. The old name was already
 * a liability and is not one to carry into a fleet that goes on a public
 * marketing page. **Silmu** is Finnish for a bud — the thing on a branch in
 * spring that is about to become something — and it is one letter off *silmä*,
 * "eye". A one-eyed thing that is a bud, whose signature accessory is a green
 * shoot growing out of its head, and whose whole job is standing next to
 * children who are about to become something. The name does more work than
 * the old one ever did.
 *
 * ## What was translated and what was copied
 *
 * Copied: the silhouette, and this time measured rather than eyeballed. The
 * outline is traced off `eteen.png` — the legacy body's half-width sampled at
 * twenty-five heights, normalised, and fitted with cubics until the profile
 * matched to within a few per cent everywhere the legs do not cover. That is
 * where the oddly specific numbers below come from, and it is why the
 * character now fills its frame: the first pass drew a rounded square in the
 * middle half of the canvas, which beside the original read as a smaller, more
 * timid animal wearing the same hat.
 *
 * Copied too, and only after a second pass at the files: the three things the
 * original leaves *out*. It has no arms unless it is doing something with them
 * — thirteen of the sixteen files draw none, and the three that do are
 * painting, waving hello or reaching up — so the rig sets `armsOnDemand` and
 * the renderer draws none in a rest pose. It has no line above the eye, ever,
 * so the cyclops face draws no brow and cuts the white instead. And it very
 * often has no mouth: nine files, every gaze sprite among them, are one eye on
 * a bean and nothing else, which is not a blank face but a composed one — so
 * the resting mood here draws no mouth either. Absences are the easiest part of
 * a reference to miss, because nothing in the picture points at them.
 *
 * Translated: everything that *is* on the face. Several of the legacy files
 * have a white toothy grin, which is a realism cue and forbidden here; the open
 * mouth is one solid glyph with no interior, drawn in the colourway's `ink`, so
 * it comes out paper-white on a dark body and near-black on a yellow one — the
 * legacy art only ever had to solve the first of those. The five direction
 * sprites — *eteen, ylos, alas, oikealle, vasemmalle* — were not translated at
 * all, because they are not drawings: they are one drawing with the pupil
 * moved, and that is now the `gaze` dial on every species in the fleet.
 *
 * ## The one thing this concept had to solve
 *
 * The legacy body is `#141414` and the site's background is `#121212`. Held
 * against the real page it disappears; the character was drawn for white
 * paper. Three fixes were rasterised on the true background and looked at:
 *
 * 1. **Charcoal body, no contour.** The mass appears. The edge does not — it
 *    reads as a soft cloud, and the feet, which are the same colour, dissolve
 *    into the ground shadow.
 * 2. **Near-black body, light contour.** The edge is crisp and the shape is
 *    unmistakable, but the inside is still a hole, so at small sizes it reads
 *    as an outline drawing rather than as a solid character — and the rest of
 *    the fleet is solid.
 * 3. **Neither: rely on the eye, the feet and the hat.** Loses the
 *    silhouette entirely, and the silhouette is what this design *is*.
 *
 * `musta` takes 1 and 2 together, because they fix different halves of the
 * same problem — one gives it mass, the other gives it an edge — and the
 * combination is the only one that reads at both 28 pixels and 300.
 *
 * ## And the thing that solved it properly: stop painting them all black
 *
 * The contour rescues one black bean on one dark page. It does nothing about
 * the real problem, which is that a *fleet* of black beans is a fleet of one
 * character: with the body fixed, the hat carries the entire identity, and at
 * 28 pixels a hat is four pixels of colour. So every colour this product
 * already owns is also a Silmu. The twenty-four `MASCOT_SWATCHES` — sixteen
 * voice-zone hues, four Yty elements, four admin product types — each give a
 * body, mixed through `colorwayFromSwatch` so that a Silmu and any other
 * species painted from the same swatch agree about what its underside looks
 * like. `musta` stays, and stays first, because it is the faithful one.
 *
 * Two things follow from a coloured body, and both are decided by measuring
 * the colour rather than by naming it:
 *
 * - **The contour is a darkness fix, so it is drawn when the body is dark.**
 *   It used to be drawn when the colourway set its `ink` slot, which was true
 *   of exactly one colourway and so happened to be right. With ink now set on
 *   a fifth of them the two have to be separated, and the honest condition is
 *   the one the note above already describes: a body whose luminance is near
 *   the page's own needs an edge, and no coloured body is.
 * - **The face's drawn parts take whichever ink the body can carry.** A yellow
 *   or lime bean wants the shared near-black line; an indigo or violet one is
 *   dark enough that the line sinks into it and wants paper instead.
 *
 * ## The simplicity pass (2026-08-23)
 *
 * **Removed: nothing.** This concept was drawn to the rule before the rule was
 * written down, which is most of what it proved. There are exactly three marks
 * on the body — the bean, the underside plane and, on a body too dark to have
 * an edge against the page, a contour — and the file already says in prose why
 * there is no sheen on it and never will be.
 *
 * **Kept as identity:** the bean (it *is* the species: two flat runs, no
 * corners, widest below the eye), the underside plane (a flat colour block
 * giving one closed shape a top and a bottom, which is the sanctioned way to
 * do that job), and the `musta` contour — which is the one thing here that
 * looks like decoration and is not. Removing it does not soften the 40px read,
 * it deletes it: the faithful body is `#141414` on a `#121212` page, so with no
 * edge the silhouette that the whole design consists of stops existing. It is
 * drawn on the four per cent of colourways dark enough to need it and on no
 * others, which is what makes it a legibility fix rather than a style.
 */

import type { ReactElement } from "react";

import type { ConceptDef, PartProps } from "../concept";
import {
  colorwayFromSwatch,
  MASCOT_INK,
  MASCOT_SWATCHES,
  shadeHex,
  SILMU_VARIANTS,
  tintHex,
  type VariantDef,
} from "../palette";
import type { Rig } from "../rig";

/**
 * The skeleton, in the proportions the legacy art actually has.
 *
 * **Every ratio below was measured off the delivered PNGs**, not read out of a
 * brief, so the next person can check the same files and get the same numbers.
 * `eteen.png` and `alas.png` are the cleanest specimens (400 × 401, figure
 * 283 × 361, no hat, no arms); `Minion_Blue`, `Minion_Red` and `back_minion`
 * agree with them to within a per cent or two.
 *
 * | measured                    | source px      | ratio | here            |
 * | --------------------------- | -------------- | ----- | --------------- |
 * | body, without the legs      | 283 × 282      | 1.00  | 120 × 121       |
 * | widest point, down the body | at y 172 / 282 | 0.54  | y 91            |
 * | legs, body-bottom to sole   | 80 of 282      | 0.28  | 37              |
 * | leg column width            | 32 of 283      | 0.113 | `limbW` 14      |
 * | leg pair, centre to centre  | 67 of 283      | 0.237 | `hipSpread` 14  |
 * | foot lobe, long axis        | 62 of 283      | 0.219 | 1.9 × `limbW`   |
 * | eye centre, down the body   | 105 of 282     | 0.37  | `eyeY` 72       |
 * | eye diameter                | 96 of 283      | 0.339 | `eyeR` 21       |
 * | pupil diameter              | 33 of 96       | 0.34  | in `face.tsx`   |
 * | mouth width (`Minion_Blue`) | 137 of 280     | 0.49  | in `face.tsx`   |
 *
 * The one number that is a decision rather than a measurement is the body's
 * height: 120 units, chosen so the figure fills this canvas the way Otso and
 * Kaveri do. The first pass drew it 112 tall and 104 wide, sitting in the
 * middle half of the frame, and beside the original it read as a smaller and
 * more timid animal wearing the same hat.
 *
 * Three things the source does **not** have, and neither does this: a curve in
 * a leg, an arm in a resting pose, and a line above the eye. See `armsOnDemand`
 * below and `CyclopsEye` in `face.tsx`.
 *
 * `fusedHead` is true because there is no neck — there is not even a head,
 * there is a body with an eye near the top of it.
 *
 * `eyeDx` is zero and means it: a cyclops has no eye separation, and saying
 * so rather than leaving a stale number in the slot is what lets the face
 * anchor tell an accessory the truth about the head it is landing on. The
 * glasses in the registry read it and draw one lens.
 */
const RIG: Rig = {
  shadow: { cx: 100, cy: 186, rx: 46, ry: 7 },
  // The legs leave the body from *inside* it, nine units above the underside,
  // so the join stays covered whatever the walk cycle does to them.
  hip: { x: 100, y: 138 },
  hipSpread: 14,
  // Where the foot lobe is *centred*, not where the sole is: the lobe is 1.5
  // leg-widths tall and hangs half of that below this line, which puts the
  // bottom of the foot on the same ground line as every other species.
  footY: 173,
  footStyle: "stem",
  // Sockets a dozen units inside the flank, at the height the legacy arms
  // leave the body. They are what the three poses with arms hang off; the
  // other nine draw none at all, so they no longer have to be a compromise
  // between "invisible at rest" and "clear of the body when waving" the way
  // they were before `armsOnDemand`.
  shoulderL: { x: 52, y: 108 },
  shoulderR: { x: 148, y: 108 },
  // `head` on a fused body is not a head — it is the window the bust crop
  // takes and the size every worn thing scales against. Both jobs pull it in
  // opposite directions: a small radius crops a tight portrait and shrinks the
  // headset until its cups sit on the character's face instead of beside it.
  // 43 is where the bust window (3.6 r across, centred half a radius below the
  // head) lands on x 22–178 and y 2–156: the whole bean and its hat, none of
  // the feet, and the body filling about four fifths of the frame.
  head: { x: 100, y: 58, r: 43 },
  eyeDx: 0,
  eyeY: 72,
  eyeR: 21,
  mouthY: 111,
  crown: { x: 100, y: 31 },
  crownW: 96,
  reach: 4,
  limbW: 14,
  handR: 8,
  // Straight, because the legacy arms are: one wedge from shoulder to mitten
  // with no bend in it, and legs that are vertical columns rather than a
  // shallow V.
  limbStyle: "straight",
  handStyle: "mitten",
  armsOnDemand: true,
  armLen: 46,
  legLen: 44,
  // Low on the belly, and low for a reason a paired-eye species never meets:
  // on a fused body the torso box is the only thing keeping a scarf off the
  // face, and the run between the mouth and the underside is barely thirty
  // units. Sitting the box at 127 puts the scarf's band under the widest mouth
  // glyph rather than across it.
  torso: { x: 62, y: 127, w: 76, h: 30 },
  fusedHead: true,
};

/**
 * The bean.
 *
 * One closed path, two flat runs and no corners anywhere. The flats — 24 units
 * across the top, 36 across the bottom — are what the legacy shape has instead
 * of a point at either end: it is blunt at both, which is most of why it reads
 * as chunky rather than as an egg, the shape this directory has already been
 * told once not to draw. The widest point is at 54% of the body's height,
 * *below* the eye, which is the other half of it.
 */
const BEAN = [
  "M 88 26",
  "L 112 26",
  "C 137 26.5 155 42 158.5 63",
  "C 159.6 72 160 82 160 91",
  "C 160 107 157.5 123 151 132",
  "C 145 141.5 133 147 118 147",
  "L 82 147",
  "C 67 147 55 141.5 49 132",
  "C 42.5 123 40 107 40 91",
  "C 40 82 40.4 72 41.5 63",
  "C 45 42 63 26.5 88 26",
  "Z",
].join(" ");

/**
 * The underside plane, retracing the bean's own bottom edge exactly — the same
 * four curves and the same flat — and closing with a second arc six units
 * higher. Copying the outer edge rather than approximating it is what keeps
 * this plane from pushing a rim out past the silhouette it belongs to.
 *
 * There is no highlight anywhere on this body and there is not going to be
 * one. A soft sheen on a silhouette is the same category of mistake as an eye
 * highlight — a material cue on a design made of flat symbols — and this is
 * the one species that could least afford it, because the whole thing is a
 * single unbroken shape whose job is to be a shape.
 */
const UNDERSIDE = [
  "M 40.2 96",
  "C 41 110 43.5 124 49 132",
  "C 55 141.5 67 147 82 147",
  "L 118 147",
  "C 133 147 145 141.5 151 132",
  "C 156.5 124 159 110 159.8 96",
  "C 157 122 133 141 100 141",
  "C 67 141 43 122 40.2 96",
  "Z",
].join(" ");

/**
 * WCAG relative luminance of a `#rrggbb`, 0 for black and 1 for white.
 *
 * Two decisions below are "how dark is this colour, really", and both of them
 * used to be made by naming colours instead. Naming does not survive
 * twenty-four swatches: nobody can look at `#7a72f5` and `#9fc92e` and say
 * which side of a line they fall on, and both answers change the drawing.
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
 * Below this a body is too close to the page's own `#121212` to have a visible
 * edge, and gets a contour. The gap around the threshold is deliberately
 * enormous — the darkest swatch body is about 0.23 and `musta` is 0.017 —
 * because there is nothing in between, and a threshold with nothing near it is
 * one nobody has to re-tune when a swatch moves.
 */
const CONTOUR_BELOW = 0.06;

/**
 * Below this the shared near-black line loses against the body and the face's
 * drawn parts switch to paper. It falls between the deep cool hues (indigo
 * 0.23, blue 0.25, violet 0.25, red 0.25, purple 0.26) and everything warmer
 * or brighter (event 0.32, fuchsia 0.31, valor 0.34, sky 0.39, and up).
 */
const LIGHT_INK_BELOW = 0.3;

function Body({ colors }: PartProps): ReactElement {
  // The contour fixes a body that has no visible edge against the page, so it
  // asks the body that question and nothing else. It used to ask whether the
  // colourway had inverted its face ink, which was the same question only for
  // as long as exactly one colourway was dark.
  const unlit = luminance(colors.bodyTop) < CONTOUR_BELOW;
  return (
    <g>
      {unlit && (
        <path
          d={BEAN}
          fill="none"
          stroke={colors.spark}
          strokeWidth={3.4}
          strokeLinejoin="round"
        />
      )}
      <path d={BEAN} fill={colors.bodyTop} />
      <path d={UNDERSIDE} fill={colors.bodyBottom} opacity={unlit ? 0.9 : 0.62} />
    </g>
  );
}

/** Head and body are one shape, so there is nothing left to draw. */
function Head(): ReactElement {
  return <g />;
}

/** The faithful one, kept first and kept exactly as it was hand-mixed. */
const MUSTA = SILMU_VARIANTS.find((v) => v.id === "musta") ?? SILMU_VARIANTS[0];

/** What a swatch's own source is called under its swatch. */
const SOURCE_LABEL = { zone: "Voice zone", yty: "Yty element", product: "Product type" };

/**
 * Every swatch, as a body.
 *
 * The hat a swatch body wears by default is the swatch eight places along the
 * table — the opposite side of the wheel for the first half of the zone hues,
 * and a jump into the Yty and product colours for the second. It is an
 * arbitrary rule, but an arbitrary rule applied uniformly is what stops
 * twenty-four defaults from being twenty-four opinions, and anything that
 * cares (the fleet, the legacy strip) names its own garment and overrides it.
 *
 * The limb shade is deeper than `colorwayFromSwatch` gives on its own. Its
 * default sits sixteen per cent towards the shadow, which is right for a limb
 * that leaves a body and travels through open space; a Silmu's arms are drawn
 * *on* its own belly and its feet are two nubs directly underneath it, so they
 * have to separate from the body above and from the ground below at once. It
 * is the same reason the four old hand-mixed colourways are gone: `luumu`,
 * `hehku`, `oras` and `taivas` were `purple`, `amber`, `green` and `sky` mixed
 * by the same helper under different names, and two naming schemes for one
 * palette is worse than either.
 */
const SWATCH_VARIANTS: readonly VariantDef[] = MASCOT_SWATCHES.map((s, i) => {
  const hatHex = MASCOT_SWATCHES[(i + 8) % MASCOT_SWATCHES.length].hex;
  return {
    id: s.id,
    label: s.label,
    note: `${SOURCE_LABEL[s.source]} — ${s.hex}`,
    colors: colorwayFromSwatch(
      s.hex,
      { clothing: hatHex, clothingAccent: tintHex(hatHex, 0.84) },
      {
        limb: shadeHex(s.hex, 0.28),
        ...(luminance(s.hex) < LIGHT_INK_BELOW ? { ink: MASCOT_INK.paper } : {}),
      },
    ),
  };
});

const VARIANTS: readonly VariantDef[] = [MUSTA, ...SWATCH_VARIANTS];

export const SILMU: ConceptDef = {
  id: "silmu",
  species: "Silmu",
  kind: "Abstract critter — the legacy SOG mascot, one eye and a hat",
  origin: "fresh",
  pitch:
    "The only concept here that School of Gaming has already run for five years. One eye the size of a fist, a bean you could draw from memory, two stubby feet, and a hat doing all the work — which is why the fleet is a hat rack rather than five drawings. Kids get a shape they can draw themselves in one stroke. Parents who have been with us since the old site recognise it before they have read anything. Gedus get the joke that the whole cast is one guy in different hats.",
  caveat:
    "The original is pure black on white paper and this site is nearly black, so the faithful colourway needs a charcoal body and a light contour to exist here at all. Every other one solves that by not being black — twenty-four swatch bodies, which is a larger departure from the artwork than the contour ever was, and the honest reading is that a coloured Silmu is a new character wearing the old one's shape. The fused body still cannot wear anything tailored or turn to look at something, and it has fewer expression channels than anything else here: no brow, no second eye to disagree with the first, and no mouth at all on the resting face. Everything a mood has to say goes into how the one white is cut and where the pupil sits in it, which is enough for six and would not obviously be enough for ten. The shared pose table also puts a waving hand four units inside this body’s own widest point, so a waving Silmu holds its arm against its belly rather than clear of it — fixable only in the pose table or in the reach cutoff, neither of which belongs to this species.",
  landmark: "One enormous eye in the top third of a chunky bean, under whichever hat it is wearing.",
  slots: ["hat", "face", "torso", "back", "extra", "scene"],
  wardrobeLimit:
    "No hoodie and no tee — like the spark, it has no shoulders, so a sleeved garment reads as a bib. Everything worn on the head fits and matters more here than on anything else in the set: the hat is not decoration on this species, it is the character.",
  rig: RIG,
  faceMode: "cyclops",
  variants: VARIANTS,
  limbs: (c) => ({ arm: c.limb, leg: c.limb, hand: c.limb, foot: c.limb }),
  Body,
  Head,
  fleet: [
    {
      name: "Vilkku",
      job: "The introducer — home hero, first-visit tours, the 404",
      variantId: "amber",
      role: "none",
      pose: "point-right",
      expression: "excited",
      outfit: { hat: "swept-cap" },
      garment: "sky",
      blurb:
        "The blue swept cap is the original — the one file the old site put on every page — so the cap keeps its blue and the body takes the amber it reads loudest against. \"Vilkku\" is a blinker, which is a decent name for something with one eye and a habit of getting your attention.",
    },
    {
      name: "Terve",
      job: "Greeter — empty states, onboarding, the first screen of anything",
      variantId: "fuchsia",
      role: "none",
      pose: "wave",
      expression: "excited",
      outfit: { hat: "beanie" },
      garment: "amber",
      blurb:
        "Straight off `hello_minion`, arms out and waving, in the orange beanie he has always worn. \"Terve\" is the Finnish hello you would actually say to a child.",
    },
    {
      name: "Maalari",
      job: "Marketing and product pages — the one that decorates things",
      variantId: "musta",
      role: "none",
      pose: "painting",
      expression: "focused",
      prop: "paintbrush",
      outfit: { hat: "painter-cap", extra: "paint-bucket" },
      garment: "purple",
      blurb:
        "The painter is the one who keeps the black body, because the loud thing about a painter should be the paint: purple cap, and that purple is the old SOG brand colour, still the app's secondary today. One swatch dyes his cap, his bristles, his drips and his tin at once, so the fleet can field a painter for every colour the product owns. In `ovi` he is not standing at the door — he has just painted the poster on it.",
    },
    {
      name: "Verso",
      job: "Gedu expert — session notes, the gedu workspace, anything being explained",
      variantId: "violet",
      role: "gedu",
      pose: "point-left",
      expression: "thinking",
      prop: "pointer",
      outfit: { hat: "sprout" },
      garment: "green",
      blurb:
        "The sprout (a verso is a young shoot) — with the big round glasses the role costume already puts on and the green shoot the species is named after, growing out of a violet body so the shoot is the one green thing on him. One eye behind one lens is a better joke than two.",
    },
    {
      name: "Tonttu",
      job: "Seasonal — December, and whatever else the calendar dresses up",
      variantId: "emerald",
      role: "none",
      pose: "wave",
      expression: "excited",
      outfit: { hat: "santa-hat", torso: "scarf" },
      garment: "red",
      blurb:
        "A tonttu is the Finnish Christmas elf, and this one is free: the seasons module already puts a santa hat and a scarf on every species between 20 and 26 December, so `look=\"auto\"` produces him without anybody asking.",
    },
    {
      // The second black body in this fleet, and the only other one that
      // earns it. Every other member takes a swatch because the hat is what
      // tells them apart; these two are the ones whose *job* is the black
      // bean itself - the painter, because paint has to be the loud thing on
      // him, and this one, because the whole reason to consider Silmu for the
      // engineer is that it is the shape School of Gaming already owns.
      name: "Chief Engineer Kyle",
      job: "CTO — the engine room; scientist, builder, architect, engineer",
      variantId: "musta",
      role: "none",
      pose: "idle",
      expression: "focused",
      prop: "wrench",
      outfit: { hat: "hardhat", torso: "tool-belt" },
      garment: "amber",
      blurb:
        "A hardhat, a tool belt round the middle and a spanner in hand, all in engineering gold on the original black body. He is the one candidate who *cannot* wear the goggles this idea started with — two lenses over one eye is the trademarked look the rename exists to escape — and the hat turns out to be the better answer anyway. He is also the fleet's answer to whether this species can wear a thing that is not a hat: a belt is a band rather than a sleeve, so it fits a body with no shoulders.",
    },
  ],
};
