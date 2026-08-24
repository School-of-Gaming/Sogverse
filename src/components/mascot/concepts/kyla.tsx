/**
 * Kylä — the village, and the six animals who live in it.
 *
 * ## What was looked at, and what it actually showed
 *
 * Three Mauri Kunnas pages were read at working size (`kunnas/k3.jpg`,
 * `k4.jpg`, `k5.jpg` in the round's scratch folder, resized to 900px wide) and
 * one figure was measured against a ten-pixel grid — the standing young dog at
 * the right of `k4.jpg`, cropped at (395, 90) 120×210. Every number below is
 * in that crop's own pixels, and the ratios are what came over into the rig.
 *
 * **Proportion.** Skull top y = 12, jaw bottom y = 68, so the head is 56 tall.
 * The garment hem is at y = 118: crown to hem is 106, which is 1.9 heads for
 * head *and* torso together. The legs run off the bottom of the crop, but the
 * seated figures in `k5.jpg` put the adults at about four heads and the pups a
 * little under. **The torso is as wide as the skull** — the garment measures 48
 * across against a 50-wide skull. That single ratio is most of the idiom: a
 * Kunnas villager is a big head, a narrow body, and clothes that flare below
 * the waist rather than a body that does.
 *
 * **The face.** Two white circles, r ≈ 10, centred 18 apart on a 50-wide skull
 * — so the whites are 0.36 of the head's height each and **they very nearly
 * touch**. The pupils are dots, r ≈ 3, about a quarter of the white. The nose
 * is the loudest mark on the whole character: a black blob r ≈ 8, which is
 * *0.8 of an eye white*, and it is the only pure black on the figure apart
 * from a shoe. There are no brows on it at all.
 *
 * **The snout.** On this pup it projects about 12 units past a 50-wide skull —
 * a quarter of the skull's width. On the adult in `k3.jpg` it is far longer,
 * nearly doubling the head's horizontal extent. Both are drawn in
 * three-quarter view, which our front-facing rig cannot do, so the projection
 * becomes a **block on the front of the face** instead: same job (a place to
 * hang the nose), our own geometry.
 *
 * **Clothes.** Real tailoring, always: a collar, a cuff at the wrist, an apron
 * with a curved hem, breeches and stockings and a buckled shoe. The clothes
 * stop at the neck and the wrist — head and hands stay bare fur — and the
 * garment is what tells you the trade. Nothing is textured; a check pattern is
 * two sets of straight lines over one flat fill.
 *
 * **Line and colour.** A fine wobbling ink contour of near-uniform weight
 * around every shape, with the fill running past it here and there. Four to
 * six muted hues per page — ochre, terracotta, brick, olive, one dusty blue —
 * on warm paper, with black spent only on noses, shoes and a spilled inkwell.
 *
 * **Composition.** `k3.jpg` is one big figure at about 55% of the frame's
 * height, two mid-sized figures flanking it, and four tiny animals scattered
 * low and at the edges, each busy with its own thing. `k4.jpg` has no hero at
 * all — it is a room, and the characters are events in it. That is the
 * ensemble idea, and it is why this concept ships a scene rather than a
 * portrait.
 *
 * ## What is deliberately NOT taken
 *
 * The guardrail is hard and it is worth writing down at the drawing. **No
 * Koiramäki, no Herra Hakkarainen, and above all no Kunnas dog** — that build
 * is a long tapering muzzle nearly as long as the skull plus a long floppy
 * teardrop ear, and it is the single most recognisable silhouette in Finnish
 * children's illustration. Ours is the opposite of it on both counts: a
 * *short, wide* snout block and two small folded flaps set high. Every other
 * form here is a different animal on the same body plan, which is the second
 * reason the dog cannot be the memorable one.
 *
 * Two things came over as *ratios* rather than as shapes, and one did not come
 * over at all:
 *
 * - The eye ratio could not come over, and it took the whole eye down with
 *   it. The reference's white is 0.36 of head height with a pupil a quarter of
 *   it; this module's pupil is fixed at 0.56 of its white, which is a
 *   face-system decision rather than a species one. Drawn at the measured
 *   size, that produces two black discs nearly touching, and the raster of it
 *   read as goggles rather than as a face. So the white is **smaller** than
 *   the reference's (0.25 of head height) and set further apart, which is the
 *   only lever a concept has over an eye it does not own. The result reads
 *   younger and softer than the source, which is the right direction for this
 *   product anyway.
 * - The cheek blush is on nearly every Kunnas face and is banned here as a
 *   realism cue. Nothing replaces it.
 * - The ink contour is the finding this concept was asked to report, and it
 *   has its own note at `OUTLINE` below.
 *
 * ## The forms
 *
 * Six domestic animals a Finnish child meets at a mummola. Otso already owns
 * the wild ones, so nothing here overlaps it — and where it would (Otso has a
 * rat), the build is so different that the two do not read as the same
 * character: an Otso is a two-and-a-half-head round cub, and a Kylä villager
 * is a three-and-a-half-head person in a coat.
 *
 * Each form is **one rig switch and one head**, exactly as Otso's sixteen are.
 * The tail is the second half of the silhouette and is drawn behind the body.
 */

import type { ReactElement } from "react";

import type { ConceptDef, FormDef, PartProps } from "../concept";
import { KYLA_VARIANTS, MASCOT_INK, shadeHex, type Colorway } from "../palette";
import type { Rig } from "../rig";

export const KYLA_FORMS: readonly FormDef[] = [
  {
    id: "dog",
    label: "Koira — dog",
    note: "Short wide snout, two small folded flaps. Deliberately not the famous one.",
  },
  { id: "cat", label: "Kissa — cat", note: "Two sharp triangles and the narrowest snout here." },
  { id: "pig", label: "Possu — pig", note: "The flat disc snout, and the only face with two nose blocks." },
  { id: "goat", label: "Vuohi — goat", note: "Horns back, ears straight out sideways, a beard under the chin." },
  { id: "rooster", label: "Kukko — rooster", note: "A comb, a wattle and a beak. No snout at all." },
  { id: "mouse", label: "Hiiri — mouse", note: "Ears wider than the skull. The smallest villager." },
];

/**
 * Whether this species is drawn with a contour, and what the rasters showed.
 *
 * The Kunnas idiom *is* an ink line — every shape on those pages carries one,
 * of near-uniform weight, with the fill running past it here and there — so
 * "should this species have an outline" is the one question this concept could
 * not answer from the ruling alone. It was drawn three ways and looked at on
 * `#121212`: no contour, the shared plum ink (`#241B33`) at 1.6 units, and a
 * contour mixed as a `shadeHex` of the coat itself. Dog and mouse, at 420px
 * bust, 200px full and 40px bust.
 *
 * **The 420px bust is where they separate, and `ink` wins the beauty
 * contest.** Outlined, the dog reads as a *drawing* rather than as an
 * arrangement of shapes: the snout lifts off the skull, the ears detach at
 * their roots, and the whole face gains the quality the reference has. If the
 * only question were "which single figure looks best large", it would be this
 * one.
 *
 * **It loses on two counts that matter more.**
 *
 * - **The silhouette edge disappears into the page.** A `#241B33` line on a
 *   `#121212` ground is not an edge, it is a fade: the outer rim of each ear
 *   and the top of the skull merge into the background, so the outlined
 *   version's silhouette is *softer* than the flat one's, which is the exact
 *   opposite of what an outline is for. Kunnas prints on white, where the same
 *   line is the strongest contrast in the picture. The line was never the
 *   point; contrast with the ground was, and the ground is inverted here.
 * - **A partial outline is worse than none.** The arms, legs, hands and feet
 *   are drawn by the shared limb renderer, which has no stroke and is not this
 *   file's to change. So an outlined head and coat arrive attached to
 *   unoutlined sleeves, and at 420px that seam is the first thing the eye
 *   finds. Outlining this species properly is a change to `limbs.tsx` — a
 *   system decision for whoever owns the face and limb modules, not something
 *   a concept file can take on its own.
 *
 * `contour` avoids the first problem — a warm mid-brown never approaches the
 * background's value — and does the useful half of the job, separating the
 * snout from the skull. It fails differently: the same stroke also rings the
 * coat and the collar, so a blue garment gets a brown outline, and the arms
 * still have none.
 *
 * **At 40px all three are the same picture.** A 1.6-unit stroke in a 200-unit
 * viewBox is 0.32 of a pixel; it draws no line and only desaturates the edge
 * of whatever it is on. Nothing about the identity changes either way, which
 * settles it: an outline can only ever be a large-size luxury here, and it is
 * a luxury that costs the silhouette.
 *
 * So: **`none`**, with the interior separation done in colour, which is what
 * the simplicity ruling asks for anyway — the snout is a paler block, the nose
 * is the only near-black one, the collar is paper against a muted garment. The
 * constant stays so the comparison can be re-run in one edit rather than
 * re-argued from memory.
 */
const OUTLINE: "none" | "ink" | "contour" = "none";

/** Contour props for a filled shape, or just the fill when the species is flat. */
function edge(fill: string, colors: Colorway): {
  fill: string;
  stroke?: string;
  strokeWidth?: number;
  strokeLinejoin?: "round";
} {
  if (OUTLINE === "none") return { fill };
  return {
    fill,
    stroke: OUTLINE === "ink" ? MASCOT_INK.line : shadeHex(colors.bodyTop, 0.5),
    strokeWidth: 1.6,
    strokeLinejoin: "round",
  };
}

/**
 * Three and a half heads tall, and where every number in it comes from.
 *
 * Ground is y = 182 and the crown is y = 16, so the figure is 166 units of
 * standing height. `head.r = 23` makes the head 46 tall, which is **3.6
 * heads** rather than the four an adult on those pages measures. Four was
 * drawn first and the raster settled it: at four heads the head is small
 * enough that the face stops being the thing you look at, and the reference's
 * own *pups* are nearer 3.5. Three-six is the compromise — still a person's
 * proportion rather than a cub's two-and-a-half, still a head big enough to
 * carry a symbol face. The torso is 42 wide against a 41-wide dog skull,
 * which is the reference's measured "torso as wide as the head".
 *
 * The eyes went the other way for the same reason. Measured off the page they
 * are 0.36 of head height each and *nearly touching*, and drawn that way here
 * they read as goggles — because this module's pupil is 0.56 of its white
 * where the reference's is a quarter, so a big white is a big black disc
 * rather than a big white with a dot in it. `eyeR = 5.8` on a 46-tall head is
 * 0.25, and `eyeDx = 8.6` leaves 5.4 units between the two whites. The
 * ratio that could not come over is written up at the top of the file.
 *
 * Arms bend (`jointed`): a villager with a job has elbows, and the reference's
 * arms are drawn with a clear one every time they reach for something. Hands
 * are mittens, which is the flat one-shape hand with a thumb that every figure
 * on those pages has. Feet are boots, because these people wear shoes.
 */
const BASE: Rig = {
  shadow: { cx: 100, cy: 184, rx: 30, ry: 5.5 },
  hip: { x: 100, y: 120 },
  hipSpread: 11,
  footY: 176,
  footStyle: "boot",
  shoulderL: { x: 81, y: 76 },
  shoulderR: { x: 119, y: 76 },
  head: { x: 100, y: 39, r: 23 },
  eyeDx: 8.6,
  eyeY: 39,
  eyeR: 5.8,
  mouthY: 55,
  crown: { x: 100, y: 16 },
  crownW: 36,
  reach: 0,
  limbW: 10,
  handR: 7.5,
  limbStyle: "jointed",
  armLen: 54,
  legLen: 56,
  torso: { x: 79, y: 72, w: 42, h: 56 },
  fusedHead: false,
  handStyle: "mitten",
};

/**
 * Half the skull's width, per form.
 *
 * `head.r` stays the vertical half-height for every villager — it is what the
 * rest of the module scales hats and the avatar crop against, so moving it per
 * species would move the framing per species. Width is the free axis, and it
 * is most of what separates a pig's face from a mouse's before either of them
 * has grown an ear.
 */
const HEAD_HALF_W: Record<string, number> = {
  dog: 20.5,
  cat: 19,
  pig: 21.5,
  goat: 17.5,
  rooster: 17,
  mouse: 16.5,
};

function halfWidth(form: string): number {
  return HEAD_HALF_W[form] ?? HEAD_HALF_W.dog;
}

/**
 * Only the crown line and the mouth move between forms.
 *
 * The crown is where a hat sits, so it has to clear whatever the animal
 * already carries up there: the goat's horns and the rooster's comb both stand
 * above their own skull, and both are set the way Otso sets the elk's antlers
 * — the hat goes on *under* the landmark rather than over it, because the
 * landmark is the identity and a hat that covered it would erase it.
 */
function rigFor(form: string): Rig {
  switch (form) {
    case "goat":
      return { ...BASE, crown: { x: 100, y: 12 }, crownW: 32, mouthY: 53 };
    case "rooster":
      return { ...BASE, head: { x: 100, y: 40, r: 21 }, crown: { x: 100, y: 15 }, crownW: 30, eyeY: 37, mouthY: 55 };
    case "mouse":
      return { ...BASE, head: { x: 100, y: 40, r: 20 }, crown: { x: 100, y: 16 }, crownW: 32, eyeY: 39, mouthY: 52 };
    case "pig":
      return { ...BASE, crown: { x: 100, y: 17 }, crownW: 38, mouthY: 54 };
    case "cat":
      return { ...BASE, crown: { x: 100, y: 12 }, crownW: 34, mouthY: 53 };
    case "dog":
    default:
      return BASE;
  }
}

/**
 * How big each form's snout is, in the same units as the rig.
 *
 * `cy` is the snout's centre as a multiple of `head.r` below the head's own
 * centre; `h` is its height. Both are large, and measured: on the reference
 * pup the muzzle occupies y = 42 to 68 of a head running 12 to 68, which is
 * **46 per cent of the head's height**. Drawn any smaller than that, the two
 * things that have to live on it — the nose block and the mouth glyph — do
 * not both fit, and the first raster of this species is what proved it: a
 * 13-tall snout put the mouth straight through the nose and the pair merged
 * into one black shape that read as a scream.
 *
 * That is a real constraint rather than a drawing preference. The shared mouth
 * glyph is sized off constants rather than off `head.r`, so on a 46-unit head
 * it is about nine units deep whatever the species does — already a known
 * open item for the face module. Until it scales with the head, a small-headed
 * species has to *give it somewhere to be*, and the snout is that place.
 */
const SNOUT: Record<string, { w: number; h: number; noseW: number; cy: number }> = {
  dog: { w: 28, h: 22, noseW: 10, cy: 0.62 },
  cat: { w: 20, h: 17, noseW: 7, cy: 0.58 },
  goat: { w: 18, h: 19, noseW: 7, cy: 0.6 },
  mouse: { w: 16, h: 17, noseW: 6, cy: 0.58 },
};

function snoutOf(form: string): { w: number; h: number; noseW: number; cy: number } {
  return SNOUT[form] ?? SNOUT.dog;
}

/**
 * The snout: two flat blocks, and the second one is the family's landmark.
 *
 * A pale block on the lower face, and the black nose sitting high on it. The
 * nose is drawn a good deal larger than a nose needs to be — the measured
 * reference has it at 0.8 of an eye white — because it is the only pure dark
 * on the character and it is what survives to the 40-pixel bust when the
 * snout's own pale block has merged with the coat.
 *
 * It is a rounded *block* rather than a circle on purpose: Kunnas's nose is a
 * round blob, and a rectangle with soft corners does the identical job in a
 * shape that is ours. Same reasoning as the snout being frontal rather than
 * projecting — this rig has no three-quarter view to project into.
 */
function Snout({
  x,
  y,
  w,
  h,
  noseW,
  colors,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  noseW: number;
  colors: Colorway;
}): ReactElement {
  const noseH = noseW * 0.66;
  return (
    <g>
      <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={h * 0.48} {...edge(colors.panel, colors)} />
      <rect
        x={x - noseW / 2}
        y={y - h / 2 + h * 0.06}
        width={noseW}
        height={noseH}
        rx={noseH * 0.42}
        fill={MASCOT_INK.line}
      />
    </g>
  );
}

/** The tail — one flat shape per form, drawn behind everything else. */
function Tail({ colors, form }: PartProps): ReactElement | null {
  const stroke = {
    fill: "none" as const,
    stroke: colors.bodyTop,
    strokeLinecap: "round" as const,
  };
  switch (form) {
    case "cat":
      return <path d="M 120 124 C 142 124 150 106 144 92" {...stroke} strokeWidth={7} />;
    case "pig":
      // A corkscrew, as one open curve. Two turns would be a texture at this
      // size; one is a shape.
      return <path d="M 120 120 C 132 116 136 106 128 104 C 122 103 121 110 127 112" {...stroke} strokeWidth={4.5} />;
    case "mouse":
      return <path d="M 120 128 C 146 132 156 118 150 104" {...stroke} strokeWidth={3.4} />;
    case "rooster":
      // Three overlapping blades, in the coat's own dark. The count is the
      // point — one blade is a stub and four is a peacock.
      return (
        <g fill={colors.bodyBottom}>
          <ellipse cx={130} cy={112} rx={17} ry={6} transform="rotate(-40 130 112)" />
          <ellipse cx={136} cy={116} rx={15} ry={5.5} transform="rotate(-22 136 116)" />
          <ellipse cx={138} cy={122} rx={13} ry={5} transform="rotate(-6 138 122)" />
        </g>
      );
    case "goat":
      return <ellipse cx={122} cy={118} rx={7} ry={5} fill={colors.bodyTop} />;
    case "dog":
    default:
      return <path d="M 119 122 C 134 122 140 112 134 104" {...stroke} strokeWidth={6} />;
  }
}

/**
 * The villager's clothes, which are three flat blocks and no seams.
 *
 * The coat is an **A-line**: 22 units across at the chest and 30 at the hem.
 * That flare is doing the work a fold, a button row and a pocket would
 * otherwise be asked to do — a rectangle under a head is a torso, and the same
 * rectangle widened at the bottom is a garment. It is also the one cue that
 * survives the 40px bust crop being thrown away, because it lives in the
 * silhouette rather than on it.
 *
 * The collar is a paper-coloured trapezoid over the coat's shoulders, and it
 * is the single most Kunnas-ish thing in the drawing: every figure on those
 * pages has a white collar or a white apron between its face and its garment.
 * On a dark page it is also structural — a warm off-white band directly under
 * the head keeps the face from sitting straight on top of a mid-value block.
 *
 * The hem reaches y = 134, which is 16 units below the hip, so the legs come
 * out from *under* a coat rather than out of a waistband.
 */
function Body(props: PartProps): ReactElement {
  const { colors } = props;
  const chestHalf = 19;
  const hemHalf = 27;
  const top = 74;
  const hem = 136;
  const coat = [
    `M ${100 - chestHalf} ${top}`,
    `C ${100 - chestHalf - 1} ${top - 8} ${100 - chestHalf + 6} ${top - 12} ${100} ${top - 12}`,
    `C ${100 + chestHalf - 6} ${top - 12} ${100 + chestHalf + 1} ${top - 8} ${100 + chestHalf} ${top}`,
    `L ${100 + hemHalf} ${hem - 8}`,
    `Q ${100 + hemHalf} ${hem} ${100 + hemHalf - 8} ${hem}`,
    `L ${100 - hemHalf + 8} ${hem}`,
    `Q ${100 - hemHalf} ${hem} ${100 - hemHalf} ${hem - 8}`,
    "Z",
  ].join(" ");
  return (
    <g>
      <Tail {...props} />
      {/* The neck. Short and narrow — it is the gap between a big head and a
          narrow body, and without it the collar has nothing to sit on. */}
      <rect x={93} y={56} width={14} height={22} rx={5} {...edge(colors.bodyTop, colors)} />
      <path d={coat} {...edge(colors.clothing, colors)} />
      {/* The collar, and two drafts' worth of why it is this shape.
          It started as a full bib — the apron every figure on those pages
          wears — and at 200px that was a white shield covering the whole
          chest, which turned the coat into a background for it. The second
          draft was a small band at the neck, which floated above the coat's
          own shoulder line and read as a sticker. This is the third: a wide
          shallow V with a notch cut out of the middle, sitting *on* the
          coat's shoulders and pointing at the chin. A notch is what separates
          a collar from a bandage, and it is the one piece of tailoring in the
          drawing — everything else a coat has (buttons, a placket, a cuff)
          is under half a pixel at 40px and is not drawn at all.
          It is the paper constant rather than a colour slot, so it matches
          the trim on the house behind it. */}
      <path
        d={`M ${100 - 9} ${top - 5} L ${100 + 9} ${top - 5} L ${100 + 16} ${top + 9} L ${100} ${top + 4} L ${100 - 16} ${top + 9} Z`}
        fill={MASCOT_INK.paper}
      />
    </g>
  );
}

function Head(props: PartProps): ReactElement {
  const { rig, colors, form } = props;
  const { x, y, r } = rig.head;
  const hw = halfWidth(form);
  const snout = snoutOf(form);
  const skull = <ellipse cx={x} cy={y} rx={hw} ry={r} {...edge(colors.bodyTop, colors)} />;

  switch (form) {
    case "cat":
      return (
        <g>
          <path
            d={`M ${x - hw + 3} ${y - r * 0.55} L ${x - hw - 3} ${y - r * 1.6} L ${x - 3} ${y - r * 0.95} Z`}
            {...edge(colors.bodyTop, colors)}
          />
          <path
            d={`M ${x + hw - 3} ${y - r * 0.55} L ${x + hw + 3} ${y - r * 1.6} L ${x + 3} ${y - r * 0.95} Z`}
            {...edge(colors.bodyTop, colors)}
          />
          <path
            d={`M ${x - hw + 3.5} ${y - r * 0.72} L ${x - hw - 0.5} ${y - r * 1.36} L ${x - 6} ${y - r * 0.98} Z`}
            fill={colors.panel}
          />
          <path
            d={`M ${x + hw - 3.5} ${y - r * 0.72} L ${x + hw + 0.5} ${y - r * 1.36} L ${x + 6} ${y - r * 0.98} Z`}
            fill={colors.panel}
          />
          {skull}
          <Snout x={x} y={y + r * snout.cy} w={snout.w} h={snout.h} noseW={snout.noseW} colors={colors} />
        </g>
      );
    case "pig":
      return (
        <g>
          {/* Ears tipped forward, which is the one thing that stops a round
              head with a disc on it reading as a bear cub. */}
          <path
            d={`M ${x - hw + 2} ${y - r * 0.9} L ${x - hw - 9} ${y - r * 0.34} L ${x - hw + 8} ${y - r * 0.24} Z`}
            {...edge(colors.bodyTop, colors)}
          />
          <path
            d={`M ${x + hw - 2} ${y - r * 0.9} L ${x + hw + 9} ${y - r * 0.34} L ${x + hw - 8} ${y - r * 0.24} Z`}
            {...edge(colors.bodyTop, colors)}
          />
          {skull}
          {/* The one face here whose nose block splits in two. A single black
              rectangle on a disc this big reads as a dog's nose stuck on a
              pig; two nostrils are what make the disc a snout, and they are
              geometry rather than a realism cue. */}
          <rect x={x - 13} y={y + r * 0.24} width={26} height={16} rx={7.5} {...edge(colors.panel, colors)} />
          <rect x={x - 7.5} y={y + r * 0.34} width={5} height={7.5} rx={2.4} fill={MASCOT_INK.line} />
          <rect x={x + 2.5} y={y + r * 0.34} width={5} height={7.5} rx={2.4} fill={MASCOT_INK.line} />
        </g>
      );
    case "goat":
      return (
        <g>
          {/* Horns first, so the skull covers their roots. Two strokes sweeping
              up and back — a filled horn at this size is a mitten. */}
          <g
            fill="none"
            stroke={colors.bodyBottom}
            strokeWidth={5}
            strokeLinecap="round"
          >
            <path d={`M ${x - 8} ${y - r * 0.86} C ${x - 14} ${y - r * 1.5} ${x - 20} ${y - r * 1.5} ${x - 22} ${y - r * 1.1}`} />
            <path d={`M ${x + 8} ${y - r * 0.86} C ${x + 14} ${y - r * 1.5} ${x + 20} ${y - r * 1.5} ${x + 22} ${y - r * 1.1}`} />
          </g>
          {/* Ears straight out sideways, which no other form here does. */}
          <ellipse cx={x - hw - 7} cy={y - r * 0.1} rx={11} ry={4.5} {...edge(colors.bodyTop, colors)} />
          <ellipse cx={x + hw + 7} cy={y - r * 0.1} rx={11} ry={4.5} {...edge(colors.bodyTop, colors)} />
          {skull}
          <Snout x={x} y={y + r * snout.cy} w={snout.w} h={snout.h} noseW={snout.noseW} colors={colors} />
          {/* No beard. It was drawn — one wedge under the jaw — and it
              failed its own test twice over: with the snout at its measured
              size the wedge starts below the chin and lands on the collar, and
              taking it off leaves a head with swept-back horns and two ears
              straight out sideways, which nothing else in the fleet has and
              nobody could mistake for anything but a goat. A detail whose
              removal leaves the form nameable was an embellishment. */}
        </g>
      );
    case "rooster":
      return (
        <g>
          {/* The comb: three lobes, the loud colour, above the crown line. */}
          <g fill={colors.accent}>
            <circle cx={x - 8} cy={y - r * 1.02} r={5.2} />
            <circle cx={x} cy={y - r * 1.22} r={5.6} />
            <circle cx={x + 8} cy={y - r * 1.02} r={5.2} />
          </g>
          {skull}
          {/* The only form whose landmark is a colour rather than a black
              block, and it took a rewrite to get there. The first version put
              a big beak straight on the face and the mouth glyph underneath
              it, and the two read as a nose cone over a beard. This one keeps
              the family's grammar exactly — a pale block low on the face, one
              loud shape at the top of it, the mouth below — and only swaps
              the black rectangle for an orange wedge, because a rooster's beak
              is the one part of a bird everybody can name and it is not black.
              The comb and the wattle are the same loud colour, so the three of
              them read as one feature the head is wearing. */}
          <rect x={x - 10} y={y + r * 0.16} width={20} height={17} rx={7} {...edge(colors.panel, colors)} />
          <path
            d={`M ${x - 7} ${y + r * 0.24} L ${x + 7} ${y + r * 0.24} L ${x} ${y + r * 0.66} Z`}
            fill={colors.accent}
          />
          {/* No wattle. Drawn and removed: at the snout's measured size it
              lands under the mouth glyph and reads as a small orange beard,
              and the comb plus the beak already name the animal from across
              the room. */}
        </g>
      );
    case "mouse":
      return (
        <g>
          <circle cx={x - hw - 2} cy={y - r * 0.72} r={11} {...edge(colors.bodyTop, colors)} />
          <circle cx={x + hw + 2} cy={y - r * 0.72} r={11} {...edge(colors.bodyTop, colors)} />
          <circle cx={x - hw - 2} cy={y - r * 0.68} r={6} fill={colors.panel} />
          <circle cx={x + hw + 2} cy={y - r * 0.68} r={6} fill={colors.panel} />
          {skull}
          <Snout x={x} y={y + r * snout.cy} w={snout.w} h={snout.h} noseW={snout.noseW} colors={colors} />
        </g>
      );
    case "dog":
    default:
      return (
        <g>
          {/* Two small folded flaps, high and wide. This is the guardrail made
              geometry: the famous dog's ear is a long teardrop hanging past
              the jaw, and this one is a short triangle that stops level with
              the eyes. */}
          <path
            d={`M ${x - hw + 4} ${y - r * 0.78} L ${x - hw - 8} ${y - r * 0.5} L ${x - hw - 1} ${y + r * 0.06} Z`}
            {...edge(colors.bodyTop, colors)}
          />
          <path
            d={`M ${x + hw - 4} ${y - r * 0.78} L ${x + hw + 8} ${y - r * 0.5} L ${x + hw + 1} ${y + r * 0.06} Z`}
            {...edge(colors.bodyTop, colors)}
          />
          {skull}
          <Snout x={x} y={y + r * snout.cy} w={snout.w} h={snout.h} noseW={snout.noseW} colors={colors} />
        </g>
      );
  }
}

export const KYLA: ConceptDef = {
  id: "kyla",
  species: "Kylä",
  kind: "Village animals — one rig, six trades, human proportions",
  origin: "fresh",
  pitch:
    "Animals as villagers: three and a half heads tall, human hands, real clothes with a cut, each one with a trade. It is our fleet idea taken literally — the introducer, the gamer's helper, the parent's helper and the Gedu are not four colourways of one creature, they are four neighbours who do four jobs, and the village they share is a scene the drawing can actually show. It is also the only concept here built to be seen three at a time: the studies put a group in front of a red board house because a crowded warm frame is what the lineage this learns from does best, and because a page with three characters busy in it says more about School of Gaming than one character standing alone ever has.",
  caveat:
    "The proportion is the risk. A person's proportion means a small head, and a small head means a small face — everything expressive about this species lives in a 46-unit circle instead of Otso's 80-unit one, so it is the concept most dependent on the bust crop for its avatar and the one that gains least from a big hero render. It also sits closest to a very famous body of work, which is why the dog is built the way it is and why the guardrails are written at the drawing rather than in a brief somebody will not read.",
  landmark:
    "The black nose block — the only pure dark on the character, drawn at four fifths of an eye — on a pale snout, under two whites that nearly touch.",
  slots: ["hat", "face", "torso", "back", "extra", "scene"],
  wardrobeLimit:
    "The goat's horns and the rooster's comb stand above their own crown lines, so a hat on those two reads as worn under the landmark rather than over it — the same trade Otso's elk makes, and the right one, because the landmark is the identity. Everything else fits: the head is small, so a hat that would swamp a cub sits on a villager the way a hat sits on a person.",
  rig: BASE,
  forms: KYLA_FORMS,
  rigFor,
  faceMode: "eyes",
  variants: KYLA_VARIANTS,
  // Sleeves and trousers, bare paws, and a boot in the garment's own dark.
  // Nothing on this species paints a limb from the coat: the reference's
  // clothes stop at the wrist and the ankle, and that boundary is most of what
  // makes a dressed animal read as dressed rather than as painted.
  limbs: (c) => ({
    // The sleeve is the coat taken down a fifth. Painting it the coat's own
    // colour is what the first raster did and the arm vanished into the body
    // — two shapes of one colour with no line between them is one shape.
    arm: shadeHex(c.clothing, 0.2),
    leg: c.clothingAccent,
    hand: c.bodyTop,
    foot: c.spark,
  }),
  Body,
  Head,
  fleet: [
    {
      name: "Vilja",
      job: "The introducer — home hero, the face of the brand",
      variantId: "okra",
      form: "goat",
      role: "none",
      pose: "wave",
      expression: "happy",
      outfit: { scene: "village" },
      blurb:
        "The one at the gate. Vilja means grain, which is what a village is for, and a goat is the animal that greets you whether or not you wanted greeting. She is the only fleet member who ships with the scene attached, because the introducer is the picture of the place as much as the person in it.",
    },
    {
      name: "Tarmo",
      job: "The herald — announcements, release notes, the news bar",
      variantId: "savi",
      form: "rooster",
      role: "none",
      pose: "hold-up",
      expression: "excited",
      prop: "sign",
      garment: "red",
      blurb:
        "The rooster announces things; it is the entire job description and nobody has ever improved on it. Comb up, sign up, and the loudest colour in his colourway spent on the two bits of him that are meant to be loud.",
    },
    {
      name: "Piki",
      job: "Gamer helper — clubs, camps, the gamer dashboard",
      variantId: "tervas",
      form: "cat",
      role: "gamer",
      pose: "controller",
      expression: "excited",
      blurb:
        "Cool-toned where every other villager is warm, headset on, controller up. The cat is the villager who is good at the thing and slightly smug about it, which is the correct energy for the one who meets a nine-year-old first.",
    },
    {
      name: "Sulo",
      job: "Parent helper — schedules, pickups, the family calendar",
      variantId: "karpalo",
      form: "pig",
      role: "parent",
      pose: "idle",
      expression: "happy",
      prop: "mug",
      garment: "teal",
      blurb:
        "The baker, and the villager everyone actually goes to. A mug, a scarf, and the calmest face in the fleet — the one who tells you the club is at six and that it is fine.",
    },
    {
      name: "Aarne",
      job: "Gedu expert — training, session write-ups, the docs",
      variantId: "kaura",
      form: "dog",
      role: "gedu",
      pose: "reading",
      expression: "thinking",
      blurb:
        "The village schoolmaster. Oat-coloured, spectacles on, lanyard round the neck, always halfway through a book he will tell you about. Short snout and small folded ears: this is the dog that is not the other dog.",
    },
    {
      name: "Nyppy",
      job: "The welcome — event pages, the welcome mail, anything with a room to warm up",
      variantId: "sammal",
      form: "mouse",
      role: "none",
      // Held across the body in both hands rather than raised. Rasterised
      // both ways: raised, the kantele is a tray carried at arm's length;
      // across the body it is an instrument being played, which is the whole
      // difference between a prop and a character doing something.
      pose: "reading",
      expression: "happy",
      prop: "kantele",
      blurb:
        "The smallest villager and the one who plays. A kantele is a Finnish thing to be holding rather than a Finnish thing to be — five strings on a flat box, and a mouse just big enough to carry it. She is also the scale joke the ensemble needs: every crowded page in the lineage has one character a third of everyone else's size, doing something entirely of their own.",
    },
  ],
};
