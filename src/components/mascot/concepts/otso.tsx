/**
 * Otso — the cub, and the fifteen animals that turned out to be the same drawing.
 *
 * Otso is the old Finnish name for the bear, used when you did not want to say
 * the bear's real name out loud. Ours is a round cub with ears too big for its
 * head, which is the single cheapest way to make a shape read as young,
 * harmless and pleased to see you.
 *
 * ## Why this is a family and not sixteen concepts
 *
 * Round one's note said an animal-per-role fleet was "charming and completely
 * unmaintainable: five species means five pose sheets". That was wrong, and
 * the reason it was wrong is worth writing down, because it is the same
 * mistake anyone would make again.
 *
 * A pose sheet is not per *animal*. It is per **body plan**. A bear, a fox, a
 * lynx, a hare, a moose and an owl are all "round torso, four limbs, head on
 * top" — they differ above the neck and in one appendage. Once the pose table,
 * the limbs, the wardrobe and the animation are shared, an extra species costs
 * a head and a tail: about thirty lines. Fifteen of them cost less than two of
 * round one's concepts did.
 *
 * The Saimaa ringed seal is the exception that proves the rule — it has no
 * ears, no visible legs and no tail worth drawing, so it is the one whose
 * silhouette genuinely fights the rig. It is here anyway because it is the
 * most Finnish animal on the list and because a fleet needs one member that is
 * shaped wrong on purpose.
 *
 * ## The second cohort, and the rule that let it in
 *
 * The first seven were picked as Finnish fauna, and the page said so, and that
 * turned into a rule nobody had actually made: three of the old SOG cast were
 * refused as "not Finnish". Kyle's ruling (2026-08-23) is the opposite one and
 * it is worth quoting the shape of it — School of Gaming is proud to be a
 * Finnish company and highlights Finnish nature where it can, *and* it is a
 * global company that loves every animal including the invented ones. So a
 * raccoon is a raccoon, a giraffe and a unicorn are welcome, and nothing here
 * gets refused for its passport.
 *
 * What everything here still gets refused for is **realism cues**. Several of
 * the legacy drawings have teeth — the bug's fangs, the beaver's incisors
 * everyone expects, the hare's buck teeth that were already cut once. A tooth
 * is the fastest way to drag a symbol face into the uncanny valley, so each of
 * those animals is carried by geometry instead: an ear shape, a tail, a
 * silhouette that is lumpy on purpose. Where that cost something, it is said
 * so at the drawing.
 *
 * ## A thing a form may not do
 *
 * Nothing in here may be an accessory. A wing, an antenna, a horn or a mask is
 * *the animal*, not its clothing: it belongs to `Head` or `Body` so that it
 * survives every outfit, cannot be taken off in a customiser, and repaints
 * with the colourway rather than with the garment slots. The dividing line is
 * whether the character would still be that animal without it.
 *
 * ## The simplicity pass (2026-08-23)
 *
 * Sixteen forms is sixteen chances to add one more mark, and the file had
 * taken most of them. What came off, and why each one failed the 40px test:
 *
 * **Removed everywhere:** the soft body sheen (a pale ellipse on the shoulder —
 * a gloss cue, on fifteen forms at once), the muzzle philtrum, and the whiskers.
 * The whiskers are the one removal that touches an earlier explicit permission
 * — the MoodyRat brief allowed "whiskers-as-two-lines … they are geometry, not
 * realism" — and the later simplicity ruling is what moves them: they are four
 * hairline strokes at fifty-five per cent behind `showsFiligree`, so they exist
 * only above 96px and are absent from the test picture entirely. The rat still
 * has the ears, the pointed muzzle and the curling tail, which is what the same
 * brief said was doing the identifying.
 *
 * **Removed per form:** the seal's belly speckles and the owl's and great tit's
 * chest arcs (texture on a chest); the owl's brow feather ticks; the raccoon's
 * and the leopard's dashed tail bands (a dash pattern is a texture, and at 40px
 * both tails were a dotted line rather than a ringed one — each is now one flat
 * colour, which is what the ruling asks for when a removed detail was doing a
 * job); the leopard's rosettes on the head and the giraffe's two cheek patches
 * (four and two rings of two-and-a-half-unit stroke, sub-pixel at 40px, on
 * animals whose ears and neck already name them); the unicorn's two horn bands
 * and its nostril pips; the fox's tail highlight; and the outline stroke around
 * the bug's four wings.
 *
 * **Tested and kept, because removing them broke the read:** the owl's disc
 * rims. They are the file's loudest "surely that is decoration" and they are
 * not — a rimless owl is two pale circles on a round head, which is what the
 * pre-disc version was and it read as a *cat*. The single dipped disc with a
 * hard edge is the landmark. Also kept: the leopard's *body* rosettes and the
 * giraffe's *body* and *neck* patches, which were already gated one level
 * looser than filigree for exactly this reason and are still visible at 40px;
 * the great tit's black stripe and cap; the raccoon's mask; the fox's and
 * lynx's cheek ruffs (they are in the silhouette); the monster's lumpy edge;
 * the ear inner shapes, which are one flat block per ear and are half of what
 * separates a bear's discs from a rat's saucers at portrait size; and every
 * muzzle and its nose, which is the family's shared colour block and the thing
 * a mouth glyph is drawn under.
 */

import type { ReactElement } from "react";

import type { ConceptDef, FormDef, PartProps } from "../concept";
import {
  markingHex,
  MASCOT_INK,
  OTSO_CAST_VARIANTS,
  OTSO_CUTE_VARIANTS,
  OTSO_VARIANTS,
  REKSI_VARIANTS,
} from "../palette";
import type { Rig } from "../rig";

export const OTSO_FORMS: readonly FormDef[] = [
  { id: "bear", label: "Karhu — bear", note: "The flagship. Two oversized ear circles." },
  { id: "fox", label: "Kettu — fox", note: "Sharp ears, ruffed cheeks, an enormous tail." },
  { id: "moose", label: "Hirvi — elk", note: "Palmate antlers. The widest silhouette here." },
  { id: "owl", label: "Pöllö — owl", note: "A rimmed facial disc and a beak. No muzzle at all." },
  { id: "lynx", label: "Ilves — lynx", note: "Tufted ears and a ruff. The cool one." },
  { id: "hare", label: "Jänis — hare", note: "Ears twice the height of the head." },
  { id: "seal", label: "Norppa — ringed seal", note: "No ears, no tail, flippers. The odd one." },
  {
    id: "raccoon",
    label: "Pesukarhu — raccoon",
    note: "The bandit mask, a ruff and a fat curl of tail. R Osmo, honestly translated.",
  },
  {
    id: "giraffe",
    label: "Kirahvi — giraffe",
    note: "The only form with a neck. Ossicones and patches finish it.",
  },
  {
    id: "unicorn",
    label: "Yksisarvinen — unicorn",
    note: "Horn, mane, long muzzle. The one animal here that never existed.",
  },
  {
    id: "leopard",
    label: "Leopardi — leopard",
    note: "Body rosettes and a long curled tail — what the lynx's stub cannot do.",
  },
  {
    id: "bug",
    label: "Pörriäinen — bug",
    note: "Four wings, two antennae, and eyes that take up most of the head.",
  },
  {
    id: "monster",
    label: "Möröhtiäinen — monster",
    note: "A lumpy edge instead of fur, antennae, and a pair of small wings.",
  },
  {
    id: "tit",
    label: "Tiainen — great tit",
    note: "Black cap, cream cheeks, yellow front. The small bird.",
  },
  {
    id: "rat",
    label: "Rotta — rat",
    note: "Ears half the width of the head, a long pointed muzzle, a curling tail.",
  },
  {
    id: "beaver",
    label: "Majava — beaver",
    note: "The paddle tail does all of it, because the incisors are not allowed.",
  },
  {
    id: "gull",
    label: "Lokki — gull",
    note: "A grey mantle over a pale body and a long gold bill. Wants the frost coat.",
  },
  {
    id: "rex",
    label: "Reksi — T-rex",
    note: "A head half the length of the animal, a square jaw, a scalloped back and no ears.",
  },
  {
    id: "penguin",
    label: "Pingviini — penguin",
    note: "A dark hood over a pale face and belly, flipper arms and a small triangular beak.",
  },
  {
    id: "otter",
    label: "Saukko — otter",
    note: "A sleek head, tiny ears, a broad pale muzzle and a thick tail curling forward.",
  },
  {
    id: "hedgehog",
    label: "Siili — hedgehog",
    note: "One scalloped mantle behind a pale face. The only form whose back is the landmark.",
  },
];

/**
 * The family's coats: the original three, then the seven mixed for the second
 * cohort. Order matters — `honey` stays first, so it stays the default.
 */
const OTSO_ALL_VARIANTS = [
  ...OTSO_VARIANTS,
  ...OTSO_CAST_VARIANTS,
  ...REKSI_VARIANTS,
  ...OTSO_CUTE_VARIANTS,
];

const BASE: Rig = {
  shadow: { cx: 100, cy: 186, rx: 42, ry: 7 },
  hip: { x: 100, y: 150 },
  hipSpread: 19,
  footY: 180,
  footStyle: "round",
  shoulderL: { x: 66, y: 120 },
  shoulderR: { x: 134, y: 120 },
  head: { x: 100, y: 70, r: 40 },
  eyeDx: 16,
  eyeY: 64,
  eyeR: 7.5,
  mouthY: 91,
  crown: { x: 100, y: 44 },
  crownW: 58,
  reach: 6,
  limbW: 12,
  handR: 10,
  // A round animal has no visible elbow, and giving it one turns a cub into a
  // small bodybuilder. Soft noodle limbs, all sixteen of them.
  limbStyle: "tapered",
  armLen: 44,
  legLen: 36,
  torso: { x: 68, y: 112, w: 64, h: 46 },
  fusedHead: false,
};

/**
 * Only the hat line, the head and the eyes move between species.
 *
 * ## How high a head is allowed to go
 *
 * The giraffe forced the question the rest of the family never had to ask, so
 * the answer is written down here once. Three things bound it:
 *
 * - **A hat needs about 26 units above `crown.y`.** The beanie is the tallest
 *   of the ordinary ones and it peaks roughly there; the santa and witch hats
 *   want more.
 * - **The `jumping` pose lifts the whole character 22 units**, and the hat
 *   goes with it.
 * - **The canvas stops at y = 0.**
 *
 * So a crown at 26 (the elk's) clears its hat standing still and clips it in a
 * jump; a crown at 20 (the hare's) is already the practical floor, and every
 * unit below that is a hat leaving the frame. **The giraffe is set at 24** —
 * between the two, no higher than a species already in the family — and buys
 * its neck by *shrinking the head to r = 23* rather than by climbing.
 *
 * That turned out to be the better lever twice over. The avatar crop window is
 * `head.r * 3.6` wide, so a smaller head is a tighter window: at 40px the
 * giraffe shows its ossicones, its head and the whole neck down to the
 * shoulders, where a big head raised to the same silhouette height would have
 * portrayed as a head floating in empty sky. And a neck reads by *contrast* —
 * it is a column narrower than the head above it and the body below it — so
 * making the head small lengthens the neck and thins it in one move.
 *
 * The ossicone knobs still finish about eight units above the crown line,
 * which is the same relationship the elk's antler tines have. Both clip the
 * top of the canvas in `jumping`; that is a known system-wide issue with tall
 * headgear rather than anything these two forms introduced.
 */
function rigFor(form: string): Rig {
  switch (form) {
    case "moose":
      return { ...BASE, crown: { x: 100, y: 26 }, crownW: 74 };
    case "hare":
      return { ...BASE, crown: { x: 100, y: 20 }, crownW: 40, head: { x: 100, y: 72, r: 36 } };
    case "owl":
      return { ...BASE, crown: { x: 100, y: 36 }, crownW: 62, eyeDx: 17, eyeR: 10.5, mouthY: 88 };
    case "seal":
      return {
        ...BASE,
        crown: { x: 100, y: 38 },
        crownW: 52,
        head: { x: 100, y: 72, r: 37 },
        mouthY: 92,
      };
    case "fox":
    case "lynx":
      return { ...BASE, crown: { x: 100, y: 40 }, crownW: 54 };
    case "raccoon":
      return { ...BASE, crown: { x: 100, y: 40 }, crownW: 54, mouthY: 90 };
    case "leopard":
      return { ...BASE, crown: { x: 100, y: 42 }, crownW: 50, head: { x: 100, y: 70, r: 37 }, mouthY: 88 };
    case "giraffe":
      return {
        ...BASE,
        head: { x: 100, y: 43, r: 23 },
        eyeDx: 10,
        eyeY: 38,
        eyeR: 6.5,
        mouthY: 61,
        crown: { x: 100, y: 24 },
        crownW: 36,
      };
    case "unicorn":
      return {
        ...BASE,
        head: { x: 100, y: 68, r: 36 },
        eyeDx: 15,
        eyeY: 62,
        eyeR: 7.5,
        mouthY: 90,
        crown: { x: 100, y: 34 },
        crownW: 48,
      };
    case "bug":
      return {
        ...BASE,
        // Four wings. It hovers at rest for the same reason a bug does.
        hovers: true,
        head: { x: 100, y: 70, r: 36 },
        // The one form whose eyes are the head rather than features on it.
        eyeDx: 19,
        eyeY: 66,
        eyeR: 12,
        mouthY: 94,
        crown: { x: 100, y: 34 },
        crownW: 46,
      };
    case "monster":
      return {
        ...BASE,
        // A pair of small wings, and no interest in using the floor.
        hovers: true,
        head: { x: 100, y: 70, r: 37 },
        eyeDx: 17,
        eyeY: 64,
        eyeR: 10,
        mouthY: 92,
        crown: { x: 100, y: 36 },
        crownW: 52,
      };
    case "tit":
      return {
        ...BASE,
        head: { x: 100, y: 72, r: 34 },
        eyeDx: 13,
        eyeY: 66,
        eyeR: 7,
        mouthY: 92,
        crown: { x: 100, y: 42 },
        crownW: 46,
      };
    // The tit's skull, with a slightly smaller eye: a gull's is small and hard
    // where a songbird's is not, and it is the only proportion separating the
    // two heads once the cap and the mantle are off.
    case "gull":
      return {
        ...BASE,
        head: { x: 100, y: 72, r: 34 },
        eyeDx: 13,
        eyeY: 66,
        eyeR: 6.5,
        mouthY: 92,
        crown: { x: 100, y: 42 },
        crownW: 46,
      };
    case "rat":
      return {
        ...BASE,
        head: { x: 100, y: 68, r: 33 },
        eyeDx: 15,
        eyeY: 60,
        eyeR: 7,
        mouthY: 90,
        crown: { x: 100, y: 40 },
        crownW: 50,
      };
    case "beaver":
      return { ...BASE, crown: { x: 100, y: 44 }, crownW: 56, mouthY: 90 };
    // A round skull, two units bigger than the songbirds' and set at the
    // family's own height: the reference's head is 418 units of face across
    // 310 of height, so the one proportion to respect is that this bird's head
    // is *wide* rather than tall, and the pale face block is where that gets
    // said. The eyes stay the family's size — a penguin's are small and dark
    // on a big pale face, and shrinking them here loses the only feature the
    // face block has in it.
    case "penguin":
      return {
        ...BASE,
        head: { x: 100, y: 70, r: 36 },
        eyeDx: 14,
        eyeY: 64,
        eyeR: 7.5,
        mouthY: 92,
        crown: { x: 100, y: 38 },
        crownW: 50,
      };
    // Sleeker than the beaver it has to be told apart from: the same head
    // radius, drawn wider than tall, with the ears small and *high* where the
    // beaver's are small and low. The tail does the rest.
    case "otter":
      return {
        ...BASE,
        head: { x: 100, y: 72, r: 34 },
        eyeDx: 14,
        eyeY: 66,
        eyeR: 7,
        mouthY: 94,
        crown: { x: 100, y: 42 },
        crownW: 48,
      };
    /**
     * The small face inside a big mantle.
     *
     * `head.r` is 30 — the smallest in the family after the giraffe's — and
     * that is the whole build: the mantle is drawn at 108 units across, so a
     * head any bigger fills its own hood and the scallops stop showing above
     * it. It buys the same thing the giraffe's small head bought, for the same
     * reason: the avatar window is 3.6 head-radii wide, so a small head is a
     * tight crop, and at 40px the bust is the mantle's arc with a face under
     * it rather than a face with two bumps beside it.
     *
     * `crown` sits at 52 — level with the top of the skull rather than with
     * the top of the mantle — so a hat lands *on the head*, in front of the
     * spines, which is where a hedgehog would have to put one.
     */
    case "hedgehog":
      return {
        ...BASE,
        head: { x: 100, y: 78, r: 30 },
        eyeDx: 12,
        eyeY: 74,
        eyeR: 7,
        mouthY: 104,
        crown: { x: 100, y: 52 },
        crownW: 44,
      };
    /**
     * The one build in the family whose *proportion* is the animal.
     *
     * Everything else here is told apart above the neck. A T-rex is told apart
     * by the ratio: the head is 90 units across where the bear's is 80, and the
     * torso is 52 across where the bear's is 72, so the head goes from being
     * one and a bit times the body's width to nearly twice it. That is the
     * single measurement anyone would name from the legacy drawings, and it is
     * the one that survives to 28px — where the head is most of the picture and
     * the body is a stalk under it.
     *
     * The head is drawn as an ellipse at 0.86 of its radius in y, so `head.r`
     * being 45 puts the skull's top at y=25 and the crown line 15 units under
     * it, which is the same clearance the bear's has. The jaw hangs four units
     * below the skull, which is what a beard then hangs off.
     *
     * The arms are the honest part. `armLen` only decides where the elbow goes
     * — the hand lands wherever the pose table put it — so a genuinely
     * comic tiny arm is not available without a per-species pose table, which
     * is the thing this directory exists to avoid. What is available is
     * everything else about them: sockets pulled in to the narrow torso, a
     * thinner limb, a smaller hand, and a negative `reach` that tucks a
     * hanging hand back towards the body instead of pushing it out. The result
     * is a short thin forelimb rather than a two-fingered stub, and that is
     * the trade this build makes.
     */
    case "rex":
      return {
        ...BASE,
        // `head.r` is the *crop* radius rather than half the skull — the
        // avatar window is 3.6 of it across and square, and this is the one
        // build in the family whose head is much wider than it is tall. Left
        // at half the drawn width the bust came out as a full-body shot with
        // the tail in it; 36 puts the skull across about seventy per cent of
        // the portrait, which is where every other form in the family sits.
        // The drawing multiplies it back up.
        head: { x: 100, y: 64, r: 36 },
        eyeDx: 22,
        eyeY: 48,
        eyeR: 8.5,
        mouthY: 99,
        crown: { x: 100, y: 34 },
        crownW: 66,
        shoulderL: { x: 81, y: 120 },
        shoulderR: { x: 119, y: 120 },
        hip: { x: 100, y: 154 },
        hipSpread: 15,
        armLen: 24,
        limbW: 10.5,
        handR: 7,
        reach: -2,
        shadow: { cx: 100, cy: 186, rx: 34, ry: 6 },
      };
    case "bear":
    default:
      return BASE;
  }
}

/**
 * Patches, rosettes and other flat markings.
 *
 * They are gated on `detail !== "icon"` rather than on `showsFiligree`, which
 * is the opposite of every other decoration in this file, and deliberately: a
 * giraffe without patches is a yellow animal and a leopard without rosettes is
 * a pink cat. These are not filigree, they are half the identification, so
 * they survive one level further down than a whisker does.
 */
const GIRAFFE_BODY_PATCHES: readonly (readonly [number, number, number])[] = [
  [84, 120, 8],
  [112, 116, 7],
  [100, 138, 8.5],
  [78, 142, 6],
  [122, 140, 6.5],
];

const GIRAFFE_NECK_PATCHES: readonly (readonly [number, number, number])[] = [
  [95, 100, 5],
  [106, 88, 4.5],
  [95, 76, 4],
  [105, 65, 3.5],
];

const LEOPARD_BODY_ROSETTES: readonly (readonly [number, number, number])[] = [
  [80, 122, 5],
  [104, 113, 4.5],
  [120, 130, 5],
  [86, 144, 4.5],
  [110, 148, 4],
];

/**
 * The T-rex's back, as five discs on the tail's upper edge — biggest at the
 * shoulder, smallest at the tip. Drawn behind everything, so each one is a
 * scallop rather than a circle.
 */
const REX_RIDGE: readonly (readonly [number, number, number])[] = [
  [120, 116, 11],
  [141, 111, 9.5],
  [159, 109, 8],
  [175, 109, 6.5],
  [188, 113, 5],
];

/**
 * The hedgehog's mantle: one scalloped arch, drawn as a contour rather than as
 * a field of spikes.
 *
 * The arch is the upper half of an ellipse at `cx 100, cy 142, rx 54, ry 104`
 * — 108 units across against the family's 72-unit torso, so eighteen units of
 * it stand clear on each side, and its crown at y = 38 is ten above the top of
 * the skull. Nine bumps, each a quadratic whose control point sits a third of
 * the way along rather than halfway, so the crest leans back the way a
 * hedgehog's spines do; that asymmetry is what keeps the outline off a cloud.
 *
 * **Why a contour and not spikes, and why nine.** Individual spikes are
 * texture: they die at 40px and they break the simplicity rule twice over. A
 * wobble in the *outline* is silhouette, so it survives every size — which is
 * also the conclusion the forest hedgehog in the pen-line species reached
 * independently, from the same brief.
 *
 * Nine bumps at seven units of crest is also the whole disambiguation from the
 * monster, the family's other lumpy form. That one is a ring of *fifteen*
 * seven-unit lobes all the way around a floating body, with antennae; this is
 * an arch of nine fourteen-unit scallops standing on the ground with a pale
 * face under it. Rasterised side by side at 40px, halving the lobe count and
 * doubling its size is what separates them.
 */
function scallopedArch(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  bumps: number,
  crest: number,
): string {
  const at = (a: number, orx: number, ory: number): string =>
    `${Math.round((cx + orx * Math.cos(a)) * 100) / 100} ${Math.round((cy - ory * Math.sin(a)) * 100) / 100}`;
  const step = -Math.PI / bumps;
  const parts = [`M ${at(Math.PI, rx, ry)}`];
  for (let i = 0; i < bumps; i += 1) {
    const a0 = Math.PI + step * i;
    parts.push(`Q ${at(a0 + step * 0.32, rx + crest, ry + crest)} ${at(a0 + step, rx, ry)}`);
  }
  // A shallow curve back along the bottom rather than a straight cut: the
  // whole lower edge sits behind the torso, and a hard horizontal line there
  // showed at the two corners where the mantle is wider than the body.
  return `${parts.join(" ")} L 154 148 Q 100 154 46 148 Z`;
}

const SIILI_MANTLE = scallopedArch(100, 142, 54, 104, 10, 10);

/** A ring of discs around an ellipse — a lumpy edge, drawn rather than shaded. */
function Fuzz({
  cx,
  cy,
  rx,
  ry,
  r,
  lobes,
  fill,
}: {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  r: number;
  lobes: number;
  fill: string;
}): ReactElement {
  return (
    <g fill={fill}>
      {Array.from({ length: lobes }, (_unused, i) => {
        const a = (i / lobes) * Math.PI * 2;
        return (
          <circle
            key={i}
            cx={Math.round((cx + Math.cos(a) * rx) * 100) / 100}
            cy={Math.round((cy + Math.sin(a) * ry) * 100) / 100}
            r={r}
          />
        );
      })}
    </g>
  );
}

/**
 * The raccoon's tail. One stroke in one flat colour — it used to be the same
 * path drawn twice, the second copy dashed to band it, and a dash pattern is a
 * texture: at 40px it read as a dotted line rather than as a ringed tail. The
 * mask carries this animal, and the tail is a shape behind it.
 */
const RACCOON_TAIL = "M 133 146 C 155 152 173 141 170 121";

/** The tail — and, for the ones that have them, the wings. Drawn behind the body. */
function Tail({ colors, form }: PartProps): ReactElement | null {
  switch (form) {
    case "fox":
      // One shape. The white tail tip was a second block on a shape three units
      // wide at 40px, where it read as the tail having a frayed end.
      return (
        <path
          d="M 136 146 C 158 146 172 128 168 108 C 166 96 154 94 150 106 C 146 118 142 132 132 138 Z"
          fill={colors.bodyBottom}
        />
      );
    case "hare":
      return <circle cx={140} cy={150} r={11} fill={colors.panel} />;
    case "lynx":
      return (
        <path
          d="M 134 142 C 148 142 152 132 150 124"
          fill="none"
          stroke={colors.bodyBottom}
          strokeWidth={11}
          strokeLinecap="round"
        />
      );
    case "seal":
      return (
        <>
          <ellipse cx={52} cy={152} rx={18} ry={9} fill={colors.bodyBottom} transform="rotate(-22 52 152)" />
          <ellipse cx={148} cy={152} rx={18} ry={9} fill={colors.bodyBottom} transform="rotate(22 148 152)" />
        </>
      );
    case "owl":
    case "tit":
    case "gull":
      return (
        <>
          <path d="M 70 118 C 58 130 60 150 72 158 C 76 146 76 130 74 118 Z" fill={colors.bodyBottom} />
          <path d="M 130 118 C 142 130 140 150 128 158 C 124 146 124 130 126 118 Z" fill={colors.bodyBottom} />
        </>
      );
    case "penguin":
      // The other birds' wing wedges, moved out and lengthened. Drawn at the
      // songbirds' 70/130 they sat almost entirely behind a torso 72 units
      // across and six units of each showed; the reference's flippers reach
      // the full width of the drawing — black from x = 0 to x = 887 on an
      // 888-wide file, against 676 of sweater — so they are the widest thing
      // on the animal and have to stand clear of it. Painted from the same
      // slot as the hood, because a penguin's wings are the same block of
      // colour as its back.
      return (
        <>
          <path d="M 74 112 C 52 122 48 148 62 164 C 70 150 76 130 78 114 Z" fill={colors.bodyBottom} />
          <path d="M 126 112 C 148 122 152 148 138 164 C 130 150 124 130 122 114 Z" fill={colors.bodyBottom} />
        </>
      );
    case "otter":
      // Round in section and tapering, curling forward past the near foot —
      // the one thing that keeps this animal off the beaver's paddle, which is
      // flat, tilted and held clear of the legs. Drawn in `Tail`, so it sits
      // *in front of* the legs and behind the body: the crossing is what makes
      // it read as coming round the front rather than lying beside them.
      return (
        <path
          d="M 124 138 C 158 140 180 158 174 174 C 168 188 138 192 104 184 C 130 182 150 176 150 167 C 149 156 138 148 120 148 Z"
          fill={colors.bodyBottom}
        />
      );
    case "hedgehog":
      // No tail. A hedgehog has one and nobody has ever seen it, and the
      // family's default stub would put a bear's bobble on the one form whose
      // whole back is already spoken for.
      return null;
    case "raccoon":
      return (
        <path
          d={RACCOON_TAIL}
          fill="none"
          strokeLinecap="round"
          stroke={colors.panel}
          strokeWidth={17}
        />
      );
    case "leopard":
      // The long curled tail, one flat colour. The bands came off for the same
      // reason the raccoon's did; the spots on the body are what say leopard.
      return (
        <path
          d="M 133 148 C 160 152 178 137 173 117 C 170 105 158 104 158 115"
          fill="none"
          strokeLinecap="round"
          stroke={colors.bodyTop}
          strokeWidth={11}
        />
      );
    case "giraffe":
      return (
        <g>
          <path
            d="M 133 138 C 146 142 151 152 149 163"
            fill="none"
            stroke={colors.bodyTop}
            strokeWidth={5}
            strokeLinecap="round"
          />
          <circle cx={149} cy={166} r={6} fill={colors.bodyBottom} />
        </g>
      );
    case "unicorn":
      return (
        <g fill="none" stroke={colors.bodyBottom} strokeLinecap="round">
          <path d="M 131 128 C 156 124 176 140 170 163" strokeWidth={17} />
          <path d="M 150 126 C 168 132 176 146 174 158" strokeWidth={11} />
        </g>
      );
    case "rat":
      return (
        <path
          d="M 130 152 C 158 160 178 150 179 132 C 179 121 168 117 165 127"
          fill="none"
          stroke={colors.panel}
          strokeWidth={6}
          strokeLinecap="round"
        />
      );
    case "beaver":
      // The whole animal, structurally. Two front teeth are the cue everyone
      // reaches for and they are teeth, so the paddle has to carry it alone —
      // which means it has to be big enough to read in the silhouette.
      // One big oval on the slant, and nothing ruled across it. The three
      // scutes were two-unit strokes — under half a pixel at 40px — so the
      // paddle was already a bare oval in the picture the test looks at, and
      // the oval, big and tilted and clear of the body, is the beaver.
      return (
        <ellipse
          cx={152}
          cy={158}
          rx={34}
          ry={16}
          fill={colors.bodyBottom}
          transform="rotate(-16 152 158)"
        />
      );
    case "bug":
      // Four flat wings, not four translucent ones. A see-through wing is a
      // material cue, in the same family as an eye highlight.
      //
      // They used to be pale panel shapes with an outline stroke to separate
      // them, and the simplicity pass took the outline off — which merged all
      // four into one cream mass with the belly, and *four* is what the wings
      // are for. So the fix is the one the ruling names: colour, not line. The
      // accent is a different flat colour from anything else on this animal,
      // it already paints the antenna tips and the monster's wings, and the
      // count survives to 40px now in a way it did not with a 1.8-unit stroke.
      return (
        <g fill={colors.accent}>
          <ellipse cx={66} cy={100} rx={27} ry={12} transform="rotate(-36 66 100)" />
          <ellipse cx={134} cy={100} rx={27} ry={12} transform="rotate(36 134 100)" />
          <ellipse cx={70} cy={117} rx={21} ry={9} transform="rotate(-14 70 117)" />
          <ellipse cx={130} cy={117} rx={21} ry={9} transform="rotate(14 130 117)" />
        </g>
      );
    case "monster":
      return (
        <g fill={colors.accent}>
          <path d="M 76 112 C 58 102 50 118 61 130 C 68 137 78 132 79 122 Z" />
          <path d="M 124 112 C 142 102 150 118 139 130 C 132 137 122 132 121 122 Z" />
        </g>
      );
    case "rex":
      // A thick base tapering to a point, and the scalloped back.
      //
      // The scallops are five discs laid along the tail's upper edge and drawn
      // *first*, so the tail and then the body cover their lower halves and
      // what is left showing is a row of soft bumps breaking the outline. That
      // is the same trick the monster's fuzz uses and it is the reason this is
      // a ridge rather than a stripe: at 40px a mark painted on the body has
      // gone and a bump that changes the silhouette has not.
      //
      // Soft bumps, not spikes. The legacy sog.gg drawing has three hard pale
      // spines and they are the one part of it that reads as a monster rather
      // than as a mascot; rounding them keeps the count, the position and the
      // break in the outline, and drops the only aggressive line on the
      // animal.
      return (
        <g>
          <g fill={colors.bodyBottom}>
            {REX_RIDGE.map(([cx, cy, r]) => (
              <circle key={cx} cx={cx} cy={cy} r={r} />
            ))}
          </g>
          <path
            d="M 106 122 C 140 116 176 112 194 120 C 178 130 150 150 108 162 Z"
            fill={colors.bodyTop}
          />
        </g>
      );
    case "moose":
    case "bear":
    default:
      return <circle cx={138} cy={148} r={9} fill={colors.bodyBottom} />;
  }
}

function Body(props: PartProps): ReactElement {
  const { colors, detail, form } = props;
  const marked = detail !== "icon";
  return (
    <g>
      <Tail {...props} />
      {form === "hedgehog" && (
        // The mantle, behind everything: the body and then the head are drawn
        // over it, so what shows is the arch above the skull and the two
        // shoulders of spines beside the torso. It is drawn here rather than in
        // `Head` because it belongs to the animal's back and must not swing
        // when the idle animation tilts the head — a hedgehog's spines stay
        // where they are and the face turns inside them.
        <path d={SIILI_MANTLE} fill={colors.bodyBottom} />
      )}
      {form === "monster" ? (
        // The legacy character's fur is drawn as hundreds of hairs, which is a
        // texture and does not survive being a symbol. A lumpy *outline* is
        // the same idea as geometry: it says "this one is fuzzy" in the
        // silhouette, which is the only place it has to survive.
        <>
          <Fuzz cx={100} cy={132} rx={36} ry={30} r={7} lobes={16} fill={colors.bodyTop} />
          <ellipse cx={100} cy={132} rx={36} ry={30} fill={colors.bodyTop} />
        </>
      ) : form === "rex" ? (
        // Tall and narrow where every other form is wide and round. Fifty-two
        // units across against the family's seventy-two, which is what makes
        // the head read as oversized without the head having to grow further —
        // and it is what a T-rex standing on two legs actually is.
        <ellipse cx={100} cy={138} rx={26} ry={30} fill={colors.bodyTop} />
      ) : (
        <ellipse cx={100} cy={132} rx={36} ry={30} fill={colors.bodyTop} />
      )}
      {form === "giraffe" && (
        // The neck belongs to the body rather than to the head, and that is
        // load-bearing: the head group rotates about a point just under the
        // head, so a neck drawn up there would swing at its base every time
        // the idle animation tilted. Down here the head pivots *on* the neck,
        // which is what a giraffe does anyway.
        <>
          <path d="M 88 110 C 88 90 91 72 93 56 L 107 56 C 109 72 112 90 112 110 Z" fill={colors.bodyTop} />
          {marked && (
            <g fill={colors.bodyBottom}>
              {GIRAFFE_NECK_PATCHES.map(([cx, cy, r]) => (
                <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} />
              ))}
            </g>
          )}
        </>
      )}
      {form === "gull" && (
        // The mantle: the grey saddle over the shoulders that every gull has
        // and no other bird in this family does. One flat block laid on the
        // body ellipse and under the belly panel — it is the whole difference
        // between this form and a generic pale bird, and it is the only mark
        // the form adds. Dark wingtips were drawn beside it and cut: a third
        // colour, three units wide, gone by 64px.
        <path
          d="M 100 102 C 122 102 136 116 136 132 C 136 124 120 118 100 118 C 80 118 64 124 64 132 C 64 116 78 102 100 102 Z"
          fill={colors.bodyBottom}
        />
      )}
      {form === "rex" ? (
        // The pale front, fitted to the narrower torso. The legacy voxel
        // `treksi.png` draws a cream belly panel and the sog.gg drawing draws a
        // pale chest, so both sources agree about this one even though they
        // agree about very little else.
        <ellipse cx={100} cy={145} rx={17} ry={21} fill={colors.panel} />
      ) : form === "penguin" ? (
        // Taller and narrower than the family's belly, and reaching up behind
        // the head: the landmark is that the pale runs from the face to the
        // feet in ONE block with the dark hood coming down over the shoulders
        // on either side of it. A belly that started at the family's y = 118
        // left a dark band across the throat and cut the block in two, which
        // at 40px is a dark bird with a pale spot rather than a penguin.
        <ellipse cx={100} cy={136} rx={26} ry={34} fill={colors.panel} />
      ) : (
        form !== "monster" && <ellipse cx={100} cy={139} rx={25} ry={21} fill={colors.panel} />
      )}
      {form === "giraffe" && marked && (
        <g fill={colors.bodyBottom}>
          {GIRAFFE_BODY_PATCHES.map(([cx, cy, r]) => (
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} />
          ))}
        </g>
      )}
      {form === "leopard" && marked && (
        <g fill="none" stroke={markingHex(colors)} strokeWidth={3}>
          {LEOPARD_BODY_ROSETTES.map(([cx, cy, r]) => (
            <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} />
          ))}
        </g>
      )}
      {form === "tit" && (
        // The black stripe down a great tit's yellow front. One flat shape.
        <path d="M 100 110 L 105 110 L 103 158 L 97 158 L 95 110 Z" fill={markingHex(colors)} />
      )}
    </g>
  );
}

/**
 * A muzzle: two flat colour blocks and nothing else — the pale patch, and the
 * nose sitting high on it. The philtrum came off in the simplicity pass; it was
 * a two-unit stroke drawing the line between the nose and the mouth glyph,
 * which is a gap the two shapes already describe by being apart.
 */
function Muzzle({
  x,
  y,
  rx,
  ry,
  noseRx,
  colors,
}: {
  x: number;
  y: number;
  rx: number;
  ry: number;
  noseRx: number;
  colors: { panel: string };
}): ReactElement {
  return (
    <g>
      <ellipse cx={x} cy={y} rx={rx} ry={ry} fill={colors.panel} />
      <ellipse cx={x} cy={y - ry * 0.55} rx={noseRx} ry={noseRx * 0.72} fill={MASCOT_INK.line} />
    </g>
  );
}

function Head(props: PartProps): ReactElement {
  const { rig, colors, form } = props;
  const { x, y, r } = rig.head;
  switch (form) {
    case "fox":
      return (
        <g>
          <path d={`M ${x - 34} ${y - 22} L ${x - 40} ${y - 58} L ${x - 8} ${y - 36} Z`} fill={colors.bodyTop} />
          <path d={`M ${x + 34} ${y - 22} L ${x + 40} ${y - 58} L ${x + 8} ${y - 36} Z`} fill={colors.bodyTop} />
          <path d={`M ${x - 30} ${y - 27} L ${x - 34} ${y - 49} L ${x - 15} ${y - 35} Z`} fill={colors.bodyBottom} />
          <path d={`M ${x + 30} ${y - 27} L ${x + 34} ${y - 49} L ${x + 15} ${y - 35} Z`} fill={colors.bodyBottom} />
          <circle cx={x} cy={y} r={r} fill={colors.bodyTop} />
          <path d={`M ${x - r} ${y + 2} q 10 20 26 22 q -20 8 -30 -6 Z`} fill={colors.panel} opacity={0.8} />
          <path d={`M ${x + r} ${y + 2} q -10 20 -26 22 q 20 8 30 -6 Z`} fill={colors.panel} opacity={0.8} />
          <Muzzle x={x} y={y + 20} rx={17} ry={13} noseRx={6.5} colors={colors} />
        </g>
      );
    case "lynx":
      return (
        <g>
          <path d={`M ${x - 32} ${y - 24} L ${x - 34} ${y - 52} L ${x - 10} ${y - 36} Z`} fill={colors.bodyTop} />
          <path d={`M ${x + 32} ${y - 24} L ${x + 34} ${y - 52} L ${x + 10} ${y - 36} Z`} fill={colors.bodyTop} />
          <path
            d={`M ${x - 34} ${y - 52} l -3 -13`}
            stroke={MASCOT_INK.line}
            strokeWidth={3}
            strokeLinecap="round"
          />
          <path
            d={`M ${x + 34} ${y - 52} l 3 -13`}
            stroke={MASCOT_INK.line}
            strokeWidth={3}
            strokeLinecap="round"
          />
          <circle cx={x} cy={y} r={r} fill={colors.bodyTop} />
          <path d={`M ${x - r - 4} ${y + 8} q 14 22 30 20 q -22 12 -34 -4 Z`} fill={colors.panel} opacity={0.75} />
          <path d={`M ${x + r + 4} ${y + 8} q -14 22 -30 20 q 22 12 34 -4 Z`} fill={colors.panel} opacity={0.75} />
          <Muzzle x={x} y={y + 19} rx={16} ry={11} noseRx={6} colors={colors} />
        </g>
      );
    case "moose":
      return (
        <g>
          {/* Antlers as a beam plus three tines a side. Strokes rather than a
              filled palm: a palmate blade at this scale turns into a mitten. */}
          <g
            fill="none"
            stroke={colors.bodyBottom}
            strokeWidth={7}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d={`M ${x - 20} ${y - 26} C ${x - 34} ${y - 34} ${x - 46} ${y - 42} ${x - 60} ${y - 44}`} />
            <path d={`M ${x - 34} ${y - 34} L ${x - 38} ${y - 52}`} strokeWidth={5} />
            <path d={`M ${x - 47} ${y - 41} L ${x - 52} ${y - 58}`} strokeWidth={5} />
            <path d={`M ${x - 59} ${y - 44} L ${x - 66} ${y - 58}`} strokeWidth={5} />
            <path d={`M ${x + 20} ${y - 26} C ${x + 34} ${y - 34} ${x + 46} ${y - 42} ${x + 60} ${y - 44}`} />
            <path d={`M ${x + 34} ${y - 34} L ${x + 38} ${y - 52}`} strokeWidth={5} />
            <path d={`M ${x + 47} ${y - 41} L ${x + 52} ${y - 58}`} strokeWidth={5} />
            <path d={`M ${x + 59} ${y - 44} L ${x + 66} ${y - 58}`} strokeWidth={5} />
          </g>
          <ellipse cx={x - 38} cy={y - 14} rx={12} ry={7} fill={colors.bodyBottom} transform={`rotate(-20 ${x - 38} ${y - 14})`} />
          <ellipse cx={x + 38} cy={y - 14} rx={12} ry={7} fill={colors.bodyBottom} transform={`rotate(20 ${x + 38} ${y - 14})`} />
          <ellipse cx={x} cy={y - 2} rx={r * 0.82} ry={r * 0.86} fill={colors.bodyTop} />
          <Muzzle x={x} y={y + 26} rx={20} ry={16} noseRx={8} colors={colors} />
        </g>
      );
    case "owl":
      return (
        <g>
          <circle cx={x} cy={y} r={r} fill={colors.bodyTop} />
          {/* ONE facial disc with a rim and a dip between the eyes, not two
              pale circles under a pair of triangles.
              The two-circles-plus-tufts version read as a *cat* at 150px, and
              on inspection that is exactly what it was drawing: a round head
              with pointed ears and two eyes in the middle of it. What makes an
              owl an owl in flat illustration is the disc — a single heart of
              pale feathers with a hard edge, dipping to a V above the beak —
              so the rim stroke is not decoration here, it is the landmark, and
              it is the reason the tufts could go. */}
          {/* Two soft bumps rather than the sharp tufts this form used to
              carry. A pointed triangle on a round head is a cat ear whatever
              you meant by it; a rounded bump is a brow, which is what an owl
              has. */}
          <circle cx={x - 26} cy={y - 30} r={9} fill={colors.bodyTop} />
          <circle cx={x + 26} cy={y - 30} r={9} fill={colors.bodyTop} />
          <g fill={colors.panel} stroke={colors.bodyBottom} strokeWidth={3}>
            <circle cx={x - 17} cy={y - 6} r={20} />
            <circle cx={x + 17} cy={y - 6} r={20} />
          </g>
          {/* The rims have to be unbroken around each eye, so the pair is
              painted again with no stroke to erase the seam where they
              overlap. */}
          <g fill={colors.panel}>
            <circle cx={x - 17} cy={y - 6} r={18.5} />
            <circle cx={x + 17} cy={y - 6} r={18.5} />
          </g>
          {/* A short hooked beak, in the coat's own darker tone rather than in
              ink: an owl's beak is the one warm thing on its face and the
              legacy drawing's is orange. */}
          <path
            d={`M ${x} ${y + 17} C ${x - 7} ${y + 11} ${x - 8} ${y + 2} ${x - 7} ${y - 3} L ${x + 7} ${y - 3} C ${x + 8} ${y + 2} ${x + 7} ${y + 11} ${x} ${y + 17} Z`}
            fill={colors.bodyBottom}
          />
        </g>
      );
    case "hare":
      return (
        <g>
          <ellipse cx={x - 14} cy={y - 54} rx={9} ry={30} fill={colors.bodyTop} transform={`rotate(-8 ${x - 14} ${y - 54})`} />
          <ellipse cx={x + 14} cy={y - 54} rx={9} ry={30} fill={colors.bodyTop} transform={`rotate(8 ${x + 14} ${y - 54})`} />
          <ellipse cx={x - 14} cy={y - 54} rx={4.5} ry={21} fill={colors.panel} transform={`rotate(-8 ${x - 14} ${y - 54})`} />
          <ellipse cx={x + 14} cy={y - 54} rx={4.5} ry={21} fill={colors.panel} transform={`rotate(8 ${x + 14} ${y - 54})`} />
          <circle cx={x} cy={y} r={r} fill={colors.bodyTop} />
          {/* No buck teeth. They were the hare's one bit of charm and they
              were also teeth sitting on top of the mouth glyph, which is the
              exact detail cue the face rules exist to keep off. The ears do
              the identifying anyway. */}
          <Muzzle x={x} y={y + 17} rx={14} ry={10} noseRx={5} colors={colors} />
        </g>
      );
    case "seal":
      return (
        <g>
          <ellipse cx={x} cy={y} rx={r * 1.02} ry={r * 0.94} fill={colors.bodyTop} />
          <Muzzle x={x} y={y + 20} rx={18} ry={12} noseRx={6.5} colors={colors} />
        </g>
      );
    case "raccoon":
      return (
        <g>
          {/* Round ears, set wide. A raccoon's are not the fox's triangles and
              not the bear's discs either — they are lower and further out. */}
          <circle cx={x - 28} cy={y - 27} r={13} fill={colors.bodyTop} />
          <circle cx={x + 28} cy={y - 27} r={13} fill={colors.bodyTop} />
          <circle cx={x - 28} cy={y - 26} r={6.5} fill={colors.panel} />
          <circle cx={x + 28} cy={y - 26} r={6.5} fill={colors.panel} />
          <circle cx={x} cy={y} r={r} fill={colors.bodyTop} />
          {/* The legacy character's collar, kept as part of the head rather
              than as a scarf: he is not wearing it, it is his face. */}
          <path d={`M ${x - r - 2} ${y + 4} q 12 22 30 22 q -24 12 -36 -6 Z`} fill={colors.bodyBottom} />
          <path d={`M ${x + r + 2} ${y + 4} q -12 22 -30 22 q 24 12 36 -6 Z`} fill={colors.bodyBottom} />
          {/* The pale blaze first, then the mask over it. Order matters: the
              blaze is what makes the mask read as a *band across the eyes*
              rather than as a dark top half of the head. */}
          <path d={`M ${x - 7} ${y - r + 2} L ${x + 7} ${y - r + 2} L ${x + 10} ${y - 14} L ${x - 10} ${y - 14} Z`} fill={colors.panel} />
          <path
            d={`M ${x - 34} ${y - 10} C ${x - 34} ${y - 22} ${x - 16} ${y - 22} ${x - 8} ${y - 15} C ${x - 4} ${y - 12} ${x + 4} ${y - 12} ${x + 8} ${y - 15} C ${x + 16} ${y - 22} ${x + 34} ${y - 22} ${x + 34} ${y - 10} C ${x + 34} ${y + 5} ${x + 18} ${y + 11} ${x + 8} ${y + 4} C ${x + 4} ${y + 1} ${x - 4} ${y + 1} ${x - 8} ${y + 4} C ${x - 18} ${y + 11} ${x - 34} ${y + 5} ${x - 34} ${y - 10} Z`}
            fill={markingHex(colors)}
          />
          <Muzzle x={x} y={y + 19} rx={16} ry={12} noseRx={6} colors={colors} />
        </g>
      );
    case "leopard":
      return (
        <g>
          {/* Cat ears: small rounded triangles sitting *on* the skull, rather
              than the bear's big discs standing off it. That one change is
              most of the difference between this and the flagship. */}
          <path d={`M ${x - 32} ${y - 20} C ${x - 34} ${y - 36} ${x - 28} ${y - 42} ${x - 20} ${y - 36} C ${x - 15} ${y - 32} ${x - 14} ${y - 26} ${x - 14} ${y - 22} Z`} fill={colors.bodyTop} />
          <path d={`M ${x + 32} ${y - 20} C ${x + 34} ${y - 36} ${x + 28} ${y - 42} ${x + 20} ${y - 36} C ${x + 15} ${y - 32} ${x + 14} ${y - 26} ${x + 14} ${y - 22} Z`} fill={colors.bodyTop} />
          <path d={`M ${x - 28} ${y - 24} C ${x - 29} ${y - 34} ${x - 26} ${y - 37} ${x - 21} ${y - 33} Z`} fill={colors.panel} />
          <path d={`M ${x + 28} ${y - 24} C ${x + 29} ${y - 34} ${x + 26} ${y - 37} ${x + 21} ${y - 33} Z`} fill={colors.panel} />
          <circle cx={x} cy={y} r={r} fill={colors.bodyTop} />
          {/* The rosettes stay on the body and come off the face. Four rings of
              two-and-a-half-unit stroke around a muzzle are half a pixel each at
              40px, and what they were competing with there is the ear shape —
              which is the thing that separates this cat from the lynx. */}
          <Muzzle x={x} y={y + 18} rx={14} ry={10} noseRx={5.4} colors={colors} />
        </g>
      );
    case "giraffe":
      return (
        <g>
          {/* Ossicones — the knobbed stalks. With the neck they are the whole
              identification, and they are the reason the crown line sits level
              with the elk's rather than higher. */}
          <g stroke={colors.bodyBottom} strokeWidth={6.5} strokeLinecap="round" fill="none">
            <path d={`M ${x - 9} ${y - 17} L ${x - 12} ${y - 27}`} />
            <path d={`M ${x + 9} ${y - 17} L ${x + 12} ${y - 27}`} />
          </g>
          <circle cx={x - 12} cy={y - 29} r={5.5} fill={colors.bodyBottom} />
          <circle cx={x + 12} cy={y - 29} r={5.5} fill={colors.bodyBottom} />
          <ellipse
            cx={x - 25}
            cy={y - 12}
            rx={12}
            ry={5.5}
            fill={colors.bodyTop}
            transform={`rotate(-24 ${x - 25} ${y - 12})`}
          />
          <ellipse
            cx={x + 25}
            cy={y - 12}
            rx={12}
            ry={5.5}
            fill={colors.bodyTop}
            transform={`rotate(24 ${x + 25} ${y - 12})`}
          />
          <circle cx={x} cy={y} r={r} fill={colors.bodyTop} />
          {/* No patches on the face. The head here is 23 units of radius and the
              cheek pair was two three-unit dots on it; the patches that do the
              identifying are on the neck and the body, where they are big. */}
          <Muzzle x={x} y={y + 16} rx={13} ry={12} noseRx={4.6} colors={colors} />
        </g>
      );
    case "unicorn":
      return (
        <g>
          {/* Horse ears: long, narrow and leaf-shaped. The first draft used
              the fox's triangles and the whole animal read as a cat with a
              horn glued on — the ear shape turned out to be doing more work
              here than the horn was. */}
          <path
            d={`M ${x - 20} ${y - 26} C ${x - 34} ${y - 42} ${x - 34} ${y - 58} ${x - 27} ${y - 58} C ${x - 19} ${y - 58} ${x - 13} ${y - 40} ${x - 10} ${y - 30} Z`}
            fill={colors.bodyTop}
          />
          <path
            d={`M ${x + 20} ${y - 26} C ${x + 34} ${y - 42} ${x + 34} ${y - 58} ${x + 27} ${y - 58} C ${x + 19} ${y - 58} ${x + 13} ${y - 40} ${x + 10} ${y - 30} Z`}
            fill={colors.bodyTop}
          />
          <circle cx={x} cy={y} r={r} fill={colors.bodyTop} />
          {/* The mane, drawn *over* the skull rather than behind it. The first
              attempt put it underneath, on the theory that a mane grows out of
              the neck — and about ten units of it survived the head circle,
              which is not a mane, it is a smudge. A cartoon mane is a shape
              lying on top of the head, so that is what this is: a crest
              between the ears, and three locks falling past the cheek. */}
          <path
            d={`M ${x + 4} ${y - 37} C ${x - 16} ${y - 42} ${x - 36} ${y - 30} ${x - 42} ${y - 8} C ${x - 46} ${y + 12} ${x - 40} ${y + 28} ${x - 32} ${y + 37} C ${x - 36} ${y + 16} ${x - 34} ${y + 1} ${x - 27} ${y - 10} C ${x - 26} ${y + 5} ${x - 23} ${y + 18} ${x - 17} ${y + 27} C ${x - 18} ${y + 6} ${x - 14} ${y - 15} ${x - 3} ${y - 27} C ${x + 1} ${y - 31} ${x + 3} ${y - 34} ${x + 4} ${y - 37} Z`}
            fill={colors.bodyBottom}
          />
          <path
            d={`M ${x - 1} ${y - 38} C ${x + 16} ${y - 38} ${x + 24} ${y - 28} ${x + 25} ${y - 16} C ${x + 19} ${y - 25} ${x + 8} ${y - 30} ${x - 3} ${y - 29} Z`}
            fill={colors.bodyBottom}
          />
          {/* The horn last, so it stands out of the mane rather than under it.
              One tapered triangle in the accent colour: the two spiral bands
              that used to cross it were three-unit strokes on a nine-unit
              shape, and the horn's *outline* is what anyone names it by. A
              spiral would have turned to mush below 60px; the bands did too. */}
          <path d={`M ${x} ${y - 66} L ${x - 9} ${y - 28} L ${x + 9} ${y - 28} Z`} fill={colors.accent} />
          {/* A muzzle that carries on below the skull, which is the other half
              of turning a round head into a horse's. No nostril pips: two
              three-unit ellipses on it were the smallest marks on the animal
              and the first to vanish. The long pale block *is* the horse. */}
          <path
            d={`M ${x - 17} ${y + 4} C ${x - 17} ${y + 26} ${x - 11} ${y + 36} ${x} ${y + 36} C ${x + 11} ${y + 36} ${x + 17} ${y + 26} ${x + 17} ${y + 4} Z`}
            fill={colors.panel}
          />
        </g>
      );
    case "bug":
      return (
        <g>
          <g stroke={colors.bodyBottom} strokeWidth={3.4} strokeLinecap="round" fill="none">
            <path d={`M ${x - 12} ${y - 30} C ${x - 20} ${y - 44} ${x - 26} ${y - 50} ${x - 30} ${y - 52}`} />
            <path d={`M ${x + 12} ${y - 30} C ${x + 20} ${y - 44} ${x + 26} ${y - 50} ${x + 30} ${y - 52}`} />
          </g>
          <circle cx={x - 32} cy={y - 53} r={5} fill={colors.accent} />
          <circle cx={x + 32} cy={y - 53} r={5} fill={colors.accent} />
          <circle cx={x} cy={y} r={r} fill={colors.bodyTop} />
          {/* No muzzle, and no fangs. The legacy drawing has two small teeth
              under the mouth; a tooth is the fastest way to make a symbol face
              look like a real one, so the bug is carried by the eyes, the
              antennae and the four wings instead. */}
        </g>
      );
    case "monster":
      return (
        <g>
          <g stroke={colors.limb} strokeWidth={3.6} strokeLinecap="round" fill="none">
            <path d={`M ${x - 13} ${y - 30} C ${x - 16} ${y - 44} ${x - 18} ${y - 50} ${x - 20} ${y - 55}`} />
            <path d={`M ${x + 13} ${y - 30} C ${x + 16} ${y - 44} ${x + 18} ${y - 50} ${x + 20} ${y - 55}`} />
          </g>
          <circle cx={x - 21} cy={y - 58} r={5.5} fill={colors.accent} />
          <circle cx={x + 21} cy={y - 58} r={5.5} fill={colors.accent} />
          <Fuzz cx={x} cy={y} rx={r} ry={r} r={7} lobes={15} fill={colors.bodyTop} />
          <circle cx={x} cy={y} r={r} fill={colors.bodyTop} />
        </g>
      );
    case "tit":
      return (
        <g>
          <circle cx={x} cy={y} r={r} fill={colors.bodyTop} />
          {/* The cap and the cheeks. A great tit is unreadable without both:
              the cap alone is a hood, the cheeks alone are two pale dots.
              The cap crosses the eye line on purpose — that is where a great
              tit's is — and the cost is that this form's brows and its shut
              Laughing eyes are dark strokes on a dark cap and get lost. Open
              eyes are unaffected, because those are white shapes with a pupil
              cut out of them rather than lines. Any member of this form wants
              an open-eyed expression. */}
          <path d={`M ${x - r} ${y - 1} A ${r} ${r} 0 0 1 ${x + r} ${y - 1} Z`} fill={markingHex(colors)} />
          <ellipse cx={x - 20} cy={y + 3} rx={11} ry={8} fill={colors.panel} />
          <ellipse cx={x + 20} cy={y + 3} rx={11} ry={8} fill={colors.panel} />
          <path d={`M ${x} ${y + 13} L ${x - 6} ${y + 1} L ${x + 6} ${y + 1} Z`} fill={MASCOT_INK.line} />
        </g>
      );
    case "rat":
      return (
        <g>
          {/* Ears half the width of the head each, and set high and out. This
              is the whole difference between a rat and a bear at 40px, so it
              is drawn generously rather than accurately. */}
          <circle cx={x - 31} cy={y - 19} r={15.5} fill={colors.bodyTop} />
          <circle cx={x + 31} cy={y - 19} r={15.5} fill={colors.bodyTop} />
          <circle cx={x - 31} cy={y - 18} r={9.5} fill={colors.panel} />
          <circle cx={x + 31} cy={y - 18} r={9.5} fill={colors.panel} />
          <circle cx={x} cy={y} r={r} fill={colors.bodyTop} />
          {/* A long pointed muzzle rather than the family's round patch. The
              nose stays high on it, as every other muzzle here puts it, so the
              mouth glyph still lands below the nose; the tapering tip below
              the mouth is what makes the snout read as long. */}
          <path
            d={`M ${x - 15} ${y - 1} C ${x - 15} ${y + 24} ${x - 8} ${y + 37} ${x} ${y + 37} C ${x + 8} ${y + 37} ${x + 15} ${y + 24} ${x + 15} ${y - 1} Z`}
            fill={colors.panel}
          />
          <ellipse cx={x} cy={y + 11} rx={5.4} ry={4.2} fill={MASCOT_INK.line} />
        </g>
      );
    case "beaver":
      return (
        <g>
          {/* Small round ears, low and wide — a bear's are big discs high on
              the skull, and that one difference plus the paddle is what keeps
              these two brown round animals apart. */}
          <circle cx={x - 33} cy={y - 22} r={7.5} fill={colors.bodyBottom} />
          <circle cx={x + 33} cy={y - 22} r={7.5} fill={colors.bodyBottom} />
          {/* A skull wider than it is tall, which the round family head is
              not. With the tiny low-set ears this is what has to separate a
              beaver from a bear in the avatar crop, where the tail — the thing
              actually carrying the animal — is out of frame entirely. */}
          <ellipse cx={x} cy={y} rx={r * 1.06} ry={r * 0.9} fill={colors.bodyTop} />
          {/* Broad, flat and low, and no incisors: two front teeth are the
              beaver cue everybody reaches for and teeth are not drawn here. */}
          <Muzzle x={x} y={y + 20} rx={27} ry={12} noseRx={7} colors={colors} />
        </g>
      );
    case "gull":
      return (
        <g>
          <circle cx={x} cy={y} r={r} fill={colors.bodyTop} />
          {/* The bill, in the coat's accent rather than in ink. Drawn dark
              like the great tit's it merges with the mouth glyph eighteen
              units below it and the pair reads as one open beak; in the
              accent the two stay separate shapes. Twenty-two units long —
              sixteen is a finch, twenty-eight is a duck. */}
          <path
            d={`M ${x - 6.5} ${y - 2} L ${x + 6.5} ${y - 2} L ${x + 4} ${y + 18} C ${x + 3} ${y + 22} ${x - 3} ${y + 22} ${x - 4} ${y + 18} Z`}
            fill={colors.accent}
          />
        </g>
      );
    case "rex":
      return (
        <g>
          {/* Wider than it is tall, and with nothing on top of it. Every other
              form in the family is identified by what is above the ears; this
              one is identified by having neither. */}
          <rect
            x={x - r * 1.28}
            y={y - r * 0.87}
            width={r * 2.56}
            height={r * 1.74}
            rx={r * 0.59}
            fill={colors.bodyTop}
          />
          {/* THE JAW. The family's only muzzle with corners on it, and the
              only one that hangs below the skull — sixty-two units across a
              ninety-unit head, against the bear's forty-four across eighty.
              Both halves of that matter: a broad muzzle on a round head is a
              bear, and a broad *square* one that overshoots the chin is a
              lizard. Drawn in `panel` like every other muzzle here, so the
              coat's own pale underside paints it and no colourway has to know
              this form exists.

              The red mouth patch the legacy voxel file has is deliberately not
              here. Kyle's ruling is that it is not a defining feature of the
              character, and the geometry above is what is. */}
          <rect x={x - 30} y={y + 16} width={60} height={30} rx={10} fill={colors.panel} />
          <ellipse cx={x} cy={y + 23} rx={7.5} ry={5.4} fill={MASCOT_INK.line} />
        </g>
      );
    /**
     * Two colour blocks and one small triangle.
     *
     * Measured off `scratchpad/polonski-zoom.png` (888 × 700, trimmed) at
     * working size, which is what settled every number here:
     *
     * - the yellow face is **418 px across** at its widest against **500 px**
     *   of black at the same row — so the pale block is about 84 per cent of
     *   the head's width and the hood is a rim of roughly eight per cent a
     *   side. Here that is a 56-unit face inside a 72-unit head.
     * - the face is **310 px tall against 418 wide** — wider than it is tall,
     *   and it reaches the chin. Nothing about the reference is a disc with a
     *   rim; that is the owl two cases up, and keeping the two apart is the
     *   reason the pale here is tangent to the bottom of the skull rather than
     *   floating inside it.
     * - the beak is a **33 × 29 px** triangle — eight per cent of the face's
     *   width, magenta, apex down, sitting 35 per cent of the way down the
     *   head. Drawn at eight per cent it would be five units wide and gone by
     *   64px, so it is drawn at twelve: still the smallest mark on the animal,
     *   still clearly a triangle at 40.
     *
     * What is in the reference and deliberately not here: the scribbled hatch
     * the plumage is drawn with (a texture — it becomes one flat block), and
     * the two magenta cheek ovals (blush, which the face grammar bans
     * outright).
     */
    case "penguin":
      return (
        <g>
          <circle cx={x} cy={y} r={r} fill={colors.bodyTop} />
          <ellipse cx={x} cy={y + 7} rx={27} ry={29} fill={colors.panel} />
          <path d={`M ${x} ${y + 16} L ${x - 6} ${y + 4} L ${x + 6} ${y + 4} Z`} fill={colors.accent} />
        </g>
      );
    case "otter":
      return (
        <g>
          {/* Ears you could miss, set high and close, and with no pale inner
              disc. An otter's are barely more than a dark fold; drawn at the
              bear's size and spacing this form was a bear, and it was the pale
              inner — the thing that makes a bear's ear a bear's ear — that was
              doing most of that. Two flat nubs in the coat's own darker tone
              cost nothing at 40px, where the tail is carrying the animal
              anyway. */}
          <circle cx={x - 26} cy={y - 26} r={7} fill={colors.bodyBottom} />
          <circle cx={x + 26} cy={y - 26} r={7} fill={colors.bodyBottom} />
          {/* Wider than tall and only slightly — a swimmer's head is a
              streamlined block, and the beaver's flatter 1.06 × 0.9 is next
              door, so the difference this shape can carry is small. The tail
              is what is actually doing the work. */}
          <ellipse cx={x} cy={y} rx={r * 1.03} ry={r * 0.95} fill={colors.bodyTop} />
          {/* Broad, and the widest muzzle here after the beaver's: an otter's
              face is mostly cheek. Low enough that the pale block touches the
              chin, which is the half of it a bust crop keeps. */}
          <Muzzle x={x} y={y + 20} rx={24} ry={12} noseRx={6.5} colors={colors} />
        </g>
      );
    case "hedgehog":
      return (
        <g>
          {/* The face is one pale block and nothing else — no ears (a
              hedgehog's are inside the mantle), no markings, no second tone.
              Everything this form has to say is said by the shape behind it,
              which is exactly the trade the simplicity ruling asks for. */}
          <circle cx={x} cy={y} r={r} fill={colors.panel} />
          {/* The nose, and nothing under it. A pointed snout was drawn here
              and cut: below the chin it lands on the body's own mid tone,
              which is four steps from the pale it is drawn in and eight from
              the mantle, so it read as a smudge at 240px and as nothing at 40
              — and any longer it reaches the belly panel and is pale on pale.
              The 40px raster with and without is identical, which is the test,
              so it stays off and the mantle keeps the whole job. */}
          <ellipse cx={x} cy={y + 16} rx={5.6} ry={4.4} fill={MASCOT_INK.line} />
        </g>
      );
    case "bear":
    default:
      return (
        <g>
          <circle cx={x - 28} cy={y - 28} r={15} fill={colors.bodyTop} />
          <circle cx={x + 28} cy={y - 28} r={15} fill={colors.bodyTop} />
          <circle cx={x - 28} cy={y - 27} r={7.5} fill={colors.panel} />
          <circle cx={x + 28} cy={y - 27} r={7.5} fill={colors.panel} />
          <circle cx={x} cy={y} r={r} fill={colors.bodyTop} />
          <Muzzle x={x} y={y + 20} rx={22} ry={15} noseRx={7.5} colors={colors} />
        </g>
      );
  }
}

export const OTSO: ConceptDef = {
  id: "otso",
  species: "Otso",
  kind: "Animal family — one rig, twenty species",
  origin: "fresh",
  pitch:
    "The warmest concept here, and the only one a seven-year-old will hug. Otso is the old Finnish word for bear, the one you used instead of the bear's real name. Round two answered the obvious objection — that a bear on its own says nothing about gaming and every Nordic children's brand already has one — by making the bear a *member* rather than the whole idea. Sixteen animals share one body plan, so a fox can be the fast one, an owl can be the gedu, a hare can be the beginner, a rat can tend the stories, and none of it costs a second pose sheet. Finnish nature is where it started and is still most of the list; the rest are here because a global company that loves animals does not check their passports.",
  caveat:
    "Least ownable, still. The forms differ above the neck and in the tail, which is enough to tell them apart and not enough to make any one of them ours. And a cub is the concept most likely to read as \"for little kids\" to a twelve-year-old — a fox, a lynx or a leopard buys that back, which is half the argument for the family.",
  landmark: "Whatever is above the ears: two round discs, two sharp triangles, antlers, a horn, antennae, or nothing at all.",
  slots: ["hat", "face", "torso", "back", "extra", "scene"],
  wardrobeLimit:
    "Everything fits, but a hat has to clear whatever is on top — the crown line moves per species, so a beanie sits low on a seal and high on a giraffe. That is the right trade: the ears are the identity and a hat that covered them would erase it. Four forms carry something taller than their own crown line — the elk's antlers, the hare's ears, the unicorn's horn and the giraffe's ossicones — and a hat on those reads as worn *under* the landmark rather than over it.",
  rig: BASE,
  forms: OTSO_FORMS,
  rigFor,
  faceMode: "eyes",
  variants: OTSO_ALL_VARIANTS,
  limbs: (c) => ({ arm: c.bodyBottom, leg: c.bodyBottom, hand: c.panel, foot: c.panel }),
  Body,
  Head,
  fleet: [
    {
      name: "Otso",
      job: "The introducer — home hero, the face of the brand",
      variantId: "honey",
      form: "bear",
      role: "none",
      pose: "wave",
      expression: "happy",
      blurb: "The species and the flagship share a name, the way a mascot usually does. Honey coat, no costume, always waving.",
    },
    {
      name: "Reksi — the Princi-Pal",
      job: "Principal gamer — the headmaster's voice: welcomes, announcements, the occasional dad joke",
      variantId: "reksi",
      form: "rex",
      role: "none",
      pose: "idle",
      expression: "happy",
      prop: "briefcase",
      // The crown is disputed and is carried here as a candidate rather than
      // as identity: it appears in exactly one asset anywhere (the sog.gg
      // about-us drawing) and Kyle does not recognise it as part of the
      // character. The marks he does name are the white beard, the shades, the
      // purple and the briefcase, and all four are on this entry — the beard
      // and the shades are one wearable because the rig has two head slots and
      // he wants three things on his head.
      outfit: { hat: "crown", face: "beard-shades" },
      garment: "purple",
      blurb:
        "The same man as the voxel Reksi and the human one, in the body the legacy sog.gg site actually draws him in: an oversized head on a narrow standing body, a square jaw, a scalloped back and no ears. Grey-blue mixed off the sampled coat, white beard, shades indoors, briefcase in hand. The arms are short and thin rather than comically tiny — the pose table puts hands at absolute coordinates, so that joke costs a pose sheet of its own.",
    },
    {
      name: "MoodyRat",
      job: "The Gardener — she tends the stories",
      variantId: "rotta",
      form: "rat",
      role: "none",
      pose: "reading",
      // The brief asked for the brow a touch lower than Thinking's default.
      // It cannot be said here: an expression is a closed id and the face
      // renderer derives all four dials from it, so there is no per-member
      // brow angle for a fleet entry to set. Widening `FleetMember` to carry
      // one would put a fifth dial outside the six-expression system that the
      // whole face grammar rests on, which is a face-system decision rather
      // than a fleet one. Thinking already looks away and down, which is the
      // moody half of it; the ask is noted for whoever opens the face module.
      expression: "thinking",
      prop: "watering-can",
      outfit: { hat: "straw-hat", extra: "story-sprout" },
      blurb: "Built for MoodyRat, who loves rats and finds them adorable, and whose job at School of Gaming is the Gardener — she tends the stories. Cute first and a little moody in the brow. The ears, the pointed muzzle and the long curling tail are what stop her being a mouse or a hare at 40 pixels.",
    },
    {
      name: "Chief Engineer Kyle",
      job: "CTO — the engine room; scientist, builder, architect, engineer",
      variantId: "majava",
      form: "beaver",
      role: "none",
      // Idle rather than the raised arm this entry started with, because the
      // scene decides the pose once there is one: `hold-up` puts the hand at
      // head height on the viewer's right, which is precisely where the room
      // hangs its gauges, and the spanner came out on top of them. Standing
      // puts the free hand at the console instead.
      pose: "idle",
      expression: "focused",
      prop: "wrench",
      // The hardhat comes off the `amber` swatch rather than off this coat,
      // whose garment slot is teal: the shell is painted from `clothing`, and
      // a teal hat on a teal-trimmed brown beaver is one colour pretending to
      // be two. Gold is also what a hardhat is, everywhere, which is a rarer
      // thing than it sounds — most of this registry's items have no real
      // colour of their own.
      outfit: { hat: "hardhat", scene: "engine-room" },
      garment: "amber",
      blurb: "The animal that builds things, dams the river and keeps the water where it should be, which is close enough to a job description. A hardhat on, a spanner in hand and the reactor column behind him. No Star Trek anywhere on him: the gold is engineering gold, the column is a column, and the title is his own handle. The paddle tail is what keeps him from being a brown bear.",
    },
    {
      name: "Repo",
      job: "Gamer helper — clubs, camps, the gamer dashboard",
      variantId: "honey",
      form: "fox",
      role: "gamer",
      pose: "controller",
      expression: "excited",
      blurb: "\"Repo\" is the old word for fox, from the same taboo-name habit that gave us Otso. Three matches in already.",
    },
    {
      name: "Tuuli",
      job: "Parent helper — schedules, pickups, the family calendar",
      variantId: "frost",
      form: "seal",
      role: "parent",
      pose: "idle",
      expression: "happy",
      prop: "mug",
      blurb: "A Saimaa ringed seal with a mug. Entirely unbothered, and the one who tells you the club is at six.",
    },
    {
      name: "Professori Pöllö",
      job: "Gedu expert — training, session write-ups, the docs",
      variantId: "berry",
      form: "owl",
      role: "gedu",
      pose: "reading",
      expression: "thinking",
      blurb: "The owl was always going to be the professor. Nobody has ever resisted this joke and we are not starting now.",
    },
    {
      name: "Lokki",
      job: "The archipelago guide — coastal camps and the summer clubs",
      variantId: "frost",
      form: "gull",
      role: "none",
      pose: "hold-up",
      expression: "happy",
      prop: "spyglass",
      outfit: { hat: "captain-cap", scene: "lighthouse" },
      garment: "sky",
      blurb: "The one member of the family who was already at the coast when the rest of the fleet arrived. Grey mantle, gold bill, a glass to her eye and a completely unearned air of authority. She will take your ice cream.",
    },
    {
      name: "Polonski",
      job: "The desk — sign-ups, consent forms, and the letters that have to be got right",
      variantId: "pingviini",
      form: "penguin",
      role: "none",
      pose: "idle",
      expression: "happy",
      prop: "clipboard",
      // The two things the legacy drawing is wearing, and nothing else. The
      // orange glasses become the wardrobe's own `specs` — the frame colour is
      // the accessory's, not his — and the green sweater is the `tee` in the
      // `green` swatch, which is what the legacy strip already dressed his
      // counterpart in before the species under it changed.
      outfit: { face: "specs", torso: "tee" },
      garment: "green",
      blurb:
        "The legacy cast's round yellow bird, under the ruling that settles what he actually is. Black back and flipper-arms, a yellow face and belly, a small pink beak and pink feet: a penguin, and never the great tit he was first rebuilt as. He keeps the sweater and the glasses he was drawn in, and he has quietly taken over everything at School of Gaming that has to be in writing.",
    },
    {
      name: "Loiske",
      job: "The icebreaker — first sessions, warm-ups, and the buddy nobody drifts away from",
      variantId: "saukko",
      form: "otter",
      role: "none",
      pose: "wave",
      expression: "excited",
      outfit: { torso: "life-vest" },
      garment: "cyan",
      blurb:
        "\"Loiske\" is the sound of something happy landing in water. Otters sleep holding each other's paws so the current cannot separate them, which is the best description of a buddy system anyone has managed, and it is her entire job: she takes the new one round, learns their name out loud, and does not let go of them in the first five minutes.",
    },
    {
      name: "Piikki",
      job: "The house rules — the be-kind pages, reporting a problem, and the word after a bad match",
      variantId: "siili",
      form: "hedgehog",
      role: "none",
      pose: "idle",
      expression: "happy",
      // The lanyard rather than a garment: it is the one wearable in the
      // registry that says "ask this one" without covering anything. A scarf
      // was tried first and sits across the mouth glyph on this build — the
      // head is small and the collar line is high — and a tee puts a second
      // green shirt next to Polonski's.
      outfit: { torso: "lanyard" },
      garment: "emerald",
      blurb:
        "\"Piikki\" is a spine, and he is the softest character in the fleet. A hedgehog's whole defence is to stop, curl up and wait for it to pass, which happens to be the advice as well: do not answer it, tell somebody. Prickly seen from outside, pale and unbothered underneath, and never the one who started it.",
    },
  ],
};
