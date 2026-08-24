/**
 * The face — six expressions as one symbol system.
 *
 * ## The grammar
 *
 * Every part of this face is a **flat primitive that means something only
 * through its geometry**. There are no rendered surfaces, no light sources and
 * no material cues anywhere on an eye or a mouth. An expression is not a
 * drawing; it is four dials set to different values:
 *
 * 1. **Eye size and shape** — how big the white ellipse is, how far a lid has
 *    come down over it, or whether it has stopped being an ellipse at all (a
 *    shut eye is an arc).
 * 2. **Pupil position** — where it sits inside its own white.
 * 3. **Brow angle and presence** — one short line whose slope does the work,
 *    drawn only when the mood needs it.
 * 4. **Mouth shape** — a small curve, or a small solid glyph with no interior.
 *
 * The same four dials produce all six moods, which is what makes them read as
 * one character changing its mind rather than as six separate drawings.
 *
 * ## Two rules the dials are not free to break
 *
 * **A resting pupil is never dead centre on a face that has two of them.** A
 * pair of perfectly concentric white-and-black discs, symmetric about the
 * face's own axis, is a doll's fixed glass eye and it is quietly unsettling —
 * which is why Thinking, whose eye is the identical shape with the pupil moved,
 * never was. So `forward` gaze means "the calm resting look", not "geometrically
 * centred": on a paired face the resting pupil sinks slightly, opening a
 * crescent of white above it while still pointing at the viewer. One eye is a
 * feature rather than a stare and keeps its centred pupil. See `RESTING_SINK`.
 *
 * **Focused narrows an eye with a lowered lid, never with a lens.** A pointed,
 * slanted or tapered almond is a racial caricature whatever it was drawn to
 * mean, so no mode here pinches an eye's ends: the white keeps its own round
 * shape and a straight chord takes the top off it (`cutDisc`), with the pupil
 * tucked under the cut. See `FOCUSED_CUT`.
 *
 * ## What was wrong before, twice
 *
 * Round one had this grammar and only used it for half the set. Thinking,
 * Surprised and Focused were pure symbol faces and they worked. Happy, Excited
 * and Laughing broke the grammar by adding **detail instead of changing
 * shape**: a specular highlight on each eye, sparkles beside them, cheek
 * blush, and a wide mouth with an interior — tongue, lip line, the lot. Every
 * one of those is a *realism* cue. Stacked on a face made of flat symbols they
 * have nothing to agree with, and the result is the uncanny valley: an eye
 * rendered like a wet sphere that still says nothing, under a mouth that is
 * shouting. That is what "soulless" was describing.
 *
 * Round two accepted the diagnosis and removed the wrong thing. It deleted the
 * white sclera — the part that already worked — and kept the highlight, which
 * was the actual realism cue. Removing the white also deleted a whole dial:
 * with no ellipse, a pupil has nothing to be positioned *inside*, so Thinking
 * lost the single gesture that made it Thinking. That version survives in
 * `face-warm.tsx` for the comparison strip and for nothing else.
 *
 * ## So, round three
 *
 * The white ellipse is back for every species that had one, and every realism
 * cue is gone from every expression: no highlights, no sparkles, no blush, no
 * teeth, no tongue, no lip or lid lines, no shading. Where a mood used to be
 * expressed by adding detail it is now expressed by moving a dial.
 *
 * Two things round three still had wrong were fixed after Kyle looked at the
 * finished set: Happy and Excited stared dead ahead, and Focused was drawn as
 * a pointed lens. Both are the rules above, and both changed the paired faces
 * only — the cyclops face was right already and is byte-for-byte unchanged.
 *
 * "Screen" mode is the second kind of head — a face that is a lit display
 * rather than a pair of eyes. It needs different primitives (a display draws
 * glyphs, not spheres) but it already obeys this grammar: lit flat shapes on a
 * dark panel, no interior detail, meaning carried entirely by outline. It is
 * therefore untouched, and it is the thing the rest of the set was rebuilt to
 * match.
 */

import type { ReactElement } from "react";

import { featureScale, type DetailLevel } from "./detail";
import { LegacyEyeballs, LegacyMouth } from "./face-legacy";
import { VoxelBrows, VoxelEyes, VoxelMouth } from "./face-voxel";
import { WARM_BLUSHING, WarmBlush, WarmEyes, WarmMouth } from "./face-warm";
import { MASCOT_INK, type Colorway } from "./palette";
import type { Rig } from "./rig";
import type { ExpressionId, GazeId } from "./vocabulary";

/**
 * Whether the head has eyes on it, one eye on it, or a display in it.
 *
 * `cyclops` keeps the four dials and changes which primitives they turn: one
 * white on the head's centre line, one pupil in it, **no brow at all**, and a
 * mouth only on the moods that open one. Dial three moves into the white
 * itself, which gets cut by a straight chord whose height and tilt do what a
 * brow's slope did on a paired face. It is not a reduced face — a single big
 * eye turns every dial *harder*, because there is nothing for the viewer's
 * attention to split between. It exists because the mascot School of Gaming
 * actually shipped for years was a one-eyed blob, and a cyclops drawn as two
 * eyes minus one is not the same thing as a cyclops drawn as a cyclops.
 *
 * `voxel` is the same grammar with every primitive squared off — see
 * `face-voxel.tsx`. It exists for the species built out of cubes: a smooth
 * ellipse on a face made of flat rectangles does not read as that character's
 * eye, it reads as something stuck on afterwards. Like `screen`, it is a
 * property of the *head*, not a face design a caller picks, so it overrides
 * the comparison-strip `style` exactly as the screen face does.
 */
export type FaceMode = "eyes" | "screen" | "cyclops" | "voxel" | "lid";

/**
 * Which face design.
 *
 * `symbol` is the one. The other two exist so the three rounds can be put next
 * to each other on the exploration page, and they are deleted with it — along
 * with this union, which then collapses to nothing.
 */
export const FACE_STYLES = ["symbol", "warm", "legacy"] as const;
export type FaceStyle = (typeof FACE_STYLES)[number];

export const FACE_STYLE_LABELS: Record<FaceStyle, string> = {
  symbol: "Round 3 — symbol",
  warm: "Round 2 — warm",
  legacy: "Round 1 — original",
};

type FaceProps = {
  rig: Rig;
  colors: Colorway;
  expression: ExpressionId;
  mode: FaceMode;
  detail: DetailLevel;
  style?: FaceStyle;
  /** Where the eyes point. See `pupilOffset` for how it composes with mood. */
  gaze?: GazeId;
  /**
   * The blink loop's class, or the empty string when the mascot is static.
   *
   * One wrapper around whichever eyes this face mode drew, which is what makes
   * the blink work the same on two eyes, on a cyclops and on a pair of voxel
   * blocks without any of those knowing it exists. See the note above the
   * wrapper itself for why it is a squash rather than a lid.
   */
  blinkClass: string;
};

type EyeCentre = { x: number; y: number; side: -1 | 1 };

type EyeProps = {
  centres: EyeCentre[];
  colors: Colorway;
  expression: ExpressionId;
  gaze: GazeId;
  r: number;
  /**
   * The line colour. Only the shut eye needs it — every other expression's
   * eye is a white shape with a pupil cut into it, and a cut-out reads on any
   * body. A shut eye is a *stroke on the silhouette*, which is why it belongs
   * to the same family as the brow and the mouth rather than to the pupil.
   */
  ink: string;
  filigree: boolean;
  highlights: boolean;
};

/** Expressions whose eyes are already shut have nothing to blink with. */
const BLINKLESS: ReadonlySet<ExpressionId> = new Set<ExpressionId>(["laughing"]);

/** The two eye centres, viewer-left first. */
function eyeCentres(rig: Rig): EyeCentre[] {
  return [
    { x: rig.head.x - rig.eyeDx, y: rig.eyeY, side: -1 },
    { x: rig.head.x + rig.eyeDx, y: rig.eyeY, side: 1 },
  ];
}

/**
 * The one eye centre of a cyclops head — on the centre line, ignoring
 * `eyeDx`, which such a rig sets to zero anyway so that anything reading the
 * face anchor (glasses, a visor) is told the truth about the head it is on.
 */
function cyclopsCentre(rig: Rig): EyeCentre[] {
  return [{ x: rig.head.x, y: rig.eyeY, side: 1 }];
}

/**
 * A disc with its top cut off by a straight chord, as one path.
 *
 * `cut` is where the chord sits, in radii above the centre: 1 leaves the whole
 * circle, 0 halves it, and a negative value cuts below the centre. Drawn as a
 * true circular segment rather than as a rectangle of body colour laid over the
 * white, because a shape that is *actually* that shape needs no second colour
 * to be right and cannot come apart from the body it sits on.
 *
 * It is the one narrowed-eye primitive this file has. See `FOCUSED_CUT` for
 * why nothing here is allowed to narrow an eye by pinching it into a lens.
 */
function cutDisc(x: number, y: number, r: number, cut: number): string {
  const c = Math.min(0.999, cut);
  const half = r * Math.sqrt(Math.max(0, 1 - c * c));
  const chord = y - r * c;
  // Sweep 0 takes the arc through the bottom of the circle; the large-arc flag
  // is set whenever that bottom arc is more than a semicircle, which is
  // whenever the chord sits above the centre.
  return `M ${x - half} ${chord} A ${r} ${r} 0 ${c >= 0 ? 1 : 0} 0 ${x + half} ${chord} Z`;
}

/**
 * **A resting pupil is never dead centre on a face that has two of them.**
 *
 * Kyle, on the round-three set: Happy and Excited "looking dead on has
 * something of an unsettling look — just a bit creepy", while Thinking, whose
 * eye is the *identical* shape and size but whose pupil is off-centre, does
 * not, and neither does the one-eyed Silmu staring straight down the lens. The
 * A/B/C/D sheets confirmed the diagnosis: what is unsettling is neither the
 * shape nor the centring on its own but the **pair of perfectly concentric
 * discs, symmetric about the face's own axis** — a doll's fixed glass eye, two
 * identical bullseyes locked on the viewer. Break the concentricity and the
 * same face is warm.
 *
 * There are two ways to break it and only one of them keeps the character
 * looking at you. Sliding both pupils sideways (tested at 0.08 and 0.14) does
 * kill the stare, but it also buys a glance off to one side — which is the
 * gesture Thinking already owns, so Happy borrowing it makes the two moods
 * argue. **Sinking both pupils slightly** leaves the eyes pointed at the viewer
 * and merely opens a crescent of white above them, which is what a real relaxed
 * eye does under its own lid. That is the pick, at **0.14 of the eye's own
 * radius**: below about 0.10 the crescent is not there yet, and by 0.18 the
 * pupil is crowding the bottom of the white and the mood tips into looking
 * down. Only Happy and Excited take it — Thinking already has its own gesture,
 * Laughing has no pupil, Surprised's tiny pupil dead in a wide white *is* the
 * shock, and Focused is tucked under its own lid.
 *
 * `paired` is what keeps this off the one-eyed face. A cyclops was never creepy
 * — one eye is a *feature*, not a stare, and there is no symmetry between two
 * of them to break — so it keeps a geometrically centred resting pupil, and the
 * sink is asked for by the modes that draw two eyes rather than applied here to
 * everything.
 *
 * ## Precedence
 *
 * **Gaze and expression both want this dial, so the precedence is written
 * down here rather than guessed at each call site: an explicit gaze wins.**
 * `forward` is the default and means "the calm resting look" — whatever the
 * mood already decided, plus the resting sink where the mood decided nothing.
 * It is no longer a synonym for "geometrically centred". Any other gaze
 * *replaces* that offset rather than adding to it, because adding them is how a
 * Thinking mascot asked to look right ends up with its pupil outside its own
 * eye. One dial, one value, the caller who asked for something specific wins.
 *
 * The amounts are fractions of the eye radius, chosen so the pupil stays
 * inside the white for every expression that has one: the widest pupil is
 * Excited's at 0.7r inside a 1.22r white, leaving 0.52r of slack against the
 * 0.4r spent here. Focused is the exception — its white is a disc cut down by a
 * lid, with much less vertical room — so it looks up and down half as far.
 */
const RESTING_SINK = 0.14;

/** The moods whose resting pupil is otherwise dead centre. See `RESTING_SINK`. */
const RESTS_LOW: ReadonlySet<ExpressionId> = new Set<ExpressionId>(["happy", "excited"]);

function pupilOffset(
  expression: ExpressionId,
  gaze: GazeId,
  r: number,
  paired = false,
): { dx: number; dy: number } {
  if (gaze === "forward") {
    if (expression === "thinking") return { dx: r * 0.34, dy: -r * 0.32 };
    return { dx: 0, dy: paired && RESTS_LOW.has(expression) ? r * RESTING_SINK : 0 };
  }
  const across = r * 0.4;
  const down = r * (expression === "focused" ? 0.17 : 0.34);
  switch (gaze) {
    case "up":
      return { dx: 0, dy: -down };
    case "down":
      return { dx: 0, dy: down };
    case "left":
      return { dx: -across, dy: 0 };
    case "right":
      return { dx: across, dy: 0 };
  }
}

/**
 * **Focused narrows an eye with a lowered lid, never with a lens.**
 *
 * Round three drew Focused as an almond: the white pinched to a pointed
 * horizontal lens, sharp at both corners. Kyle: "the squinting eyes for the
 * focused face can also read as a rude stereotype for Asian eyes — let's make
 * sure we get this right and not offend on accident." He is right, and the
 * fix is not a smaller almond: a pointed, slanted or tapered eye is exactly
 * the caricature, so **no mode in this module narrows an eye by pinching its
 * ends**. The construction that replaces it is the one the cyclops face was
 * already using for the same mood — the eye's own round white, cut flat by a
 * straight chord from the top (`cutDisc`), with the pupil tucked under the cut.
 * It is a lid coming down over a round eye, which is what concentrating
 * actually looks like, and it has no point anywhere on it.
 *
 * The two numbers are where "concentrating" beat "sleepy" on the raster
 * ladder at 200 / 64 / 40. `FOCUSED_CUT` is the chord's height in radii above
 * the centre: at 0.5 the eye is barely narrowed and the mood does not land, at
 * 0 the eye is a half-disc and reads as nodding off, and 0.22 takes just under
 * two fifths of the white's height off the top — narrowed, unmistakably awake.
 * `FOCUSED_SINK` then drops the pupil far enough to sit *under* the lid rather
 * than be sawn in half by it. The brow (which this mode draws and the lid mode
 * does not) carries the rest of the intent.
 */
const FOCUSED_CUT = 0.22;
const FOCUSED_SINK = 0.24;

/**
 * Dials one and two: the white ellipse, and where the pupil sits in it.
 *
 * Every case here is two flat shapes and nothing else. If a future expression
 * seems to need a third shape to say what it means, the right move is a
 * different ellipse — not a third shape.
 */
function SymbolEyes({ centres, colors, expression, gaze, r, ink }: EyeProps): ReactElement {
  const off = pupilOffset(expression, gaze, r, true);
  return (
    <>
      {centres.map(({ x, y, side }) => {
        // Every case below draws its white about (x, y) and its pupil about
        // (px, py). The two coincide exactly when the mood and the gaze both
        // have nothing to say, which is the default face.
        const px = x + off.dx;
        const py = y + off.dy;
        switch (expression) {
          // The default face. The Thinking eye with the pupil brought back to
          // centre: looking straight at you, and nothing added to say so.
          case "happy":
            return (
              <g key={side}>
                <circle cx={x} cy={y} r={r} fill={colors.sclera} />
                <circle cx={px} cy={py} r={r * 0.56} fill={colors.pupil} />
              </g>
            );
          // The same eye, bigger and rounder, with a bigger pupil. Open wide
          // with plenty of pupil reads as delight; open wide with a small
          // pupil — two cases down — reads as shock. That difference is the
          // whole of it.
          case "excited":
            return (
              <g key={side}>
                <circle cx={x} cy={y} r={r * 1.22} fill={colors.sclera} />
                <circle cx={px} cy={py} r={r * 0.7} fill={colors.pupil} />
              </g>
            );
          // A shape change rather than added detail, which is why it is
          // allowed: the eye has closed, so there is no ellipse and no pupil.
          case "laughing":
            return (
              <path
                key={side}
                d={`M ${x - r} ${y + r * 0.35} Q ${x} ${y - r * 0.95} ${x + r} ${y + r * 0.35}`}
                fill="none"
                stroke={ink}
                strokeWidth={r * 0.46}
                strokeLinecap="round"
              />
            );
          // Dial two, on its own: same ellipse, pupil up and to the side.
          case "thinking":
            return (
              <g key={side}>
                <circle cx={x} cy={y} r={r} fill={colors.sclera} />
                <circle cx={px} cy={py} r={r * 0.56} fill={colors.pupil} />
              </g>
            );
          case "surprised":
            return (
              <g key={side}>
                <circle cx={x} cy={y} r={r * 1.16} fill={colors.sclera} />
                <circle cx={px} cy={py} r={r * 0.4} fill={colors.pupil} />
              </g>
            );
          // Narrowed by a lowered lid: the same round white, cut flat across
          // the top, with the pupil tucked under the cut. Still two shapes,
          // and still one dial — see `FOCUSED_CUT`.
          case "focused":
            return (
              <g key={side}>
                <path d={cutDisc(x, y, r, FOCUSED_CUT)} fill={colors.sclera} />
                <circle
                  cx={px}
                  cy={py + r * FOCUSED_SINK}
                  r={r * 0.5}
                  fill={colors.pupil}
                />
              </g>
            );
        }
      })}
    </>
  );
}

/**
 * A display has no pupil to move, so a gaze moves the whole lit glyph inside
 * the panel instead — a screen that looks left is a screen whose picture has
 * slid left. Less travel than an eyeball gets, because the glyph is much
 * bigger than a pupil and the panel it sits in has hard edges.
 */
function ScreenEyes({ centres, colors, expression, gaze, r }: EyeProps): ReactElement {
  const lit = colors.sclera;
  const off = pupilOffset(expression, gaze, r);
  const glyphs = (
    <>
      {centres.map(({ x, y, side }) => {
        switch (expression) {
          case "happy":
            return (
              <rect
                key={side}
                x={x - r * 0.9}
                y={y - r * 0.85}
                width={r * 1.8}
                height={r * 1.7}
                rx={r * 0.55}
                fill={lit}
              />
            );
          case "excited":
            return (
              <rect
                key={side}
                x={x - r * 0.85}
                y={y - r * 1.05}
                width={r * 1.7}
                height={r * 2.1}
                rx={r * 0.5}
                fill={lit}
              />
            );
          case "thinking":
            return (
              <rect
                key={side}
                x={x - r * 0.45}
                y={y - r * 0.95}
                width={r * 1.5}
                height={r * 1.3}
                rx={r * 0.45}
                fill={lit}
              />
            );
          case "laughing":
            return (
              <path
                key={side}
                d={`M ${x - r} ${y + r * 0.4} L ${x} ${y - r * 0.6} L ${x + r} ${y + r * 0.4}`}
                fill="none"
                stroke={lit}
                strokeWidth={r * 0.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            );
          case "surprised":
            return (
              <circle
                key={side}
                cx={x}
                cy={y}
                r={r * 0.95}
                fill="none"
                stroke={lit}
                strokeWidth={r * 0.44}
              />
            );
          case "focused":
            return (
              <rect
                key={side}
                x={x - r * 0.95}
                y={y - r * 0.4}
                width={r * 1.9}
                height={r * 0.8}
                rx={r * 0.35}
                fill={lit}
              />
            );
        }
      })}
    </>
  );
  if (gaze === "forward") return glyphs;
  return <g transform={`translate(${off.dx * 0.7} ${off.dy * 0.7})`}>{glyphs}</g>;
}

/**
 * Dial three. One short line per eye whose angle carries the meaning, drawn
 * only for the moods that need it — Happy and Laughing say everything with the
 * other three dials, and a brow they do not need would be decoration.
 */
function Brows({
  centres,
  expression,
  r,
  ink,
}: {
  centres: EyeCentre[];
  expression: ExpressionId;
  r: number;
  ink: string;
}): ReactElement | null {
  const stroke = {
    stroke: ink,
    strokeWidth: Math.max(2.4, r * 0.36),
    strokeLinecap: "round" as const,
    fill: "none",
  };
  switch (expression) {
    case "excited":
      return (
        <>
          {centres.map(({ x, y, side }) => (
            <path
              key={side}
              d={`M ${x - r * 0.9} ${y - r * 1.55} Q ${x} ${y - r * 2.2} ${x + r * 0.9} ${y - r * 1.55}`}
              {...stroke}
            />
          ))}
        </>
      );
    case "surprised":
      return (
        <>
          {centres.map(({ x, y, side }) => (
            <path
              key={side}
              d={`M ${x - r} ${y - r * 1.9} Q ${x} ${y - r * 2.55} ${x + r} ${y - r * 1.9}`}
              {...stroke}
            />
          ))}
        </>
      );
    case "focused":
      return (
        <>
          {centres.map(({ x, y, side }) => (
            <path
              key={side}
              d={`M ${x + side * r} ${y - r * 1.8} L ${x - side * r} ${y - r * 1.1}`}
              {...stroke}
            />
          ))}
        </>
      );
    case "thinking":
      return (
        <>
          {centres.map(({ x, y, side }) => (
            <path
              key={side}
              d={`M ${x - r} ${y - r * (side === 1 ? 2.15 : 1.55)} L ${x + r} ${y - r * (side === 1 ? 1.75 : 1.65)}`}
              {...stroke}
            />
          ))}
        </>
      );
    case "happy":
    case "laughing":
      return null;
  }
}

/**
 * The one-eyed face, which is a different symbol system on the same four dials.
 *
 * A cyclops is not a two-eyed head with an eye removed, and the first pass
 * treated it as one: it borrowed the paired eyes, the paired mouths and the
 * paired brows, and scaled them. Two of those do not survive the trip.
 *
 * **There is no brow.** Not "no brow on the moods that do not need one" — none,
 * ever. The legacy SOG mascot has sixteen files and not one of them draws a
 * line above the eye, and the reason is structural rather than stylistic: a
 * paired brow says what it says by disagreeing with the other one, and a lone
 * brow on a head with no other feature reads as a mark left on the character
 * rather than as part of its face. What the brow was doing moves into the eye,
 * which on this species is big enough to carry it — the white gets **cut** by a
 * straight chord, and the height and angle of that cut is the dial the brow
 * used to be. `Minion_Red` is the whole argument: its eye is a full circle with
 * the top sliced off just above centre and the pupil sitting under the slice,
 * and it reads as unmistakably wary without a stroke anywhere near it.
 *
 * **The mouth is optional.** Nine of the sixteen files have no mouth at all,
 * including every one of the five gaze sprites, and the face they make is not
 * blank — it is composed. So the resting mood draws no mouth, and a mouth
 * appears when the mood is one that opens it. (The tidier form of this is a
 * shared `content` expression every species could use; it is not done here
 * because adding a member to `ExpressionId` breaks the exhaustive switches in
 * four face modules this change does not own.)
 */

/**
 * One eye per mood: how big the white is, where its chord falls and how far the
 * chord is tilted, and how much of the white the pupil takes.
 *
 * The two ratios come off the source rather than off taste. In `eteen`, `alas`
 * and `Minion_Blue` alike the white is 96 px across on a body 280 px wide — a
 * shade over a third — and the pupil inside it is 33 px, which is a third
 * again. A pupil at the house's usual 0.56 of the white looks right on a
 * seven-unit eye and looks like a dinner plate on a twenty-one-unit one.
 */
const CYCLOPS_EYES: Record<
  ExpressionId,
  { white: number; cut: number; tilt: number; pupil: number }
> = {
  // The resting face: a full circle and a small pupil, which is what all five
  // of the gaze sprites are.
  happy: { white: 1, cut: 1, tilt: 0, pupil: 0.36 },
  // Wide open. `Minion_Blue`, which is the file the old site put everywhere.
  excited: { white: 1.12, cut: 1, tilt: 0, pupil: 0.4 },
  // Wider still with less pupil in it — the same trade the paired face makes
  // between delight and shock.
  surprised: { white: 1.16, cut: 1, tilt: 0, pupil: 0.28 },
  // A shallow chord, tilted, so one end of the cut sits lower than the other:
  // barely a fifth of a radius comes off the top, which narrows the eye without
  // closing it. This is the asymmetry a single eye is allowed, and the only one
  // it has. `Minion_Orange` is the reference — a nearly-round eye, a pupil
  // looking off, and a small smile.
  thinking: { white: 1, cut: 0.8, tilt: -18, pupil: 0.36 },
  // `Minion_Red`: cut flat just above the centre, pupil under the cut.
  focused: { white: 1, cut: 0.2, tilt: 0, pupil: 0.36 },
  // Shut, and therefore a stroke rather than a shape, as in the paired face.
  laughing: { white: 1, cut: 1, tilt: 0, pupil: 0 },
};

/**
 * The lid eye: a two-eye face whose whites are cut flat across the top, the
 * way a resting lid sits on an eye. It is the eye of the Huhtala lineage the
 * Porukka concept is built on — the cut is what makes the face calm — and it
 * uses the same four dials as every other mode: the white's size, the cut's
 * height, the pupil's size and its sink under the lid. The cut is a circular
 * segment (`cutDisc`), never a drawn lid line. Laughing falls through to the
 * symbol face's shut arcs, which are already the right glyph.
 *
 * `sink` is the *extra* drop a mood wants on top of the shared resting sink
 * (`RESTING_SINK`), which this mode asks for like every other paired face. Two
 * moods used to hold their own small tuck here and no longer need one: Happy
 * and Excited get theirs from the shared rule, so their entry is zero and the
 * two faces cannot drift apart.
 */
const LID_EYES: Record<ExpressionId, { white: number; cut: number; pupil: number; sink: number }> = {
  happy: { white: 1.15, cut: 0.45, pupil: 0.5, sink: 0 },
  excited: { white: 1.3, cut: 0.75, pupil: 0.52, sink: 0 },
  surprised: { white: 1.3, cut: 0.95, pupil: 0.36, sink: 0 },
  thinking: { white: 1.15, cut: 0.35, pupil: 0.5, sink: 0.12 },
  focused: { white: 1.15, cut: 0.05, pupil: 0.5, sink: 0.16 },
  laughing: { white: 1.15, cut: 1, pupil: 0, sink: 0 },
};

function LidEyes(props: EyeProps): ReactElement {
  const { centres, colors, expression, gaze, r } = props;
  if (expression === "laughing") return <SymbolEyes {...props} />;
  const spec = LID_EYES[expression];
  const rw = r * spec.white;
  const off = pupilOffset(expression, gaze, rw, true);
  return (
    <>
      {centres.map(({ x, y, side }) => (
        <g key={side}>
          <path d={cutDisc(x, y, rw, spec.cut)} fill={colors.sclera} />
          <circle
            cx={x + off.dx}
            cy={y + off.dy + rw * spec.sink}
            r={rw * spec.pupil}
            fill={colors.pupil}
          />
        </g>
      ))}
    </>
  );
}

function CyclopsEye({ centres, colors, expression, gaze, r, ink }: EyeProps): ReactElement {
  const { x, y } = centres[0];
  if (expression === "laughing") {
    return (
      <path
        d={`M ${x - r} ${y + r * 0.35} Q ${x} ${y - r * 0.95} ${x + r} ${y + r * 0.35}`}
        fill="none"
        stroke={ink}
        strokeWidth={r * 0.42}
        strokeLinecap="round"
      />
    );
  }
  const spec = CYCLOPS_EYES[expression];
  const rw = r * spec.white;
  const off = pupilOffset(expression, gaze, rw);
  // A cut eye keeps its pupil under the cut rather than half-hidden by it. The
  // pupil is small enough that sliding it down by a third of what the chord
  // took off is the difference between "looking out from under" and "sawn in
  // half".
  const sink = spec.cut >= 0.999 ? 0 : rw * (1 - spec.cut) * 0.32;
  return (
    <g transform={spec.tilt === 0 ? undefined : `rotate(${spec.tilt} ${x} ${y})`}>
      <path d={cutDisc(x, y, rw, spec.cut)} fill={colors.sclera} />
      <circle cx={x + off.dx} cy={y + off.dy + sink} r={rw * spec.pupil} fill={colors.pupil} />
    </g>
  );
}

/**
 * The mouths this species has, and the mood that has none.
 *
 * `Minion_Blue`'s grin is a solid shape with a flat top and a round bottom — a
 * D on its back — and it is *enormous*: 137 px across a 280 px body, very
 * nearly half its width. Everything here is scaled off the eye rather than off
 * a constant, so it stays in proportion to the one feature this face is built
 * around.
 */
function CyclopsMouth({
  rig,
  expression,
  ink,
}: {
  rig: Rig;
  expression: ExpressionId;
  ink: string;
}): ReactElement | null {
  const x = rig.head.x;
  const y = rig.mouthY;
  const r = rig.eyeR;
  const line = {
    fill: "none",
    stroke: ink,
    strokeWidth: Math.max(3, r * 0.19),
    strokeLinecap: "round" as const,
  };
  // The open grin, as one filled shape: flat across the top, half an ellipse
  // hung under it.
  const grin = (w: number, h: number): ReactElement => (
    <path
      d={`M ${x - w} ${y - h * 0.3} L ${x + w} ${y - h * 0.3} A ${w} ${h} 0 0 1 ${x - w} ${y - h * 0.3} Z`}
      fill={ink}
    />
  );
  switch (expression) {
    // No mouth. A Silmu standing there with one eye and nothing else is not
    // missing a feature; it is the face nine of the sixteen source files draw.
    case "happy":
      return null;
    case "excited":
      return grin(r * 0.98, r * 0.9);
    case "laughing":
      return grin(r * 0.86, r * 0.82);
    case "surprised":
      // Round rather than tall. An oval under a big round eye reads as a drip
      // coming off it; a circle reads as a mouth.
      return <circle cx={x} cy={y + 1} r={r * 0.34} fill={ink} />;
    case "thinking":
      return (
        <path
          d={`M ${x - r * 0.16} ${y + 1} Q ${x + r * 0.2} ${y + r * 0.3} ${x + r * 0.55} ${y - 1}`}
          {...line}
        />
      );
    case "focused":
      return <path d={`M ${x - r * 0.5} ${y} Q ${x} ${y + r * 0.28} ${x + r * 0.5} ${y - 1}`} {...line} />;
  }
}

/**
 * Dial four. Four of the six are one open curve; the other two are one solid
 * glyph. Nothing here has an inside — no tongue, no teeth, no lip line, no
 * second colour. Round two was right that the mouths had grown too wide, and
 * these keep its narrower widths.
 */
function SymbolMouth({
  rig,
  expression,
  detail,
  ink,
}: {
  rig: Rig;
  expression: ExpressionId;
  detail: DetailLevel;
  ink: string;
}): ReactElement {
  const x = rig.head.x;
  const y = rig.mouthY;
  const line = {
    fill: "none",
    stroke: ink,
    strokeWidth: detail === "icon" ? 5 : 3.6,
    strokeLinecap: "round" as const,
  };
  switch (expression) {
    case "happy":
      return <path d={`M ${x - 8} ${y - 1} Q ${x} ${y + 8} ${x + 8} ${y - 1}`} {...line} />;
    case "excited":
      return <path d={`M ${x - 12} ${y - 3} Q ${x} ${y + 16} ${x + 12} ${y - 3}`} {...line} />;
    case "laughing":
      return <path d={`M ${x - 11} ${y - 2} Q ${x} ${y + 15} ${x + 11} ${y - 2} Z`} fill={ink} />;
    case "thinking":
      return <path d={`M ${x - 3} ${y + 1} Q ${x + 4} ${y + 6} ${x + 11} ${y - 1}`} {...line} />;
    case "focused":
      return <path d={`M ${x - 9} ${y} Q ${x} ${y + 5} ${x + 9} ${y - 2}`} {...line} />;
    case "surprised":
      return <ellipse cx={x} cy={y + 2} rx={5} ry={6.6} fill={ink} />;
  }
}

export function Face({
  rig,
  colors,
  expression,
  mode,
  detail,
  style = "symbol",
  gaze = "forward",
  blinkClass,
}: FaceProps): ReactElement {
  const r = rig.eyeR * featureScale(detail);
  const filigree = detail === "full";
  const centres = mode === "cyclops" ? cyclopsCentre(rig) : eyeCentres(rig);
  const canBlink = blinkClass !== "" && !BLINKLESS.has(expression);
  // The brow and the mouth are the only parts of this face drawn *on* the
  // body rather than cut out of it, so they are the only parts a near-black
  // silhouette can swallow. A colourway that knows it is dark says so; every
  // other one gets the shared ink it has always had.
  const ink = colors.ink ?? MASCOT_INK.line;
  const eyeProps: EyeProps = {
    centres,
    colors,
    expression,
    gaze,
    r,
    ink,
    filigree,
    highlights: detail !== "icon",
  };

  let eyes: ReactElement;
  if (mode === "screen") eyes = <ScreenEyes {...eyeProps} />;
  else if (mode === "voxel")
    eyes = (
      // No resting sink here, deliberately. The doll-eye the sink exists to
      // break is a *round* pupil concentric in a *round* white — a drawn
      // eyeball — and a dark square inside a white square does not read as one;
      // it reads as a lit pixel, which is what this alphabet wants. Sunk, the
      // white band above the pupil and the sliver below stop matching and the
      // block looks misaligned rather than relaxed. Rasterised both ways before
      // deciding.
      <VoxelEyes {...eyeProps} pupil={pupilOffset(expression, gaze, r)} />
    );
  else if (mode === "cyclops") eyes = <CyclopsEye {...eyeProps} />;
  else if (mode === "lid") eyes = <LidEyes {...eyeProps} />;
  else if (style === "legacy") eyes = <LegacyEyeballs {...eyeProps} />;
  else if (style === "warm") eyes = <WarmEyes {...eyeProps} />;
  else eyes = <SymbolEyes {...eyeProps} />;

  let mouth: ReactElement;
  if (mode === "screen") {
    // A lit outline on a dark panel. Already symbol grammar; left alone.
    mouth = (
      <LegacyMouth
        rig={rig}
        colors={colors}
        expression={expression}
        lit={colors.sclera}
        soft={false}
        detail={detail}
      />
    );
  } else if (mode === "voxel") {
    mouth = <VoxelMouth rig={rig} expression={expression} detail={detail} ink={ink} />;
  } else if (style === "legacy") {
    mouth = (
      <LegacyMouth
        rig={rig}
        colors={colors}
        expression={expression}
        lit={MASCOT_INK.line}
        soft
        detail={detail}
      />
    );
  } else if (style === "warm") {
    mouth = <WarmMouth rig={rig} colors={colors} expression={expression} detail={detail} />;
  } else if (mode === "cyclops") {
    mouth = <CyclopsMouth rig={rig} expression={expression} ink={ink} />;
  } else {
    mouth = <SymbolMouth rig={rig} expression={expression} detail={detail} ink={ink} />;
  }

  // Cheeks are a realism cue and the symbol face has none. The two comparison
  // styles keep theirs, because the point of keeping them is to show what they
  // did.
  const blushing =
    mode === "eyes" && filigree && style !== "symbol" && WARM_BLUSHING.has(expression);

  return (
    <g>
      {blushing && <WarmBlush rig={rig} colors={colors} />}
      {/* The blink, and the reason it is one wrapper rather than three
          implementations. A blink here is a *shape change* — the white
          squashes to a line about its own middle and springs back — so it is
          the same operation whatever the eye is made of, and the group that
          gets squashed is whichever eyes this mode already drew. There is no
          lid line and there will not be one: a stroke drawn across the eye is
          a second grammar for something the shape already says, and it would
          need a colour that works on every body in the fleet.

          `fill-box` is load-bearing. The squash has to happen about the
          rendered eyes' own middle, and that is not a coordinate anything here
          knows: a cyclops eye cut flat across the top has its visual centre
          below the eye row, and a `focused` lens is half the height of a
          `surprised` circle. Asking the box rather than the rig gets all of
          those right and none of them written down twice. */}
      {canBlink ? (
        <g className={blinkClass} style={{ transformBox: "fill-box", transformOrigin: "center" }}>
          {eyes}
        </g>
      ) : (
        eyes
      )}
      {/* No brow on a one-eyed head, at any detail level — see `CyclopsEye`.
          What it used to say is said by the cut across the white instead. */}
      {mode !== "screen" &&
        mode !== "cyclops" &&
        mode !== "lid" &&
        detail !== "icon" &&
        (mode === "voxel" ? (
          <VoxelBrows centres={centres} expression={expression} r={r} ink={ink} />
        ) : (
          <Brows centres={centres} expression={expression} r={r} ink={ink} />
        ))}
      {mouth}
    </g>
  );
}
