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
 * 1. **Eye size and shape** — how big the white ellipse is, or whether it has
 *    stopped being an ellipse at all (a shut eye is an arc).
 * 2. **Pupil position** — centred, or off to one side.
 * 3. **Brow angle and presence** — one short line whose slope does the work,
 *    drawn only when the mood needs it.
 * 4. **Mouth shape** — a small curve, or a small solid glyph with no interior.
 *
 * The same four dials produce all six moods, which is what makes them read as
 * one character changing its mind rather than as six separate drawings.
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
import { WARM_BLUSHING, WarmBlush, WarmEyes, WarmMouth } from "./face-warm";
import { MASCOT_INK, type Colorway } from "./palette";
import type { Rig } from "./rig";
import type { ExpressionId } from "./vocabulary";

/** Whether the head has eyes on it or a display in it. */
export type FaceMode = "eyes" | "screen";

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
  /** Empty string when the mascot is static. */
  blinkClass: string;
};

type EyeCentre = { x: number; y: number; side: -1 | 1 };

type EyeProps = {
  centres: EyeCentre[];
  colors: Colorway;
  expression: ExpressionId;
  r: number;
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
 * Dials one and two: the white ellipse, and where the pupil sits in it.
 *
 * Every case here is two flat shapes and nothing else. If a future expression
 * seems to need a third shape to say what it means, the right move is a
 * different ellipse — not a third shape.
 */
function SymbolEyes({ centres, colors, expression, r }: EyeProps): ReactElement {
  return (
    <>
      {centres.map(({ x, y, side }) => {
        switch (expression) {
          // The default face. The Thinking eye with the pupil brought back to
          // centre: looking straight at you, and nothing added to say so.
          case "happy":
            return (
              <g key={side}>
                <circle cx={x} cy={y} r={r} fill={colors.sclera} />
                <circle cx={x} cy={y} r={r * 0.56} fill={colors.pupil} />
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
                <circle cx={x} cy={y} r={r * 0.7} fill={colors.pupil} />
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
                stroke={colors.pupil}
                strokeWidth={r * 0.46}
                strokeLinecap="round"
              />
            );
          // Dial two, on its own: same ellipse, pupil up and to the side.
          case "thinking":
            return (
              <g key={side}>
                <circle cx={x} cy={y} r={r} fill={colors.sclera} />
                <circle cx={x + r * 0.34} cy={y - r * 0.32} r={r * 0.56} fill={colors.pupil} />
              </g>
            );
          case "surprised":
            return (
              <g key={side}>
                <circle cx={x} cy={y} r={r * 1.16} fill={colors.sclera} />
                <circle cx={x} cy={y} r={r * 0.4} fill={colors.pupil} />
              </g>
            );
          // Narrowed: the ellipse squeezed into a lens. Still two shapes.
          case "focused":
            return (
              <g key={side}>
                <path
                  d={`M ${x - r} ${y + r * 0.05} Q ${x} ${y - r * 1.05} ${x + r} ${y + r * 0.05} Q ${x} ${y + r * 0.62} ${x - r} ${y + r * 0.05} Z`}
                  fill={colors.sclera}
                />
                <circle cx={x} cy={y - r * 0.05} r={r * 0.46} fill={colors.pupil} />
              </g>
            );
        }
      })}
    </>
  );
}

function ScreenEyes({ centres, colors, expression, r }: EyeProps): ReactElement {
  const lit = colors.sclera;
  return (
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
}: {
  centres: EyeCentre[];
  expression: ExpressionId;
  r: number;
}): ReactElement | null {
  const stroke = {
    stroke: MASCOT_INK.line,
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
 * Dial four. Four of the six are one open curve; the other two are one solid
 * glyph. Nothing here has an inside — no tongue, no teeth, no lip line, no
 * second colour. Round two was right that the mouths had grown too wide, and
 * these keep its narrower widths.
 */
function SymbolMouth({
  rig,
  expression,
  detail,
}: {
  rig: Rig;
  expression: ExpressionId;
  detail: DetailLevel;
}): ReactElement {
  const x = rig.head.x;
  const y = rig.mouthY;
  const ink = MASCOT_INK.line;
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
  blinkClass,
}: FaceProps): ReactElement {
  const r = rig.eyeR * featureScale(detail);
  const filigree = detail === "full";
  const centres = eyeCentres(rig);
  const canBlink = blinkClass !== "" && !BLINKLESS.has(expression);
  const eyeProps: EyeProps = {
    centres,
    colors,
    expression,
    r,
    filigree,
    highlights: detail !== "icon",
  };

  let eyes: ReactElement;
  if (mode === "screen") eyes = <ScreenEyes {...eyeProps} />;
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
  } else {
    mouth = <SymbolMouth rig={rig} expression={expression} detail={detail} />;
  }

  // Cheeks are a realism cue and the symbol face has none. The two comparison
  // styles keep theirs, because the point of keeping them is to show what they
  // did.
  const blushing =
    mode === "eyes" && filigree && style !== "symbol" && WARM_BLUSHING.has(expression);

  return (
    <g>
      {blushing && <WarmBlush rig={rig} colors={colors} />}
      {canBlink ? (
        <g className={blinkClass} style={{ transformBox: "fill-box", transformOrigin: "center" }}>
          {eyes}
        </g>
      ) : (
        eyes
      )}
      {mode === "eyes" && detail !== "icon" && (
        <Brows centres={centres} expression={expression} r={r} />
      )}
      {mouth}
    </g>
  );
}
