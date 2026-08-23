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
 */

import type { ReactElement } from "react";

import type { ConceptDef, FormDef, PartProps } from "../concept";
import { showsFiligree } from "../detail";
import { markingHex, MASCOT_INK, OTSO_CAST_VARIANTS, OTSO_VARIANTS } from "../palette";
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
    note: "The bandit mask and a ringed tail. R Osmo, honestly translated.",
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
    note: "Rosettes and a long curled tail — what the lynx's stub cannot do.",
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
];

/**
 * The family's coats: the original three, then the seven mixed for the second
 * cohort. Order matters — `honey` stays first, so it stays the default.
 */
const OTSO_ALL_VARIANTS = [...OTSO_VARIANTS, ...OTSO_CAST_VARIANTS];

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

/** The raccoon's tail, as one path drawn twice — the second copy is the rings. */
const RACCOON_TAIL = "M 133 146 C 155 152 173 141 170 121";

/** Whiskers: two lines a side, which are geometry rather than a texture. */
function Whiskers({
  x,
  y,
  spread,
  reach,
}: {
  x: number;
  y: number;
  spread: number;
  reach: number;
}): ReactElement {
  return (
    <g stroke={MASCOT_INK.line} strokeWidth={1.4} strokeLinecap="round" opacity={0.55} fill="none">
      <path d={`M ${x - spread} ${y - 2} l ${-reach} -4`} />
      <path d={`M ${x - spread} ${y + 2} l ${-reach} 4`} />
      <path d={`M ${x + spread} ${y - 2} l ${reach} -4`} />
      <path d={`M ${x + spread} ${y + 2} l ${reach} 4`} />
    </g>
  );
}

/** The tail — and, for the ones that have them, the wings. Drawn behind the body. */
function Tail({ colors, form, detail }: PartProps): ReactElement | null {
  switch (form) {
    case "fox":
      return (
        <g>
          <path
            d="M 136 146 C 158 146 172 128 168 108 C 166 96 154 94 150 106 C 146 118 142 132 132 138 Z"
            fill={colors.bodyBottom}
          />
          <path
            d="M 168 108 C 166 96 154 94 150 106 C 154 104 162 104 166 114 Z"
            fill={colors.panel}
          />
        </g>
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
      return (
        <>
          <path d="M 70 118 C 58 130 60 150 72 158 C 76 146 76 130 74 118 Z" fill={colors.bodyBottom} />
          <path d="M 130 118 C 142 130 140 150 128 158 C 124 146 124 130 126 118 Z" fill={colors.bodyBottom} />
        </>
      );
    case "raccoon":
      // Two strokes on one path: the pale tail, then the same curve dashed in
      // the dark marking colour. A ringed tail drawn as a dash pattern always
      // lands its bands square across the tail, which hand-placed ticks on a
      // curve never quite do.
      return (
        <g fill="none" strokeLinecap="round">
          <path d={RACCOON_TAIL} stroke={colors.panel} strokeWidth={17} />
          <path
            d={RACCOON_TAIL}
            stroke={markingHex(colors)}
            strokeWidth={17}
            strokeDasharray="8 9"
            strokeDashoffset={-5}
          />
        </g>
      );
    case "leopard":
      return (
        <g fill="none" strokeLinecap="round">
          <path
            d="M 133 148 C 160 152 178 137 173 117 C 170 105 158 104 158 115"
            stroke={colors.bodyTop}
            strokeWidth={11}
          />
          <path
            d="M 152 149 C 168 146 176 134 174 121"
            stroke={markingHex(colors)}
            strokeWidth={11}
            strokeDasharray="3 10"
          />
        </g>
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
      return (
        <g transform="rotate(-16 152 158)">
          <ellipse cx={152} cy={158} rx={34} ry={16} fill={colors.bodyBottom} />
          {/* The scutes are gated one level looser than filigree, for the same
              reason the giraffe's patches are: without them the paddle is an
              oval, and the oval is the entire beaver. */}
          {detail !== "icon" && (
            <g fill="none" stroke={colors.panel} strokeWidth={2} strokeLinecap="round">
              <path d="M 138 148 L 138 168" />
              <path d="M 152 145 L 152 171" />
              <path d="M 166 148 L 166 168" />
            </g>
          )}
        </g>
      );
    case "bug":
      // Four flat wings, not four translucent ones. A see-through wing is a
      // material cue, which is the same family of thing as an eye highlight,
      // so they are opaque shapes with an outline instead.
      return (
        <g fill={colors.panel} stroke={colors.spark} strokeWidth={1.8}>
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
      {form === "monster" ? (
        // The legacy character's fur is drawn as hundreds of hairs, which is a
        // texture and does not survive being a symbol. A lumpy *outline* is
        // the same idea as geometry: it says "this one is fuzzy" in the
        // silhouette, which is the only place it has to survive.
        <>
          <Fuzz cx={100} cy={132} rx={36} ry={30} r={7} lobes={16} fill={colors.bodyTop} />
          <ellipse cx={100} cy={132} rx={36} ry={30} fill={colors.bodyTop} />
        </>
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
      {form !== "monster" && <ellipse cx={100} cy={139} rx={25} ry={21} fill={colors.panel} />}
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
      {form === "seal" && showsFiligree(detail) && (
        <g fill="none" stroke={colors.bodyBottom} strokeWidth={2} opacity={0.55}>
          <ellipse cx={80} cy={124} rx={6} ry={4.5} />
          <ellipse cx={120} cy={122} rx={5} ry={4} />
          <ellipse cx={104} cy={112} rx={5.5} ry={4} />
        </g>
      )}
      {(form === "owl" || form === "tit") && showsFiligree(detail) && (
        <g fill="none" stroke={colors.bodyBottom} strokeWidth={2} strokeLinecap="round" opacity={0.4}>
          <path d="M 90 128 q 10 7 20 0" />
          <path d="M 86 140 q 14 8 28 0" />
        </g>
      )}
      {showsFiligree(detail) && form !== "seal" && form !== "monster" && (
        <ellipse cx={82} cy={116} rx={9} ry={6} fill={MASCOT_INK.paper} opacity={0.18} />
      )}
    </g>
  );
}

/** A muzzle: the pale patch, the nose, and the crease under it. */
function Muzzle({
  x,
  y,
  rx,
  ry,
  noseRx,
  colors,
  detail,
}: {
  x: number;
  y: number;
  rx: number;
  ry: number;
  noseRx: number;
  colors: { panel: string };
  detail: PartProps["detail"];
}): ReactElement {
  return (
    <g>
      <ellipse cx={x} cy={y} rx={rx} ry={ry} fill={colors.panel} />
      <ellipse cx={x} cy={y - ry * 0.55} rx={noseRx} ry={noseRx * 0.72} fill={MASCOT_INK.line} />
      {/* The philtrum, and nothing else. A glint on the nose is the same
          specular cue the face rules threw out — the fact that it was on a
          muzzle rather than on an eye did not make it a different mistake. */}
      {showsFiligree(detail) && (
        <path
          d={`M ${x} ${y - ry * 0.2} L ${x} ${y + ry * 0.15}`}
          stroke={MASCOT_INK.line}
          strokeWidth={2}
          strokeLinecap="round"
        />
      )}
    </g>
  );
}

function Head(props: PartProps): ReactElement {
  const { rig, colors, form, detail } = props;
  const { x, y, r } = rig.head;
  const marked = detail !== "icon";
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
          <Muzzle x={x} y={y + 20} rx={17} ry={13} noseRx={6.5} colors={colors} detail={detail} />
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
          <Muzzle x={x} y={y + 19} rx={16} ry={11} noseRx={6} colors={colors} detail={detail} />
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
          <Muzzle x={x} y={y + 26} rx={20} ry={16} noseRx={8} colors={colors} detail={detail} />
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
          {showsFiligree(detail) && (
            <g fill="none" stroke={colors.bodyBottom} strokeWidth={1.6} opacity={0.5}>
              <path d={`M ${x - 34} ${y - 22} q 10 -8 18 -4`} />
              <path d={`M ${x + 34} ${y - 22} q -10 -8 -18 -4`} />
            </g>
          )}
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
          <Muzzle x={x} y={y + 17} rx={14} ry={10} noseRx={5} colors={colors} detail={detail} />
        </g>
      );
    case "seal":
      return (
        <g>
          <ellipse cx={x} cy={y} rx={r * 1.02} ry={r * 0.94} fill={colors.bodyTop} />
          <Muzzle x={x} y={y + 20} rx={18} ry={12} noseRx={6.5} colors={colors} detail={detail} />
          {showsFiligree(detail) && <Whiskers x={x} y={y + 22} spread={16} reach={14} />}
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
          <Muzzle x={x} y={y + 19} rx={16} ry={12} noseRx={6} colors={colors} detail={detail} />
          {showsFiligree(detail) && <Whiskers x={x} y={y + 21} spread={15} reach={15} />}
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
          {marked && (
            <g fill="none" stroke={markingHex(colors)} strokeWidth={2.6}>
              <circle cx={x - 28} cy={y - 2} r={4.5} />
              <circle cx={x + 28} cy={y - 2} r={4.5} />
              <circle cx={x - 15} cy={y - 22} r={4} />
              <circle cx={x + 15} cy={y - 22} r={4} />
            </g>
          )}
          <Muzzle x={x} y={y + 18} rx={14} ry={10} noseRx={5.4} colors={colors} detail={detail} />
          {showsFiligree(detail) && <Whiskers x={x} y={y + 20} spread={15} reach={15} />}
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
          {marked && (
            <g fill={colors.bodyBottom}>
              <circle cx={x - 15} cy={y - 11} r={3.6} />
              <circle cx={x + 16} cy={y - 8} r={3.2} />
            </g>
          )}
          <Muzzle x={x} y={y + 16} rx={13} ry={12} noseRx={4.6} colors={colors} detail={detail} />
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
              A tapered triangle with two bands: a drawn spiral turns to mush
              below about 60px, two bands survive to the avatar crop. */}
          <path d={`M ${x} ${y - 66} L ${x - 9} ${y - 28} L ${x + 9} ${y - 28} Z`} fill={colors.accent} />
          <path
            d={`M ${x - 6} ${y - 45} L ${x + 6} ${y - 45}`}
            stroke={colors.spark}
            strokeWidth={3.2}
            strokeLinecap="round"
          />
          <path
            d={`M ${x - 3.6} ${y - 56} L ${x + 3.6} ${y - 56}`}
            stroke={colors.spark}
            strokeWidth={2.8}
            strokeLinecap="round"
          />
          {/* A muzzle that carries on below the skull, which is the other half
              of turning a round head into a horse's. Two small nostrils rather
              than the family's single nose blob — a horse has them set apart,
              and they are still flat shapes with no interior. */}
          <path
            d={`M ${x - 17} ${y + 4} C ${x - 17} ${y + 26} ${x - 11} ${y + 36} ${x} ${y + 36} C ${x + 11} ${y + 36} ${x + 17} ${y + 26} ${x + 17} ${y + 4} Z`}
            fill={colors.panel}
          />
          <ellipse cx={x - 6} cy={y + 19} rx={3.4} ry={2.6} fill={MASCOT_INK.line} />
          <ellipse cx={x + 6} cy={y + 19} rx={3.4} ry={2.6} fill={MASCOT_INK.line} />
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
          {showsFiligree(detail) && <Whiskers x={x} y={y + 14} spread={13} reach={18} />}
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
          <Muzzle x={x} y={y + 20} rx={27} ry={12} noseRx={7} colors={colors} detail={detail} />
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
          <Muzzle x={x} y={y + 20} rx={22} ry={15} noseRx={7.5} colors={colors} detail={detail} />
        </g>
      );
  }
}

export const OTSO: ConceptDef = {
  id: "otso",
  species: "Otso",
  kind: "Animal family — one rig, sixteen species",
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
      // The goggles and the belt-and-braces gold both come off the `amber`
      // swatch rather than off this coat, whose garment slot is teal: the
      // goggle frames are painted from `clothing`, and teal frames around
      // cyan glass are one colour pretending to be two.
      outfit: { hat: "goggles", scene: "engine-room" },
      garment: "amber",
      blurb: "The animal that builds things, dams the river and keeps the water where it should be, which is close enough to a job description. Goggles pushed up, a spanner in hand and the reactor column behind him. No Star Trek anywhere on him: the gold is engineering gold, the column is a column, and the title is his own handle. The paddle tail is what keeps him from being a brown bear.",
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
  ],
};
