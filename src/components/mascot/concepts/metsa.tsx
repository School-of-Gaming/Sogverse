/**
 * Metsänväki — the forest folk. A pen line and a wash, on a night ground.
 *
 * ## What the references actually show (measured, not remembered)
 *
 * Three sheets were read at working size before a line of this was written:
 * `jansson/j1.jpg` (a pen-and-wash landscape, 960×1200) and `jansson/j2.jpg` /
 * `jansson/j3.jpg` (the same two figures drawn in 1951 and 1968, 667×517 and
 * 638×561). What is in them, as numbers:
 *
 * - **The line is one weight and it belongs to the pen, not to the figure.**
 *   Sampled across seven scan lines of `j2.jpg`, the median dark run is 3px —
 *   on the 290px figure, on the 430px figure beside it, and on the interior
 *   marks. A small creature does not get a thinner line. Scaled onto this
 *   module's 200-unit canvas, where a figure stands about 100 units tall, that
 *   is a **1.6-unit stroke**, and it is the same 1.6 everywhere.
 * - **Nothing in the figure drawings is filled.** Both sheets are pure
 *   contour: the paper inside the outline *is* the animal. Head and body are
 *   one continuous line — there is no seam where a head meets a shoulder.
 * - **The face is four marks at most.** Each eye is a circle about an eighth
 *   of the head's width with a solid dot roughly a third of its own diameter
 *   inside it, set high and close to the centre line. The mouth is one short
 *   *unclosed* comma-stroke, well below and off to one side. The larger figure
 *   in the 1951 sheet has closed eyes drawn as two shallow arcs and **no mouth
 *   at all**. No brows, no nostrils, no cheeks, nothing else.
 * - **The 1968 redraw changes almost nothing except the tilt.** Same
 *   contours, same face marks, steadier line — and different lean. The posture
 *   is doing the acting, which is the whole permission slip for a face this
 *   empty.
 * - **Solid black is rationed and it lives in the landscape.** In `j1.jpg` the
 *   only true blacks are the tower's roof, its window frames, two deer on the
 *   far bank and a few foreground leaves — the very far and the very near,
 *   never the middle. The mood is carried by three or four flat grey washes, a
 *   moon left as untouched paper, and long diagonal rays across the whole rock
 *   face. The creatures beside the tower are 40px tall in a 1200px picture and
 *   are identifiable only by silhouette and stance; the landscape is roughly
 *   85% of the frame.
 *
 * ## What is taken and what is refused
 *
 * Taken: the grammar above — one nib weight, unfilled figures, one wash,
 * rationed black, a face of two dots, a body that acts by leaning, and small
 * creatures in a lot of night. That grammar is Jansson's; it is not the
 * Moomins', and it long predates them.
 *
 * Refused, deliberately and checked form by form at the bottom of this file:
 * no rounded white troll body, no large round snout, no tufted tail, no
 * wide-brimmed hat, no topknot-and-red-dress pairing, no crowd of tall pale
 * figures with pinprick eyes. Every form here is a Finnish forest animal or a
 * folklore figure that predates and sits outside that cast: a hedgehog read as
 * a scalloped mound, an owl read as an upright egg with two tufts, a mouse
 * read as two round ears and a wire tail, a fox read as two points and a
 * brush, a *tonttu* in a red cone cap (Finnish house-elf folklore, not
 * anyone's character), and a *haltija* — a forest spirit — read as height plus
 * a sprig.
 *
 * ## The colour problem, and what the rasters said
 *
 * A pen-line species is ink on paper, and this site has no paper: the page is
 * `#121212`. Three answers were drawn and rasterised at 200px and 40px on the
 * real background before one was picked.
 *
 * - **(a) Ink inverted** — a pale line and pale marks directly on the night.
 *   At 200px it is the most atmospheric thing in this whole directory. At 40px
 *   the line is a third of a pixel wide and the figure is *gone*: an unfilled
 *   contour drawing has no silhouette, which is precisely what small sizes
 *   have to be carried by. Kept as exactly one colourway (`hamara`) so the
 *   register is on the page to look at, and not as the species.
 * - **(b) A paper card behind the figure.** Black ink on a cream rectangle,
 *   like a page pinned to the wall. Honest, and it reads at every size — but
 *   what reads at 40px is *the card*, not the animal, so a participant list
 *   becomes a row of identical cream squares. It also drags the whole species
 *   out of the page and into a frame, which fights every other concept here.
 * - **(c) One wash, dark nib.** The figure filled with a single swatch tinted
 *   two thirds towards paper, contoured with the blue-black nib. The wash is
 *   the silhouette at 40px, the nib is the drawing at 200px, and the two
 *   never fight because they are doing different jobs at different sizes.
 *   **This is the species.**
 *
 * The wash depth is the one tuned number: below about half-way to paper the
 * 40px raster stops separating from the background, and above about three
 * quarters the nib stops reading as a line against its own fill.
 *
 * ## Distinct from the other ink species here
 *
 * The Helsinki-lineage concept is also drawn with a line, and the two must not
 * converge: that one is a **thick brush contour around flat, saturated colour**
 * and this one is a **thin even nib around a pale wash**. If a change here
 * would thicken the line or saturate the fill, it belongs there instead.
 */

import type { ReactElement } from "react";

import type { ConceptDef, PartProps } from "../concept";
import { METSA_INK, METSA_VARIANTS, type Colorway } from "../palette";
import { n, type Rig } from "../rig";

/**
 * The nib, in canvas units. One value for every form and every mark — see the
 * measurement at the top of this file. It is not scaled by detail level: a
 * line that thickened as the drawing shrank would be a different species at
 * every size, and the small sizes are carried by the wash anyway.
 */
const PEN = 1.6;

/** The contour attributes every shape in this species is drawn with. */
function nib(colors: Colorway): {
  fill: string;
  stroke: string;
  strokeWidth: number;
  strokeLinejoin: "round";
} {
  return {
    fill: colors.bodyTop,
    stroke: colors.ink ?? METSA_INK.pen,
    strokeWidth: PEN,
    strokeLinejoin: "round",
  };
}

/** A stroke with no fill — a tail, a wing, a whisker of a line. */
function line(colors: Colorway): {
  fill: "none";
  stroke: string;
  strokeWidth: number;
  strokeLinecap: "round";
} {
  return {
    fill: "none",
    stroke: colors.ink ?? METSA_INK.pen,
    strokeWidth: PEN,
    strokeLinecap: "round",
  };
}

/**
 * The spined back, as one scalloped line over the top half of an ellipse.
 *
 * The brief for this form was explicit and it is the right call: a hedgehog's
 * spines are **a scalloped contour**, not a field of individual spikes. Drawn
 * as spikes they are texture, they die at 40px, and they violate the
 * simplicity rule twice over. Drawn as a wobble in the outline they *are* the
 * silhouette, so they are the one thing about this form that survives every
 * size.
 */
function scallopedDome(cx: number, cy: number, rx: number, ry: number, bumps: number): string {
  const at = (a: number, orx: number, ory: number): string =>
    `${n(cx + orx * Math.cos(a))} ${n(cy - ory * Math.sin(a))}`;
  const step = -Math.PI / bumps;
  const parts = [`M ${at(Math.PI, rx, ry)}`];
  for (let i = 0; i < bumps; i += 1) {
    const a0 = Math.PI + step * i;
    // One bump per spine, with its control point a third of the way along
    // rather than halfway: the crest leans back the way a hedgehog's spines do,
    // and the asymmetry is what keeps the outline from reading as a cloud. A
    // true spike would read as texture and die at 40px; this survives it.
    parts.push(`Q ${at(a0 + step * 0.32, rx + 7, ry + 7)} ${at(a0 + step, rx, ry)}`);
  }
  return parts.join(" ");
}

// --- the six silhouettes -------------------------------------------------

function Siili({ colors }: PartProps): ReactElement {
  return <path d={`${scallopedDome(100, 176, 52, 56, 9)} L 48 176 Z`} {...nib(colors)} />;
}

function Hiiri({ colors }: PartProps): ReactElement {
  return (
    <g>
      {/* The tail: one wire, drawn behind the body so it leaves the outline
          rather than being stuck onto it. */}
      <path d="M 120 164 C 144 168 154 150 146 132" {...line(colors)} />
      {/* Ears, body and head as one continuous contour — two circles and a
          teardrop, drawn as separate closed paths of the same fill and stroke
          so the overlaps read as one shape without any boolean geometry. */}
      <circle cx={80} cy={74} r={11} {...nib(colors)} />
      <circle cx={120} cy={74} r={11} {...nib(colors)} />
      <path
        d="M 100 110 C 120 118 128 144 125 172 L 75 172 C 72 144 80 118 100 110 Z"
        {...nib(colors)}
      />
      <path
        d="M 100 68 C 116 68 122 82 122 94 C 122 106 112 116 100 118 C 88 116 78 106 78 94 C 78 82 84 68 100 68 Z"
        {...nib(colors)}
      />
    </g>
  );
}

function Pollo({ colors }: PartProps): ReactElement {
  return (
    <g>
      {/* Two tufts, then the egg. Not ears and not a hat: the tufts are the
          only thing separating an owl's silhouette from a pear's. */}
      <path d="M 86 76 L 78 52 L 100 68 Z" {...nib(colors)} />
      <path d="M 114 76 L 122 52 L 100 68 Z" {...nib(colors)} />
      <path
        d="M 100 62 C 132 62 144 98 142 132 C 140 166 124 178 100 178 C 76 178 60 166 58 132 C 56 98 68 62 100 62 Z"
        {...nib(colors)}
      />
    </g>
  );
}

function Haltija({ colors }: PartProps): ReactElement {
  return (
    <path
      d="M 86 176 C 82 142 84 106 91 82 C 93 74 107 74 109 82 C 116 106 118 142 114 176 Z"
      {...nib(colors)}
    />
  );
}

function Tonttu({ colors }: PartProps): ReactElement {
  return (
    <path
      d="M 66 176 C 64 144 78 114 100 112 C 122 114 136 144 134 176 Z"
      {...nib(colors)}
    />
  );
}

function Kettu({ colors }: PartProps): ReactElement {
  return (
    <g>
      {/* The brush, behind everything: a fox at forty pixels is two points on
          top and one heavy curve off to the side. */}
      <path
        d="M 116 170 C 112 151 121 133 133 127 C 146 132 151 149 144 162 C 138 173 124 179 116 173 Z"
        {...nib(colors)}
      />
      <path
        d="M 100 122 C 118 130 126 150 124 172 L 76 172 C 74 150 82 130 100 122 Z"
        {...nib(colors)}
      />
      <path
        d="M 80 82 L 73 50 L 92 68 C 96 66 104 66 108 68 L 127 50 L 120 82 C 118 102 111 122 100 130 C 89 122 82 102 80 82 Z"
        {...nib(colors)}
      />
    </g>
  );
}

function Body(props: PartProps): ReactElement {
  switch (props.form) {
    case "hiiri":
      return <Hiiri {...props} />;
    case "pollo":
      return <Pollo {...props} />;
    case "haltija":
      return <Haltija {...props} />;
    case "tonttu":
      return <Tonttu {...props} />;
    case "kettu":
      return <Kettu {...props} />;
    case "siili":
    default:
      return <Siili {...props} />;
  }
}

/**
 * The interior marks.
 *
 * Every form draws its whole silhouette in `Body`, because the references
 * draw head and body as one unbroken contour and a species that drew them as
 * two would show a seam across its own neck. What is left for `Head` is the
 * handful of marks *inside* that contour — the one pale block a form is
 * allowed, a beak, a muzzle tip — plus the tonttu's cap, which is the only
 * garment in the set that is also a silhouette.
 */
function Head(props: PartProps): ReactElement {
  const { colors, form } = props;
  switch (form) {
    case "siili":
      // The face, as one paler block rather than as a line: a value survives
      // 40px and a line does not, and the block is what stops the mound
      // reading as a rock.
      return (
        <path
          d="M 100 126 C 110 126 116 136 115 146 C 114 158 108 166 100 169 C 92 166 86 158 85 146 C 84 136 90 126 100 126 Z"
          fill={colors.panel}
        />
      );
    case "hiiri":
      return (
        <g>
          <ellipse cx={100} cy={106} rx={9} ry={7} fill={colors.panel} />
          <ellipse cx={100} cy={112} rx={2.6} ry={2.1} fill={colors.ink ?? METSA_INK.pen} />
        </g>
      );
    case "pollo":
      return (
        <g>
          {/* One of the two rationed solids on this species: a small filled
              beak, in the line colour. The references keep their blacks tiny
              and far apart, and this is tiny. */}
          <path d="M 94 116 L 106 116 L 100 129 Z" fill={colors.ink ?? METSA_INK.pen} />
        </g>
      );
    case "haltija":
      // Nothing. A forest spirit is height, two dots and the sprig above it —
      // anything drawn on the column is the thing this form exists to refuse.
      return <g />;
    case "tonttu":
      return (
        <path
          d="M 116 52 C 127 56 127 68 121 77 C 116 89 122 99 134 110 C 116 120 84 120 66 110 C 84 92 100 64 116 52 Z"
          fill={colors.clothing}
          stroke={colors.ink ?? METSA_INK.pen}
          strokeWidth={PEN}
          strokeLinejoin="round"
        />
      );
    case "kettu":
      return <path d="M 92 102 Q 100 98 108 102 Q 105 119 100 128 Q 95 119 92 102 Z" fill={colors.panel} />;
    default:
      return <g />;
  }
}

/** The haltija's sprig, and nothing else in the species has one. */
function Crown({ colors, form, floatClass }: PartProps): ReactElement | null {
  if (form !== "haltija") return null;
  return (
    <g className={floatClass} style={{ transformBox: "view-box", transformOrigin: "100px 76px" }}>
      <path d="M 100 78 L 100 52" {...line(colors)} />
      <path d="M 100 62 C 92 60 89 54 90 48 C 97 49 101 55 100 62 Z" fill={colors.accent} />
      <path d="M 100 70 C 108 68 111 62 110 56 C 103 57 99 63 100 70 Z" fill={colors.accent} />
    </g>
  );
}

// --- the skeletons -------------------------------------------------------

/**
 * No ground shadow, on any form.
 *
 * Every other species here drops an ellipse on the floor, and it is right for
 * them: a painted body wants something to stand on. A pen drawing does not
 * have one — there is no cast shadow anywhere in the reference sheets, and an
 * airbrushed grey oval under a contour drawing is the one mark on the page
 * that is not made by the pen. The rig has no way to say "none", so it says it
 * with a shadow too small to have any pixels.
 */
const NO_SHADOW = { cx: 100, cy: 181, rx: 0.01, ry: 0.01 } as const;

/**
 * The shared build. Thin limbs (`limbW` 2.8 against the 1.6 nib) because a
 * limb in the references is a stroke of the same pen, and the module draws
 * limbs as filled shapes rather than as strokes — so the *width* is what has
 * to carry the resemblance.
 */
const BASE: Rig = {
  shadow: NO_SHADOW,
  hip: { x: 100, y: 154 },
  hipSpread: 10,
  footY: 174,
  footStyle: "round",
  shoulderL: { x: 82, y: 128 },
  shoulderR: { x: 118, y: 128 },
  head: { x: 100, y: 92, r: 24 },
  eyeDx: 9,
  eyeY: 90,
  eyeR: 4.4,
  mouthY: 104,
  crown: { x: 100, y: 68 },
  crownW: 42,
  reach: 8,
  limbW: 2.8,
  handR: 2.7,
  limbStyle: "tapered",
  armLen: 36,
  legLen: 22,
  torso: { x: 84, y: 122, w: 32, h: 32 },
  // Every form. The references draw the whole animal with one line and act
  // with the *lean of the body*; a head that tilted on its own would be a
  // head cut off its own contour.
  fusedHead: true,
};

function rigFor(form: string): Rig {
  switch (form) {
    case "hiiri":
      return {
        ...BASE,
        head: { x: 100, y: 92, r: 22 },
        eyeY: 90,
        mouthY: 102,
        crown: { x: 100, y: 64 },
        crownW: 46,
        hip: { x: 100, y: 156 },
        shoulderL: { x: 80, y: 128 },
        shoulderR: { x: 120, y: 128 },
      };
    case "pollo":
      return {
        ...BASE,
        head: { x: 100, y: 106, r: 30 },
        eyeDx: 13,
        eyeY: 104,
        eyeR: 7.4,
        mouthY: 142,
        crown: { x: 100, y: 60 },
        crownW: 50,
        hip: { x: 100, y: 164 },
        hipSpread: 12,
        footY: 180,
        legLen: 12,
        shoulderL: { x: 72, y: 132 },
        shoulderR: { x: 128, y: 132 },
        torso: { x: 80, y: 122, w: 40, h: 36 },
        shadow: NO_SHADOW,
      };
    case "haltija":
      return {
        ...BASE,
        head: { x: 100, y: 90, r: 14 },
        eyeDx: 5,
        eyeY: 90,
        eyeR: 3.4,
        mouthY: 100,
        crown: { x: 100, y: 76 },
        crownW: 20,
        hip: { x: 100, y: 158 },
        hipSpread: 7,
        footY: 178,
        legLen: 24,
        armLen: 44,
        shoulderL: { x: 90, y: 114 },
        shoulderR: { x: 110, y: 114 },
        torso: { x: 90, y: 108, w: 20, h: 44 },
        shadow: NO_SHADOW,
      };
    case "tonttu":
      return {
        ...BASE,
        head: { x: 100, y: 128, r: 22 },
        eyeY: 130,
        eyeDx: 8,
        mouthY: 142,
        crown: { x: 100, y: 52 },
        crownW: 18,
        hip: { x: 100, y: 164 },
        footY: 178,
        legLen: 12,
        shoulderL: { x: 78, y: 142 },
        shoulderR: { x: 122, y: 142 },
        torso: { x: 82, y: 134, w: 36, h: 30 },
        shadow: NO_SHADOW,
      };
    case "kettu":
      return {
        ...BASE,
        head: { x: 100, y: 90, r: 24 },
        eyeY: 86,
        mouthY: 113,
        crown: { x: 100, y: 58 },
        crownW: 52,
        hip: { x: 100, y: 158 },
        shoulderL: { x: 82, y: 132 },
        shoulderR: { x: 118, y: 132 },
      };
    case "siili":
    default:
      return {
        ...BASE,
        // `head.r` is doing double duty here and the second job is what set
        // it: the bust crop is a box of 3.6 head-radii, so a hedgehog whose
        // head radius described only its face cropped to a plain rectangle of
        // wash at 40px. Thirty units is the radius that frames the mound.
        head: { x: 100, y: 150, r: 30 },
        eyeDx: 8,
        eyeY: 143,
        eyeR: 4.2,
        mouthY: 156,
        crown: { x: 100, y: 108 },
        crownW: 76,
        hip: { x: 100, y: 166 },
        hipSpread: 16,
        footY: 178,
        legLen: 12,
        shoulderL: { x: 64, y: 152 },
        shoulderR: { x: 136, y: 152 },
        torso: { x: 78, y: 138, w: 44, h: 28 },
        shadow: NO_SHADOW,
      };
  }
}

export const METSA: ConceptDef = {
  id: "metsa",
  species: "Metsänväki",
  kind: "Forest folk — one pen weight, one wash, a lot of night",
  origin: "fresh",
  pitch:
    "The quietest thing in the set, and the only one that is a drawing rather than a build. Six forest creatures, each a closed contour of one nib weight filled with a single wash, a face of two dots and sometimes no mouth, and the acting done entirely by how the body leans. It is the simplicity ruling taken further than any other concept dares: there is nothing on these bodies at all, which is what makes a lantern or a scarf read as an event. It also gives the product a register nothing else here has — calm, nocturnal, a little melancholy — for the surfaces that should not be shouting.",
  caveat:
    "It buys that calm by giving up loudness, and a seven-year-old scanning a dashboard is not looking for calm. The pen line is a fiction below about sixty pixels — at 40px this species is its wash silhouette and nothing else, so the forms had to be designed as silhouettes first and drawings second, and the two most similar (mouse and fox) are told apart at that size only by the tail and the ears. The inverted colourway is the prettiest thing in the directory at 200px and unusable at 40.",
  landmark:
    "A closed pale wash with one even dark contour, and a face that is two dots — the hedgehog's scalloped back, the owl's tufted egg, the spirit's height and sprig.",
  slots: ["hat", "face", "torso", "back", "extra", "scene"],
  wardrobeLimit:
    "Anything drawn in flat saturated colour lands on this species like a sticker — the wardrobe was built for bodies that are themselves flat colour. Scarves, lanterns and the night scene sit right; a headset does not. The tonttu wears no hat at all: the cap is its head.",
  rig: rigFor("siili"),
  forms: [
    { id: "siili", label: "Siili", note: "Hedgehog — a scalloped mound with a small pointed face" },
    { id: "hiiri", label: "Hiiri", note: "Forest mouse — two round ears and a wire tail" },
    { id: "pollo", label: "Pöllö", note: "Owl — an upright egg with two tufts and a filled beak" },
    { id: "haltija", label: "Haltija", note: "Forest spirit — height, two dots, and a sprig" },
    { id: "tonttu", label: "Tonttu", note: "House elf — a red cone cap and almost nothing under it" },
    { id: "kettu", label: "Kettu", note: "Fox — two points on top, one brush off the side" },
  ],
  rigFor,
  faceMode: "eyes",
  variants: METSA_VARIANTS,
  // Every extremity is the pen. A limb here is a stroke, not a painted arm.
  limbs: (c) => {
    const ink = c.ink ?? METSA_INK.pen;
    return { arm: ink, leg: ink, hand: ink, foot: ink };
  },
  Body,
  Head,
  Crown,
  // Mood, on this species, is chosen with one extra constraint the others do
  // not have: **the browless moods first**. The shared face draws a brow for
  // Excited, Surprised, Focused and Thinking, and the references have no brows
  // anywhere — the acting is done by the lean of the body. Happy and Laughing
  // draw none, so they are the species' register, and a brow is spent only
  // where it is the point (the Gedu, thinking).
  fleet: [
    {
      name: "Haltia",
      job: "The introducer — the hero, the empty state, the first thing a visitor meets",
      variantId: "kuu",
      form: "haltija",
      role: "none",
      pose: "wave",
      expression: "happy",
      blurb:
        "A forest spirit with a birch sprig and no other feature. Says hello by leaning, because that is all it has.",
    },
    {
      name: "Nyyti",
      job: "Gamer helper — the gamer dashboard, achievements, anywhere a child is being spoken to",
      variantId: "sammal",
      form: "hiiri",
      role: "gamer",
      pose: "idle",
      expression: "laughing",
      prop: "lantern",
      outfit: { torso: "scarf" },
      garment: "red",
      blurb:
        "The smallest of them, in a scarf twice its own weight, carrying the lantern that lights every scene the others stand in.",
    },
    {
      name: "Sammal",
      job: "Parent guide — the family pages, the enrolment flow, anything a parent reads slowly",
      variantId: "havu",
      form: "siili",
      role: "parent",
      pose: "idle",
      expression: "happy",
      garment: "emerald",
      blurb:
        "A hedgehog that has never once been in a hurry. Reads the whole page before saying anything.",
    },
    {
      name: "Pöllönen",
      job: "Gedu — session notes, the expert voice, anything being explained",
      variantId: "usva",
      form: "pollo",
      role: "gedu",
      pose: "reading",
      expression: "thinking",
      garment: "cyan",
      blurb:
        "Two enormous eyes and a beak the size of a full stop. Has read the thing you are asking about.",
    },
    {
      name: "Repo",
      job: "The one that moves — walking across a progress bar, pointing at what is next",
      variantId: "tuohi",
      form: "kettu",
      role: "none",
      pose: "walking",
      expression: "happy",
      garment: "amber",
      blurb:
        "\"Repo\" is the old Finnish word for a fox, from before anyone said kettu. Arrives before you notice.",
    },
    {
      name: "Tonttu",
      job: "December, and the small helpful notices the rest of the year",
      variantId: "puolukka",
      form: "tonttu",
      role: "none",
      pose: "hold-up",
      expression: "laughing",
      garment: "red",
      blurb:
        "A house elf out of Finnish folklore, which is older than every character it might be mistaken for. The cap is the whole design.",
    },
  ],
};

/*
 * ## IP check, form by form
 *
 * The lineage this species learns from is also the most protected artwork in
 * Finland, so the check is written down rather than assumed. The test applied
 * to each form: could a Finn glance at it and name it as somebody else's
 * character? Distance is measured against the specific shapes that are
 * protected, not against "roundness" in general.
 *
 * - **siili** — a wide, low, scalloped mound with a small oval face at the
 *   bottom of it. Nothing about it is a standing pear-shaped figure and it has
 *   no snout: the face is a flat block inside the silhouette, not a projection
 *   from it. The closest thing to a hazard here is any hedgehog anywhere, and
 *   hedgehogs are not owned.
 * - **hiiri** — two large round ears well clear of the head, a small pointed
 *   muzzle tip and a wire tail with no tuft on the end. The ears are the
 *   identity; the protected cast has none of that shape, and the tail is
 *   deliberately bare, because the tuft is the tell.
 * - **pöllö** — an upright egg with two small tufts and a filled beak. Owls
 *   are drawn in every children's book in the country; this one is
 *   distinguished by having no face disc, no drawn feathers and no perch.
 * - **haltija** — a narrow column two thirds the width of everything else,
 *   with a sprig. The one shape in the set that could drift towards a tall
 *   pale crowd figure, and it is held off by three things: it is one, not many;
 *   its eyes are dots on a *wash*, not pinpricks on white; and the sprig gives
 *   it a feature that cast's members deliberately do not have.
 * - **tonttu** — a red cone cap with a floppy tip. Finnish house-elf folklore,
 *   which is centuries older than any of the characters this file is careful
 *   about, and the cap is a soft cone rather than a brimmed hat. Nothing here
 *   is a wide brim; the silhouette has no brim line at all.
 * - **kettu** — two tall ears, a tapering muzzle, a plume at the hip. A fox.
 *   This is the weakest form in the set for a different reason: at 200px it
 *   sits close to a generic canid, and its plume reads as a lump rather than
 *   as a brush. That is a drawing problem, not an IP one.
 *
 * The register itself is the strongest defence: these are pale washes on a
 * night page, and the protected cast is black line on white paper. Two
 * drawings can share a grammar and not be confusable when one of them is the
 * photographic negative of the other's ground.
 */
