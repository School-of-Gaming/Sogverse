/**
 * Sieni — the mushrooms.
 *
 * The other half of Kyle's berries-and-mushrooms brief, and a separate concept
 * from Marja rather than three more forms of it. That was the one real
 * decision in this round, so the reasoning is written down here rather than
 * summarised somewhere else.
 *
 * ## Why this is not a Marja form
 *
 * The tempting answer is one species with seven forms — they come off the same
 * forest floor, they are picked into the same basket, and `rigFor` can hand a
 * form whatever skeleton it likes, so nothing in the machinery would have
 * stopped it. Three things did:
 *
 * 1. **The head and the body swap places.** A berry has no head — the fruit
 *    *is* the head, which is what `fusedHead` says. A mushroom is mostly head:
 *    a wide cap over a narrow stem, and the cap is more than half the
 *    silhouette. A family whose forms disagree about which shape carries the
 *    face is two families.
 * 2. **They cannot wear the same things, and a concept says that once.**
 *    `slots` and `wardrobeLimit` belong to the concept, not to the form, so
 *    there is no way for one species to say "the berries take a hat and the
 *    mushrooms already have one". A mushroom's cap *is* a hat, and the honest
 *    place to write that down is a concept of its own.
 * 3. **They are two jokes.** A berry is something a child picks and eats. A
 *    mushroom is something a child is taught to look at and not touch, which
 *    is a different relationship and gives this cast a job the berries cannot
 *    do — see Kärpi below.
 *
 * They still share everything worth sharing: Silmu's rig grammar (stem legs,
 * mittens on demand, a body that is its own head), one flat block per mark,
 * and a colour discipline that is the berries' turned upside down. Marja keeps
 * one green constant and varies the fruit; Sieni keeps one **cream** constant
 * — every stem in the species is the same pale block — and varies the cap. So
 * a mushroom is identified by one colour at the top of its silhouette and by
 * nothing else, which is the simplicity ruling stated as a species.
 *
 * ## The three forms
 *
 * - **`kantarelli`** — a chanterelle. A funnel: the cap's two outer tips lift
 *   and its centre dips, which is the only shape in the family that is not a
 *   dome. The one colourway that keeps an amber stem, because a real
 *   chanterelle has no join between cap and foot and giving it a cream one
 *   made it a small tatti in a yellow hat.
 * - **`tatti`** — a porcini. The fat dome, in the only brown the product's
 *   palette can mix. The reliable one.
 * - **`kärpässieni`** — a fly agaric. The dome again, taller, in the zone red,
 *   under **five** white dots. The dots are the identity here rather than
 *   decoration, so they are large (nineteen to twenty-two units across, on a
 *   132-unit cap) and few: fifteen small ones would be texture and would be
 *   gone by 40px, which is exactly the size the warning has to survive at.
 *
 * ## Face: `lid`, and it is the cap's own line
 *
 * The face sits on the **stem**, in the clear run between the cap's brim and
 * the mouth — not on the cap. A face on the cap turns the stem into a body too
 * narrow to be one and the whole thing into a person in a very large hat; a
 * face under the brim is a small creature standing in its own shade, which is
 * the read the species wants.
 *
 * That decides the eye. The brim already cuts one hard horizontal across the
 * top of the head, and `lid` cuts the same chord across the top of each white,
 * so the face and the silhouette are saying one thing at two scales. It is
 * also the mode that draws no brow, which suits a species whose expression
 * budget is small on purpose.
 *
 * The quiet reward for putting the face on the stem: the stem is the *shared
 * cream* on three colourways out of four, so the face is drawn on the same
 * pale block whatever the cap is doing. Nothing here needs an `ink` override,
 * and a mood tuned once is tuned for every member — which is not true of any
 * other species in this directory.
 */

import type { ReactElement } from "react";

import type { ConceptDef, FormDef, PartProps } from "../concept";
import { MASCOT_INK, SIENI_VARIANTS } from "../palette";
import type { Rig } from "../rig";

export const SIENI_FORMS: readonly FormDef[] = [
  {
    id: "kantarelli",
    label: "Kantarelli — chanterelle",
    note: "A funnel: tips up, centre dipped. The only cap here that is not a dome.",
  },
  {
    id: "tatti",
    label: "Tatti — porcini",
    note: "The fat dome, in the only brown the palette can mix.",
  },
  {
    id: "karpassieni",
    label: "Kärpässieni — fly agaric",
    note: "Red, and five large white dots. The look-do-not-eat one.",
  },
];

/**
 * One skeleton for all three, because one *stem* serves all three.
 *
 * The forms differ above y=92 and nowhere else. That is not a shortcut: it is
 * the species' whole design stated as a rig, and it is what makes the family
 * legible — three characters that share a body and differ in one block of
 * colour at the top read as one species immediately, where three characters
 * that differ everywhere read as three drawings.
 *
 * The face row is the number that took the longest. It has to clear the brim
 * (which bottoms out around y=90 on the widest cap) and still sit inside the
 * stem, which is only about 65 units across there; at `eyeR 10` a pair of
 * whites at `±16` spans 72 to 128, leaving five units of stem on each side. Any
 * wider and the whites hang off the body they are drawn on.
 */
const RIG: Rig = {
  shadow: { cx: 100, cy: 186, rx: 46, ry: 7 },
  // Inside the stem, eight units above its base, so the join stays covered.
  hip: { x: 100, y: 136 },
  hipSpread: 13,
  footY: 173,
  footStyle: "stem",
  shoulderL: { x: 72, y: 118 },
  shoulderR: { x: 128, y: 118 },
  // The bust window: x 32–168 and y 29–165, which is the whole cap including
  // the widest brim, the face under it, and none of the feet.
  head: { x: 100, y: 78, r: 38 },
  eyeDx: 16,
  eyeY: 108,
  eyeR: 10,
  mouthY: 128,
  crown: { x: 100, y: 36 },
  crownW: 100,
  // Nothing to correct: the stem is narrow, so a hand resting at the hip is
  // already clear of the body. The cap overhangs much further, but it is
  // sixty units above the hands and never meets one.
  reach: 0,
  limbW: 12,
  handR: 8,
  limbStyle: "straight",
  handStyle: "mitten",
  armsOnDemand: true,
  armLen: 44,
  legLen: 42,
  torso: { x: 70, y: 132, w: 60, h: 18 },
  fusedHead: true,
};

/**
 * The stem. One shape, every form, every colourway.
 *
 * Sixty units across at the shoulder of it and seventy-two at the foot, with
 * the sides bowing outward on the way down — a mushroom stalk is wider where
 * it meets the ground, and that flare is most of why the silhouette reads as
 * grown rather than as a peg someone pushed in.
 */
const STEM = [
  "M 70 74",
  "L 130 74",
  "C 132 96 134 124 136 138",
  "C 136 145 122 149 100 149",
  "C 78 149 64 145 64 138",
  "C 66 124 68 96 70 74",
  "Z",
].join(" ");

/**
 * The gills, as one lens under the cap rather than as radiating lines.
 *
 * Radial gills are the first thing anyone draws on a mushroom and they are
 * texture: thirty strokes on a 136-unit brim are a grey band at 40px and a
 * moiré at 200. The job they were doing — telling the viewer the cap has an
 * underside and is not a painted disc — is done by one flat colour block,
 * which is the sanctioned substitution.
 */
const GILLS = [
  "M 34 90",
  "C 34 99 56 105 100 105",
  "C 144 105 166 99 166 90",
  "C 166 84 144 80 100 80",
  "C 56 80 34 84 34 90",
  "Z",
].join(" ");

/** The porcini's dome. Bottom edge bows *up*, so the gills show under it. */
const TATTI_CAP = [
  "M 32 92",
  "C 32 54 58 36 100 36",
  "C 142 36 168 54 168 92",
  "C 140 84 60 84 32 92",
  "Z",
].join(" ");

/** The fly agaric's — the same dome, taller and a shade narrower. */
const KARPAS_CAP = [
  "M 34 92",
  "C 34 50 60 32 100 32",
  "C 140 32 166 50 166 92",
  "C 138 84 62 84 34 92",
  "Z",
].join(" ");

/**
 * The chanterelle's funnel: the two outer tips lift to y=56 and the middle
 * dips to y=68. Two lobes rather than a scalloped edge — a wave count above
 * two is decoration, and at 40px the pair is what survives.
 */
const KANTARELLI_CAP = [
  "M 40 94",
  "C 40 74 50 58 62 56",
  "C 74 54 82 61 100 64",
  "C 118 61 126 54 138 56",
  "C 150 58 160 74 160 94",
  "C 136 86 64 86 40 94",
  "Z",
].join(" ");

/**
 * Five dots, placed so none of them touches the cap's edge or another dot.
 *
 * Large and few is the whole instruction. Twenty units across a 132-unit cap
 * is four pixels at a 40-pixel render, which is comfortably above the size a
 * dot stops being a dot and starts being a smudge — and five at that size is
 * the count that still reads as "spotted" instead of as "flecked". The raster
 * at 40 is where the number was settled: the dots are the only thing that
 * separates this cap from any other red dome, and they had to survive it.
 */
const KARPAS_DOTS = [
  { key: "n", cx: 79, cy: 50, r: 11 },
  { key: "e", cx: 121, cy: 50, r: 11 },
  { key: "sw", cx: 58, cy: 76, r: 9.5 },
  { key: "s", cx: 100, cy: 74, r: 10 },
  { key: "se", cx: 142, cy: 76, r: 9.5 },
];

const CAPS: Record<string, string> = {
  kantarelli: KANTARELLI_CAP,
  tatti: TATTI_CAP,
  karpassieni: KARPAS_CAP,
};

/** The stem, painted from the `panel` slot — the species' one constant. */
function Body({ colors }: PartProps): ReactElement {
  return <path d={STEM} fill={colors.panel} />;
}

/**
 * The cap, drawn after the stem so it overhangs it, and before anything worn
 * so a hat lands on top of it.
 *
 * A mushroom's head is a hat already, which is the one thing this species has
 * to be honest about: nothing is stopping a Sieni from wearing a beanie, and
 * it will look like a beanie on a hat. The seasons module will do it anyway in
 * December, and the result is funny rather than broken, so the slot stays
 * open and the caveat says what it costs.
 */
function Head({ colors, form }: PartProps): ReactElement {
  return (
    <g>
      <path d={GILLS} fill={colors.bodyBottom} />
      <path d={CAPS[form] ?? TATTI_CAP} fill={colors.bodyTop} />
      {form === "karpassieni" && (
        <g fill={MASCOT_INK.paper}>
          {KARPAS_DOTS.map((dot) => (
            <circle key={dot.key} cx={dot.cx} cy={dot.cy} r={dot.r} />
          ))}
        </g>
      )}
    </g>
  );
}

export const SIENI: ConceptDef = {
  id: "sieni",
  species: "Sieni",
  kind: "Mushroom — a cream stem under a cap that carries the whole identity",
  origin: "fresh",
  pitch:
    "One stem, three caps, and a species you can tell apart from across a room by a single block of colour. It is the cleanest demonstration in this directory of the half of the simplicity ruling that gets skipped — every mushroom here is the *same drawing* below the brim, and nobody looking at three of them together would say so. It also brings a job no other cast has: a Finnish child is taught early which ones you look at and which ones you pick, and Kärpi is a warning character who is genuinely charming rather than a yellow triangle.",
  caveat:
    "Its head is already a hat, so the hat slot is a joke rather than a wardrobe — a Sieni in a beanie is a beanie on a cap, and the automatic December look will do exactly that. Only the top third of the silhouette varies, which is the design and is also the risk: paint two forms in similar caps and they are the same character. And a face on a narrow stem is a small face — the eyes are ten units on a two-hundred-unit canvas, against a berry's twelve on a much wider body, so this is the species most likely to lose its expression first at small sizes.",
  landmark: "A wide cap over a pale stem, with the face in the shade under the brim.",
  slots: ["hat", "face", "torso", "back", "extra", "scene"],
  wardrobeLimit:
    "No hoodie and no tee — the stem has no shoulders, so a sleeved garment reads as a bib. A hat is possible and is always a hat on a hat: the cap is this species' head, and covering it covers the only part of the drawing that says which mushroom this is.",
  rig: RIG,
  forms: SIENI_FORMS,
  faceMode: "lid",
  variants: SIENI_VARIANTS,
  limbs: (c) => ({ arm: c.limb, leg: c.limb, hand: c.limb, foot: c.limb }),
  Body,
  Head,
  fleet: [
    {
      name: "Kanttis",
      job: "Gamer stand-in — session pages, the gamer dashboard, anywhere a child's photo cannot go",
      variantId: "kantarelli",
      form: "kantarelli",
      role: "gamer",
      pose: "controller",
      expression: "focused",
      garment: "emerald",
      blurb:
        "A chanterelle is the one you go out looking for, and finding a patch of them is the closest thing a Finnish forest has to a loot drop — which makes it the right mushroom to hand a controller. Amber from cap to foot, the only member of this fleet with no cream on it.",
    },
    {
      name: "Vahvero",
      job: "Gedu expert — session notes, the gedu workspace, anything being explained",
      variantId: "vahvero",
      form: "kantarelli",
      role: "gedu",
      pose: "point-left",
      expression: "thinking",
      prop: "pointer",
      garment: "teal",
      blurb:
        "The pale chanterelle: the same form as Kanttis and a different colourway, which is the ruling stated as a pair — two characters told apart by colour alone, standing next to each other, both still nameable. Fitting for the one whose job is telling you which is which.",
    },
    {
      name: "Tatu",
      job: "Parent stand-in — the parent dashboard, billing, anything written to a grown-up",
      variantId: "tatti",
      form: "tatti",
      role: "parent",
      pose: "idle",
      expression: "happy",
      prop: "basket",
      garment: "amber",
      blurb:
        "A porcini: the widest cap, the sturdiest stem and the calmest colour in the family, holding the basket everyone else is filling. Tatu is one letter off tatti and is a real Finnish name, which is the whole reason he is called it.",
    },
    {
      name: "Kärpi",
      job: "Warnings and safety notes — the look-first, ask-first, do-not-click-that moments",
      variantId: "karpassieni",
      form: "karpassieni",
      role: "none",
      pose: "hold-up",
      expression: "surprised",
      prop: "sign",
      garment: "red",
      blurb:
        "Red cap, five white dots, and a sign held up over his head. Every Finnish child learns this one before they learn to read: the prettiest mushroom in the forest is the one you look at and do not eat. That makes him a warning a child will actually stop and read — and the only character in the fleet whose job is to be admired and not touched.",
    },
  ],
};
