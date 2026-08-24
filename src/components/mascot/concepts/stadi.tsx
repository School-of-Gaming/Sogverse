/**
 * Stadi — the inked humanoid, after the city's own illustration idiom.
 *
 * "Stadi" is Helsinki slang for Helsinki (from the Swedish *stad*), and it is
 * the right name for two reasons: it is one syllable-pair a Finn recognises
 * instantly, and it names the *place* rather than a person, which is what this
 * concept actually is — a whole way of drawing people, not one character. The
 * alternatives on the table were "Stadilainen" (a Helsinki *person*, but three
 * syllables too long for a fleet name), "Rata" (track) and "Ratikka" (tram);
 * the last one survives as a colourway, which is where a tram belongs.
 *
 * This is the counterpart to the outline-free flat concept: same brief, the
 * opposite answer. There, everything is a flat block with no line anywhere.
 * Here, **the line is the species.**
 *
 * ## What the references actually are, measured
 *
 * Read at working size — `hki/h10.webp` at 2x and in two crops, `hki/h1.webp`
 * at 1.6x and in detail crops, `lille-sheet.png` at native 900px — rather than
 * described, because the summary that arrived with this brief was right about
 * half of it and wrong about the other half in a way that mattered.
 *
 * **The palette rule is exact, and it is the strongest thing in the set.**
 * Counting the actual pixels of each panel:
 *
 * - `h10`, the cyclist half: green `#009348` ground, white, pale-blue skin
 *   `#9fc9ea`, orange `#fd4f01`, black. Two figure colours, a ground, black,
 *   paper.
 * - `h10`, the trio half: yellow `#ffe978` ground, white, black, the same pale
 *   blue skin. One figure colour besides the skin.
 * - `h1`, the left half: mint `#00d8a6` at 35% of the panel, white at 14%,
 *   black at 13%, and **nothing else above 1%**. One colour, black and white.
 *
 * So a picture in this idiom is two colours plus black and paper. That is the
 * rule the colourways in `palette.ts` are built on, and it is not a stylistic
 * preference — it is what the files measure.
 *
 * **The outline is not universal, and where it is absent is informative.** The
 * three age-portraits in `h10` (Ella 18, Mikko 44, Selma 76) have *no* contour
 * at all: pale-blue skin and solid-black hair and clothes butting straight
 * against each other, with the "line" being the gap where the black shape
 * ends. The heavy brush contour is on the cyclist beside them, on the whole of
 * `h1`, and on Lille Santanen's figure. Both halves are the same trick seen
 * from two sides — **the ink is what separates two light shapes** — and only
 * one of them also needs the outer edge drawn.
 *
 * **Line weight is a hierarchy of about 8 : 4 : 1.** On `lille-sheet.png`,
 * scanned across the drawing: a wheel rim is 15–16px, the figure's sweater
 * contour is 8px, the interior strokes are 1–2px, and the head is 78px tall.
 * So the heavy line is ~0.20 of head height, the body contour ~0.10, and the
 * fine one ~0.02. Everything below is a fraction of `rig.head.r`, which is
 * half of head height, so those become 0.40 / 0.20 / 0.04 of `r`.
 *
 * **The figures are very long.** Lille's cyclist measures 600px tall against a
 * 78px head — 7.7 heads, which is past elegant and into fashion illustration.
 * The `h10` trio are bust crops and cannot be measured. Five heads is where
 * this concept lands: enough that the limbs are the first thing you notice,
 * short of the point where it stops reading as a child's mascot.
 *
 * **Skin is a colour, not a complexion.** Pale blue `#9fc9ea` across three
 * ages in one picture; peach, brick and white in the collage. The same
 * safeguard the flat-people concept reaches for, arrived at by a different
 * route.
 *
 * ## The one thing the dark page changes, and it changes it completely
 *
 * Every source picture sits on a light ground, and that is load-bearing for
 * the whole idiom: the black line is the darkest thing in the frame, so it
 * separates the figure *from the page*. On `#121212` it cannot. Measured
 * contrast against the page: pure black 1.12:1, the shared `MASCOT_INK.line`
 * 1.14:1. An outer contour drawn in either is not a faint line — it is no line
 * at all, and all it does is eat one stroke width off the silhouette.
 *
 * Rasterised on `#121212` and looked at, three things came out of it:
 *
 * 1. **The interior line works perfectly and needs no help.** Hair against a
 *    face, a sleeve against a torso, the mouth on the cheek: every one of
 *    those is ink with light fill on both sides, which is exactly the
 *    condition the sources are drawn under. This is most of the drawing.
 * 2. **The outer contour has to be lifted, and not far.** The three candidates
 *    were rendered side by side on the page. At the shared `#241B33` the
 *    silhouette has no edge at all — the head reads as a pale shape with a bite
 *    out of it and the garment as a colour block floating with nothing round
 *    it. At `#5C566B` (2.67:1 on the page) the line goes grey: it is 1.66:1
 *    against the brick complexion, the shoes turn to plastic, and — worst —
 *    black hair becomes grey hair, which costs the elder build its one cue.
 *    `#3A3350` is the crossing point: 1.58:1 on the page, so the contour is a
 *    real edge, and 11.2:1 on paper and 7.7:1 on the pale sky complexion, so
 *    inside the drawing it is still unmistakably black.
 * 3. **Everything the figure hangs outside its own silhouette has to be light.**
 *    This is the constraint that actually disciplines the drawing, and it is
 *    the one that reversed a decision: the reference trio's arms are solid
 *    black on yellow paper and are the boldest shape in the picture, and the
 *    same sleeve on this page is a grey noodle you have to look for. Sleeves,
 *    trousers and the garment are therefore all light values, and the ink is
 *    kept to where it has fill on both sides. The one colourway that leans all
 *    the way into this (`paperi`) has paper skin *and* paper cloth, so the
 *    entire figure is the line — and on this ground it is the strongest of the
 *    five, which is the opposite of what the sources would predict.
 *
 * ## The hand-drawn line, and how much of it survives
 *
 * No grain, no texture fills, no second stroke. Grain is detail, and the
 * ruling on detail is mechanical: it does not exist at 40 pixels, so it is not
 * in the picture that matters. What is here instead is two cheap tricks that
 * cost nothing at any size:
 *
 * - **A weight hierarchy.** The torso carries a heavier contour than the head,
 *   and the head a heavier one than the collar. Three weights derived from
 *   `r`, in the 0.26 / 0.21 / 0.13 proportions the reference measures at.
 * - **A baked wobble.** Every long edge is a cubic whose two ends disagree by
 *   a few hundredths of `r` — the head reaches `0.98r` to the left and `0.94r`
 *   to the right, its chin drops `1.12r` on one side and `1.15r` on the other,
 *   and the garment's left shoulder sits a fraction higher than its right. It
 *   is deterministic (a fixture has to draw the same face twice) and it is
 *   *asymmetry*, not jitter: the shape is lopsided the way a brush is, rather
 *   than bumpy the way a bad path is.
 *
 * At 200px both read: the figure looks drawn rather than constructed. At 40px
 * full-body the whole viewBox is 0.2px per unit, so an adult's 3.26-unit head
 * contour is 0.65px and a 0.6-unit wobble is 0.12px — the wobble vanishes
 * cleanly (which is what it is supposed to do) and the contour would vanish
 * with it, so at `icon` detail every weight is widened by half and the outline
 * does the one job left to it: thickening the silhouette. At the avatar bust
 * crop the window is `3.6r` across rather than 200 units, so 40px is 0.72px per
 * unit and the same contour is a 2.3px line — an inked bust is the best portrait
 * in this whole directory, because a portrait is exactly the crop where the line
 * has light fill on both sides everywhere you look. Rasterised at 28 pixels all
 * four builds and all five colourways are still nameable apart.
 *
 * ## What is deliberately not on the body
 *
 * The simplicity ruling applies with no exception: the line and one or two
 * colour blocks *are* the identity, so nothing else goes on. No grain, no
 * folds beyond the ones the silhouette already makes, no pocket, no hairline,
 * no cheek, no nose. The four forms differ by height, hair shape and shoulder
 * width and by nothing else, which is the same discipline the humanoid family
 * next door arrived at independently.
 */

import type { ReactElement } from "react";

import type { ConceptDef, FormDef, PartProps } from "../concept";
import { MASCOT_INK, mixHex, STADI_INK, STADI_VARIANTS } from "../palette";
import { n, type Rig } from "../rig";

export const STADI_FORMS: readonly FormDef[] = [
  { id: "kid", label: "Kid", note: "Biggest head, shortest legs, a mop. Just under four heads." },
  { id: "teen", label: "Teen", note: "Narrow shoulders, long hair swept to one side. Lanky." },
  { id: "adult", label: "Adult", note: "The five-heads build. Short swept hair, widest shoulders." },
  { id: "elder", label: "Elder", note: "White hair in a high bun, narrow again, a shade shorter." },
];

/**
 * White hair, mixed rather than picked — the same problem the other humanoid
 * families hit and the same answer. Paper on a pale complexion is two light
 * values with nothing between them, so the hair stops being a silhouette at
 * portrait size and the one cue that makes an elder an elder goes with it.
 * A sixth of the way towards the line keeps it white against the page and
 * gives it an edge against a pale-sky or paper face.
 */
const ELDER_HAIR = mixHex(MASCOT_INK.paper, STADI_INK.line, 0.16);

/** The builds whose hair is white whatever the colourway says. */
const WHITE_HAIRED = new Set(["elder"]);

/**
 * One build, from the six numbers that actually differ between them.
 *
 * Everything else — where the eyes sit in the head, how far the mouth is below
 * them, how thick a limb is against the head it hangs off — is a ratio, so the
 * four forms are one drawing at four sizes rather than four drawings. That is
 * what makes a form change move nothing on the face.
 */
function build({
  headR,
  headY,
  shoulderY,
  hipY,
  footY,
  halfWidth,
  limbW,
}: {
  headR: number;
  headY: number;
  shoulderY: number;
  hipY: number;
  footY: number;
  halfWidth: number;
  limbW: number;
}): Rig {
  const torsoY = shoulderY - headR * 0.3;
  // The garment is wider than the shoulder line by a limb's half-width plus a
  // unit, so an arm leaves from *inside* the torso rather than from its corner.
  // Drawn the other way round — sockets on the garment's own edge — the arm
  // reads as bolted on, because there is a stripe of page between the two
  // shapes at every pose that hangs the hand below the hip.
  const torsoHalf = halfWidth + limbW * 0.28;
  return {
    shadow: { cx: 100, cy: footY + limbW * 0.9, rx: halfWidth * 1.05, ry: limbW * 0.62 },
    hip: { x: 100, y: hipY },
    hipSpread: limbW * 1.3,
    footY,
    footStyle: "boot",
    shoulderL: { x: 100 - halfWidth, y: shoulderY },
    shoulderR: { x: 100 + halfWidth, y: shoulderY },
    head: { x: 100, y: headY, r: headR },
    // Wide-set and small. The sources draw an eye as a dot or a small oval and
    // put the pair well apart; a big eye here would be a different species'
    // face wearing this one's line.
    eyeDx: headR * 0.44,
    eyeY: headY + headR * 0.1,
    eyeR: headR * 0.235,
    mouthY: headY + headR * 0.6,
    // Above the skull but *under* the hair's own apex, which is at about
    // `1.26r`. A hat therefore sits into the hair rather than on top of it,
    // which is how a hat sits on hair.
    crown: { x: 100, y: headY - headR * 1.18 },
    crownW: headR * 2,
    reach: 0,
    limbW,
    // A fist rather than a mitt. The hand is bare skin against a sleeve of a
    // different colour and carries no line of its own, so an oversized one
    // stops reading as a hand and starts reading as a ball on a string.
    handR: limbW * 0.6,
    limbStyle: "jointed",
    // Just under the furthest any pose in the table reaches on a build this
    // tall — the idle hang, which is 82 units from shoulder to hip on an adult,
    // against pointing at 42, waving at 31 and the star jump at 33. Set a
    // fraction *shorter* than the hang on purpose: the IK folds all its surplus
    // into one elbow, so a generous bone on a nearly-straight arm is what turns
    // a hanging arm into an akimbo one.
    armLen: (footY - shoulderY) * 0.72,
    legLen: (footY - hipY) * 1.02,
    torso: { x: 100 - torsoHalf, y: torsoY, w: torsoHalf * 2, h: hipY - torsoY + 2 },
    fusedHead: false,
  };
}

const RIGS: Record<string, Rig> = {
  kid: build({
    headR: 19.5,
    headY: 44,
    shoulderY: 82,
    hipY: 130,
    footY: 178,
    halfWidth: 24,
    limbW: 9.5,
  }),
  teen: build({
    headR: 16.5,
    headY: 37,
    shoulderY: 70,
    hipY: 122,
    footY: 180,
    halfWidth: 23,
    limbW: 8,
  }),
  adult: build({
    headR: 15.5,
    headY: 34,
    shoulderY: 66,
    hipY: 120,
    footY: 181,
    halfWidth: 27,
    limbW: 8,
  }),
  elder: build({
    headR: 16,
    headY: 36,
    shoulderY: 68,
    hipY: 122,
    footY: 181,
    halfWidth: 24,
    limbW: 8,
  }),
};

function rigFor(form: string): Rig {
  return RIGS[form] ?? RIGS.adult;
}

/**
 * The three line weights, in the proportions measured off the reference sheet
 * (a heavy contour ~0.40 of head *radius*, a body contour ~0.20, a fine
 * interior stroke ~0.04) and pulled in a little because our figure is drawn at
 * 200 units rather than 900 pixels.
 *
 * At `icon` detail every weight goes up by half. Below forty pixels the whole
 * viewBox is a fifth of a pixel per unit and the contour would otherwise be
 * two thirds of a pixel of grey; widened, it is the one thing the ruling says
 * an outline should do at that size, which is thicken the silhouette.
 */
function inkWeights(r: number, icon: boolean): { torso: number; head: number; fine: number } {
  const k = icon ? 1.5 : 1;
  return { torso: r * 0.26 * k, head: r * 0.21 * k, fine: r * 0.13 * k };
}

/**
 * The head: a cubic in four segments whose ends deliberately disagree.
 *
 * It is an egg rather than a circle — `0.96r` wide against `1.1r` tall — for
 * the same reason the reference heads are: a circle with a face on it is a
 * smiley, and every head in the source material is a long oval or a rounded
 * square. Left reaches `0.98r` and right `0.94r`; the crown peaks a shade left
 * of centre; the chin drops `1.12r` on one side and `1.09r` on the other. Four
 * hundredths of `r` is about half a unit on an adult head — enough to look
 * brushed at 200px, gone at 40px. Baked rather than generated: a fixture has to
 * draw the same face every time it renders.
 */
function headPath(x: number, y: number, r: number): string {
  return [
    `M ${n(x - r * 0.98)} ${n(y + r * 0.06)}`,
    `C ${n(x - r * 1.02)} ${n(y - r * 0.8)} ${n(x - r * 0.62)} ${n(y - r * 1.1)} ${n(x - r * 0.04)} ${n(y - r * 1.08)}`,
    `C ${n(x + r * 0.54)} ${n(y - r * 1.06)} ${n(x + r * 0.96)} ${n(y - r * 0.76)} ${n(x + r * 0.94)} ${n(y + r * 0.12)}`,
    `C ${n(x + r * 0.92)} ${n(y + r * 0.78)} ${n(x + r * 0.54)} ${n(y + r * 1.09)} ${n(x - r * 0.02)} ${n(y + r * 1.12)}`,
    `C ${n(x - r * 0.58)} ${n(y + r * 1.15)} ${n(x - r * 0.94)} ${n(y + r * 0.8)} ${n(x - r * 0.98)} ${n(y + r * 0.06)}`,
    "Z",
  ].join(" ");
}

/**
 * The garment: shoulders that slope, sides that come in a little towards the
 * hem, and a hem that is a hair off level. The left shoulder sits a fraction
 * higher than the right, which is the same asymmetry the head has and for the
 * same reason.
 *
 * The taper is worth a sentence because the first pass did without it and came
 * out as a paper bag: two vertical sides and a level hem is a rectangle, and a
 * rectangle under a head is a *sign*, not a body. Three units of draw-in over
 * the height of the garment is enough to say "cloth on a person" and small
 * enough that it never reads as a waist.
 */
function torsoPath(t: { x: number; y: number; w: number; h: number }): string {
  const midX = t.x + t.w / 2;
  const draw = t.w * 0.055;
  return [
    `M ${n(t.x - 0.6)} ${n(t.y + t.h * 0.22)}`,
    `C ${n(t.x - 1.4)} ${n(t.y + t.h * 0.02)} ${n(t.x + t.w * 0.2)} ${n(t.y - t.h * 0.12)} ${n(midX)} ${n(t.y - t.h * 0.115)}`,
    `C ${n(t.x + t.w * 0.8)} ${n(t.y - t.h * 0.11)} ${n(t.x + t.w + 1.2)} ${n(t.y + t.h * 0.04)} ${n(t.x + t.w + 0.4)} ${n(t.y + t.h * 0.24)}`,
    `C ${n(t.x + t.w - draw * 0.3)} ${n(t.y + t.h * 0.66)} ${n(t.x + t.w - draw * 0.8)} ${n(t.y + t.h * 0.86)} ${n(t.x + t.w - draw)} ${n(t.y + t.h)}`,
    `L ${n(t.x + draw * 0.9)} ${n(t.y + t.h - 1)}`,
    `C ${n(t.x + draw * 0.7)} ${n(t.y + t.h * 0.84)} ${n(t.x + draw * 0.2)} ${n(t.y + t.h * 0.64)} ${n(t.x - 0.6)} ${n(t.y + t.h * 0.22)}`,
    "Z",
  ].join(" ");
}

function Body({ rig, colors, detail }: PartProps): ReactElement {
  const t = rig.torso;
  const w = inkWeights(rig.head.r, detail === "icon");
  const stroke = {
    stroke: STADI_INK.line,
    strokeLinejoin: "round" as const,
    strokeLinecap: "round" as const,
  };
  return (
    <g>
      {/* The neck, drawn first so both the head and the garment overlap it.
          On a five-head figure it is a real length rather than a suggestion —
          it is one of the things doing the work of "tall". */}
      <rect
        x={rig.head.x - rig.head.r * 0.26}
        y={rig.head.y + rig.head.r * 0.5}
        width={rig.head.r * 0.52}
        height={t.y - rig.head.y}
        fill={colors.bodyTop}
        strokeWidth={w.head}
        {...stroke}
      />
      <path d={torsoPath(t)} fill={colors.accent} strokeWidth={w.torso} {...stroke} />
      {/* The collar: one block cut into the top of the garment, which is the
          only interior shape the body gets. It is what stops a torso reading
          as a bag, and it is a block rather than a line because a line here
          would be drawing an edge two colours already make. */}
      <path
        d={[
          `M ${n(rig.head.x - rig.head.r * 0.62)} ${n(t.y - t.h * 0.1)}`,
          `Q ${n(rig.head.x)} ${n(t.y + t.h * 0.13)} ${n(rig.head.x + rig.head.r * 0.62)} ${n(t.y - t.h * 0.1)}`,
          `L ${n(rig.head.x + rig.head.r * 0.3)} ${n(t.y - t.h * 0.13)}`,
          `Q ${n(rig.head.x)} ${n(t.y + t.h * 0.03)} ${n(rig.head.x - rig.head.r * 0.3)} ${n(t.y - t.h * 0.13)}`,
          "Z",
        ].join(" ")}
        fill={colors.panel}
        strokeWidth={w.fine}
        {...stroke}
      />
    </g>
  );
}

/**
 * The hair — one ink shape per build, and the whole of what tells four ages
 * apart once height and shoulders have had their say.
 *
 * Every shape starts from the same cap over the crown, so a form change never
 * moves an eye or a mouth. What differs is where the cap's bottom edge sits
 * and what hangs off it, which is the cheapest possible family system and the
 * one the reference trio is visibly built on: a pair of high buns, a swept
 * shape plus a beard, a tall bumpy cloud.
 *
 * ## Two numbers every one of these shapes has to respect
 *
 * **The dome has a ceiling at `-1.3r`.** The bust crop is a window `3.6r`
 * across centred half a radius below the head, so its top edge is exactly
 * there, and anything above it is simply cut off. The first pass put the
 * control points at `-1.9r` and all four builds came back from the portrait
 * rasteriser with flat tops. A cubic's apex sits at about three quarters of the
 * way to its controls, so controls at `-1.6r` land the apex at about `-1.26r`:
 * a fifth of a radius of hair above a skull whose own top is `-1.08r`, and
 * inside the portrait by four hundredths. Lower than about `-1.5r` and the hair
 * stops being a mass and becomes a swimming cap.
 *
 * **The fringe is the *bottom* of the shape, not a line across the middle of
 * it.** Each of these is one closed path: out along the dome, in at the far
 * side, back across the hairline. Put that return curve's controls too high and
 * the enclosed area is a thin crescent rather than a head of hair — which is
 * invisible while the fill is the ink colour (the stroke fattens the crescent
 * back into a blob) and is glaringly obvious the moment a colourway paints the
 * hair green. It cost a render to find, twice.
 */
function Hair({ rig, colors, form, detail }: PartProps): ReactElement {
  const { x, y, r } = rig.head;
  const fill = WHITE_HAIRED.has(form) ? ELDER_HAIR : colors.spark;
  const w = inkWeights(r, detail === "icon");
  /**
   * Hair drawn *in* the line colour gets no line, and that is not a shortcut.
   *
   * A contour exists to separate two fills, and a black shape contoured in
   * black separates nothing — all the stroke does is grow the shape by half its
   * width on every side, which on a head this size is a fifth of a radius of
   * extra hair and is the difference between a haircut and a hood. It is also
   * what the sources do: the trio's black hair is one solid shape with no
   * outline anywhere, and only the *coloured* hair in the collage carries one.
   */
  const inked = fill === STADI_INK.line;
  const stroke = {
    stroke: inked ? "none" : STADI_INK.line,
    strokeWidth: inked ? 0 : w.head,
    strokeLinejoin: "round" as const,
    strokeLinecap: "round" as const,
  };

  switch (form) {
    case "kid":
      // A mop: down over the brow, long at the sides, and the fringe cut on a
      // slant so the two sides do not agree — which is the only hand-drawn cue
      // this shape gets and is worth more than any amount of edge wobble.
      return (
        <path
          d={[
            `M ${n(x - r * 1.03)} ${n(y + r * 0.5)}`,
            `C ${n(x - r * 1.14)} ${n(y - r * 1.62)} ${n(x + r * 1.1)} ${n(y - r * 1.68)} ${n(x + r * 0.99)} ${n(y + r * 0.38)}`,
            `L ${n(x + r * 0.72)} ${n(y - r * 0.2)}`,
            `C ${n(x + r * 0.3)} ${n(y - r * 0.46)} ${n(x - r * 0.36)} ${n(y - r * 0.26)} ${n(x - r * 0.74)} ${n(y + r * 0.06)}`,
            "Z",
          ].join(" ")}
          fill={fill}
          {...stroke}
        />
      );
    case "teen":
      // Long, and all of it down one side. The asymmetry is the build: it is
      // the only form whose hair leaves the head's own silhouette, and at bust
      // size it is what separates a teenager from an adult at a glance.
      return (
        <g fill={fill} {...stroke}>
          <path
            d={[
              `M ${n(x - r * 1.0)} ${n(y + r * 0.14)}`,
              `C ${n(x - r * 1.1)} ${n(y - r * 1.6)} ${n(x + r * 1.06)} ${n(y - r * 1.66)} ${n(x + r * 0.94)} ${n(y - r * 0.3)}`,
              `L ${n(x + r * 0.66)} ${n(y - r * 0.36)}`,
              `C ${n(x + r * 0.28)} ${n(y - r * 0.66)} ${n(x - r * 0.3)} ${n(y - r * 0.42)} ${n(x - r * 0.76)} ${n(y - r * 0.06)}`,
              "Z",
            ].join(" ")}
          />
          <path
            d={[
              `M ${n(x - r * 1.0)} ${n(y - r * 0.3)}`,
              `C ${n(x - r * 1.3)} ${n(y + r * 0.9)} ${n(x - r * 1.24)} ${n(y + r * 1.9)} ${n(x - r * 1.0)} ${n(y + r * 2.5)}`,
              `L ${n(x - r * 0.5)} ${n(y + r * 2.34)}`,
              `C ${n(x - r * 0.66)} ${n(y + r * 1.5)} ${n(x - r * 0.7)} ${n(y + r * 0.5)} ${n(x - r * 0.62)} ${n(y - r * 0.3)}`,
              "Z",
            ].join(" ")}
          />
        </g>
      );
    case "elder":
      // Volume, and it goes **sideways**. A high bun was the first answer and
      // the portrait rasteriser threw it out: anything above `-1.3r` is outside
      // the bust window, so a bun is a flat-topped smudge in exactly the crop
      // an elder most needs to be recognisable in. Wide is free — the window is
      // `3.6r` across against a head `1.8r` wide — and it is also what the
      // reference's own seventy-six-year-old has: a big soft cloud sitting on
      // the ears rather than a tower over the crown.
      return (
        <path
          d={[
            `M ${n(x - r * 1.24)} ${n(y - r * 0.24)}`,
            `C ${n(x - r * 1.5)} ${n(y - r * 1.66)} ${n(x + r * 1.46)} ${n(y - r * 1.72)} ${n(x + r * 1.2)} ${n(y - r * 0.32)}`,
            "Z",
          ].join(" ")}
          fill={fill}
          {...stroke}
        />
      );
    case "adult":
    default:
      // Short and swept, sides cut well above the jaw. The plainest of the four
      // on purpose: it is the build the parent, the gedu and the engineer all
      // share, and they are told apart by colour and by what they carry.
      return (
        <path
          d={[
            `M ${n(x - r * 1.0)} ${n(y - r * 0.1)}`,
            `C ${n(x - r * 1.08)} ${n(y - r * 1.58)} ${n(x + r * 1.04)} ${n(y - r * 1.64)} ${n(x + r * 0.95)} ${n(y - r * 0.26)}`,
            `L ${n(x + r * 0.7)} ${n(y - r * 0.3)}`,
            `C ${n(x + r * 0.36)} ${n(y - r * 0.64)} ${n(x - r * 0.24)} ${n(y - r * 0.5)} ${n(x - r * 0.74)} ${n(y - r * 0.16)}`,
            "Z",
          ].join(" ")}
          fill={fill}
          {...stroke}
        />
      );
  }
}

function Head(props: PartProps): ReactElement {
  const { rig, colors, detail } = props;
  const { x, y, r } = rig.head;
  const w = inkWeights(r, detail === "icon");
  return (
    <g>
      <path
        d={headPath(x, y, r)}
        fill={colors.bodyTop}
        stroke={STADI_INK.line}
        strokeWidth={w.head}
        strokeLinejoin="round"
      />
      <Hair {...props} />
    </g>
  );
}

export const STADI: ConceptDef = {
  id: "stadi",
  species: "Stadi",
  kind: "Inked humanoid — a thick brush line, two colours, four ages",
  origin: "fresh",
  pitch:
    "The city's own way of drawing people, done as ours. Where the flat humanoid family has no line anywhere, this one is nothing *but* line: a heavy near-black contour round every shape, two colours per picture and no third, skins that are pale blue or brick because a skin colour is a colour here and never a complexion. It is the most ownable humanoid in the set — a flat yellow person is a look a hundred products already have, and an inked one at five heads tall with a wobble in its edges is a house style. It is also, for the same reason, the best portrait: a bust crop is all interior line, which is the exact condition this idiom is drawn for.",
  caveat:
    "It fights the page harder than anything else here. The whole idiom assumes a light ground, and on #121212 the outer contour is worth 1.58:1 even after being lifted off black — the line reads, but it is doing a quieter job than it does on paper, and a colourway whose fills go dark loses it entirely. The long build is the other cost: five heads tall is elegant and is not cuddly, so it is a weaker answer than a kid-proportioned concept anywhere the audience is six years old.",
  landmark: "The heavy ink contour and the one flat hair shape on a pale, unreal head.",
  slots: ["hat", "face", "torso", "back", "extra", "scene"],
  wardrobeLimit:
    "Nothing is refused, but a worn item drawn without a line of its own sits on this body as a sticker rather than as part of the drawing — glasses and a cap read best, because a frame and a peak are already lines.",
  rig: RIGS.adult,
  forms: STADI_FORMS,
  rigFor,
  faceMode: "eyes",
  variants: STADI_VARIANTS,
  // Sleeves and trousers in the garment's lighter value, hands in the skin,
  // shoes in the ink.
  //
  // The reference trio does the opposite — a pale hand on the end of a solid
  // black sleeve — and it was the first thing tried here. Rasterised on
  // `#121212` it fails, and the failure is instructive: a black sleeve on
  // yellow paper is the boldest shape in the picture, and the same sleeve on
  // this page is a grey noodle you have to look for. Everything a figure hangs
  // *outside its own silhouette* has to be light here, or the page eats it.
  // The ink stays where it has light on both sides, which is where this idiom
  // actually spends most of its line anyway.
  //
  // The sleeve then has to be the garment's *lighter* value rather than the
  // garment itself, and that one is forced by the shared limb renderer: it
  // draws a limb as a plain fill with no contour, so an arm painted the same
  // colour as the torso it hangs in front of has no line between them and the
  // idle pose comes out looking armless. Two values of one hue is what the
  // sources do with a top and a bottom anyway; here it is also the only line
  // available between an arm and a chest.
  limbs: (c) => ({ arm: c.limb, leg: c.limb, hand: c.bodyTop, foot: c.spark }),
  Body,
  Head,
  fleet: [
    {
      name: "Aino",
      job: "Gamer stand-in — club pages, camp galleries, the shots a photo cannot be in",
      variantId: "taivas",
      form: "teen",
      role: "gamer",
      pose: "controller",
      expression: "focused",
      blurb:
        "Long hair swept to one side, pale sky skin, amber jumper, controller up. The tallest kid in the set and the one who reads as a teenager rather than as a child.",
    },
    {
      name: "Onni",
      job: "The youngest — camp pages, first-session copy, anywhere the reader is small",
      variantId: "okra",
      form: "kid",
      role: "gamer",
      pose: "wave",
      expression: "excited",
      blurb:
        "The mop of hair and the biggest head-to-body ratio here. Pale yellow with a green jumper — the yellow field and the green field of the source pictures, worn instead of printed.",
    },
    {
      name: "Helmi",
      job: "Parent stand-in — billing, consent, the pages that ask someone to read carefully",
      variantId: "tiili",
      form: "adult",
      role: "parent",
      pose: "idle",
      expression: "happy",
      prop: "mug",
      outfit: { torso: "scarf" },
      garment: "sky",
      blurb:
        "Brick skin, a sky-blue scarf, a mug. The colourway that proves the point about complexions: nobody looks at a brick-red person and wonders which parent it is.",
    },
    {
      name: "Väinö",
      job: "Gedu stand-in — recruitment, training, every diagram that needs an educator in it",
      variantId: "taivas",
      form: "adult",
      role: "gedu",
      pose: "point-left",
      expression: "happy",
      outfit: { face: "specs" },
      garment: "emerald",
      blurb:
        "Specs, lanyard, clipboard, pointing at the thing you are meant to be looking at. Glasses suit this idiom better than any other concept here — a frame is a line, and this species is made of them.",
    },
    {
      name: "Sirkka",
      job: "The desk — enrolment, term dates, and whatever is actually happening on Tuesday",
      variantId: "paperi",
      form: "elder",
      role: "none",
      pose: "hold-up",
      expression: "happy",
      outfit: { face: "specs" },
      garment: "emerald",
      blurb:
        "White bun, paper-white face, one solid inked cardigan — the self-portrait trick from the reference sheet, where a whole figure is a black mass and a drawn face. Holding up the notice.",
    },
    {
      name: "Chief Engineer Kyle",
      job: "CTO — the engine room; scientist, builder, architect, engineer",
      variantId: "ratikka",
      form: "adult",
      role: "none",
      pose: "idle",
      expression: "focused",
      prop: "blueprint",
      outfit: { hat: "hardhat", torso: "tool-belt" },
      garment: "amber",
      blurb:
        "A hardhat over the hair, a tool belt, a rolled drawing under his arm. The inked read of the idea: where the flat version is a friendly diagram of an engineer, this one is a poster of one.",
    },
  ],
};
