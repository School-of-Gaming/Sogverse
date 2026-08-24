/**
 * Marja — the berries.
 *
 * Kyle's brief for this round was one sentence long: "more things inspired by
 * Finnish nature such as berries and mushrooms … we could lean into Finns'
 * love of nature." It is the easiest brief in the directory to get right and
 * the easiest to over-build, because a berry is *already* the shape the
 * simplicity ruling has been asking every other species to become. A ball, one
 * flat colour, a green stalk. There is nothing to strip.
 *
 * So this concept is the ruling's test case rather than another interpretation
 * of it. Every form is a silhouette plus at most one extra mark, every mark is
 * a flat block, and the thing that tells four characters apart is the colour
 * of the fruit — which is the half of the ruling that gets forgotten, because
 * removing detail is visible work and choosing colour is not.
 *
 * ## The four forms, and the one mark each is allowed
 *
 * - **`mustikka`** — a bilberry. A sphere, and the five-pointed calyx star on
 *   its crown, which is the only thing on a real one and is drawn in the
 *   body's own pale tint rather than in a second hue.
 * - **`puolukka`** — a lingonberry. A sphere and *nothing*: the deepest red in
 *   the set, an underside plane, and the shared stalk. It is the control that
 *   proves the ball reads on its own, and it is deliberately the plainest
 *   thing in this whole module.
 * - **`lakka`** — a cloudberry. The one silhouette change: six round globes
 *   around a core, because a cloudberry is a cluster of drupelets and that
 *   bumpy edge is the entire identity at 40 pixels. The two lowest globes are
 *   painted in the underside colour, which is how this species gives a lumpy
 *   shape a bottom without drawing a single line.
 * - **`mansikka`** — a strawberry. A wide shoulder tapering to a blunt point,
 *   and a five-leaf crown. **The seeds are not drawn.** They are the first
 *   thing anyone reaches for and they are texture: a hundred and fifty
 *   sub-pixel pips at 40px are a dirty smudge on a red shape, and the taper
 *   plus the crown already say strawberry from across a room.
 *
 * ## Why the green is a constant and the fruit is the variable
 *
 * A leaf, a calyx, a stalk and two stem legs are all the same plant, so they
 * are all one colour — `MARJA_LEAF`, shared by every form and every colourway.
 * Nothing botanical about this species ever changes; only the berry does.
 * That is what makes a lineup of five of these read as one species rather than
 * as five drawings, and it is why the legs are green: a berry's legs are its
 * stalk, so painting them from the body would have been the *less* simple
 * choice as well as the less true one.
 *
 * ## Face: `eyes`, not `cyclops`
 *
 * Both were rasterised on the dark ground at 200 and at 40. The one-eyed read
 * is genuinely cute on a sphere — and it is Silmu's, which settles it: this
 * module already has a one-eyed bean, and a one-eyed ball beside it is the
 * same character in fruit colours. The paired face also buys back the one dial
 * a sphere has no other way to spend, the brow: there is no head to tilt
 * (`fusedHead`), no ears to flatten and no muzzle to open, so two short lines
 * above two eyes are the whole of this species' surprise.
 *
 * ## Rig
 *
 * Straight from Silmu's, because the anatomy is the same anatomy: a body that
 * is its own head, two stem legs ending in a lobe that bulges outward, arms
 * only when a pose or a prop needs them, and mittens on the end of them. That
 * reuse is the point of the directory — the berry cost a body path and a
 * colour table, and arrived with twelve poses and a wardrobe.
 *
 * The numbers that are not Silmu's: the ball is `r 56` about `(100, 96)`, four
 * units wider than the bean, because a circle with no flats at the top and
 * bottom reads smaller than a bean of the same width; the eyes are a pair at
 * `±23` rather than one on the centre line; and the crop window is centred
 * eighteen units higher so the calyx and the leaf crown are inside the bust.
 */

import type { ReactElement } from "react";

import type { ConceptDef, FormDef, PartProps } from "../concept";
import { MARJA_LEAF, MARJA_VARIANTS } from "../palette";
import type { Rig } from "../rig";

export const MARJA_FORMS: readonly FormDef[] = [
  {
    id: "mustikka",
    label: "Mustikka — bilberry",
    note: "A sphere and the five-point calyx star. The flagship.",
  },
  {
    id: "puolukka",
    label: "Puolukka — lingonberry",
    note: "A sphere and nothing else. The plainest form in the module, on purpose.",
  },
  {
    id: "lakka",
    label: "Lakka — cloudberry",
    note: "Six round globes. The only silhouette change in the family.",
  },
  {
    id: "mansikka",
    label: "Mansikka — strawberry",
    note: "A taper to a blunt point under a five-leaf crown. No seeds.",
  },
];

/** The ball every form is measured against. */
const BALL = { cx: 100, cy: 96, r: 56 } as const;

const RIG: Rig = {
  shadow: { cx: 100, cy: 186, rx: 44, ry: 7 },
  // Inside the fruit rather than on its underside, so the join stays covered
  // whatever the walk cycle does to the legs — Silmu's trick, same reason.
  hip: { x: 100, y: 140 },
  hipSpread: 14,
  footY: 173,
  footStyle: "stem",
  // On the flank at the height a berry would have shoulders if it had any,
  // which it does not: `armsOnDemand` means these sockets are only ever used
  // by a pose that is doing something with its hands.
  shoulderL: { x: 54, y: 112 },
  shoulderR: { x: 146, y: 112 },
  // A fused body's `head` is the bust window and the scale every worn thing
  // takes, not a head. 38 puts the window on x 32–168 and y 27–163: the whole
  // fruit, its crown mark, and none of the feet.
  head: { x: 100, y: 76, r: 38 },
  eyeDx: 23,
  eyeY: 100,
  eyeR: 12,
  mouthY: 122,
  crown: { x: 100, y: 42 },
  crownW: 78,
  reach: 4,
  limbW: 13,
  handR: 8,
  limbStyle: "straight",
  handStyle: "mitten",
  armsOnDemand: true,
  armLen: 44,
  legLen: 42,
  torso: { x: 64, y: 126, w: 72, h: 26 },
  fusedHead: true,
};

/** The strawberry: a wide shoulder falling to a blunt point. */
const MANSIKKA = [
  "M 45 84",
  "C 45 55 69 39 100 39",
  "C 131 39 155 55 155 84",
  "C 155 113 129 143 100 159",
  "C 71 143 45 113 45 84",
  "Z",
].join(" ");

/** Its underside — the two lower curves retraced, closed with a flatter arc. */
const MANSIKKA_UNDER = [
  "M 47 96",
  "C 51 121 74 145 100 159",
  "C 126 145 149 121 153 96",
  "C 142 122 123 138 100 141",
  "C 77 138 58 122 47 96",
  "Z",
].join(" ");

/** The sphere's underside plane, retracing its own lower arc. */
const BALL_UNDER = [
  "M 44.6 108",
  "C 50 133 73 152 100 152",
  "C 127 152 150 133 155.4 108",
  "C 144 132 124 146 100 146",
  "C 76 146 56 132 44.6 108",
  "Z",
].join(" ");

/**
 * A cloudberry's drupelets: a core with six globes round it.
 *
 * Three numbers here are the whole form, and all three came off rasters rather
 * than off a first guess.
 *
 * **Six, not eight.** Eight small globes on a wide ring cut deep narrow
 * scallops and rasterised as a sunflower. Six large ones on a tighter ring
 * leave nine units between a peak and a valley — nearly two pixels at a
 * 40-pixel render, which is the least a bump can be and still be one — while
 * the lobes stay wide enough to read as berries rather than as petals.
 *
 * **Rotated thirty degrees, so there is a notch at the top and not a point.**
 * A ring with one globe pointing straight up is a flower whatever else is done
 * to it; a pair of globes with a shallow dip between them is fruit. This is
 * the single change that stopped the form reading as a daisy, and it costs
 * nothing.
 *
 * **The two lowest globes are drawn behind, in the underside colour.** The
 * core (`r 36`) then covers everything but a crescent along the bottom of
 * each, which is this species' underside plane arriving for free out of the
 * shapes the silhouette is already made of. Drawing them *over* the finished
 * cluster instead — the obvious way round — shades half the berry including
 * the ground the mouth is drawn on, which is what the second raster of this
 * form showed.
 */
const LOBES = [-60, 0, 60, 120, 180, 240].map((deg) => {
  const a = (deg * Math.PI) / 180;
  return {
    key: deg,
    x: 100 + Math.cos(a) * 30,
    y: 96 + Math.sin(a) * 30,
    r: 25,
    low: deg === 60 || deg === 120,
  };
});

/** A five-pointed star, as one closed path — the bilberry's calyx and nothing else. */
function star(cx: number, cy: number, outer: number, inner: number): string {
  const points = 5;
  const parts: string[] = [];
  for (let i = 0; i < points * 2; i += 1) {
    const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? outer : inner;
    const x = (cx + Math.cos(a) * r).toFixed(1);
    const y = (cy + Math.sin(a) * r).toFixed(1);
    parts.push(`${i === 0 ? "M" : "L"} ${x} ${y}`);
  }
  parts.push("Z");
  return parts.join(" ");
}

/**
 * The fruit.
 *
 * Three of the four are the same circle and differ only in colour; the
 * cloudberry is the one that changes shape and the strawberry the one that
 * changes proportion. Nothing here carries a highlight, a seam or a speckle,
 * and the lingonberry is the proof that it does not need to — "glossy" on a
 * flat-symbol species is a *darker underside*, which is a colour block, and
 * not a white ellipse, which is a material cue and is forbidden on every body
 * in this module.
 */
function Body({ colors, form }: PartProps): ReactElement {
  if (form === "mansikka") {
    return (
      <g>
        <path d={MANSIKKA} fill={colors.bodyTop} />
        <path d={MANSIKKA_UNDER} fill={colors.bodyBottom} opacity={0.7} />
      </g>
    );
  }
  if (form === "lakka") {
    return (
      <g>
        {LOBES.filter((l) => l.low).map((l) => (
          <circle key={l.key} cx={l.x} cy={l.y} r={l.r} fill={colors.bodyBottom} />
        ))}
        <circle cx={BALL.cx} cy={BALL.cy} r={36} fill={colors.bodyTop} />
        {LOBES.filter((l) => !l.low).map((l) => (
          <circle key={l.key} cx={l.x} cy={l.y} r={l.r} fill={colors.bodyTop} />
        ))}
      </g>
    );
  }
  return (
    <g>
      <circle cx={BALL.cx} cy={BALL.cy} r={BALL.r} fill={colors.bodyTop} />
      <path d={BALL_UNDER} fill={colors.bodyBottom} opacity={0.7} />
    </g>
  );
}

/**
 * The plant, which is drawn *after* the fruit and before anything worn.
 *
 * Splitting it out of `Body` is what puts a hat on top of a stalk rather than
 * under it, and it is also the honest division of the species: the body is the
 * berry and this is the bush it came off. Every form gets the same stalk; two
 * of them get one mark more.
 */
function Head({ colors, form }: PartProps): ReactElement {
  return (
    <g>
      {/* The stalk. Seven units across and twenty tall, which is one pixel by
          three at 40px — small, and the difference between a berry and a ball.
          The bilberry is the one form without it: a real one has the calyx
          star there instead, and drawing both put two marks on the crown of
          the simplest shape in the module. */}
      {form !== "mustikka" && (
        <path d="M 96.5 50 L 103.5 47 L 107 29 L 99.5 28 Z" fill={MARJA_LEAF} />
      )}
      {form === "mustikka" && <path d={star(100, 61, 16, 6.5)} fill={colors.panel} />}
      {form === "mansikka" && <MansikkaCrown />}
    </g>
  );
}

/**
 * One leaf of a strawberry's calyx, drawn once pointing up and rotated into
 * five. Rotating a single lozenge rather than plotting five is not a saving —
 * it is the only way the five come out identical, which is what makes the
 * crown read as one shape with points rather than as five leaves that were
 * placed by hand and disagree.
 */
const CROWN_LEAF = "M 100 66 L 90 44 L 100 20 L 110 44 Z";
const CROWN_ANGLES = [-72, -36, 0, 36, 72];

function MansikkaCrown(): ReactElement {
  return (
    <g fill={MARJA_LEAF}>
      {CROWN_ANGLES.map((a) => (
        <path key={a} d={CROWN_LEAF} transform={a === 0 ? undefined : `rotate(${a} 100 66)`} />
      ))}
    </g>
  );
}

export const MARJA: ConceptDef = {
  id: "marja",
  species: "Marja",
  kind: "Berry — a ball that is its own head, on green stalk legs",
  origin: "fresh",
  pitch:
    "The simplicity ruling with nothing left to argue about. A berry is a circle, one flat colour and a green stalk, and every Finn already knows all four of these by name — mustikka, puolukka, lakka and mansikka are what a Finnish childhood is measured in. A child can draw one. A parent gets the forest. The whole cast is told apart by fruit colour, which is the property that survives every scale, so the 28-pixel avatar is as legible as the hero.",
  caveat:
    "It is a sphere, so it has no shoulders, no neck and no head to tilt — the wardrobe is bands and hats only, and every expression has to come out of two eyes and two brows with nothing else helping. Two of the four forms are the same circle in two different reds, which is fine in a lineup and honestly ambiguous alone: a puolukka on its own reads as \"red berry\" rather than as a lingonberry. And the stalk and the calyx sit exactly where a hat lands, so a Marja in a beanie loses the mark that makes it a berry rather than a ball.",
  landmark: "A fruit-coloured ball with a green stalk on its crown, and two green stem legs under it.",
  slots: ["hat", "face", "torso", "back", "extra", "scene"],
  wardrobeLimit:
    "No hoodie and no tee — a sphere has no shoulders, so a sleeved garment reads as a bib. A hat covers the stalk and the calyx, which is a real loss on this species rather than a cosmetic one: dress a Marja from the head down only when the colour alone is carrying it.",
  rig: RIG,
  forms: MARJA_FORMS,
  faceMode: "eyes",
  variants: MARJA_VARIANTS,
  limbs: (c) => ({ arm: c.limb, leg: c.limb, hand: c.limb, foot: c.limb }),
  Body,
  Head,
  fleet: [
    {
      name: "Mansi",
      job: "The introducer — home hero, first-visit tours, anything saying hello",
      variantId: "mansikka",
      form: "mansikka",
      role: "none",
      pose: "wave",
      expression: "excited",
      garment: "teal",
      blurb:
        "The strawberry, because it is the one berry a seven-year-old recognises from the doorway — the leaf crown is the loudest silhouette in the family and the brighter of the two reds goes under it.",
    },
    {
      name: "Mustis",
      job: "Gamer stand-in — session pages, the gamer dashboard, anywhere a child's photo cannot go",
      variantId: "mustikka",
      form: "mustikka",
      role: "gamer",
      pose: "controller",
      expression: "focused",
      garment: "cyan",
      blurb:
        "Mustis is what a Finnish child comes home from the forest looking like. Deep blue-violet, the calyx star on top, a controller in both mittens — and the one form in the family whose body is dark enough that its mouth is drawn in paper rather than in ink.",
    },
    {
      name: "Punakka",
      job: "Parent stand-in — the parent dashboard, billing, anything written to a grown-up",
      variantId: "puolukka",
      form: "puolukka",
      role: "parent",
      pose: "idle",
      expression: "happy",
      prop: "basket",
      garment: "emerald",
      blurb:
        "A lingonberry: the deepest red in the set, a perfectly plain sphere, and a basket. Punakka is the Finnish for ruddy-cheeked, which is both what the berry is and what a parent looks like coming in off a September bog.",
    },
    {
      name: "Hilla",
      job: "Gedu expert — session notes, the gedu workspace, anything being explained",
      variantId: "lakka",
      form: "lakka",
      role: "gedu",
      pose: "point-left",
      expression: "thinking",
      prop: "pointer",
      garment: "purple",
      blurb:
        "Hilla is the other Finnish word for a cloudberry and a real given name besides, which makes her the only member of this fleet who can be introduced without explanation. Amber, eight lobes, and the rarest thing on the bog.",
    },
  ],
};
