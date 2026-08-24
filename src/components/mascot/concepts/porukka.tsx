/**
 * Porukka — the simplest person the set can hold, and a whole age range of it.
 *
 * "Porukka" is Finnish for the crew, the gang, our lot ("meidän porukka"). It
 * is a collective noun on purpose: this concept is not one character with
 * variations, it is a *population* — a baby, a kid, a teen, an adult and an
 * elder built from the same four shapes, so a page can show a family without
 * showing the same drawing five times.
 *
 * ## What it is answering
 *
 * Kyle's simplicity ruling: "as simple as possible while still being unique
 * and identifiable… the base form is simple and stripped down. Props are the
 * only additive thing." Kaveri is the other humanoid here and it has a neck
 * seam, a collar, a placket, a hood roll, a pocket, two hoodie strings and
 * four freckles. Every one of those is a line on a body that is supposed to be
 * a silhouette. Porukka is what is left when they all come off: **head, hair,
 * one garment, tapering limbs, hands, feet.** Nothing else is drawn on it
 * anywhere, at any detail level. If Kaveri has a line on it, this one does
 * not.
 *
 * ## Measured off the reference, not remembered from it
 *
 * The style prompt was Mari Huhtala's illustrations for Terveyskylä — the
 * pictures a Helsinki neuvola has on its walls. Two of them were opened at
 * working size and measured rather than described; these are the numbers the
 * geometry below is built from, so the next reader can check them against the
 * same two files.
 *
 * `huhtala.png` (1400x934), the neuvola scene:
 * - Standing child, viewer-right: hair top y=482, chin y=605, sole y=867.
 *   Head 123 px, figure 385 px — **3.1 heads tall**.
 * - Standing woman: hair top y=45, chin y=220, sole y=870. Head 175 px,
 *   figure 825 px — **4.7 heads tall**.
 * - The child's face is 154 px wide against a 123 px head: a child's head is
 *   **wider than it is tall** (1.25:1). Ears add ~18 px a side.
 * - **No neck anywhere.** The chin meets the shoulder line directly.
 *
 * `huhtala2.png` (947x789), the family at a laptop:
 * - Standing man: head 116 px, figure 578 px — **5.0 heads tall**.
 * - Crawling baby: head 68 px, whole crawl 148 px — **2.2 heads**.
 *
 * Face internals, off the child (face width Fw=154, head height Hh=123):
 * - Eye: a white oval **39 x 22 px** — 0.25 Fw across, aspect about 1.8:1,
 *   with its top edge **cut flat by the lid**.
 * - Eye centres at 0.42 Hh below the crown — above the middle of the head, not
 *   on it — and 84 px apart, which is 0.55 Fw (centres at +/-0.27 Fw).
 * - Pupil: a circle about 0.15 Fw, roughly 0.6 of the white's width, sitting
 *   against the flat lid.
 * - Nose: a flat pink dot, 16 px — 0.10 Fw — centred, at 0.52 Hh.
 * - Mouth centre at 0.74 Hh. Low on the face.
 * - Skin `#ffc61c` in one picture and `#fdc445` in the other; nose `#f3a4ca`.
 *
 * The ratios above are what `AGES` below encodes. The heads-tall figures are
 * rounded to the brief's ladder (2.5 / 3.5 / 4 / 4.5 / 4.5) rather than to the
 * measurements, because the measured child is a leaning 3.1 and the measured
 * man a leaning 5.0, and a ladder with even spacing is what makes five figures
 * standing in a row read as one family at five ages.
 *
 * ## What was deliberately NOT taken from the reference
 *
 * - **Cheek blush.** Both children have two pink cheek ovals. The house face
 *   grammar bans blush and it is right to: it is a realism cue on a symbol
 *   face. The pink *nose* is a different thing and is discussed below.
 * - **The darker yellow tone under the hairline.** One extra value of skin is
 *   still shading, and shading is what the simplicity ruling removes. The
 *   `bodyBottom` slot keeps it so a second complexion can exist, but nothing
 *   draws with it.
 * - **The strand lines in the blond bob**, the teeth in the child's grin, the
 *   buttons on the man's shirt, the pacifier. All embellishment; all off.
 *
 * ## One skin for everyone
 *
 * Every person in both pictures has the same flat yellow skin. That is the
 * single most important thing to carry over and the reason to carry it: with
 * one deliberately unreal complexion for the whole cast, difference is carried
 * by hair, clothes and colour, and never by ethnicity. It is the same
 * safeguard Kaveri's lilac-and-teal complexions provide, arrived at from the
 * other direction — Kaveri makes every person a *different* impossible
 * colour, Porukka makes every person the *same* impossible colour.
 *
 * `bodyTop` is that skin and every colourway sets it to the same hex, so the
 * slot survives for a second complexion variant without the fleet shipping
 * one. The colourways vary hair (`limb`) and the two garments.
 *
 * ## What the forms may differ by
 *
 * Height, hair shape, shoulder width. Nothing else — no makeup, no lashes on
 * one and not another, no skirt, no colour coding. Head-to-body ratio is the
 * whole language of drawn age and it is worth more than any amount of costume.
 */

import type { ReactElement } from "react";

import type { ConceptDef, FormDef, PartProps } from "../concept";
import { PORUKKA_VARIANTS } from "../palette";
import type { Rig } from "../rig";

/**
 * The pink nose dot, as a flag rather than as a decision already taken.
 *
 * The doc's face grammar bans "nose glints" and it means highlights — a
 * specular dot that claims the nose is a shiny sphere. A flat pink circle is
 * not that: it is a *symbol* for a nose, the same kind of thing the mouth
 * glyph is, and Huhtala puts one on every single face in both reference
 * pictures including the robot. So it is built, and built switchable, and the
 * decision is Kyle's off the rasters rather than mine off taste.
 *
 * It is painted from the `spark` slot rather than from a constant, which means
 * the comparison can also be made *live* by overriding one colour: paint
 * `spark` the skin colour and the dot disappears without the drawing changing.
 * That is what the exploration study's A/B row does.
 */
// Annotated `boolean` rather than left to infer `true`: without it the type is
// the literal and every read of it is "always truthy" to the compiler and the
// linter, which is the opposite of what a switch is for.
export const PORUKKA_NOSE_DOT: boolean = true;

export const PORUKKA_FORMS: readonly FormDef[] = [
  { id: "kid-a", label: "Kid — mop", note: "3.5 heads. Round head, hair past the ears." },
  { id: "kid-b", label: "Kid — crop", note: "3.5 heads. The same head under short hair." },
  { id: "teen-a", label: "Teen — long", note: "4 heads. Longer body, hair past the shoulders." },
  { id: "teen-b", label: "Teen — knot", note: "4 heads. Short at the sides, one knot on top." },
  { id: "adult-a", label: "Adult — bob", note: "4.5 heads. Hair to the jaw." },
  { id: "adult-b", label: "Adult — crop", note: "4.5 heads. The broadest shoulders here." },
  { id: "elder-a", label: "Elder — set", note: "4.5 heads on a shorter figure. The tallest hair here." },
  { id: "elder-b", label: "Elder — beard", note: "4.5 heads. Side hair and a short beard." },
  {
    id: "baby",
    label: "Baby — sitting",
    note: "2.5 heads. Sits rather than stands; standing poses are not for this build.",
  },
];

/** The five ages, which is the axis every form is a point on. */
type Age = "baby" | "kid" | "teen" | "adult" | "elder";

function ageOf(form: string): Age {
  if (form === "baby") return "baby";
  if (form.startsWith("kid")) return "kid";
  if (form.startsWith("teen")) return "teen";
  if (form.startsWith("elder")) return "elder";
  return "adult";
}

/**
 * Half the head's width, per age, in the same units as `head.r`.
 *
 * A separate number rather than `head.r` because the reference is explicit
 * that a child's head is wider than it is tall (1.25:1 measured) and an
 * adult's is very nearly square, and that difference alone does a surprising
 * amount of the work of drawn age. `head.r` stays the *vertical* half-height,
 * because that is what the rest of the module scales hats and crops against.
 */
const HEAD_HALF_W: Record<Age, number> = {
  baby: 26.4,
  kid: 23.9,
  teen: 20.1,
  adult: 17.9,
  elder: 16.9,
};

/**
 * A baby that sits.
 *
 * The reference baby crawls, and a crawl cannot be expressed in a rig whose
 * legs go from a hip to a sole — so this is the sitting version of the same
 * idea: a very large head, a hip almost on the ground, and short legs splayed
 * out from under it. Crown to ground is about 2.4 heads.
 *
 * **The standing and moving poses are not meaningful on this build.** Walking,
 * jumping and striding will render — nothing breaks — but they draw a seated
 * infant doing a star jump. The family study uses `idle` and `seated`, and a
 * future caller should too.
 */
const BABY: Rig = {
  shadow: { cx: 100, cy: 183, rx: 36, ry: 6 },
  hip: { x: 100, y: 154 },
  hipSpread: 22,
  footY: 172.5,
  footStyle: "boot",
  shoulderL: { x: 76, y: 114 },
  shoulderR: { x: 124, y: 114 },
  head: { x: 100, y: 84, r: 24 },
  eyeDx: 14.3,
  eyeY: 81,
  eyeR: 7.4,
  mouthY: 96,
  crown: { x: 100, y: 59 },
  crownW: 50,
  reach: 0,
  limbW: 13.5,
  handR: 8.6,
  limbStyle: "straight",
  armLen: 44,
  legLen: 26,
  torso: { x: 74, y: 110, w: 52, h: 48 },
  fusedHead: false,
  // A thumb, and nothing else. Rasterised against a plain disc at 200 / 64 /
  // 40: below about 64 the two are the same handful of pixels, and at 200 the
  // disc reads as a ball on a stick while the mitten reads as a hand. A free
  // win at the top of the range that costs nothing at the bottom.
  handStyle: "mitten",
};

const KID: Rig = {
  shadow: { cx: 100, cy: 185, rx: 32, ry: 6 },
  hip: { x: 100, y: 110 },
  hipSpread: 15,
  footY: 176,
  footStyle: "boot",
  shoulderL: { x: 73, y: 79 },
  shoulderR: { x: 127, y: 79 },
  head: { x: 100, y: 50.5, r: 22.5 },
  eyeDx: 12.9,
  eyeY: 47,
  eyeR: 6.3,
  mouthY: 61,
  crown: { x: 100, y: 27 },
  crownW: 44,
  reach: 0,
  limbW: 13.5,
  handR: 8.2,
  limbStyle: "straight",
  armLen: 58,
  legLen: 62,
  torso: { x: 73, y: 75, w: 54, h: 40 },
  fusedHead: false,
  // A thumb, and nothing else. Rasterised against a plain disc at 200 / 64 /
  // 40: below about 64 the two are the same handful of pixels, and at 200 the
  // disc reads as a ball on a stick while the mitten reads as a hand. A free
  // win at the top of the range that costs nothing at the bottom.
  handStyle: "mitten",
};

const TEEN: Rig = {
  shadow: { cx: 100, cy: 186, rx: 30, ry: 6 },
  hip: { x: 100, y: 99 },
  hipSpread: 14,
  footY: 176.5,
  footStyle: "boot",
  shoulderL: { x: 73, y: 68 },
  shoulderR: { x: 127, y: 68 },
  head: { x: 100, y: 42.3, r: 20.3 },
  eyeDx: 10.9,
  eyeY: 39,
  eyeR: 5.2,
  mouthY: 52,
  crown: { x: 100, y: 21 },
  crownW: 39,
  reach: 0,
  limbW: 12.5,
  handR: 7.8,
  limbStyle: "straight",
  armLen: 68,
  legLen: 80,
  torso: { x: 72, y: 64, w: 56, h: 42 },
  fusedHead: false,
  // A thumb, and nothing else. Rasterised against a plain disc at 200 / 64 /
  // 40: below about 64 the two are the same handful of pixels, and at 200 the
  // disc reads as a ball on a stick while the mitten reads as a hand. A free
  // win at the top of the range that costs nothing at the bottom.
  handStyle: "mitten",
};

const ADULT: Rig = {
  shadow: { cx: 100, cy: 186, rx: 30, ry: 6 },
  hip: { x: 100, y: 100 },
  hipSpread: 14,
  footY: 176.5,
  footStyle: "boot",
  shoulderL: { x: 72, y: 58 },
  shoulderR: { x: 128, y: 58 },
  head: { x: 100, y: 32, r: 19 },
  eyeDx: 9.7,
  eyeY: 29,
  eyeR: 4.8,
  mouthY: 42,
  crown: { x: 100, y: 12 },
  crownW: 38,
  reach: 0,
  limbW: 12.5,
  handR: 7.6,
  limbStyle: "straight",
  armLen: 72,
  legLen: 74,
  torso: { x: 71, y: 54, w: 58, h: 44 },
  fusedHead: false,
  // A thumb, and nothing else. Rasterised against a plain disc at 200 / 64 /
  // 40: below about 64 the two are the same handful of pixels, and at 200 the
  // disc reads as a ball on a stick while the mitten reads as a hand. A free
  // win at the top of the range that costs nothing at the bottom.
  handStyle: "mitten",
};

/**
 * The same head-to-body ratio as an adult on a shorter figure. Age is read
 * from *stature and hair*, not from a smaller head — a shrinking head would
 * read as a different species rather than as an older person.
 */
const ELDER: Rig = {
  shadow: { cx: 100, cy: 186, rx: 29, ry: 6 },
  hip: { x: 100, y: 106 },
  hipSpread: 13,
  footY: 177,
  footStyle: "boot",
  shoulderL: { x: 76, y: 65 },
  shoulderR: { x: 124, y: 65 },
  head: { x: 100, y: 40, r: 18 },
  eyeDx: 9.2,
  eyeY: 37,
  eyeR: 4.5,
  mouthY: 49,
  crown: { x: 100, y: 21 },
  crownW: 36,
  reach: 0,
  limbW: 12,
  handR: 7.4,
  limbStyle: "straight",
  armLen: 66,
  legLen: 70,
  torso: { x: 74, y: 61, w: 52, h: 44 },
  fusedHead: false,
  // A thumb, and nothing else. Rasterised against a plain disc at 200 / 64 /
  // 40: below about 64 the two are the same handful of pixels, and at 200 the
  // disc reads as a ball on a stick while the mitten reads as a hand. A free
  // win at the top of the range that costs nothing at the bottom.
  handStyle: "mitten",
};

const AGE_RIG: Record<Age, Rig> = {
  baby: BABY,
  kid: KID,
  teen: TEEN,
  adult: ADULT,
  elder: ELDER,
};

/** Shoulder width is the one build cue that is not hair or height. */
function withShoulders(base: Rig, halfWidth: number): Rig {
  // The garment is half a limb wider than the sockets on each side, so a
  // sleeve comes out from *under* it. At the sockets' own width the arm's
  // shoulder cap stands proud of the garment's edge and the bust crop shows
  // two dark blobs with a notch between them and the body — epaulettes on a
  // t-shirt.
  const half = halfWidth + base.limbW * 0.5;
  return {
    ...base,
    shoulderL: { x: 100 - halfWidth, y: base.shoulderL.y },
    shoulderR: { x: 100 + halfWidth, y: base.shoulderR.y },
    torso: { ...base.torso, x: 100 - half, w: half * 2 },
  };
}

/**
 * Half the shoulder span, per build, and why the numbers are as small as they
 * are. Measured off the reference: the standing woman's shoulders span 220 px
 * on an 825 px figure — **27% of her height** — and the standing child 150 px
 * on 385, which is 39%. A child really is nearly half as wide as it is tall
 * and an adult is not, and getting that wrong in the adult's favour is what
 * makes a flat figure read as a gingerbread man.
 */
const SHOULDERS: Record<string, number> = {
  baby: 21,
  "kid-a": 22,
  "kid-b": 21,
  "teen-a": 20,
  "teen-b": 22,
  "adult-a": 22,
  "adult-b": 25,
  "elder-a": 20,
  "elder-b": 23,
};

function rigFor(form: string): Rig {
  const age = ageOf(form);
  return withShoulders(AGE_RIG[age], SHOULDERS[form] ?? 27);
}

/**
 * The head: one rounded shape, two ears, and nothing else on it.
 *
 * The ears are silhouette rather than surface — they change the outline, which
 * is the one kind of detail the simplicity rule keeps — so they are drawn at
 * every level. They are also two plain discs with no inner shape, because the
 * pink ear interior in the reference is exactly the sort of second value that
 * comes off.
 */
function Head({ rig, colors, form }: PartProps): ReactElement {
  const { x, y, r } = rig.head;
  const hw = HEAD_HALF_W[ageOf(form)];
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
      <Hair rig={rig} colors={colors} hw={hw} form={form} />
      {PORUKKA_NOSE_DOT && (
        <circle cx={x} cy={y + r * 0.12} r={hw * 0.1} fill={colors.spark} />
      )}
    </g>
  );
}

/**
 * The hair, which is doing all of the work of telling nine people apart.
 *
 * Every shape is one flat fill in the `limb` slot, drawn against the same head
 * geometry, so changing form never moves an eye, a nose or a shoulder. `cap`
 * is the shared dome every build starts from; the builds differ in where its
 * bottom edge sits, how far it flares past the head, and what hangs off it.
 *
 * `limb` carries the hair colour rather than the limbs, which is the same slot
 * re-use Kaveri makes. On this species the arms are sleeves and the legs are
 * trousers, so the slot was free and hair is the thing that most needs its own
 * colour.
 */
function Hair({
  rig,
  colors,
  hw,
  form,
}: {
  rig: Rig;
  colors: PartProps["colors"];
  hw: number;
  form: string;
}): ReactElement {
  const { x, y, r } = rig.head;
  const hair = colors.limb;

  /**
   * The dome over the crown. `bottom` is its hairline in head half-heights,
   * `flare` how far past the head's own width it sits, and `lift` how high the
   * curve's control points reach — which is what turns the same shape from a
   * crop into a bouffant.
   */
  const cap = (bottom: number, flare: number, lift = 1.52, dip = 0.2): string =>
    [
      `M ${x - hw * flare} ${y + r * bottom}`,
      `C ${x - hw * (flare + 0.12)} ${y - r * lift}`,
      `${x + hw * (flare + 0.12)} ${y - r * lift}`,
      `${x + hw * flare} ${y + r * bottom}`,
      // The fringe, and the whole difference between hair and a swim cap. A
      // dome closed with a straight chord reads as a bathing cap at every size
      // — the eye needs the bottom edge to *hang*. One quadratic dipping a
      // fifth of a head-height at the centre is enough, and it is the only
      // curve in the shape that is not the outline. A **negative** dip is the
      // same control run the other way: the hairline rises in the middle and
      // the hair reads as swept back off the forehead rather than cut across
      // it, which is the one silhouette in this set that is not a fringe.
      `Q ${x} ${y + r * (bottom + dip)} ${x - hw * flare} ${y + r * bottom}`,
      "Z",
    ].join(" ");

  /**
   * `lift` and `dip` are both bounded by the *avatar* crop, not by taste. A
   * bust window is 3.6 head-radii wide centred half a radius below the head,
   * so its top edge sits at 1.3 radii above the head's centre — anything
   * taller than that is cropped off in every participant list on the site.
   * The peak of the dome above is `0.25 bottom + 0.75 lift`, which is what
   * keeps every build here at or under that line.
   */

  /** A lock down each side of the face, from the hairline to `to`. */
  const locks = (from: number, to: number, width: number, flare: number): ReactElement => (
    <>
      <path
        d={`M ${x - hw * flare} ${y + r * from} L ${x - hw * (flare - width)} ${y + r * from} L ${x - hw * (flare - width)} ${y + r * to} Q ${x - hw * (flare - width / 2)} ${y + r * (to + 0.26)} ${x - hw * flare} ${y + r * to} Z`}
      />
      <path
        d={`M ${x + hw * flare} ${y + r * from} L ${x + hw * (flare - width)} ${y + r * from} L ${x + hw * (flare - width)} ${y + r * to} Q ${x + hw * (flare - width / 2)} ${y + r * (to + 0.26)} ${x + hw * flare} ${y + r * to} Z`}
      />
    </>
  );

  switch (form) {
    case "kid-b":
      // Short, tight to the skull.
      return (
        <g fill={hair}>
          <path d={cap(-0.56, 1.06)} />
        </g>
      );
    case "teen-a":
      // Long, past the shoulders. The tallest hair volume in the set.
      return (
        <g fill={hair}>
          <path d={cap(-0.54, 1.12)} />
          {locks(-0.54, 1.85, 0.3, 1.12)}
        </g>
      );
    case "teen-b":
      // Shaved high at the sides with one knot standing on top. The knot is a
      // separate shape because it is a separate *object* — hair gathered and
      // tied — and it is the silhouette the whole build is identified by.
      return (
        <g fill={hair}>
          <path d={cap(-0.34, 0.99, 1.02)} />
          <ellipse cx={x} cy={y - r * 1.04} rx={hw * 0.27} ry={r * 0.27} />
        </g>
      );
    case "adult-a":
      // A bob to the jaw.
      return (
        <g fill={hair}>
          <path d={cap(-0.5, 1.1)} />
          {locks(-0.5, 0.94, 0.32, 1.1)}
        </g>
      );
    case "adult-b":
      // Short back and sides. Sits lower at the temples than the kid crop.
      return (
        <g fill={hair}>
          <path d={cap(-0.48, 1.08)} />
          {locks(-0.48, 0.06, 0.2, 1.08)}
        </g>
      );
    case "elder-a":
      // Set and swept back: the only build whose hairline *rises* across the
      // forehead instead of hanging over it, and the widest hair here. Volume
      // plus an open forehead is what makes a head of hair read as *old*
      // rather than merely pale, and it is the cue that survives when the
      // colourway is not the silver one. Two earlier passes lost: a bun behind
      // the dome was invisible, and a bun in front of it was the teen's knot
      // again.
      return (
        <g fill={hair}>
          <path d={cap(-0.44, 1.18, 1.66, -0.18)} />
        </g>
      );
    case "elder-b":
      // Side hair and a beard, and nothing across the top. Two crescents and
      // one chin shape: the only build here whose scalp is part of the face.
      return (
        <g fill={hair}>
          <path
            d={`M ${x - hw * 1.1} ${y + r * 0.5} C ${x - hw * 1.24} ${y - r * 0.9} ${x - hw * 0.72} ${y - r * 1.12} ${x - hw * 0.7} ${y - r * 0.66} C ${x - hw * 0.86} ${y - r * 0.62} ${x - hw * 0.94} ${y - r * 0.1} ${x - hw * 0.9} ${y + r * 0.5} Z`}
          />
          <path
            d={`M ${x + hw * 1.1} ${y + r * 0.5} C ${x + hw * 1.24} ${y - r * 0.9} ${x + hw * 0.72} ${y - r * 1.12} ${x + hw * 0.7} ${y - r * 0.66} C ${x + hw * 0.86} ${y - r * 0.62} ${x + hw * 0.94} ${y - r * 0.1} ${x + hw * 0.9} ${y + r * 0.5} Z`}
          />
          {/* The beard starts below the mouth line, not above it: the face is
              drawn on top of the head by a renderer that knows nothing about
              what a concept put under it, so a beard reaching the mouth would
              simply have a mouth on it. */}
          <path
            d={`M ${x - hw * 1.06} ${y + r * 0.2} C ${x - hw * 1.1} ${y + r * 1.5} ${x - hw * 0.5} ${y + r * 1.9} ${x} ${y + r * 1.88} C ${x + hw * 0.5} ${y + r * 1.9} ${x + hw * 1.1} ${y + r * 1.5} ${x + hw * 1.06} ${y + r * 0.2} L ${x + hw * 0.86} ${y + r * 0.2} C ${x + hw * 0.9} ${y + r * 0.9} ${x - hw * 0.9} ${y + r * 0.9} ${x - hw * 0.86} ${y + r * 0.2} Z`}
          />
        </g>
      );
    case "baby":
      // One wisp. A baby's hair is a shape it barely has yet, and drawing a
      // full cap on it is what makes a drawn infant read as a small adult.
      return (
        <g fill={hair}>
          <path
            d={`M ${x - hw * 0.5} ${y - r * 0.94} C ${x - hw * 0.46} ${y - r * 1.42} ${x + hw * 0.12} ${y - r * 1.5} ${x + hw * 0.34} ${y - r * 1.26} C ${x + hw * 0.1} ${y - r * 1.2} ${x + hw * 0.22} ${y - r * 1.02} ${x + hw * 0.4} ${y - r * 0.9} Z`}
          />
        </g>
      );
    case "kid-a":
    default:
      // The mop: a wide dome down past the ears. The default build.
      return (
        <g fill={hair}>
          <path d={cap(-0.62, 1.14)} />
          {locks(-0.62, 0.42, 0.26, 1.14)}
        </g>
      );
  }
}

/**
 * The body: two garment shapes and no third one.
 *
 * A top from the shoulders to just past the hip in `clothing`, and a hip block
 * in `clothingAccent` that the legs continue out of. No collar, no placket, no
 * pocket, no cuffs, no hem line — the reference draws none of those on a child
 * and the simplicity ruling forbids all of them. Where the reference's adults
 * do have a garment feature (stripes, a placket, buttons) it is exactly the
 * kind of thing that dies at 40 px, so it is not here either.
 *
 * The garment's top edge sits *above* the shoulder line and under the chin,
 * because there is no neck: the head is drawn after the body and covers the
 * join, which is how the reference gets a head to sit straight on a torso with
 * nothing between them.
 */
function Body({ rig, colors, form }: PartProps): ReactElement {
  const t = rig.torso;
  const age = ageOf(form);

  if (age === "baby") {
    // One romper: a single rounded pod from the shoulders to the ground. A
    // sitting infant has no visible waist, so it is one shape rather than two.
    return (
      <rect
        x={t.x}
        y={t.y - 6}
        width={t.w}
        height={178 - (t.y - 6)}
        rx={t.w * 0.42}
        fill={colors.clothing}
      />
    );
  }

  const hip = rig.hip.y;
  const hem = hip + 5;
  const top = [
    `M ${t.x} ${t.y + 12}`,
    `C ${t.x} ${t.y - 4} ${t.x + t.w * 0.22} ${t.y - 10} ${t.x + t.w / 2} ${t.y - 10}`,
    `C ${t.x + t.w * 0.78} ${t.y - 10} ${t.x + t.w} ${t.y - 4} ${t.x + t.w} ${t.y + 12}`,
    `L ${t.x + t.w} ${hem - 11}`,
    `Q ${t.x + t.w} ${hem} ${t.x + t.w - 11} ${hem}`,
    `L ${t.x + 11} ${hem}`,
    `Q ${t.x} ${hem} ${t.x} ${hem - 11}`,
    "Z",
  ].join(" ");
  const hipW = rig.hipSpread * 2 + rig.limbW * 1.9;
  return (
    <g>
      <rect
        x={100 - hipW / 2}
        y={hip - 16}
        width={hipW}
        height={34}
        rx={rig.limbW}
        fill={colors.clothingAccent}
      />
      <path d={top} fill={colors.clothing} />
    </g>
  );
}

export const PORUKKA: ConceptDef = {
  id: "porukka",
  species: "Porukka",
  kind: "Humanoid population — five ages, one impossible complexion, six shapes total",
  origin: "fresh",
  branchOf: "kaveri",
  pitch:
    "The person, stripped to the bone. Head, hair, one garment, limbs, hands, feet — no seam, fold, sheen, freckle, hairline or trim anywhere on it, at any size, so a hat or a prop is the only thing on the drawing that is not the drawing. It ships as five ages rather than as one figure: a baby, a kid, a teen, an adult and an elder from the same six shapes, which is what lets one illustration show a whole family. Everyone in it has the same flat yellow skin, on purpose — one deliberately unreal complexion for the entire cast means difference is carried by hair and clothes and never by ethnicity. \"Porukka\" is Finnish for the crew, the gang, our lot.",
  caveat:
    "It is the least ownable thing here by design — a simple flat person is the most-drawn illustration in the world, and Porukka will never be as distinctive as a one-eyed bean or a folded plane. The yellow is doing more work than it looks: it is the only thing separating this from a generic corporate-illustration person, and it has to survive on a near-black page. And the baby sits rather than stands, so the walking, striding and jumping poses are not meaningful on that build.",
  landmark: "The flat yellow head with the wide-set eyes, and the one-shape hair over it.",
  slots: ["hat", "face", "torso", "back", "extra", "scene"],
  wardrobeLimit:
    "None. Everything fits, and everything reads, because there is nothing already on the body to compete with it — which is the whole argument for building a person this quiet.",
  rig: rigFor("kid-a"),
  forms: PORUKKA_FORMS,
  rigFor,
  faceMode: "lid",
  variants: PORUKKA_VARIANTS,
  // Sleeves and trousers, not skin: the arms are inside the garment and only
  // the hands come out of it. `bodyTop` is the one constant across every
  // colourway, so the hands are the same yellow on every member of the fleet.
  limbs: (c) => ({
    arm: c.clothingAccent,
    leg: c.clothingAccent,
    hand: c.bodyTop,
    foot: c.panel,
  }),
  Body,
  Head,
  fleet: [
    {
      name: "Aino",
      job: "Gamer stand-in — club pages, camp galleries, the hero a photo cannot fill",
      variantId: "noki",
      form: "kid-a",
      role: "gamer",
      pose: "controller",
      expression: "excited",
      blurb:
        "Nine, headset on, controller up. The one that stands where a picture of a child would have gone, and is unidentifiable on purpose.",
    },
    {
      name: "Väinö",
      job: "The older sibling — teen clubs, the competitive end, gamer testimonials",
      variantId: "kupari",
      form: "teen-b",
      role: "gamer",
      pose: "keyboard-mouse",
      expression: "focused",
      blurb:
        "Fourteen and taller than he was last term. Same face as his sister, four inches and a hair knot apart.",
    },
    {
      name: "Tuomas",
      job: "Parent stand-in — billing, consent, safeguarding, every page a grown-up must read",
      variantId: "ruis",
      form: "adult-b",
      role: "parent",
      pose: "idle",
      expression: "happy",
      prop: "mug",
      garment: "teal",
      blurb: "The dad on the sofa with the mug, reading the terms. Broadest shoulders in the family.",
    },
    {
      name: "Salla",
      job: "Gedu stand-in — recruitment, training, the workspace, every diagram with an educator in it",
      variantId: "kupari",
      form: "adult-a",
      role: "gedu",
      pose: "point-left",
      expression: "happy",
      prop: "clipboard",
      garment: "emerald",
      blurb: "Lanyard, specs, clipboard, pointing at the thing you are supposed to be looking at.",
    },
    {
      name: "Helmi",
      job: "The grandparent — holiday camps, the family pages, the ones that are not about screens",
      variantId: "usva",
      form: "elder-a",
      role: "none",
      pose: "wave",
      expression: "happy",
      garment: "violet",
      blurb:
        "Silver hair in a low bun, narrow shoulders, waving from the door. Proof the ladder goes all the way up.",
    },
    {
      name: "Muru",
      job: "The little one — family imagery, the pages about the whole household rather than the gamer",
      variantId: "ruis",
      form: "baby",
      role: "none",
      pose: "idle",
      expression: "surprised",
      garment: "amber",
      blurb:
        "Sitting on the floor with one wisp of hair and an enormous head, watching everyone else. Two and a half heads tall and the reason the ladder is worth having.",
    },
    {
      name: "Chief Engineer Kyle",
      job: "CTO — the engine room; scientist, builder, architect, engineer",
      variantId: "noki",
      form: "adult-b",
      role: "none",
      pose: "idle",
      expression: "focused",
      prop: "blueprint",
      outfit: { hat: "hardhat", torso: "hoodie" },
      garment: "amber",
      blurb:
        "A hardhat, an engineering-gold hoodie, a rolled drawing under one arm. The candidate on the quietest body in the set — nothing on the character competes with the two things that say what he does.",
    },
  ],
};
