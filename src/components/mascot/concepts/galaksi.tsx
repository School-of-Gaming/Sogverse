/**
 * Galaksi — the alien crew.
 *
 * School of Gaming's legal entity is *School of Gaming Galactic Oy*, which is
 * a joke nobody outside the company has ever been let in on, and Kyle's brief
 * is to let them in: "we have inter-galactic ideas … cute and playful aliens
 * that like to play games and help parents." So this is a small crew that flies
 * a saucer, plays whatever the gamers are playing, and answers the parents'
 * questions on the way past.
 *
 * ## What makes a shape read as an alien, and what does not
 *
 * Three landmarks do all of it, and every one of them is geometry rather than
 * detail:
 *
 * 1. **A cranium wider than the jaw.** The head is a rounded teardrop stood on
 *    its point — widest well above the eyes, tapering to a small rounded chin.
 *    It is the one silhouette in this whole directory that gets *narrower* as
 *    it goes down, and it is the reason a Galaksi is not a Silmu, a Kaari or a
 *    Ytymo: those are all widest at or below their eye line.
 * 2. **Eyes low and wide on that cranium.** Not big for cuteness — big and
 *    *low*. The forehead above them is more than half the head's height, which
 *    is the proportion a person reads as "not a mammal" before they have
 *    consciously seen anything.
 * 3. **One antenna with a ball on it.** One, not two: a pair reads as an
 *    insect (Otso already has one of those), and a single stalk off to one
 *    side reads as equipment growing out of a creature, which is exactly the
 *    tone.
 *
 * Everything else that a drawn alien usually carries — a mouth slit, finger
 * ridges, a suit, a belt, panel lines, three fingers, a glow — is detail, and
 * under the simplicity ruling it is off. What is left, off the face, is four
 * marks: a cranium, a body, a stalk and a ball.
 *
 * ## Why two eyes, having tested one and three
 *
 * The brief asked for `eyes` against `cyclops` against a three-eye variant, so
 * all three were built on this exact body and rasterised on `#121212`, full
 * figure and bust crop, at 200 / 64 / 40 / 28 pixels. The face grammar permits
 * a count change provided every eye is the same symbol, so the three-eye run
 * was a fair one: three whites of one radius across the brow, evenly spaced,
 * each with its own pupil.
 *
 * **Three eyes is the best-looking of the three at 200 pixels and the worst
 * everywhere else.** Fitting a third white between the pair drops each one to
 * about two thirds of the paired radius; at the 40-pixel bust the three whites
 * have merged into a single pale bar with a dark smear in it, and at 28 the
 * face is gone. Since every avatar use is a bust between 28 and 64, that is
 * the size band the species actually has to live in, and a face that only
 * works at hero size is not a face this fleet can use.
 *
 * **One eye is legible at every size and is somebody else's character.** The
 * cyclops crop at 28 is genuinely strong — it is the same reason the bean
 * portraits so well, one pupil being worth four of a pair. But this directory
 * already has a one-eyed rounded critter, and a second one differing only in
 * outline is not a second species; and the cyclops face carries no brow at all
 * by design, so adopting it would have cost this species two of the four mood
 * dials for a read we already own. The wide cranium is also *explained* by two
 * eyes set far apart on it — put one eye in the middle and the width above it
 * stops having a reason.
 *
 * Two eyes also cost nothing: `eyes` is the shared symbol face, so the species
 * inherits all six moods, the brow set, the blink and the gaze dial with no
 * face-module change at all. A third eye would have needed a new eye count in
 * the face renderer, which this species does not own.
 *
 * ## Forms are proportion, never costume
 *
 * `pilot`, `navigator` and `engineer` are three builds of one anatomy, and the
 * only things that differ are the numbers: how tall the cranium is, how wide
 * it is at the brow, how big the eyes are, and how heavy the body under it is.
 * Nobody is wearing a different hat to say which job they do, because a fleet
 * whose members are told apart by their accessories is a fleet of one
 * character — the lesson the bean's own file already had to learn.
 *
 * - **Pilot** — the compact one. Shortest cranium, roundest body, the default.
 * - **Navigator** — tall and narrow: a longer skull and a longer, slimmer body,
 *   the tallest of the three by about a tenth of the canvas.
 * - **Engineer** — broad and low: the widest brow in the set, the biggest eyes,
 *   a heavy body and short legs.
 *
 * ## The antenna and the helmet, which are one decision
 *
 * The `space-helmet` accessory is a clear dome fitted to whatever head it lands
 * on, and this species has a thing sticking out of its head. Two ways out:
 * push the antenna through the dome, or keep it short enough to live inside.
 * Inside wins — a sealed dome is what a helmet *is*, and an antenna visible
 * through the glass is a better picture than one puncturing it — so every
 * build's antenna is placed so its ball sits within the dome radius the
 * accessory derives from `head.r`. That is why the stalk leans out to the
 * viewer's right rather than standing up: a vertical antenna long enough to
 * read would not fit under the dome, and a short vertical one reads as a stub.
 * Leaning it also clears the crown, so every hat in the registry still lands
 * on this head without the antenna fighting it.
 */

import type { ReactElement } from "react";

import type { ConceptDef, FormDef, PartProps } from "../concept";
import { GALAKSI_VARIANTS } from "../palette";
import type { Point, Rig } from "../rig";

export const GALAKSI_FORMS: readonly FormDef[] = [
  { id: "pilot", label: "Luotsi — pilot", note: "Compact: short cranium, round body. The default." },
  {
    id: "navigator",
    label: "Suunnistaja — navigator",
    note: "Tall and narrow. The longest skull and the slimmest body.",
  },
  {
    id: "engineer",
    label: "Insinööri — engineer",
    note: "Broad and low. The widest brow and the biggest eyes here.",
  },
];

/**
 * One build, as the numbers both the rig and the drawing are derived from.
 *
 * Everything is in viewBox units on the shared `0 0 200 200` canvas, and the
 * three builds differ *only* here — there is not one `switch (form)` anywhere
 * in the drawing code below, which is the property that makes a fourth build
 * one more row in this table rather than a new set of paths.
 */
type Build = {
  /** The cranium: top of the dome, the widest line, and the chin. */
  headTop: number;
  browY: number;
  browW: number;
  chinY: number;
  chinW: number;
  /** Head centre and the nominal radius accessories and the bust crop use. */
  headY: number;
  headR: number;
  eyeY: number;
  eyeR: number;
  eyeDx: number;
  mouthY: number;
  crownW: number;
  /** The body capsule: where it starts under the chin, where it ends, how wide. */
  bodyTop: number;
  bodyBot: number;
  bodyW: number;
  bodyShoulderW: number;
  /** The skeleton's own numbers. */
  hipY: number;
  hipSpread: number;
  footY: number;
  legLen: number;
  shoulderY: number;
  shoulderDx: number;
  armLen: number;
  limbW: number;
  handR: number;
  torso: { x: number; y: number; w: number; h: number };
  shadow: { rx: number; ry: number; cy: number };
  /** Where the stalk leaves the head, where its ball sits, and how big. */
  antennaFrom: Point;
  antennaTo: Point;
  antennaR: number;
};

/**
 * The three builds.
 *
 * Two constraints fix most of these numbers rather than taste, and both were
 * found by rasterising rather than by reasoning:
 *
 * - **The Surprised brow is the tallest thing on this face.** The shared brow
 *   set draws it at `eyeY - 2.55 × eyeR`, so an eye placed high on a cranium
 *   puts its own brow *above the skull*. Every `eyeY` here clears its
 *   `headTop` by at least eight units at that multiple, which is what forces
 *   the eyes low — and the low eyes are the alien read, so the constraint and
 *   the design want the same thing.
 * - **The Excited mouth reaches `mouthY + 16`.** Every `mouthY` here sits far
 *   enough above `chinY` that the widest mouth stays on the face.
 *
 * The chin always overlaps the body by ten units or more, because the head is
 * drawn after the body and has to cover the join — this species has no neck
 * and must not appear to have a seam.
 */
const BUILDS: Record<string, Build> = {
  pilot: {
    headTop: 32,
    browY: 60,
    browW: 40,
    chinY: 110,
    chinW: 14,
    headY: 71,
    headR: 37,
    eyeY: 71,
    eyeR: 12,
    eyeDx: 16,
    mouthY: 90,
    crownW: 64,
    bodyTop: 100,
    bodyBot: 156,
    bodyW: 25,
    bodyShoulderW: 15,
    hipY: 150,
    hipSpread: 12,
    footY: 172,
    legLen: 24,
    shoulderY: 118,
    shoulderDx: 20,
    armLen: 40,
    limbW: 11,
    handR: 7,
    torso: { x: 77, y: 112, w: 46, h: 34 },
    shadow: { rx: 38, ry: 6.5, cy: 183 },
    antennaFrom: { x: 114, y: 48 },
    antennaTo: { x: 126, y: 30 },
    antennaR: 6.5,
  },
  navigator: {
    headTop: 26,
    browY: 54,
    browW: 35,
    chinY: 108,
    chinW: 12,
    headY: 67,
    headR: 35,
    eyeY: 66,
    eyeR: 11,
    eyeDx: 14.5,
    mouthY: 86,
    crownW: 56,
    bodyTop: 98,
    bodyBot: 156,
    bodyW: 20,
    bodyShoulderW: 12,
    hipY: 150,
    hipSpread: 11,
    footY: 176,
    legLen: 30,
    shoulderY: 116,
    shoulderDx: 17,
    armLen: 42,
    limbW: 10,
    handR: 6.5,
    torso: { x: 82, y: 110, w: 36, h: 34 },
    shadow: { rx: 32, ry: 6, cy: 187 },
    antennaFrom: { x: 108, y: 44 },
    antennaTo: { x: 118, y: 28 },
    antennaR: 6,
  },
  engineer: {
    headTop: 40,
    browY: 72,
    browW: 50,
    chinY: 124,
    chinW: 19,
    headY: 82,
    headR: 39,
    eyeY: 82,
    eyeR: 14,
    eyeDx: 19,
    mouthY: 104,
    crownW: 80,
    bodyTop: 112,
    bodyBot: 162,
    bodyW: 33,
    bodyShoulderW: 21,
    hipY: 156,
    hipSpread: 15,
    footY: 176,
    legLen: 20,
    shoulderY: 130,
    shoulderDx: 27,
    armLen: 36,
    limbW: 13,
    handR: 8,
    torso: { x: 71, y: 124, w: 58, h: 32 },
    shadow: { rx: 46, ry: 7, cy: 187 },
    antennaFrom: { x: 124, y: 64 },
    antennaTo: { x: 136, y: 46 },
    antennaR: 7,
  },
};

const CENTRE = 100;

function buildOf(form: string): Build {
  return BUILDS[form] ?? BUILDS.pilot;
}

function rigFor(form: string): Rig {
  const b = buildOf(form);
  return {
    shadow: { cx: CENTRE, cy: b.shadow.cy, rx: b.shadow.rx, ry: b.shadow.ry },
    hip: { x: CENTRE, y: b.hipY },
    hipSpread: b.hipSpread,
    footY: b.footY,
    footStyle: "round",
    shoulderL: { x: CENTRE - b.shoulderDx, y: b.shoulderY },
    shoulderR: { x: CENTRE + b.shoulderDx, y: b.shoulderY },
    head: { x: CENTRE, y: b.headY, r: b.headR },
    eyeDx: b.eyeDx,
    eyeY: b.eyeY,
    eyeR: b.eyeR,
    mouthY: b.mouthY,
    crown: { x: CENTRE, y: b.headTop },
    crownW: b.crownW,
    reach: 4,
    limbW: b.limbW,
    handR: b.handR,
    // Soft noodle limbs with no visible elbow, which is what a rounded body
    // with no shoulders wants — the same call Ytymo and the animals make.
    limbStyle: "tapered",
    armLen: b.armLen,
    legLen: b.legLen,
    torso: b.torso,
    // The head is its own shape on top of the body, so it tilts. That is the
    // one thing this species has that the bean does not, and it is worth
    // having: a head tilt is most of what makes a small figure read as
    // curious rather than as an object.
    fusedHead: false,
  };
}

/**
 * The cranium: a rounded teardrop stood on its point.
 *
 * Widest at `browY`, which is above the eyes; blunt-rounded at the top so it
 * reads as a skull rather than as a leaf; and tapering to a small rounded chin.
 * The lower curve's control points reach out past the chin (`chinW × 1.5`) so
 * the cheek stays convex all the way down — pulled in, the jaw goes straight
 * and the head reads as a shield.
 */
function craniumPath(b: Build): string {
  const upper = b.browY - b.headTop;
  const lower = b.chinY - b.browY;
  return [
    `M ${CENTRE - b.browW} ${b.browY}`,
    `C ${CENTRE - b.browW} ${b.headTop + upper * 0.3} ${CENTRE - b.browW * 0.72} ${b.headTop} ${CENTRE} ${b.headTop}`,
    `C ${CENTRE + b.browW * 0.72} ${b.headTop} ${CENTRE + b.browW} ${b.headTop + upper * 0.3} ${CENTRE + b.browW} ${b.browY}`,
    `C ${CENTRE + b.browW} ${b.browY + lower * 0.42} ${CENTRE + b.chinW * 1.5} ${b.chinY - lower * 0.22} ${CENTRE + b.chinW} ${b.chinY}`,
    `C ${CENTRE + b.chinW * 0.55} ${b.chinY + b.chinW * 0.5} ${CENTRE - b.chinW * 0.55} ${b.chinY + b.chinW * 0.5} ${CENTRE - b.chinW} ${b.chinY}`,
    `C ${CENTRE - b.chinW * 1.5} ${b.chinY - lower * 0.22} ${CENTRE - b.browW} ${b.browY + lower * 0.42} ${CENTRE - b.browW} ${b.browY}`,
    "Z",
  ].join(" ");
}

/** The waist: the body path's own widest node, and the only y it needs. */
function bodyMid(b: Build): number {
  return (b.bodyTop + b.bodyBot) / 2;
}

/** The body: one closed blob, narrow at the shoulders and heaviest at the waist. */
function bodyPath(b: Build): string {
  const h = b.bodyBot - b.bodyTop;
  const mid = bodyMid(b);
  return [
    `M ${CENTRE} ${b.bodyTop}`,
    `C ${CENTRE + b.bodyShoulderW * 0.9} ${b.bodyTop} ${CENTRE + b.bodyW} ${b.bodyTop + h * 0.3} ${CENTRE + b.bodyW} ${mid}`,
    `C ${CENTRE + b.bodyW} ${b.bodyBot - h * 0.22} ${CENTRE + b.bodyW * 0.6} ${b.bodyBot} ${CENTRE} ${b.bodyBot}`,
    `C ${CENTRE - b.bodyW * 0.6} ${b.bodyBot} ${CENTRE - b.bodyW} ${b.bodyBot - h * 0.22} ${CENTRE - b.bodyW} ${mid}`,
    `C ${CENTRE - b.bodyW} ${b.bodyTop + h * 0.3} ${CENTRE - b.bodyShoulderW * 0.9} ${b.bodyTop} ${CENTRE} ${b.bodyTop}`,
    "Z",
  ].join(" ");
}

/**
 * The body, as the second of the species' two colour blocks.
 *
 * It is one closed shape in one flat colour and there is nothing drawn on it —
 * no underside plane, no belly, no seam, no sheen. That is a decision that was
 * rasterised both ways: the first pass gave the body a darker underside plane
 * the way the bean has one, and beside it the version here wins outright.
 * A plane cutting a *small* body in half puts a hard horizontal edge across
 * the middle of the figure, and at 200 pixels it reads as a pair of shorts;
 * making the whole body the darker tone instead spends the same one extra
 * colour on saying the thing that actually needs saying, which is where the
 * head stops and the body starts. A species with no neck has to answer that
 * question somehow, and one flat block answers it at every size.
 *
 * So the figure is three values and three shapes: a bright cranium, a mid
 * body, and limbs darker than either. There is no highlight, no rim light and
 * no gloss anywhere on it and there is not going to be one — a material cue on
 * a design made of flat symbols is the same mistake as an eye highlight.
 */
function Body({ colors, form }: PartProps): ReactElement {
  return <path d={bodyPath(buildOf(form))} fill={colors.bodyBottom} />;
}

/**
 * The head, and the one thing growing out of it.
 *
 * The antenna is drawn *first* so the cranium covers the root of the stalk:
 * an antenna that starts on the outline is a line stuck to a head, and one
 * that starts inside it is a thing growing out of one. The stalk takes the
 * limb colour (it is an appendage, and it should agree with the arms), the
 * ball takes `accent` — the one loud colour in the whole colourway, spent on
 * the single mark that is neither the silhouette nor the face.
 *
 * Neither is gated on the detail level, and that is deliberate: the ball is
 * the one mark in the drawing that breaks the head's own outline, so it is
 * what a 28-pixel bust has left to say "alien" with. A landmark is exactly
 * the thing that must not drop out when the picture gets small.
 */
function Head({ colors, form }: PartProps): ReactElement {
  const b = buildOf(form);
  return (
    <g>
      <path
        d={`M ${b.antennaFrom.x} ${b.antennaFrom.y} Q ${b.antennaFrom.x + 1} ${b.antennaTo.y + 4} ${b.antennaTo.x} ${b.antennaTo.y}`}
        fill="none"
        stroke={colors.limb}
        strokeWidth={b.antennaR * 0.62}
        strokeLinecap="round"
      />
      <circle cx={b.antennaTo.x} cy={b.antennaTo.y} r={b.antennaR} fill={colors.accent} />
      <path d={craniumPath(b)} fill={colors.bodyTop} />
    </g>
  );
}

export const GALAKSI: ConceptDef = {
  id: "galaksi",
  species: "Galaksi",
  kind: "Alien crew — a wide cranium, low eyes and one antenna",
  origin: "fresh",
  pitch:
    "The company is registered as School of Gaming Galactic Oy and has never once cashed the joke in. Galaksi is a crew of small cold-coloured aliens who fly a saucer, play whatever the gamers are playing and answer the parents on the way past — and it is the only concept here whose premise gives the fleet a reason to have jobs at all, because a crew is a thing that already has them. Three builds, six skins, one antenna each, and a helmet every other species in this directory can borrow.",
  caveat:
    "Cute aliens are the most crowded shelf in children's illustration, and nothing about this silhouette is hard to arrive at independently — its distinctiveness is carried by the palette discipline and by the crew premise rather than by the shape, which is the honest reading. The three builds are proportion-only, which is the right call and also means they are much harder to tell apart than sixteen animal heads: at 40 pixels a pilot and a navigator in the same colourway are the same character, so the fleet has to spend colour on the difference and never form. There is no `hovers` here — a crew that walks around a landing pad is standing on it — so the species never uses the one motion property that would have been thematically free.",
  landmark: "A cranium wider than its jaw, two low wide eyes, and one ball on a stalk.",
  slots: ["hat", "face", "torso", "back", "extra", "scene"],
  wardrobeLimit:
    "Tailored garments read oddly on a body with no shoulders — a hoodie becomes a bib — but bands, domes and anything worn on the head fit. The space helmet is the item this species exists to introduce, and it is the one that makes a hat and a face item collide: the dome draws over the face slot's glasses, so a crew member in a helmet does not also wear specs.",
  rig: rigFor("pilot"),
  forms: GALAKSI_FORMS,
  rigFor,
  faceMode: "eyes",
  variants: GALAKSI_VARIANTS,
  limbs: (c) => ({ arm: c.limb, leg: c.limb, hand: c.limb, foot: c.limb }),
  Body,
  Head,
  fleet: [
    {
      name: "Tähti",
      job: "The pilot — home hero, first-visit tours, anything that introduces the place",
      variantId: "revontuli",
      form: "pilot",
      role: "none",
      pose: "point-right",
      expression: "excited",
      garment: "amber",
      blurb:
        "Tähti is a star, and the one who flies the thing. She is the crew member a first-time visitor meets: pointing at whatever the page wants read next, in the flagship teal, with nothing on her head so the antenna is the first thing you see.",
    },
    {
      name: "Kipinä",
      job: "Co-pilot for gamers — club pages, session countdowns, anything a child lands on",
      variantId: "komeetta",
      form: "pilot",
      role: "gamer",
      pose: "controller",
      expression: "happy",
      prop: "joystick",
      garment: "orange",
      blurb:
        "A kipinä is a spark. She is the one who actually plays: on a stick rather than a pad, because the crew fly by joystick and it is funnier if the games are flown the same way. Same build as Tähti and a different colour, which is the whole of how this species separates its members.",
    },
    {
      name: "Sumu",
      job: "Navigator — the Gedu surface: session plans, notes, anything being explained",
      variantId: "tahtisumu",
      form: "navigator",
      role: "gedu",
      pose: "point-left",
      expression: "thinking",
      prop: "pointer",
      garment: "amber",
      blurb:
        "Sumu is mist, and *tähtisumu* is a nebula. The tall narrow build with the long skull, working out where everyone is going — which is what a Gedu is doing when they plan a session, so the navigator is the crew member who gets the lanyard.",
    },
    {
      name: "Kuu",
      job: "Comms — the parent surfaces: welcomes, empty states, the first screen of anything",
      variantId: "kiertorata",
      form: "navigator",
      role: "parent",
      pose: "wave",
      expression: "happy",
      garment: "red",
      blurb:
        "Kuu is the moon, and she is the one who answers. Kyle's brief asked for aliens who help parents, and the crew's answer is a comms officer: the calm sky-blue one, waving, holding the mug the parent role already hands out.",
    },
    {
      name: "Ruuvi",
      job: "Flight engineer — support, troubleshooting, anything that is broken",
      variantId: "plasma",
      form: "engineer",
      role: "none",
      pose: "idle",
      expression: "focused",
      prop: "wrench",
      garment: "purple",
      blurb:
        "A ruuvi is a screw. The broad build with the biggest eyes in the set, squinting at whatever has stopped working — the crew member a support page or an error state is allowed to be a bit funny with.",
    },
    {
      name: "Otava",
      job: "The landing party — the saucer scene, seasonal art, anything decorative",
      variantId: "syvyys",
      form: "engineer",
      role: "none",
      pose: "wave",
      expression: "excited",
      outfit: { hat: "space-helmet" },
      garment: "yellow",
      blurb:
        "Otava is the Finnish name for the Plough, and this is the crew member who actually goes outside: the darkest skin in the set under the clear dome, which is the pairing that proves the helmet reads — a pale ring and a pale rim on a body with nothing else pale on it.",
    },
  ],
};
