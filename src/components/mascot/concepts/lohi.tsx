/**
 * Lohi — the dragon cast, built out of five shapes.
 *
 * Kyle asked for a cute dragon cast, and named the thing it must not be: the
 * Ender Dragon. So the hard line is drawn first, because every dragon
 * reference a person has seen in the last decade is that one — **nothing here
 * is black, nothing is purple-eyed, nothing has a membrane wing on a long
 * bony arm, and nothing is bigger than the child looking at it.** A wyvern
 * silhouette (huge leathery wings, a long neck, a whip tail) is the shape that
 * reads as that mob at any size, so this species is the opposite of it at
 * every point: a round body two heads tall, wings that are two small lobes
 * peeking out behind the shoulders, a short tail with a leaf on the end, and a
 * salmon-pink body. Held next to the mob at 40 pixels there is nothing to
 * confuse: one is a black silhouette that is mostly wing, the other is a pink
 * ball with a snout.
 *
 * ## Why Lohi
 *
 * *Lohikäärme* is the Finnish word for dragon; *lohi* on its own is a salmon.
 * The pun is free, it is Finnish, it is not anybody else's, and it decides
 * three things that would otherwise have been arbitrary: the flagship body is
 * salmon-pink, the fleet is named after the rivers a salmon runs up (Kymi,
 * Teno, Aura, Vuoksi), and the species belongs to *water* rather than to a
 * volcano — which is the other half of what keeps it away from the fire-and-
 * obsidian dragon everyone else draws. The one member who admits to the fire
 * is the engineer, and he is in the engine room, where fire is a job.
 *
 * ## What a dragon is, reduced to geometry
 *
 * The simplicity ruling says a species is a silhouette plus one or two flat
 * colour blocks, and props are the only additive layer. A dragon is a hard
 * case for that, because it is *defined* by a list of appendages. So each
 * landmark had to earn its place at 40 pixels, and each one is a shape in the
 * outline rather than a mark on the body:
 *
 * - **A blunt snout that is part of the outline** — a muzzle bulge in the
 *   body's own colour hanging below the skull, with a pale jaw block on its
 *   underside and two nostrils high on it. The first three drafts drew the
 *   snout as a pale oval *inside* a circular head, which is a pig; the
 *   silhouette has to change or nothing else on the head matters.
 * - **Two horns**, tapering from a broad base to a blunt tip, swept up and
 *   out from the *top* of the skull. Also learned the hard way: an ellipse
 *   leaning off the head's upper corner is a cat's ear, and an ellipse
 *   anywhere on a round head is an ear of some kind. A horn tapers.
 * - **A frill**, as a scalloped line — three bumps over the crown, drawn
 *   behind the head so only their tops show. This is the landmark that says
 *   "dragon" once the horns have said "horned animal", and it is the one that
 *   the elder build repeats under the chin as a beard.
 * - **Two small rounded wings**, part of the body and not an accessory,
 *   because a wing is the animal — see the note in the animal family about
 *   what a form may not do. Two lobes with a scalloped trailing edge, sized so
 *   that at 40 pixels they are two bumps on the shoulder line.
 * - **A short tail with a leaf tip.** The tip is one flat colour with the
 *   tail, not a second block: the fox in the animal family lost its white
 *   tail tip for exactly this reason, and the lesson transfers.
 *
 * Five landmarks is more than this directory usually spends, and the honest
 * reason is that a dragon with four of them is a lizard. What is *not* here
 * is everything a dragon usually also gets: belly plates, scales, claws,
 * spines down the spine, a second horn pair, teeth, a forked tongue, a glow.
 * Every one of those is texture or a realism cue and none of them survives a
 * 40-pixel raster.
 *
 * ## Forms: age, not breed
 *
 * The brief offered a choice — three ages, or three body types. It is three
 * ages, for the reason the humanoid families are: **the job this fleet has to
 * do first is stand in for a child, an adult and an expert**, and age is the
 * only axis that changes the silhouette rather than the costume. A hatchling
 * is a big head on a small body with nub wings; a grown one has a neck, which
 * is the single cue that ages an animal fastest; an elder is the grown one
 * with a frill beard and heavier horns. Three body types would have been
 * three drawings of the same age, which is a *cast* but not a *family*, and
 * the family is what fills the person-shaped hole.
 *
 * The other reason is mechanical: a form may change the rig, and age changes
 * the rig honestly (head radius, eye row, crown line, where the neck is).
 * Breed differences would all have been the same rig with different
 * decoration, which the simplicity rule spends its whole argument against.
 *
 * ## Face mode: `eyes`
 *
 * Two eyes, the ordinary symbol pair. A dragon's face is built around a
 * *snout*, and a snout is a horizontal block with something above it: one
 * central eye lands directly over the snout's midline and reads as a
 * cyclops-lizard, which is a different and much less friendly animal. The
 * paired eyes also let the two dials this species leans on hardest work — the
 * eye row sits high and wide on the hatchling (young) and lower and closer on
 * the elder (old), which is most of what separates the three builds in a bust
 * crop. `lid` belongs to the flat humanoids and `voxel` to the cube species;
 * neither is this.
 *
 * ## Grounded, not hovering
 *
 * `hovers` was drawn both ways and rasterised — the grounded still beside the
 * hover loop's own peak frame, which is the whole figure lifted seven units
 * with the ground shadow left where it was. The lifted one reads as *pasted
 * onto* the page: the soles hang a visible gap above their own shadow, and
 * nothing on this body explains why, because the wings are two lobes the size
 * of its own head and a child can see they are not doing it. Grounded, it is a
 * small heavy animal standing next to you, which is also the funnier of the
 * two — a dragon too round to fly is a character, a dragon hanging in the air
 * is a logo. So the whole cast keeps its feet on the ground, and the wings are
 * what it will fly with *later*, which is the right joke for a company whose
 * users are eight.
 */

import type { ReactElement } from "react";

import type { ConceptDef, FormDef, PartProps } from "../concept";
import { LOHI_VARIANTS, MASCOT_INK } from "../palette";
import type { Rig } from "../rig";

export const LOHI_FORMS: readonly FormDef[] = [
  {
    id: "kid",
    label: "Poikanen — hatchling",
    note: "Big head, no neck, nub wings. The one a seven-year-old draws.",
  },
  {
    id: "grown",
    label: "Aikuinen — grown",
    note: "A neck, and wings that have grown into themselves.",
  },
  {
    id: "old",
    label: "Vanhus — elder",
    note: "Heavier horns and a frill beard. The same frill, moved under the chin.",
  },
];

/**
 * The three builds, as numbers rather than as three drawings.
 *
 * Everything the forms disagree about lives here, so `Body` and `Head` are one
 * drawing each with a lookup in them rather than a switch per landmark. The
 * head radii and eye rows are in the rigs below; this is the part the drawing
 * needs and the rig has no slot for.
 */
type FormSpec = {
  /** The body ellipse. The hatchling's is smaller so its head reads bigger. */
  body: { cy: number; rx: number; ry: number };
  /** How much of the full-size wing this build has. */
  wing: number;
  /** Whether there is a neck between the head and the body. */
  neck: boolean;
  /** Whether the frill is repeated under the chin. */
  beard: boolean;
  /** How much of the full-size horn this build carries. */
  horn: number;
  /**
   * Where the tail leaves the body, how thick it is, and where the leaf on
   * the end of it sits. The grown build and the elder share one tail on
   * purpose: age is in the head and the frill, and a tail that also grew
   * would be a second thing saying the same word.
   */
  tail: { d: string; w: number; tip: { x: number; y: number; r: number } };
};

const FORM_SPECS: Record<string, FormSpec> = {
  kid: {
    body: { cy: 137, rx: 32, ry: 26 },
    wing: 0.66,
    neck: false,
    beard: false,
    horn: 0.86,
    tail: {
      d: "M 124 154 C 142 160 155 153 155 143",
      w: 9,
      tip: { x: 155, y: 135, r: 8 },
    },
  },
  grown: {
    body: { cy: 132, rx: 36, ry: 30 },
    wing: 1,
    neck: true,
    beard: false,
    horn: 1,
    tail: {
      d: "M 128 154 C 152 160 170 152 170 141",
      w: 11,
      tip: { x: 170, y: 133, r: 11 },
    },
  },
  old: {
    body: { cy: 132, rx: 37, ry: 30 },
    wing: 0.92,
    neck: true,
    beard: true,
    horn: 1.15,
    tail: {
      d: "M 128 154 C 152 160 170 152 170 141",
      w: 11,
      tip: { x: 170, y: 133, r: 11 },
    },
  },
};

function specOf(form: string): FormSpec {
  return FORM_SPECS[form] ?? FORM_SPECS.grown;
}

const BASE: Rig = {
  shadow: { cx: 100, cy: 186, rx: 38, ry: 7 },
  hip: { x: 100, y: 150 },
  hipSpread: 18,
  footY: 180,
  footStyle: "round",
  shoulderL: { x: 68, y: 122 },
  shoulderR: { x: 132, y: 122 },
  head: { x: 100, y: 58, r: 31 },
  eyeDx: 13,
  eyeY: 53,
  eyeR: 7,
  // On the snout, under the nose. Every build puts it at the same fraction of
  // the snout block, which is why the three numbers below look unrelated.
  mouthY: 87,
  crown: { x: 100, y: 26 },
  crownW: 46,
  reach: 6,
  limbW: 12,
  handR: 9,
  // A round animal with no visible elbow, exactly like the animal family. A
  // jointed arm on a body this soft turns a cub into a small bodybuilder.
  limbStyle: "tapered",
  armLen: 42,
  legLen: 34,
  torso: { x: 68, y: 112, w: 64, h: 46 },
  fusedHead: false,
  // Deliberately absent: see the note about hovering at the top of the file.
};

/**
 * Age, as four numbers.
 *
 * The head does most of it — a hatchling's is a quarter bigger than an
 * elder's on the same body — and the eye row does the rest: high and wide
 * apart on the young one, lower and closer on the old one. The crown line
 * moves with the head, and stays at or above 26, which the animal family
 * established as the height a beanie still clears standing still.
 */
function rigFor(form: string): Rig {
  switch (form) {
    case "kid":
      return {
        ...BASE,
        hip: { x: 100, y: 152 },
        shoulderL: { x: 70, y: 126 },
        shoulderR: { x: 130, y: 126 },
        head: { x: 100, y: 68, r: 36 },
        eyeDx: 14,
        eyeY: 62,
        eyeR: 8,
        mouthY: 101,
        crown: { x: 100, y: 30 },
        crownW: 52,
        legLen: 32,
      };
    case "old":
      return {
        ...BASE,
        head: { x: 100, y: 58, r: 30 },
        eyeDx: 12,
        eyeY: 52,
        eyeR: 6.5,
        mouthY: 86,
        crown: { x: 100, y: 24 },
        crownW: 50,
      };
    case "grown":
    default:
      return BASE;
  }
}

/**
 * One wing: a rounded lobe with two scallops out of its trailing edge, rooted
 * inside the body so the join never shows.
 *
 * The points are written once, for the viewer's right, as offsets from the
 * centre line, and both the mirror and the build's size come out of the same
 * two arguments. `k` scales the whole shape about its root, so a hatchling's
 * wing is the grown one at two thirds rather than a second path to keep in
 * step with the first.
 */
function wingPath(side: 1 | -1, k: number): string {
  const rootX = 22;
  const rootY = 116;
  const p = (dx: number, dy: number): string => {
    const x = 100 + side * (rootX + (dx - rootX) * k);
    const y = rootY + (dy - rootY) * k;
    return `${Math.round(x * 100) / 100} ${Math.round(y * 100) / 100}`;
  };
  return [
    `M ${p(rootX, rootY)}`,
    `C ${p(30, 96)} ${p(44, 80)} ${p(60, 78)}`,
    `C ${p(62, 90)} ${p(58, 100)} ${p(50, 104)}`,
    `C ${p(54, 112)} ${p(46, 120)} ${p(34, 120)}`,
    "Z",
  ].join(" ");
}

/**
 * One horn: a tapered cone leaving the top of the skull, swept out and back.
 *
 * Written in units of the *skull's* radius so all three builds share it, and
 * scaled about its base so an elder's heavier horn is the same shape rather
 * than a second path. The tip lands about four tenths of a skull radius above
 * the crown — far enough to be a horn, and short enough that the bust crop
 * keeps both tips, which an earlier and handsomer horn did not.
 */
function hornPath(side: 1 | -1, x: number, y: number, rs: number, k: number): string {
  const baseX = 0.36;
  const baseY = -0.96;
  const p = (dx: number, dy: number): string => {
    const px = x + side * (baseX + (dx - baseX) * k) * rs;
    const py = y + (baseY + (dy - baseY) * k) * rs;
    return `${Math.round(px * 100) / 100} ${Math.round(py * 100) / 100}`;
  };
  return [
    `M ${p(0.22, -0.98)}`,
    `C ${p(0.28, -1.2)} ${p(0.46, -1.3)} ${p(0.66, -1.36)}`,
    `C ${p(0.58, -1.12)} ${p(0.54, -1.0)} ${p(0.5, -0.88)}`,
    "Z",
  ].join(" ");
}

/**
 * The puff of flame, and the two things it must not be.
 *
 * A teardrop is a *shape*, not a meaning: the same outline is a flame, a horn
 * or a tear depending entirely on where it sits and which way it points. Both
 * failures are one placement away and both were drawn before this one was
 * kept — centred above the muzzle, between the eyes, it is a unicorn's horn;
 * anywhere on the cheek under an eye it is a tear, which on a character built
 * to make children smile is the worst available reading.
 *
 * What is left, front-on, is the free air beside the muzzle's lower corner,
 * where the head has already narrowed. So the puff sits just off the snout at
 * the mouth's outer corner, tilted out and up, floating clear of the
 * silhouette with a gap on every side — attached to nothing, which is what
 * stops it being an appendage, and rising away from the face, which is what
 * makes it a puff rather than a drip. It is also placed to clear the elder's
 * beard, whose outermost frill bump comes down into the same corner: at nine
 * tenths of a skull radius out and just under one down, it misses the bump on
 * every build rather than being moved per form.
 *
 * One flat shape in the colourway's `spark`, which this species spends on the
 * flame and on nothing else. No glow, no gradient, no second colour inside it:
 * the same rule that keeps a highlight off an eye keeps a fire from being lit.
 */
function flamePath(x: number, y: number, rs: number): string {
  const h = rs * 0.38;
  const w = rs * 0.22;
  const p = (dx: number, dy: number): string =>
    `${Math.round((x + dx) * 100) / 100} ${Math.round((y + dy) * 100) / 100}`;
  return [
    `M ${p(0, -h)}`,
    `C ${p(w * 0.85, -h * 0.3)} ${p(w, h * 0.2)} ${p(0, h * 0.55)}`,
    `C ${p(-w, h * 0.2)} ${p(-w * 0.85, -h * 0.3)} ${p(0, -h)}`,
    "Z",
  ].join(" ");
}

/**
 * The frill, as a run of discs on a circle.
 *
 * Drawn *behind* the head so only the caps show, which is what makes a row of
 * circles read as a scalloped edge rather than as a row of circles. The same
 * function draws the crown crest and the elder's beard; they differ by where
 * on the head's circumference they start and what colour they are, which is
 * the whole of the idea that an elder is a build rather than a drawing.
 */
function Frill({
  x,
  y,
  r,
  from,
  to,
  count,
  size,
  fill,
}: {
  x: number;
  y: number;
  r: number;
  /** Degrees clockwise from straight up. */
  from: number;
  to: number;
  count: number;
  size: number;
  fill: string;
}): ReactElement {
  return (
    <g fill={fill}>
      {Array.from({ length: count }, (_unused, i) => {
        const t = count === 1 ? 0.5 : i / (count - 1);
        const a = ((from + (to - from) * t) * Math.PI) / 180;
        return (
          <circle
            key={i}
            cx={Math.round((x + Math.sin(a) * r) * 100) / 100}
            cy={Math.round((y - Math.cos(a) * r) * 100) / 100}
            r={size}
          />
        );
      })}
    </g>
  );
}

function Body(props: PartProps): ReactElement {
  const { colors, form } = props;
  const spec = specOf(form);
  const { cy, rx, ry } = spec.body;
  return (
    <g>
      {/* Wings and tail first: both are rooted inside the body, and the body
          drawn over them is what hides every join. */}
      <path d={wingPath(-1, spec.wing)} fill={colors.bodyBottom} />
      <path d={wingPath(1, spec.wing)} fill={colors.bodyBottom} />
      <path
        d={spec.tail.d}
        fill="none"
        stroke={colors.bodyBottom}
        strokeWidth={spec.tail.w}
        strokeLinecap="round"
      />
      {/* The leaf on the end of the tail. One flat colour with the tail — a
          second colour here is the fox's white tail tip, which came off in the
          simplicity pass because at 40px it read as a frayed end. */}
      <path
        d={[
          `M ${spec.tail.tip.x} ${spec.tail.tip.y - spec.tail.tip.r * 1.25}`,
          `C ${spec.tail.tip.x + spec.tail.tip.r} ${spec.tail.tip.y - spec.tail.tip.r * 0.5}`,
          `${spec.tail.tip.x + spec.tail.tip.r} ${spec.tail.tip.y + spec.tail.tip.r * 0.6}`,
          `${spec.tail.tip.x} ${spec.tail.tip.y + spec.tail.tip.r * 1.25}`,
          `C ${spec.tail.tip.x - spec.tail.tip.r} ${spec.tail.tip.y + spec.tail.tip.r * 0.6}`,
          `${spec.tail.tip.x - spec.tail.tip.r} ${spec.tail.tip.y - spec.tail.tip.r * 0.5}`,
          `${spec.tail.tip.x} ${spec.tail.tip.y - spec.tail.tip.r * 1.25}`,
          "Z",
        ].join(" ")}
        fill={colors.bodyBottom}
      />
      {spec.neck && (
        // The neck belongs to the body rather than to the head, for the reason
        // the giraffe's does: the head group rotates about a point just under
        // the head, so a neck drawn up there would swing at its base every
        // time the idle tilted. Down here the head pivots on the neck.
        <path d="M 89 112 C 89 98 91 88 92 78 L 108 78 C 109 88 111 98 111 112 Z" fill={colors.bodyTop} />
      )}
      <ellipse cx={100} cy={cy} rx={rx} ry={ry} fill={colors.bodyTop} />
      {/* The belly: one flat plane, which is the sanctioned way to give a
          closed shape a top and a bottom. Not plates, not scales, not a sheen. */}
      <ellipse cx={100} cy={cy + 5} rx={rx * 0.62} ry={ry * 0.66} fill={colors.panel} />
    </g>
  );
}

function Head(props: PartProps): ReactElement {
  const { rig, colors, form, detail, expression } = props;
  const { x, y, r } = rig.head;
  const spec = specOf(form);
  // The skull is drawn a tenth smaller than the rig's nominal head radius, and
  // the tenth is what the horns are made of. `head.r` is not a measurement of
  // this species' skull — it is the size the bust crop and every worn thing
  // scale against, and the crop window it opens reaches 1.3 radii above the
  // head's centre. A horn drawn from the top of a full-radius skull has 0.3 of
  // a radius to live in before the portrait cuts its tips off, which is a nub;
  // drawing the skull at 0.9 and the horn to 1.25 gives the same portrait a
  // horn four tenths of a skull long. Everything else on the head is in skull
  // radii for the same reason.
  const rs = r * 0.9;
  // The muzzle bulge, and the pale jaw on the underside of it.
  const snoutY = y + rs * 0.7;
  const snoutRx = rs * 0.54;
  const snoutRy = rs * 0.56;
  const jawY = y + rs * 0.94;
  return (
    <g>
      {/* Behind the head: the crown frill and, on the elder, the beard. Only
          the caps clear the head circle, which is what makes them scallops. */}
      <Frill x={x} y={y} r={rs * 0.99} from={-20} to={20} count={3} size={rs * 0.17} fill={colors.bodyBottom} />
      {spec.beard && (
        <Frill x={x} y={y} r={rs * 0.99} from={126} to={234} count={5} size={rs * 0.22} fill={colors.panel} />
      )}
      {/* The horns. Two rounds of rasters went into the shape of these and
          both failures are worth recording: an ellipse at the head's upper
          corner is a cat's ear, and an ellipse anywhere on a round head is an
          ear of some kind. A horn has to *taper* and it has to leave the top
          of the skull rather than its corner — a broad base narrowing to a
          blunt tip, swept out and back. That, and nothing else on the head,
          is what stopped the drawing reading as a cat. */}
      <path d={hornPath(-1, x, y, rs, spec.horn)} fill={colors.bodyBottom} />
      <path d={hornPath(1, x, y, rs, spec.horn)} fill={colors.bodyBottom} />
      <circle cx={x} cy={y} r={rs} fill={colors.bodyTop} />
      {/* The snout, and the thing that took the longest to get right.
          A pale oval *inside* a circular head is a pig, and it stayed a pig
          through three rasters: the silhouette was still a circle, so the only
          thing separating this from a pony was where the pale bit sat. What
          fixes it is that the snout is part of the *outline* — a bulge in the
          body's own colour that hangs below the skull — with the pale block
          reduced to the jaw underneath it. Head plus muzzle is a snouted
          animal at any size; a circle with a patch on it never is. */}
      <ellipse cx={x} cy={snoutY} rx={snoutRx} ry={snoutRy} fill={colors.bodyTop} />
      <ellipse cx={x} cy={jawY} rx={snoutRx * 0.78} ry={snoutRy * 0.54} fill={colors.panel} />
      {detail !== "icon" && (
        // Two nostrils rather than one nose, high on the muzzle: a bear has a
        // nose, a lizard has holes in its face, and that is the whole of the
        // difference at this level of abstraction. Below the icon threshold
        // they drop out and the muzzle's own shape carries it.
        <g fill={MASCOT_INK.line}>
          <ellipse cx={x - rs * 0.2} cy={snoutY - snoutRy * 0.42} rx={rs * 0.075} ry={rs * 0.095} />
          <ellipse cx={x + rs * 0.2} cy={snoutY - snoutRy * 0.42} rx={rs * 0.075} ry={rs * 0.095} />
        </g>
      )}
      {expression === "excited" && detail === "full" && (
        // Only when it is excited, and only at the size where it is a flame
        // rather than a speck. `full` starts at 96 pixels for a whole figure,
        // where the puff is about five pixels across; the level below it is a
        // 40-pixel figure, where the same shape is one pixel and reads as dirt
        // on the screen. A mark this small has to drop out rather than shrink.
        <path
          d={flamePath(x + rs * 0.9, y + rs * 0.88, rs)}
          fill={colors.spark}
          transform={`rotate(26 ${Math.round((x + rs * 0.9) * 100) / 100} ${Math.round((y + rs * 0.88) * 100) / 100})`}
        />
      )}
    </g>
  );
}

export const LOHI: ConceptDef = {
  id: "lohi",
  species: "Lohi",
  kind: "Dragon family — three ages on one rig",
  origin: "fresh",
  pitch:
    "A dragon is the one creature every child in this product already wants to be, and nobody in the Finnish children's world owns a cute one. Lohi is ours: two heads tall, round, salmon-pink, with wings too small to be any use yet and a leaf on the end of its tail. The pun does the naming for free — lohikäärme is a dragon, lohi is a salmon — so the cast is named after the rivers the fish runs up and the species belongs to water rather than to a volcano. Three ages on one rig fill the three holes the product actually has: a hatchling stands in for the gamer, a grown one for the parent, an elder with a frill beard for the gedu.",
  caveat:
    "It is the busiest silhouette in the set — a snout, two horns, a crest, two wings and a tail is five landmarks where this directory usually spends two, and the argument for each is only that a dragon with four of them is a lizard. The wings are also the thing most likely to be argued about: they are deliberately too small to fly, which is a joke that has to be read rather than seen. And the species is one bad decision away from the thing it must not be, so the black-body colourway that the swatch table would happily produce is not offered here at all: every Lohi is a river colour on purpose.",
  landmark:
    "A blunt pale snout under two horn nubs, with three frill bumps over the crown and two small wing lobes at the shoulders.",
  slots: ["hat", "face", "torso", "back", "extra", "scene"],
  wardrobeLimit:
    "A hat sits over the crown frill and between the horns, which is the same compromise the antlered and horned animals make: it reads as worn under the landmark rather than over it. The elder's beard is the one build a scarf argues with — the frill and the band occupy the same run of chin — so the elder wears the lanyard instead, which is what the gedu costume already gives him.",
  rig: BASE,
  forms: LOHI_FORMS,
  rigFor,
  faceMode: "eyes",
  variants: LOHI_VARIANTS,
  limbs: (c) => ({ arm: c.bodyBottom, leg: c.bodyBottom, hand: c.panel, foot: c.panel }),
  Body,
  Head,
  fleet: [
    {
      name: "Kymi",
      job: "The introducer — home hero, first-visit tours, the 404",
      variantId: "lohi",
      form: "kid",
      role: "none",
      pose: "wave",
      expression: "excited",
      blurb:
        "The salmon-pink hatchling, named for the Kymijoki. The flagship is deliberately the youngest build: the first thing a family meets should be the one that is the same age as their child and about as good at flying.",
    },
    {
      name: "Teno",
      job: "Gamer helper — clubs, camps, the gamer dashboard",
      variantId: "koski",
      form: "kid",
      role: "gamer",
      pose: "controller",
      expression: "excited",
      blurb:
        "Named for the Tenojoki, the great salmon river in the north. Cyan, headset on over the horns, and entirely focused on the screen.",
    },
    {
      name: "Aura",
      job: "Parent helper — schedules, pickups, the family calendar",
      variantId: "nuotio",
      form: "grown",
      role: "parent",
      pose: "idle",
      expression: "happy",
      prop: "mug",
      blurb:
        "The Aurajoki runs through Turku, and this one runs through the family calendar. A grown dragon with a neck, a scarf and a coffee, who knows the club is at six.",
    },
    {
      name: "Vuoksi",
      job: "Gedu expert — training, session write-ups, the docs",
      variantId: "kaisla",
      form: "old",
      role: "gedu",
      pose: "reading",
      expression: "thinking",
      blurb:
        "The elder, in reed green, named for the Vuoksi. The frill that sits over a younger dragon's crown is repeated under his chin as a beard, which is the entire difference between the grown build and this one — an age is a rig and a shape, never a costume.",
    },
    {
      name: "Chief Engineer Kyle",
      job: "CTO — the engine room; scientist, builder, architect, engineer",
      variantId: "virta",
      form: "grown",
      role: "none",
      pose: "idle",
      expression: "focused",
      prop: "wrench",
      outfit: { hat: "hardhat", torso: "tool-belt", scene: "engine-room" },
      garment: "amber",
      blurb:
        "The engine room dragon: deep-current indigo, a hardhat down over the horns, a tool belt and a spanner, in front of the reactor column. He is the one member of a water species who is allowed to be about fire, because in an engine room fire is a job rather than a threat. No Star Trek anywhere on him — the gold is engineering gold and the title is his own handle.",
    },
  ],
};
