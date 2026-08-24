/* eslint-disable i18next/no-literal-string -- throwaway developer-facing design-exploration surface; every string here is a caption on a page no user will ever see and that gets deleted with the exploration */
"use client";

/**
 * SPIKE — the back profile, and the `back` slot finally earning its keep.
 *
 * **This is a deliberate fork and it is not maintained.** Nothing outside this
 * file imports anything from it, and everything it draws is drawn locally on
 * purpose, so that the answer to "what would a back view cost" can be read off
 * one file rather than reconstructed from a diff across the rig, the limbs,
 * the accessories and six concepts. It gets promoted into the real model or it
 * gets deleted. It does not get patched.
 *
 * ## The pitch, and where it comes from
 *
 * `public/mascot-legacy/back-minion.png` — the old School of Gaming mascot
 * drawn from behind, both arms up in a cheer, no face, no hat, no mark of any
 * kind on the body. The legacy set shipped exactly one of these and it is the
 * most expressive drawing in the folder, which is the whole argument: a
 * character with its back to you is *doing* something, and the thing it is
 * doing is looking at what you are looking at.
 *
 * Kyle: "None of our characters have a back profile. Just like the side-profile
 * walking spike, maybe a spike for the back profile? For the back set: cape,
 * backpack, balloons."
 *
 * ## What the reference actually says (measured, not remembered)
 *
 * `back-minion.png` is 750 x 751 and trims to 733 x 581. Everything below is
 * off that trim, so the next reader can open the same file and check it.
 *
 * | measured                          | source px           | ratio  |
 * | --------------------------------- | ------------------- | ------ |
 * | body, without the legs            | 417 x 408           | 1.02   |
 * | the same on `eteen.png` (front)   | 283 x 282           | 1.004  |
 * | widest point, down the body       | at y 245 / 408      | 0.58   |
 * | the same on `eteen.png`           | at y 172 / 282      | 0.54   |
 * | leg column width                  | 65 of 417           | 0.156  |
 * | leg pair, centre to centre        | 133 of 417          | 0.319  |
 * | the same on `eteen.png`           | 67 of 283           | 0.237  |
 * | arm centre line, above horizontal | (568,145)->(686,42) | 41 deg |
 * | hand centres, converted to rig    | (192, 37), (13, 46) |        |
 *
 * Three findings fall straight out of that table.
 *
 * **The back bean is the front bean.** Sampling both silhouettes' half-widths
 * at twenty-one normalised heights and dividing each by its own maximum, the
 * two profiles agree to within five per cent everywhere the arms do not cover
 * the back one. The artist did not draw a second body. He drew the same body
 * and left the face off.
 *
 * **The stance is wider and the arms are enormous.** 0.32 of the body's width
 * between the soles against 0.24 from the front, and hands a full body-width
 * out from the centre, level with the body's own top edge. That is not a
 * different character, it is the same character *cheering* — so the widened
 * stance belongs to the cheer rather than to the back view, and only the
 * `cheer` arm pose below widens anything.
 *
 * **He did not mirror the feet.** `eteen.png` points both foot lobes viewer-
 * right and so does `back-minion.png`, which cannot both be true of one
 * character turning round. The current rig already sidesteps this by swelling
 * both lobes *outward* (see `Foot` in `limbs.tsx`), and an outward-symmetric
 * foot is mirror-invariant — so the one thing the legacy artist got wrong here
 * is a thing this rig cannot get wrong. Free.
 *
 * ## The one structural change a back view needs
 *
 * `mascot.tsx` draws `BEHIND_SLOTS = ["back"]` first, before the legs and the
 * body. That is correct from the front, and it is exactly why the `back` slot
 * is close to invisible there: a cape is a fan of cloth sticking out past the
 * ankles, a backpack is a two-pixel rim, and the `balloons` accessory carries
 * a comment admitting the cluster had to be shoved sideways because "a balloon
 * directly above the head is a balloon entirely hidden by the head".
 *
 * A back view is the same draw order with that one slot moved from the first
 * line to after the body. Nothing else in the pipeline changes.
 *
 * ## What a back view costs, per species
 *
 * The two figures here were built to answer exactly this, and they answer it
 * differently, which is the useful part:
 *
 * - **Silmu: nothing.** The concept's own `Body` *is* the back view. Its
 *   `Head` already returns an empty group, and not calling `Face` is the whole
 *   of the turn. One hat had to be redrawn from behind — the swept cap's peak
 *   sweeping away instead of across — and that is the entire bill.
 * - **Porukka: one function.** The concept's `Body` — two garment blocks with
 *   no collar, no placket and no neck — is verbatim correct from behind. What
 *   had to be drawn is the head: the same rounded block and the same two ear
 *   discs, minus the nose dot, plus one hair shape per build. The back hair is
 *   *simpler* than the front hair, because a cap plus two side locks becomes
 *   one mass with a nape.
 *
 * The rule that falls out: **a species pays for a back view in proportion to
 * how much of its front is a face.** A fused body pays nothing. A humanoid
 * pays for a head. A species with a directional foot, a muzzle or a tail would
 * pay for those too, and nothing in the shipping set has more than a head to
 * pay for.
 *
 * ## What the rasters said
 *
 * Everything below was rasterised on `#121212` at 280, then at 64 and 28, and
 * looked at rather than reasoned about. Five things came back:
 *
 * 1. **A back view reads, and it reads as the right character.** With no face
 *    at all, a Silmu is still a Silmu — the bean and the cap carry it — and a
 *    Porukka is still whichever build its hair says it is. Nothing else was
 *    needed. The face was never what identified these characters; it was what
 *    gave them a mood.
 * 2. **It survives the avatar crop**, which is the test that matters most,
 *    because every small use on this site is the bust. The back bust at 28
 *    still names its subject. The *full body* at 28 does not — but neither
 *    does the front one, and the module already knew that.
 * 3. **The back set is a different set of objects seen from the front.** A
 *    cape from the front is two triangles either side of a pair of ankles with
 *    its clasp hidden; from behind it is a garment. A backpack from the front
 *    is a rim, and painted from the same slot as the shirt it is worn over, so
 *    it is a rim the same colour as the shirt. Balloons from the front are
 *    behind the head. Three items, three different ways of being invisible.
 * 4. **A cape wants shoulders.** On Porukka it is immediately a cape. On a
 *    fused body it took four passes to stop being a pinafore, and what fixed
 *    it was a narrow clasp with a wide flare — a cape has to be *narrower than
 *    the body at the top and wider at the bottom*, and a species with no neck
 *    gives you nowhere to put the top. It is legible now; it is still the
 *    weakest thing in the file, and `wardrobeLimit` is where that belongs.
 * 5. **A full-width cape erases everything below the neck.** Which is what a
 *    cape does, and it means that with one on, identity rests entirely on the
 *    hair or the hat. The cape here is deliberately narrower than the
 *    shoulders so a rim of the character's own garment survives either side.
 *
 * ## Static on purpose
 *
 * No animation here. The walk-in spike owns turning, and the two compose
 * cleanly if both survive: a back view is a rig-level *facing* flag, and a
 * turn is a pose that would flip the flag at its midpoint. Neither has to know
 * about the other for that to work, which is a reason to keep them separate
 * rather than to build one on the other now.
 */

import type { ReactElement } from "react";

import { Card, CardContent } from "@/components/ui/card";

import { rigOf, type ConceptId, type LimbPaint } from "../concept";
import { getConcept } from "../concepts";
import { Limb } from "../limbs";
import { Mascot } from "../mascot";
import { MASCOT_INK, shadeHex, swatchHex, type Colorway } from "../palette";
import type { Point, Rig } from "../rig";
import { Rubric, Tile } from "./controls";

// --- the two subjects ------------------------------------------------------

/**
 * A back-view subject: which concept and build, painted from the swatch list
 * like everything else in this module.
 *
 * `hat` is a spike-local id rather than an accessory id, because the point of
 * the hat here is that it is the *back* of one — a promotion would give the
 * accessory registry a second render function, not a second registry.
 */
type Subject = {
  id: string;
  label: string;
  short: string;
  concept: ConceptId;
  form: string;
  variantId: string;
  /**
   * The character's own garment, as swatch ids, or undefined to keep whatever
   * the colourway already paints. On Silmu this is the hat, which is the whole
   * identity; on Porukka the variant already dresses the figure.
   */
  garment?: { clothing: string; accent: string };
  /**
   * The *worn item's* two colours — and the reason this exists is a real
   * defect the back view surfaced.
   *
   * Every accessory in the registry paints itself from `colors.clothing` and
   * `colors.clothingAccent`, and so does Porukka's own body: its top is
   * `clothing` and its hips are `clothingAccent`. So on that species a cape,
   * a backpack and a set of balloons are *always exactly the colour of the
   * shirt they are worn over*, and no override can separate them — repainting
   * the item repaints the garment underneath it in the same stroke. The first
   * raster of this file showed it as a wholly amber figure in an amber cape.
   *
   * From the front nobody noticed, because the `back` slot draws behind the
   * body and the item was never visible enough to compare. It is not a
   * back-view problem; it is a palette-model problem the back view found.
   */
  item: { clothing: string; accent: string };
  hat?: "swept-cap";
};

const SILMU_BACK: Subject = {
  id: "silmu",
  label: "Silmu, from behind",
  short: "Silmu",
  concept: "silmu",
  form: "default",
  variantId: "musta",
  garment: { clothing: "sky", accent: "blue" },
  // Not amber, which was the first choice and is the sun's colour in the
  // moment scene below — an amber cape in front of an amber sun is one shape.
  item: { clothing: "fuchsia", accent: "purple" },
  hat: "swept-cap",
};

const PORUKKA_BACK: Subject = {
  id: "porukka",
  label: "Porukka adult, from behind",
  short: "Porukka",
  concept: "porukka",
  form: "adult-a",
  variantId: "kupari",
  item: { clothing: "sky", accent: "blue" },
};

const PORUKKA_CROP: Subject = {
  ...PORUKKA_BACK,
  id: "porukka-crop",
  label: "Porukka adult, short crop",
  short: "Porukka (crop)",
  form: "adult-b",
  variantId: "ruis",
  item: { clothing: "fuchsia", accent: "purple" },
};

const SUBJECTS: readonly Subject[] = [SILMU_BACK, PORUKKA_BACK];

function dressed(base: Colorway, pair: { clothing: string; accent: string }): Colorway {
  return {
    ...base,
    clothing: swatchHex(pair.clothing),
    clothingAccent: shadeHex(swatchHex(pair.accent), 0.24),
  };
}

/** The character: body colourway plus whatever it is wearing on itself. */
function colorsFor(s: Subject): Colorway {
  const def = getConcept(s.concept);
  const base = def.variants.find((v) => v.id === s.variantId) ?? def.variants[0];
  return s.garment === undefined ? base.colors : dressed(base.colors, s.garment);
}

/** The same character, with the garment slots handed to the worn item instead. */
function itemColorsFor(s: Subject): Colorway {
  return dressed(colorsFor(s), s.item);
}

// --- arms ------------------------------------------------------------------

/**
 * The three arm configurations this spike needs, and no more.
 *
 * They are computed off the rig rather than tabulated, so the same three read
 * on a 120-unit bean and on a 36-unit-wide adult. `none` is what a Silmu at
 * rest actually does — the legacy set draws no arms in thirteen of its sixteen
 * files, and the rig says `armsOnDemand` because of it.
 */
type ArmPose = "none" | "cheer" | "rest" | "hold";

/**
 * Where the hands are. `l` is optional because a species with `armsOnDemand`
 * holding something in one hand draws one arm and not two — the legacy set's
 * `maalari` and `hello_minion` both do exactly that, and an idle arm added
 * beside a working one is an arm that is doing nothing on a body whose rule is
 * that arms appear when there is something to do.
 */
type Hands = { l?: Point; r: Point };

function handsFor(rig: Rig, arms: ArmPose): Hands | undefined {
  const onDemand = rig.armsOnDemand === true;
  switch (arms) {
    case "none":
      return undefined;
    case "cheer":
      // Measured off `back-minion.png` and then pulled in about fourteen units
      // a side, because the faithful reach puts the hand centres at x 13 and
      // x 192 on a canvas that is 200 wide and a mitten is sixteen across. The
      // angle and the height are what make the cheer read; the last fourteen
      // units of span are not. The asymmetry is the source's own — his right
      // hand is nine units higher than his left.
      return {
        l: { x: 100 - (rig.shoulderR.x - 100) - rig.armLen * 0.6, y: rig.crown.y + 15 },
        r: { x: rig.shoulderR.x + rig.armLen * 0.66, y: rig.crown.y + 6 },
      };
    case "rest":
      return {
        l: { x: rig.shoulderL.x - 3, y: rig.shoulderL.y + rig.armLen * 0.9 },
        r: { x: rig.shoulderR.x + 3, y: rig.shoulderR.y + rig.armLen * 0.9 },
      };
    case "hold":
      // One arm out to the side at the hip, which is where a person actually
      // holds a fistful of balloon strings — and, less romantically, the only
      // height on a 200-unit canvas with room for a balloon above it.
      return {
        ...(onDemand ? {} : { l: { x: rig.shoulderL.x - 3, y: rig.shoulderL.y + rig.armLen * 0.9 } }),
        r: { x: rig.shoulderR.x + rig.armLen * 0.52, y: rig.hip.y + rig.limbW * 0.7 },
      };
  }
}

/**
 * A mitten seen from the back of the hand: the same disc and thumb the front
 * draws, with the thumb on the other side.
 *
 * This is the smallest real difference between the two views in the whole
 * file and it is worth its one line — a thumb that stays inboard when the
 * character turns round is a hand on backwards.
 */
function BackHand({ rig, fill, at }: { rig: Rig; fill: string; at: Point }): ReactElement {
  const outward = at.x > 100 ? 1 : -1;
  return (
    <g fill={fill}>
      <circle cx={at.x} cy={at.y} r={rig.handR} />
      {rig.handStyle === "mitten" && (
        <circle
          cx={at.x + outward * rig.handR * 0.82}
          cy={at.y - rig.handR * 0.62}
          r={rig.handR * 0.52}
        />
      )}
    </g>
  );
}

/**
 * `width` is a multiplier on the rig's limb width, and the cheer needs one.
 *
 * `back-minion.png` draws a fatter limb than the front sprites do: the leg
 * column is 0.156 of the body's width against the front's 0.113, and the arm
 * is about 0.2 at the shoulder tapering to 0.11 at the wrist. The ratio of arm
 * to leg there is 1.28, so that is the number — a raised arm at the rig's own
 * width reads as a wire coathanger against a body this size, which the first
 * raster showed immediately.
 */
function BackArms({
  rig,
  paint,
  hands,
  width = 1,
}: {
  rig: Rig;
  paint: LimbPaint;
  hands: Hands;
  width?: number;
}): ReactElement {
  const arm = (from: Point, to: Point): ReactElement => (
    <>
      <Limb
        from={from}
        to={to}
        style={rig.limbStyle}
        totalLen={rig.armLen}
        width={rig.limbW * width}
        fill={paint.arm}
      />
      <BackHand rig={rig} fill={paint.hand} at={to} />
    </>
  );
  return (
    <g>
      {hands.l !== undefined && arm(rig.shoulderL, hands.l)}
      {arm(rig.shoulderR, hands.r)}
    </g>
  );
}

// --- legs and heels --------------------------------------------------------

/**
 * The sole from behind.
 *
 * A `stem` foot is already a lobe that swells outward from the centre, which
 * is mirror-symmetric and therefore identical front and back — the one place
 * where the legacy artist's own drawings disagree with each other and this rig
 * does not.
 *
 * A `boot` is a rounded block and would also survive untouched, but it is the
 * one shape here where the back view can say something the front cannot: a
 * heel is narrower than a toe box. So the back boot is the front boot at 0.82
 * of its length, and that is the whole of "heels instead of toes" — a change
 * in the silhouette, not a mark drawn on it.
 */
function BackFoot({ rig, at, fill }: { rig: Rig; at: Point; fill: string }): ReactElement {
  if (rig.footStyle === "stem") {
    const len = rig.limbW * 1.9;
    const h = rig.limbW * 1.5;
    const outward = at.x < 100 ? -1 : 1;
    const left = outward === 1 ? at.x - rig.limbW / 2 : at.x + rig.limbW / 2 - len;
    return <rect x={left} y={at.y - h / 2} width={len} height={h} rx={h / 2} fill={fill} />;
  }
  const w = rig.limbW * 1.89;
  return (
    <rect
      x={at.x - w / 2}
      y={at.y - rig.limbW * 0.62}
      width={w}
      height={rig.limbW * 1.24}
      rx={rig.limbW * 0.5}
      fill={fill}
    />
  );
}

function BackLegs({
  rig,
  paint,
  spread,
}: {
  rig: Rig;
  paint: LimbPaint;
  spread: number;
}): ReactElement {
  const feet: readonly Point[] = [
    { x: rig.hip.x - spread, y: rig.footY },
    { x: rig.hip.x + spread, y: rig.footY },
  ];
  const sockets: readonly Point[] = [
    { x: rig.hip.x - rig.hipSpread, y: rig.hip.y },
    { x: rig.hip.x + rig.hipSpread, y: rig.hip.y },
  ];
  return (
    <g>
      {feet.map((foot, i) => (
        <g key={foot.x}>
          <Limb
            from={sockets[i]}
            to={foot}
            style={rig.limbStyle}
            totalLen={rig.legLen}
            width={rig.limbW}
            fill={paint.leg}
          />
          <BackFoot rig={rig} at={foot} fill={paint.foot} />
        </g>
      ))}
    </g>
  );
}

// --- the back of a head ----------------------------------------------------

/**
 * Copied out of `porukka.tsx`, where it is a module-private constant.
 *
 * A promotion would export it rather than duplicate it. A spike that reached
 * into a private would be lying about what it costs to build this properly.
 */
const PORUKKA_ADULT_HEAD_HALF_W = 17.9;

/**
 * The back of a Porukka head: the same block, the same two ear discs, no nose
 * dot, and one hair shape instead of a cap plus two locks.
 *
 * The hair is the whole finding. From the front, a build is a dome with a
 * fringe hanging over the forehead and a lock down each side of the face —
 * three shapes arranged around a face. From behind there is no face to arrange
 * anything around, so the same build is **one closed shape**: the same dome
 * with its bottom edge dropped to wherever that build's hair ends, and the
 * fringe's quadratic run the other way so the edge hangs down at the centre
 * instead of dipping up. That inversion is the entire difference between the
 * front of a head of hair and the back of one.
 */
function PorukkaBackHead({
  rig,
  colors,
  drop,
}: {
  rig: Rig;
  colors: Colorway;
  drop: number;
}): ReactElement {
  const { x, y, r } = rig.head;
  const hw = PORUKKA_ADULT_HEAD_HALF_W;
  const flare = 1.1;
  const hair = [
    `M ${x - hw * flare} ${y + r * drop}`,
    `C ${x - hw * (flare + 0.12)} ${y - r * 1.52}`,
    `${x + hw * (flare + 0.12)} ${y - r * 1.52}`,
    `${x + hw * flare} ${y + r * drop}`,
    `Q ${x} ${y + r * (drop + 0.34)} ${x - hw * flare} ${y + r * drop}`,
    "Z",
  ].join(" ");
  return (
    <g>
      <circle cx={x - hw * 0.99} cy={y + r * 0.14} r={r * 0.23} fill={colors.bodyTop} />
      <circle cx={x + hw * 0.99} cy={y + r * 0.14} r={r * 0.23} fill={colors.bodyTop} />
      <rect
        x={x - hw}
        y={y - r}
        width={hw * 2}
        height={r * 2}
        rx={Math.min(hw, r) * 0.8}
        fill={colors.bodyTop}
      />
      <path d={hair} fill={colors.limb} />
    </g>
  );
}

/** How far below the head's centre each build's hair ends, in head radii. */
const HAIR_DROP: Record<string, number> = { "adult-a": 1.02, "adult-b": 0.28 };

/**
 * The swept cap from behind.
 *
 * The front version's peak sweeps a whole head's width to the viewer's left
 * and turns up at the tip. Turn the wearer round and the peak points *away*
 * from the viewer, so what is left of it is a stub on the far side of the
 * dome — a peak seen end-on is nearly nothing, and drawing the full sweep
 * mirrored would be drawing a hat with two peaks.
 *
 * What replaces it, and what makes this read as the back of a cap rather than
 * as a beanie, is the **strap gap**: a real cap has an opening at the back,
 * and one shallow notch lifted out of the dome's hem is the cheapest possible
 * way to say "this is the back of a hat". It is a change to the silhouette
 * rather than a mark drawn on the hat, which is what keeps it inside the
 * simplicity rule.
 */
function SweptCapBack({ rig, colors }: { rig: Rig; colors: Colorway }): ReactElement {
  const x = rig.crown.x;
  const y = rig.crown.y;
  const half = rig.crownW / 2;
  const stub = Math.min(rig.crownW * 0.2, 19);
  return (
    <g fill={colors.clothing}>
      {/* The peak, foreshortened to a stub on the far side of the dome. */}
      <path
        d={[
          `M ${x - half * 0.9} ${y - 2}`,
          `C ${x - half * 1.05} ${y + 2} ${x - half - stub} ${y + 3} ${x - half - stub} ${y + 9}`,
          `C ${x - half - stub * 0.4} ${y + 13} ${x - half * 0.98} ${y + 16} ${x - half * 0.82} ${y + 12}`,
          "Z",
        ].join(" ")}
      />
      <path
        d={[
          `M ${x - half * 1.02} ${y + 10}`,
          `C ${x - half * 1.06} ${y - 18} ${x - half * 0.5} ${y - 36} ${x + half * 0.14} ${y - 31}`,
          `C ${x + half * 0.78} ${y - 26} ${x + half * 1.06} ${y - 6} ${x + half} ${y + 11}`,
          `Q ${x + half * 0.36} ${y + 4} ${x} ${y + 3}`,
          `Q ${x - half * 0.36} ${y + 4} ${x - half * 1.02} ${y + 10}`,
          "Z",
        ].join(" ")}
      />
    </g>
  );
}

// --- the back set ----------------------------------------------------------

/**
 * Where a worn thing hangs on a back, which is not what `anchorsFor` returns.
 *
 * The shared `back` anchor is the shoulder line and a drop, which is right for
 * a species with shoulders and meaningless on a fused body: a Silmu's shoulder
 * sockets sit at mid-belly, so a cape hung off them covers the bottom half of
 * the bean and reads as a towel. On a fused body the thing a cape actually
 * hangs from is the top of the body, so that is what this returns — and a
 * promotion would put this distinction in `anchorsFor` rather than here.
 */
function backSpan(rig: Rig): { x: number; top: number; half: number; hem: number } {
  const fused = rig.fusedHead === true;
  return {
    x: 100,
    top: fused ? rig.head.y + rig.head.r * 0.16 : rig.shoulderL.y - 5,
    half: fused ? rig.crownW * 0.42 : (rig.shoulderR.x - rig.shoulderL.x) / 2 + 4,
    // Two thirds of the way from the hip to the sole, not the sole itself. The
    // first pass hung everything to the ground line and the raster came back
    // with two figures in ankle-length dresses: a cape that reaches the floor
    // stops being worn *by* a silhouette and becomes the silhouette.
    hem: rig.hip.y + (rig.footY - rig.hip.y) * 0.66,
  };
}

/**
 * A cape, drawn as a cape rather than as the two triangles that leak past a
 * standing figure's ankles from the front.
 *
 * This is the item the whole spike is about. From the front the `back` slot
 * puts it *behind* the legs, so what a viewer sees is a fan of cloth with a
 * person standing in front of it, and the collar — the part that says "cape"
 * rather than "sheet" — is hidden by the body every single time. From behind
 * it is one flat trapezoid with a band at the top and a hem that hangs: the
 * entire garment, visible, in fewer shapes than the front version needs.
 */
function BackCape({ rig, colors }: { rig: Rig; colors: Colorway }): ReactElement {
  const fused = rig.fusedHead === true;
  const b = backSpan(rig);
  // A cape hangs from a *clasp*, and where the clasp goes is the one thing a
  // fused body changes. On a shouldered figure it is the shoulder line, so the
  // cape starts as wide as the shoulders and flares. On a body that is all
  // body, hanging it from the shoulder sockets produced a pinafore in the
  // first raster — 80 units of cloth across a 120-unit bean, top to bottom.
  // High and narrow instead: a clasp a quarter of the body's width, up where a
  // neck would be if there were one, flaring to just inside the silhouette.
  const top = fused ? rig.crown.y + rig.head.r * 0.3 : b.top;
  // Narrower than the shoulders it hangs from, so a rim of the character's own
  // garment survives either side of it. A cape at full shoulder width erases
  // everything below the neck, and then the only thing left carrying identity
  // is the hair — which is a real finding about capes, not a reason to draw
  // one that wide by default.
  const half = fused ? rig.crownW * 0.26 : b.half * 0.8;
  const halfHem = half * (fused ? 2.5 : 1.46);
  const mid = top + (b.hem - top) * 0.55;
  return (
    <g>
      <path
        d={[
          `M ${b.x - half} ${top}`,
          `Q ${b.x} ${top - 4} ${b.x + half} ${top}`,
          `C ${b.x + half * 1.3} ${mid} ${b.x + halfHem} ${b.hem - 18} ${b.x + halfHem} ${b.hem}`,
          // The hem in two shallow scallops. Cloth hanging off two shoulders
          // gathers into two falls with a lift between them; a straight chord
          // here reads as a board.
          `Q ${b.x + halfHem * 0.5} ${b.hem + 9} ${b.x} ${b.hem + 2}`,
          `Q ${b.x - halfHem * 0.5} ${b.hem + 9} ${b.x - halfHem} ${b.hem}`,
          `C ${b.x - halfHem} ${b.hem - 18} ${b.x - half * 1.3} ${mid} ${b.x - half} ${top}`,
          "Z",
        ].join(" ")}
        fill={colors.clothing}
      />
      <rect
        x={b.x - half - 3}
        y={top - 6}
        width={half * 2 + 6}
        height={10}
        rx={5}
        fill={colors.clothingAccent}
      />
    </g>
  );
}

/**
 * A backpack seen from the side it is actually on.
 *
 * Four shapes, and every one of them is invisible from the front: the pack, a
 * pocket, a grab loop and two straps. The straps are drawn *before* the pack
 * so the pack's own top edge cuts them off — from behind, a strap is visible
 * only for the short run between the top of the pack and the crest of the
 * shoulder it goes over, and drawing the whole strap would be drawing the
 * front of the garment onto its back.
 */
function BackPack({ rig, colors }: { rig: Rig; colors: Colorway }): ReactElement {
  const fused = rig.fusedHead === true;
  const b = backSpan(rig);
  const w = b.half * 2 * (fused ? 0.8 : 1.2);
  const top = b.top + (fused ? 20 : 12);
  const h = (rig.footY - top) * (fused ? 0.5 : 0.56);
  const strapX = w * 0.3;
  const strapW = rig.limbW * 0.78;
  // Where a strap stops being visible. On a body with shoulders that is the
  // shoulder crest, a few units above the socket line. On a fused body there
  // is no crest to go over, so the straps run all the way up under the hat and
  // are cut off by it — which is where a rucksack on a thing shaped like a
  // bean would actually have to be anchored, and it is the only reading that
  // does not leave two bars standing in the middle of an otherwise empty back.
  const strapTop = fused ? rig.crown.y - 2 : b.top - 6;
  return (
    <g>
      {[-1, 1].map((side) => (
        <rect
          key={side}
          x={b.x + side * strapX - strapW / 2}
          y={strapTop}
          width={strapW}
          height={top - strapTop + 20}
          rx={strapW / 2}
          fill={colors.clothingAccent}
        />
      ))}
      <rect x={b.x - w / 2} y={top} width={w} height={h} rx={w * 0.17} fill={colors.clothing} />
      <rect
        x={b.x - w * 0.3}
        y={top + h * 0.48}
        width={w * 0.6}
        height={h * 0.38}
        rx={w * 0.1}
        fill={colors.clothingAccent}
      />
      <path
        d={`M ${b.x - w * 0.12} ${top + 2} Q ${b.x} ${top - 12} ${b.x + w * 0.12} ${top + 2}`}
        fill="none"
        stroke={colors.clothingAccent}
        strokeWidth={rig.limbW * 0.38}
        strokeLinecap="round"
      />
    </g>
  );
}

/**
 * Balloons, held.
 *
 * The registry already has a `balloons` entry and it is the clearest evidence
 * in the module for why the `back` slot needs a back view. It draws behind the
 * character, so its own comment explains that the cluster had to be pushed
 * sideways because "a balloon directly above the head is a balloon entirely
 * hidden by the head" — and it carries a small paper ellipse at half opacity
 * on every balloon, a specular highlight, which is a realism cue and is banned
 * everywhere else on these characters. Both are the same problem: nobody could
 * see the item properly, so it got decorated.
 *
 * This version is three flat ellipses in three swatches on three hairline
 * strings converging on the hand holding them, drawn last so nothing is hidden
 * by anything. No highlight, no outline, no second value.
 */
function Balloons({ at, hues }: { at: Point; hues: readonly string[] }): ReactElement {
  const centres: readonly Point[] = [
    { x: at.x - 4, y: at.y - 45 },
    { x: at.x + 19, y: at.y - 63 },
    { x: at.x - 1, y: at.y - 81 },
  ];
  return (
    <g>
      {centres.map((c) => (
        <path
          key={`s${c.y}`}
          d={`M ${at.x} ${at.y - 3} Q ${(at.x + c.x) / 2 + 5} ${(at.y + c.y) / 2} ${c.x} ${c.y + 13}`}
          fill="none"
          stroke={MASCOT_INK.lineSoft}
          strokeWidth={1.2}
        />
      ))}
      {centres.map((c, i) => (
        <ellipse key={`b${c.y}`} cx={c.x} cy={c.y} rx={10.5} ry={13} fill={hues[i % hues.length]} />
      ))}
    </g>
  );
}

// --- the figure ------------------------------------------------------------

type BackItem = "none" | "cape" | "backpack" | "balloons";

const BALLOON_HUES: readonly string[] = ["pink", "yellow", "sky"].map(swatchHex);

/**
 * One back view, as a group, so the moment scene below can place two of them
 * on one canvas without either owning an `<svg>`.
 *
 * The draw order is `mascot.tsx`'s own with exactly one edit: the back slot
 * has moved from the first line to after the body.
 */
function BackFigureBody({
  subject,
  arms,
  item,
}: {
  subject: Subject;
  arms: ArmPose;
  item: BackItem;
}): ReactElement {
  const def = getConcept(subject.concept);
  const rig = rigOf(def, subject.form);
  const colors = colorsFor(subject);
  // The worn item gets its own two garment colours. See the note on
  // `Subject.item`: sharing one pair with the body is what makes a Porukka
  // cape invisible against a Porukka shirt, and it is a palette-model defect
  // rather than anything this file invented.
  const worn = itemColorsFor(subject);
  const paint = def.limbs(colors);
  const hands = handsFor(rig, arms);
  const parts = {
    rig,
    colors,
    variantId: subject.variantId,
    form: subject.form,
    expression: "happy" as const,
    detail: "full" as const,
    floatClass: "",
  };
  // The cheer's wider stance, measured off the reference at 0.32 of the body's
  // width between the soles against the standing 0.24. It belongs to the pose
  // and not to the view, so nothing else here widens.
  const spread = arms === "cheer" ? rig.hipSpread * 1.35 : rig.hipSpread;
  const armDrawing =
    hands === undefined ? null : (
      <BackArms rig={rig} paint={paint} hands={hands} width={arms === "cheer" ? 1.28 : 1} />
    );
  return (
    <g>
      <ellipse
        cx={rig.shadow.cx}
        cy={rig.shadow.cy}
        rx={rig.shadow.rx}
        ry={rig.shadow.ry}
        fill={MASCOT_INK.shadow}
        opacity={0.45}
      />
      <BackLegs rig={rig} paint={paint} spread={spread} />
      <def.Body {...parts} />
      {/* A cape is the one worn thing that goes *over* the arms rather than
          beside them: hung from the shoulders, it falls in front of everything
          the shoulders carry, and the first raster of a Porukka in one showed
          exactly what happens otherwise — two sleeve-coloured stripes down a
          blue cape, reading as braces. Every other item hangs beside the arms,
          so the arms go on top of those. */}
      {item === "cape" && armDrawing}
      {item === "cape" && <BackCape rig={rig} colors={worn} />}
      {item === "backpack" && <BackPack rig={rig} colors={worn} />}
      {rig.fusedHead !== true && (
        <PorukkaBackHead rig={rig} colors={colors} drop={HAIR_DROP[subject.form] ?? 0.5} />
      )}
      {subject.hat === "swept-cap" && <SweptCapBack rig={rig} colors={colors} />}
      {item !== "cape" && armDrawing}
      {item === "balloons" && hands !== undefined && (
        <Balloons at={hands.r} hues={BALLOON_HUES} />
      )}
    </g>
  );
}

/**
 * The bust window, copied out of `mascot.tsx` — 3.6 head-radii across, centred
 * half a radius below the head — because the avatar question is the one this
 * whole side track exists to answer and a full-body figure at 28 pixels
 * answers it for nobody. The module's own finding is that no full-body figure
 * survives below about 48px, and a back view does not repeal it.
 */
function bustBox(rig: Rig): string {
  const side = rig.head.r * 3.6;
  const cy = rig.head.y + rig.head.r * 0.5;
  return `${rig.head.x - side / 2} ${cy - side / 2} ${side} ${side}`;
}

function BackFigure({
  subject,
  arms,
  item = "none",
  size = 200,
  crop = "full",
}: {
  subject: Subject;
  arms: ArmPose;
  item?: BackItem;
  size?: number;
  crop?: "full" | "bust";
}): ReactElement {
  const rig = rigOf(getConcept(subject.concept), subject.form);
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={crop === "bust" ? bustBox(rig) : "0 0 200 200"}
      width={size}
      height={size}
      role="img"
      aria-label={`${subject.label}, ${item === "none" ? "nothing worn" : item}`}
    >
      <BackFigureBody subject={subject} arms={arms} item={item} />
    </svg>
  );
}

/**
 * What a subject does with its arms in a given render.
 *
 * A Silmu at rest draws none, because `armsOnDemand` is the rig saying so and
 * the legacy set is where it came from. Anything holding something gets a hand
 * to hold it with.
 */
function armsFor(subject: Subject, item: BackItem): ArmPose {
  if (item === "balloons") return "hold";
  return subject.concept === "silmu" ? "none" : "rest";
}

// --- the moment ------------------------------------------------------------

/**
 * The scene the back view exists for.
 *
 * Two characters with their backs to the reader, capes on, looking at a
 * horizon. It is the composition that end-of-session copy, "see you next
 * week", and any empty state pointing *outward* rather than at itself has been
 * unable to make with this fleet, because every character in it is looking at
 * the camera — and a character looking at the camera cannot be looking at the
 * thing the page is about.
 *
 * The horizon is two flat bands and two discs. Nothing here is a gradient: the
 * sun is one swatch at low opacity behind the same swatch at half, which is
 * the same two-value trick the bodies use and survives being rasterised into
 * an email.
 */
function SunsetMoment({ width = 480 }: { width?: number }): ReactElement {
  const sun = swatchHex("amber");
  const sky = swatchHex("indigo");
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 480 200"
      width={width}
      height={(width * 200) / 480}
      role="img"
      aria-label="Two mascots seen from behind, in capes, watching a horizon"
    >
      {/* One disc, clear of both figures. The first pass put it between them
          and every version of that read as a hill, because a 200-unit figure
          box either side leaves a gap narrower than the sun. A second disc
          behind it at low opacity was worse still: it rendered as a visible
          brown ring, which is the exact material cue the rest of this module
          has spent three rounds removing. */}
      <circle cx={370} cy={150} r={78} fill={sun} />
      {/* The ground is opaque and drawn over the sun, so the disc is cut clean
          by the horizon rather than showing through it as a smudge. */}
      <rect x={0} y={150} width={480} height={50} fill={MASCOT_INK.shadow} />
      <rect x={0} y={148.5} width={480} height={2} fill={sky} opacity={0.6} />
      <g transform="translate(28 0)">
        <BackFigureBody subject={SILMU_BACK} arms="none" item="cape" />
      </g>
      <g transform="translate(150 0)">
        <BackFigureBody subject={PORUKKA_BACK} arms="rest" item="cape" />
      </g>
    </svg>
  );
}

// --- the page section ------------------------------------------------------

const WORN: readonly { item: BackItem; label: string; sub: string }[] = [
  { item: "cape", label: "cape", sub: "The garment, entire — collar, fall and hem" },
  { item: "backpack", label: "backpack", sub: "Body, pocket, grab loop, both straps" },
  { item: "balloons", label: "balloons", sub: "Flat, no highlight, held in a hand" },
];

export function BackViewSpike(): ReactElement {
  return (
    <Card>
      <CardContent className="space-y-10 p-6">
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-foreground">Spike — the back profile</h3>
          <p className="max-w-3xl text-sm text-muted-foreground">
            A deliberate fork, drawn locally and wired to nothing. The legacy set shipped
            exactly one back view and it is the most expressive drawing in the folder; this
            asks what it would cost to have one for every species, and what the back slot
            looks like when the thing worn in it is facing the reader.
          </p>
        </div>

        <section>
          <Rubric
            title="Against the reference"
            note="back-minion.png beside the rebuild. Same bean, no face, arms up — measured off the file, not eyeballed."
          />
          <div className="flex flex-wrap items-end gap-6">
            <Tile caption="back_minion" sub="The legacy original, on its own paper" tone="paper">
              {/* eslint-disable-next-line @next/next/no-img-element -- a throwaway exploration tile; the legacy PNGs are unoptimised fixtures deleted with this page */}
              <img
                src="/mascot-legacy/back-minion.png"
                alt="The legacy SOG mascot drawn from behind"
                width={200}
                height={200}
                className="h-[200px] w-[200px] object-contain"
              />
            </Tile>
            <Tile caption="Silmu, cheering" sub="No face. The hat is the only new drawing.">
              <BackFigure subject={SILMU_BACK} arms="cheer" size={200} />
            </Tile>
            <Tile caption="Silmu, at rest" sub="armsOnDemand — the legacy draws none, so neither does this">
              <BackFigure subject={SILMU_BACK} arms="none" size={200} />
            </Tile>
            <Tile caption="Porukka adult" sub="One hair shape replaces a cap and two locks">
              <BackFigure subject={PORUKKA_BACK} arms="rest" size={200} />
            </Tile>
            <Tile caption="Porukka, short crop" sub="The same head, the other build">
              <BackFigure subject={PORUKKA_CROP} arms="rest" size={200} />
            </Tile>
          </div>
        </section>

        <section>
          <Rubric
            title="The back set, worn"
            note="Every one of these is close to invisible from the front, because the slot draws behind the body."
          />
          <div className="space-y-6">
            {SUBJECTS.map((subject) => (
              <div key={subject.id} className="flex flex-wrap items-end gap-6">
                {WORN.map(({ item, label, sub }) => (
                  <Tile key={item} caption={`${subject.short} — ${label}`} sub={sub}>
                    <BackFigure
                      subject={subject}
                      arms={armsFor(subject, item)}
                      item={item}
                      size={200}
                    />
                  </Tile>
                ))}
              </div>
            ))}
          </div>
        </section>

        <section>
          <Rubric
            title="What the front does with the same items"
            note="The real component, same characters, same slot, painted the way a caller would actually get it."
          />
          <div className="flex flex-wrap items-end gap-6">
            <Tile caption="Front — cape" sub="A fan of cloth behind the ankles, the clasp hidden — and the cap has gone amber too, because a hat and a back item read one slot">
              <Mascot
                concept="silmu"
                variant="musta"
                outfit={{ hat: "swept-cap", back: "cape" }}
                colors={itemColorsFor(SILMU_BACK)}
                size={200}
                animated={false}
              />
            </Tile>
            <Tile caption="Back — cape" sub="The same garment, from the side it is on">
              <BackFigure subject={SILMU_BACK} arms="none" item="cape" size={200} />
            </Tile>
            <Tile caption="Front — backpack" sub="A rim, if that — and exactly the colour of the shirt, because both read clothing">
              <Mascot
                concept="porukka"
                form="adult-a"
                variant="kupari"
                outfit={{ back: "backpack" }}
                colors={itemColorsFor(PORUKKA_BACK)}
                size={200}
                animated={false}
              />
            </Tile>
            <Tile caption="Back — backpack" sub="Body, pocket, loop, straps">
              <BackFigure subject={PORUKKA_BACK} arms="rest" item="backpack" size={200} />
            </Tile>
            <Tile caption="Front — balloons" sub="Pushed sideways so the head does not eat them, with a highlight on each">
              <Mascot
                concept="porukka"
                form="adult-a"
                variant="kupari"
                outfit={{ back: "balloons" }}
                colors={itemColorsFor(PORUKKA_BACK)}
                size={200}
                animated={false}
              />
            </Tile>
            <Tile caption="Back — balloons" sub="Held, in front, flat">
              <BackFigure subject={PORUKKA_BACK} arms="hold" item="balloons" size={200} />
            </Tile>
          </div>
        </section>

        <section>
          <Rubric
            title="The moment"
            note="What a back view is for: a character looking at what the reader is looking at."
          />
          <div className="overflow-x-auto">
            <div className="w-[660px] rounded-lg border border-border bg-background">
              <SunsetMoment width={660} />
            </div>
          </div>
        </section>

        <section>
          <Rubric
            title="Turn-around"
            note="Front from the real component, back from this file, same scale. How little separates them is the point."
          />
          <div className="flex flex-wrap items-end gap-6">
            <Tile caption="Silmu — front" sub="The real component">
              <Mascot
                concept="silmu"
                variant="musta"
                outfit={{ hat: "swept-cap" }}
                colors={colorsFor(SILMU_BACK)}
                size={160}
                animated={false}
              />
            </Tile>
            <Tile caption="Silmu — back" sub="Same body, no face, one hat redrawn">
              <BackFigure subject={SILMU_BACK} arms="none" size={160} />
            </Tile>
            <Tile caption="Porukka — front" sub="The real component">
              <Mascot concept="porukka" form="adult-a" variant="kupari" size={160} animated={false} />
            </Tile>
            <Tile caption="Porukka — back" sub="Same body, one head function">
              <BackFigure subject={PORUKKA_BACK} arms="rest" size={160} />
            </Tile>
          </div>
        </section>

        <section>
          <Rubric
            title="At avatar size"
            note="Full body at 64 and 28, then the bust crop at the same two. Whether identity survives with no face at all is the whole question."
          />
          <div className="flex flex-wrap items-end gap-6">
            {[SILMU_BACK, PORUKKA_BACK, PORUKKA_CROP].map((subject) => (
              <div key={subject.id} className="flex items-end gap-3">
                <Tile caption="64" sub={subject.short}>
                  <BackFigure subject={subject} arms={armsFor(subject, "none")} size={64} />
                </Tile>
                <Tile caption="28" sub="full body">
                  <BackFigure subject={subject} arms={armsFor(subject, "none")} size={28} />
                </Tile>
                <Tile caption="64" sub="bust">
                  <BackFigure
                    subject={subject}
                    arms={armsFor(subject, "none")}
                    size={64}
                    crop="bust"
                  />
                </Tile>
                <Tile caption="28" sub="bust">
                  <BackFigure
                    subject={subject}
                    arms={armsFor(subject, "none")}
                    size={28}
                    crop="bust"
                  />
                </Tile>
              </div>
            ))}
          </div>
        </section>
      </CardContent>
    </Card>
  );
}
