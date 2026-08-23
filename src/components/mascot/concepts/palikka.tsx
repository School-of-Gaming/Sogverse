/**
 * Palikka — the voxel animals, brought forward from `hipponen.png` and
 * `treksi.png`.
 *
 * A *palikka* is a building block: the wooden or plastic brick a Finnish
 * five-year-old has a tub of, and the word a Finnish child would use for what
 * these animals are made of. It carries a mild second sense — calling a person
 * a palikka is calling them a blockhead — which is worth naming rather than
 * pretending away. It is affectionate rather than cutting, it is the *animals*
 * being described and not a child, and no alternative got close: *kuutio*
 * (cube) is a geometry lesson, *möhkö* (hunk) says shapeless, and *nappula*
 * would have collided with the concept already called Nappi.
 *
 * ## Why this exists at all, having once been refused
 *
 * The first pass through the legacy set dropped both voxel files with "voxel
 * animals read as Minecraft, and we are a Roblox partner". Kyle's ruling on
 * 2026-08-23 narrowed that: the no-look-alikes rule forbids recreating
 * characters that exist in those games, not a blocky *style*. A hippo and a
 * T-rex are nobody's mob. So the line this species has to stay behind is
 * specific and short — nothing creeper-, zombie-, pig-, cow- or sheep-shaped,
 * no per-block noise textures, no humanoid in eight-block proportions — and
 * everything here is on the safe side of it: real animals, flat untextured
 * faces, and a head-to-body ratio nearer a plush toy's than a person's.
 *
 * ## The rig problem, and the answer
 *
 * The legacy files are 3/4 isometric: the camera is above and to the side, the
 * hippo is seen broadside, and the T-rex's own left is nearer to us than its
 * right. Nothing in this directory can draw that. The pose table gives hands
 * in absolute front-facing coordinates, the limbs are solved by a two-bone IK
 * in the picture plane, the walk cycle rotates legs about hip sockets, and the
 * face anchors an eye pair either side of a centre line. Rebuilding any of
 * that for one species would have cost more than the species is worth and
 * would have left it unable to share a lineup with anything else.
 *
 * So the camera moves and the *drawing* keeps the isometry. Every block is
 * drawn front-on as three faces — a front rectangle, a lighter parallelogram
 * on top, a darker one down the right side — which is the cube read the legacy
 * files get from their camera angle, obtained instead from shading. The
 * character faces the viewer, so the pose table, the jointed limbs, the six
 * expressions, the wardrobe and every animation work untouched, and a Palikka
 * stands in a lineup beside a Kaveri at the same optical size on the same
 * ground line.
 *
 * Two things had to be added to the shared machinery to make that read, and
 * both are new enum values that no existing concept can reach:
 *
 * - `limbStyle: "blocky"` — the same anatomical elbow solve, but the segments
 *   keep one width and every cap is a square. The taper and the three discs
 *   are exactly what says "drawn with a brush", and they were the loudest
 *   wrong note on an otherwise square body.
 * - `faceMode: "voxel"` — the symbol face with every primitive squared off.
 *   Same four dials, same shapes-not-details rule; see `face-voxel.tsx`.
 *
 * ## What was translated, and what was left behind
 *
 * The T-rex's teeth are gone. The legacy file has none either — it is a red
 * block where a mouth goes — but the temptation on a lizard is real, and teeth
 * are a realism cue the face grammar forbids on every species. The red block
 * survives as exactly what it was: a patch of red on the snout, with the
 * grammar's glyph mouth drawn inside it. That is a marking on the animal in
 * the same category as the cream belly, not an interior to the mouth, and
 * three rasterisations were needed to place it — put it at the bottom of the
 * snout, where a jaw line would go, and it reads unmistakably as a red collar
 * on an olive frog. The cream striped belly survives, because after the head it is the
 * thing that makes that drawing recognisable. The hippo's yellow-green eyes
 * did not: the grammar's eye is a white shape and a dark pupil and nothing
 * else, and an iris is the third shape it does not get.
 */

import type { ReactElement } from "react";

import type { ConceptDef, FormDef, PartProps } from "../concept";
import { showsFiligree } from "../detail";
import { PALIKKA_VARIANTS, shadeHex, tintHex } from "../palette";
import type { Rig } from "../rig";

export const PALIKKA_FORMS: readonly FormDef[] = [
  {
    id: "trex",
    label: "Reksi — T-rex",
    note: "The flagship. A head half the size of the character, and a stepped tail.",
  },
  {
    id: "hippo",
    label: "Hipponen — virtahepo",
    note: "The widest silhouette here: a flat slab of a face and ears like two pips.",
  },
  {
    id: "hirvi",
    label: "Sarvinen — hirvi",
    note: "Antlers built out of six blocks. Reads at any size, from across a room.",
  },
];

/**
 * The three faces of one block.
 *
 * The *body* takes its three straight out of the colourway (see the note in
 * `palette.ts` about `spark` being the lit top face), because the two faithful
 * colourways are sampled face-by-face off the legacy artwork and deriving them
 * would throw that away. Every secondary material — a muzzle, an antler, a
 * foot — derives its own from one hex at the same ratios the sampling found in
 * the legacy hippo: a fifth of the way to paper on top, a third of the way to
 * the shadow down the side.
 */
type Facets = { front: string; top: string; side: string };

function facets(base: string): Facets {
  return { front: base, top: tintHex(base, 0.2), side: shadeHex(base, 0.3) };
}

/**
 * One block, drawn front-on with its top and right faces showing.
 *
 * `x`, `y`, `w`, `h` are the *front* face, so everything in this file is
 * positioned by the face the viewer actually looks at, and `d` pushes the
 * other two faces up and to the right. The front is drawn last so that a block
 * in front of another block covers it cleanly.
 */
function Cube({
  x,
  y,
  w,
  h,
  d,
  f,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  d: number;
  f: Facets;
}): ReactElement {
  return (
    <g>
      <path d={`M ${x} ${y} L ${x + d} ${y - d} L ${x + w + d} ${y - d} L ${x + w} ${y} Z`} fill={f.top} />
      <path
        d={`M ${x + w} ${y} L ${x + w + d} ${y - d} L ${x + w + d} ${y + h - d} L ${x + w} ${y + h} Z`}
        fill={f.side}
      />
      <rect x={x} y={y} width={w} height={h} fill={f.front} />
    </g>
  );
}

/**
 * The skeleton.
 *
 * Shared by all three builds down to the hips: they differ above the neck and
 * in what hangs off the back, which is the same finding the animal family
 * arrived at — a body plan is not per animal. `reach` is unusually large
 * because a cube body is at its widest exactly where the hands hang, and a
 * hand at the pose table's default lands on the torso's own right face.
 */
const BASE: Rig = {
  shadow: { cx: 102, cy: 186, rx: 42, ry: 6.5 },
  hip: { x: 100, y: 144 },
  hipSpread: 18,
  footY: 178,
  footStyle: "block",
  shoulderL: { x: 74, y: 116 },
  shoulderR: { x: 126, y: 116 },
  head: { x: 100, y: 52, r: 40 },
  eyeDx: 21,
  eyeY: 40,
  eyeR: 9.5,
  mouthY: 77,
  crown: { x: 100, y: 18 },
  crownW: 80,
  reach: 10,
  limbW: 12,
  handR: 8,
  limbStyle: "blocky",
  armLen: 34,
  legLen: 38,
  // Narrower than the head on purpose. The first rasterisation had the two
  // within six units of each other and the whole character came out as one
  // unbroken column with eyes near the top — a head only reads as a head when
  // something below it is visibly smaller.
  torso: { x: 72, y: 100, w: 56, h: 50 },
  fusedHead: false,
};

function rigFor(form: string): Rig {
  switch (form) {
    case "hippo":
      // Small eyes, set high and close, on a braincase narrower than the
      // shoulders. Everything about this rig is arranged to leave the snout as
      // the biggest thing in the frame: big eyes on a wide head is a bear, and
      // that is exactly what the first version of this build came out as.
      return {
        ...BASE,
        head: { x: 100, y: 62, r: 40 },
        eyeDx: 19,
        eyeY: 48,
        eyeR: 7,
        mouthY: 99,
        crown: { x: 100, y: 34 },
        crownW: 68,
        torso: { x: 62, y: 104, w: 76, h: 48 },
        shoulderL: { x: 68, y: 118 },
        shoulderR: { x: 132, y: 118 },
        reach: 14,
      };
    case "hirvi":
      return {
        ...BASE,
        head: { x: 100, y: 56, r: 34 },
        eyeDx: 15,
        eyeY: 48,
        eyeR: 7.5,
        mouthY: 92,
        crown: { x: 100, y: 34 },
        crownW: 44,
        torso: { x: 70, y: 102, w: 60, h: 48 },
      };
    case "trex":
    default:
      return BASE;
  }
}

/** The torso, plus whatever this build carries behind it. */
function Body({ colors, form, detail }: PartProps): ReactElement {
  const skin: Facets = { front: colors.bodyTop, top: colors.spark, side: colors.bodyBottom };
  const inset = facets(colors.panel);
  const box = rigFor(form).torso;
  const filigree = showsFiligree(detail);
  return (
    <g>
      {/* The tail, first, so the body sits in front of where it joins. Two
          blocks stepping down and away is the whole of it — a tapered curve
          would be the one smooth thing on the character. */}
      {form === "trex" && (
        <>
          <Cube x={40} y={126} w={30} h={18} d={6} f={skin} />
          <Cube x={18} y={138} w={24} h={16} d={6} f={skin} />
        </>
      )}
      {form === "hirvi" && <Cube x={132} y={112} w={16} h={10} d={5} f={skin} />}
      <Cube x={box.x} y={box.y} w={box.w} h={box.h} d={8} f={skin} />
      {/* The neck. Short and square: there is a head above and a body below and
          the join has to be visible, or the head reads as balanced on top. */}
      <Cube x={84} y={84} w={32} h={22} d={6} f={skin} />
      {/* The belly. The legacy T-rex's cream front is the second thing anyone
          would describe about it, so it is drawn on every build rather than
          only on the one it came from — it is what stops a cube torso reading
          as a cardboard box. It starts a third of the way down: run it to the
          top of the torso and it stops being a belly and becomes a shirt. */}
      <rect
        x={box.x + box.w * 0.25}
        y={box.y + box.h * 0.32}
        width={box.w * 0.5}
        height={box.h * 0.68}
        fill={inset.front}
      />
      {filigree && (
        <g fill={inset.side} opacity={0.55}>
          {[0, 1, 2].map((i) => (
            <rect
              key={i}
              x={box.x + box.w * 0.25}
              y={box.y + box.h * 0.32 + 9 + i * 9}
              width={box.w * 0.5}
              height={1.6}
            />
          ))}
        </g>
      )}
    </g>
  );
}

/** The head, which is the only part that knows which animal this is. */
function Head({ colors, form, detail }: PartProps): ReactElement {
  const skin: Facets = { front: colors.bodyTop, top: colors.spark, side: colors.bodyBottom };
  const inset = facets(colors.panel);
  const band = facets(colors.accent);
  const filigree = showsFiligree(detail);

  if (form === "hippo") {
    return (
      <g>
        {/* Ear pips. Tiny on purpose — one small block each, exactly as the
            legacy file has them. Anything bigger starts reading as a bear's
            ears, and the ears are not what makes this a hippo. */}
        <Cube x={70} y={18} w={11} h={11} d={4} f={skin} />
        <Cube x={119} y={18} w={11} h={11} d={4} f={skin} />
        {/* The braincase, deliberately narrow and set back. */}
        <Cube x={66} y={34} w={68} h={52} d={8} f={skin} />
        {/* THE SNOUT. The identity of this animal is one slab, wider than the
            head it hangs off and wider than the shoulders under it, pushed
            forward and down. The first build had a muzzle narrower than the
            head and it read as a blocky bear; nothing else about the drawing
            had to change to fix that. */}
        <Cube x={46} y={68} w={108} h={44} d={10} f={inset} />
        {/* Nostrils on the snout's *top* face, drawn skewed to sit in it. This
            is the one place the 2.5D read carries information rather than
            depth: a hippo's nostrils are on top of its muzzle, and a viewer
            reads a pip on a top face as sitting on a horizontal surface. */}
        {filigree && (
          <g fill={shadeHex(colors.panel, 0.45)}>
            <path d="M 76 67 L 82 61 L 96 61 L 90 67 Z" />
            <path d="M 110 67 L 116 61 L 130 61 L 124 67 Z" />
          </g>
        )}
        {/* The mouth: one wide flat bar low on the slab, running its full
            width, with the glyph riding inside it. Same trick as the T-rex's
            red patch — at 28 pixels the bar is what survives, and a wide bar
            low on a wide slab is the hippo. */}
        <rect x={46} y={92} width={108} height={15} fill={band.front} />
      </g>
    );
  }

  if (form === "hirvi") {
    return (
      <g>
        {/* Six blocks of antler. Palmate, like a real hirvi and unlike the
            branched thing people draw when they mean a deer, and drawn in the
            inset tone so it reads as a different material from the animal. */}
        <Cube x={70} y={22} w={8} h={18} d={5} f={skin} />
        <Cube x={122} y={22} w={8} h={18} d={5} f={skin} />
        <Cube x={44} y={14} w={30} h={10} d={5} f={inset} />
        <Cube x={126} y={14} w={30} h={10} d={5} f={inset} />
        <Cube x={46} y={6} w={8} h={9} d={4} f={inset} />
        <Cube x={59} y={6} w={8} h={9} d={4} f={inset} />
        <Cube x={133} y={6} w={8} h={9} d={4} f={inset} />
        <Cube x={146} y={6} w={8} h={9} d={4} f={inset} />
        {/* Ears out sideways, under the antlers. */}
        <Cube x={62} y={52} w={16} h={10} d={4} f={skin} />
        <Cube x={122} y={52} w={16} h={10} d={4} f={skin} />
        <Cube x={78} y={34} w={44} h={46} d={7} f={skin} />
        <Cube x={82} y={70} w={36} h={36} d={5} f={inset} />
        {filigree && (
          <g fill={inset.side}>
            <rect x={88} y={75} width={9} height={6} />
            <rect x={103} y={75} width={9} height={6} />
          </g>
        )}
        <rect x={82} y={99} width={36} height={7} fill={band.front} />
      </g>
    );
  }

  return (
    <g>
      <Cube x={60} y={18} w={80} h={58} d={10} f={skin} />
      {/* The snout, pushed forward and hung below the head. Its own top face
          cutting across the head's front is what makes it a snout rather than
          a patch — and the nostrils go on that top face's near edge, which is
          the one place on this character where the 2.5D read is doing work
          rather than decoration. */}
      <Cube x={70} y={54} w={60} h={48} d={9} f={skin} />
      {filigree && (
        <g fill={colors.bodyBottom}>
          <rect x={84} y={58} width={10} height={6} />
          <rect x={106} y={58} width={10} height={6} />
        </g>
      )}
      {/* The legacy file's red block, inset from the snout's own edges so it
          reads as a patch on the animal rather than as a band around it, with
          the glyph mouth landing inside it. At small sizes this is the single
          strongest landmark the build has: at 28 pixels it is the one with the
          red mouth. */}
      <rect x={78} y={66} width={44} height={22} fill={band.front} />
    </g>
  );
}

export const PALIKKA: ConceptDef = {
  id: "palikka",
  species: "Palikka",
  kind: "Voxel animals — the legacy hippo and T-rex, front-facing",
  origin: "fresh",
  pitch:
    "Two of the legacy files were voxel animals and they are the most confidently drawn things in the whole folder. Kids build out of blocks — it is the medium half of them already play in — so a species made of them needs no explanation, and a fleet drawn this way can add an animal for the cost of one head. Reksi the T-rex is a real person's actual mascot, which makes him the one character here who arrives with a voice already attached.",
  caveat:
    "The tiny arms lose. A T-rex's forelimbs are its second-best joke and the shared pose table wants hands at absolute coordinates that no genuinely tiny arm can reach, so they are short and thin rather than comically short — the alternative was a per-species pose table, which is the thing this whole directory exists to avoid. The style is also the closest anything here comes to the no-look-alikes line: it stays behind it on species and on texture, but it is a line, and somebody should look at these next to a Roblox partner deck before they ship.",
  landmark:
    "Three-tone cubes with hard corners, and a head shape you could name from across a room — the slab, the box with a jaw, the antlers.",
  slots: ["hat", "face", "torso", "back", "extra", "scene"],
  wardrobeLimit:
    "Nothing tailored. A hoodie drapes and this body has no drape in it, so a soft garment on square shoulders reads as a bib — hats, glasses and anything with a straight edge are what fit. The antlered build additionally wears a hat *between* the antlers, which is what its narrow crown width says.",
  rig: BASE,
  forms: PALIKKA_FORMS,
  rigFor,
  faceMode: "voxel",
  variants: PALIKKA_VARIANTS,
  limbs: (c) => ({ arm: c.limb, leg: c.limb, hand: c.bodyBottom, foot: c.bodyBottom }),
  Body,
  Head,
  fleet: [
    {
      name: "Reksi — the Princi-Pal",
      job: "Principal gamer — the headmaster's voice: announcements, welcomes, the occasional dad joke",
      variantId: "oliivi",
      form: "trex",
      role: "none",
      pose: "wave",
      expression: "happy",
      outfit: { hat: "swept-cap", face: "shades" },
      garment: "purple",
      blurb:
        "The one character in this folder who is a person. `treksi.png` is the T-rex and `REKSI.png` is the same man with white hair and a briefcase, and the shades and the cap are his in both. He is the first thing a family should meet, which is why he waves.",
    },
    {
      name: "Hipponen",
      job: "Parent-facing — billing, schedules, and every page that has to feel unhurried",
      variantId: "violetti",
      form: "hippo",
      role: "parent",
      pose: "idle",
      expression: "happy",
      garment: "sky",
      blurb:
        "Straight off `hipponen.png`, purple included. A hippo is the widest, heaviest, least hurried shape available, which is the right one to put beside a direct debit — and the legacy purple happens to be the old SOG brand colour.",
    },
    {
      name: "Sarvinen",
      job: "Gedu expert — session notes, the gedu workspace, anything being explained",
      variantId: "ruska",
      form: "hirvi",
      role: "gedu",
      pose: "point-left",
      expression: "thinking",
      prop: "pointer",
      garment: "green",
      blurb:
        "The build the legacy set never had, added to prove the species is a family rather than two ports. Antlers give the tallest, most nameable silhouette in the concept and survive being shrunk further than any face on it.",
    },
    {
      name: "Kulma",
      job: "The gamer stand-in — hero images, session pages, anywhere a child would be",
      variantId: "routa",
      form: "trex",
      role: "gamer",
      pose: "controller",
      expression: "focused",
      garment: "amber",
      blurb:
        "A *kulma* is a corner, which is what this species has instead of curves. The frost colourway puts the same build as far from Reksi as the palette goes, so the two read as different characters rather than as one character twice.",
    },
  ],
};
