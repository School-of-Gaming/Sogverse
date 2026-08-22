/**
 * The face — six expressions, two kinds of head, three levels of detail.
 *
 * ## What round two changed, and why
 *
 * Round one's faces were called creepy and soulless, and the diagnosis was
 * narrow: **the eyes and the mouth**, on every species except Konsu, and
 * worst on the two expressions the product would use most. Two mechanisms did
 * all the damage.
 *
 * **A big pale sclera with a small pupil in it is a stare.** It is how a face
 * looks when it is frightened, or when it is not looking at anything. Cartoon
 * faces that read as warm show almost no white — the eye is one dark shape
 * with a highlight on it, and everything the eye communicates comes from the
 * *shape* of that shape.
 *
 * **A wide rigid grin does not read as happy on a still face.** It reads as a
 * held expression. When the mouth is the only thing carrying the emotion and
 * the eyes are two unchanging discs above it, the two halves disagree, and
 * that disagreement is precisely the uncanny sensation.
 *
 * Konsu was the counter-example that proved both: its screen face is lit
 * shapes on a dark panel with no sclera at all, its "mouth" is a small curve,
 * and nobody found it unsettling. So the rules here generalise Konsu:
 *
 * 1. **No sclera.** Every eye is a solid dark shape with a highlight.
 * 2. **The eyes carry the mood.** Squint for happy, wide and sparkling for
 *    excited, shut arcs for laughing, narrowed for focused.
 * 3. **Mouths are small.** The widest one here is two thirds of the width of
 *    round one's, and the everyday `happy` mouth is a short curve, not a grin.
 * 4. **Highlights survive down to `simple`.** They are not filigree — a solid
 *    dark eye without a highlight is a hole, and the highlight is what makes
 *    it a living eye rather than a dot.
 *
 * Round one's face is still in `face-legacy.tsx` so the exploration page can
 * show the two side by side; both go when the exploration does.
 *
 * ## The rest of the contract, unchanged
 *
 * An expression is only ever an eye swap plus a mouth swap. Nothing else in
 * the character moves, which is the whole reason a model can edit this file
 * safely: adding a seventh expression means adding two small shapes to two
 * switch statements, not redrawing a head.
 *
 * "Screen" mode is the second kind of head — a face that is a lit display
 * rather than a pair of eyes. It needs different eye shapes (a display draws
 * glyphs, not spheres) but the same expression vocabulary, so it lives here as
 * a mode rather than as a separate component that would drift. It also keeps
 * the legacy mouth, because none of the criticism above applied to it.
 */

import type { ReactElement } from "react";

import { featureScale, showsFiligree, type DetailLevel } from "./detail";
import { LegacyEyeballs, LegacyMouth } from "./face-legacy";
import { MASCOT_INK, type Colorway } from "./palette";
import type { Rig } from "./rig";
import type { ExpressionId } from "./vocabulary";

/** Whether the head has eyes on it or a display in it. */
export type FaceMode = "eyes" | "screen";

/**
 * Which face design. `warm` is the one; `legacy` exists only so the two can be
 * compared on the exploration page and disappears with it.
 */
export const FACE_STYLES = ["warm", "legacy"] as const;
export type FaceStyle = (typeof FACE_STYLES)[number];

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
  /** Highlights are not filigree — see the note at the top. */
  highlights: boolean;
};

/** Expressions whose eyes are already shut have nothing to blink with. */
const BLINKLESS: ReadonlySet<ExpressionId> = new Set<ExpressionId>(["laughing"]);

/** Expressions warm enough to earn cheeks. A surprised blush reads as a rash. */
const BLUSHING: ReadonlySet<ExpressionId> = new Set<ExpressionId>([
  "happy",
  "excited",
  "laughing",
]);

/** The two eye centres, viewer-left first. */
function eyeCentres(rig: Rig): EyeCentre[] {
  return [
    { x: rig.head.x - rig.eyeDx, y: rig.eyeY, side: -1 },
    { x: rig.head.x + rig.eyeDx, y: rig.eyeY, side: 1 },
  ];
}

/** The one highlight every open eye gets, from a light up and to the left. */
function Highlight({ x, y, r, scale = 1 }: { x: number; y: number; r: number; scale?: number }) {
  return (
    <circle cx={x - r * 0.3} cy={y - r * 0.38} r={r * 0.3 * scale} fill={MASCOT_INK.paper} />
  );
}

/** A four-point star, for the eyes that are meant to be sparkling. */
function Sparkle({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <path
      d={`M ${x} ${y - r} Q ${x + r * 0.22} ${y - r * 0.22} ${x + r} ${y} Q ${x + r * 0.22} ${y + r * 0.22} ${x} ${y + r} Q ${x - r * 0.22} ${y + r * 0.22} ${x - r} ${y} Q ${x - r * 0.22} ${y - r * 0.22} ${x} ${y - r} Z`}
      fill={MASCOT_INK.paper}
      opacity={0.9}
    />
  );
}

function WarmEyes({ centres, colors, expression, r, filigree, highlights }: EyeProps): ReactElement {
  const ink = colors.pupil;
  return (
    <>
      {centres.map(({ x, y, side }) => {
        switch (expression) {
          // A soft squint: full curve on top, the lower lid pushed up. This is
          // the shape a face makes when it means it, and it is doing the work
          // the wide grin used to do badly.
          case "happy":
            return (
              <g key={side}>
                <path
                  d={`M ${x - r * 0.94} ${y + r * 0.26} Q ${x} ${y - r * 1.34} ${x + r * 0.94} ${y + r * 0.26} Q ${x} ${y + r * 0.66} ${x - r * 0.94} ${y + r * 0.26} Z`}
                  fill={ink}
                />
                {highlights && <Highlight x={x} y={y - r * 0.12} r={r} />}
              </g>
            );
          // Wide, round and lit up. Dark, so it is delight rather than alarm.
          case "excited":
            return (
              <g key={side}>
                <circle cx={x} cy={y} r={r * 1.02} fill={ink} />
                {highlights && (
                  <>
                    <Highlight x={x} y={y} r={r} scale={1.15} />
                    <circle cx={x + r * 0.32} cy={y + r * 0.36} r={r * 0.16} fill={MASCOT_INK.paper} />
                  </>
                )}
                {filigree && <Sparkle x={x + side * r * 1.7} y={y - r * 1.1} r={r * 0.5} />}
              </g>
            );
          // Squeezed shut and curving up.
          case "laughing":
            return (
              <g key={side}>
                <path
                  d={`M ${x - r} ${y + r * 0.42} Q ${x} ${y - r * 1.05} ${x + r} ${y + r * 0.42}`}
                  fill="none"
                  stroke={ink}
                  strokeWidth={r * 0.5}
                  strokeLinecap="round"
                />
                {filigree && (
                  <path
                    d={`M ${x + side * r * 1.5} ${y - r * 0.5} l ${side * r * 0.5} ${-r * 0.32}`}
                    fill="none"
                    stroke={ink}
                    strokeWidth={r * 0.24}
                    strokeLinecap="round"
                    opacity={0.65}
                  />
                )}
              </g>
            );
          // Looking up and away, and a touch smaller — the eye of someone whose
          // attention is somewhere else in the room.
          case "thinking":
            return (
              <g key={side}>
                <ellipse
                  cx={x + r * 0.18}
                  cy={y - r * 0.12}
                  rx={r * 0.78}
                  ry={r * 0.92}
                  fill={ink}
                />
                {highlights && <Highlight x={x + r * 0.18} y={y - r * 0.12} r={r} scale={0.9} />}
              </g>
            );
          case "surprised":
            return (
              <g key={side}>
                <circle cx={x} cy={y} r={r * 1.14} fill={ink} />
                {highlights && <Highlight x={x} y={y} r={r} scale={1.05} />}
              </g>
            );
          // Narrowed to a lens. Lids from both sides, not a lowered brow — a
          // brow does that job separately just above.
          case "focused":
            return (
              <g key={side}>
                <path
                  d={`M ${x - r} ${y} Q ${x} ${y - r * 0.98} ${x + r} ${y} Q ${x} ${y + r * 0.56} ${x - r} ${y} Z`}
                  fill={ink}
                />
                {highlights && (
                  <circle cx={x - r * 0.3} cy={y - r * 0.18} r={r * 0.2} fill={MASCOT_INK.paper} />
                )}
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
    strokeWidth: Math.max(2.4, r * 0.34),
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
              d={`M ${x - r * 0.9} ${y - r * 1.7} Q ${x} ${y - r * 2.35} ${x + r * 0.9} ${y - r * 1.7}`}
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
              d={`M ${x - r} ${y - r * 2} Q ${x} ${y - r * 2.65} ${x + r} ${y - r * 2}`}
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
              d={`M ${x + side * r} ${y - r * 1.75} L ${x - side * r} ${y - r * 1.05}`}
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
              d={`M ${x - r} ${y - r * (side === 1 ? 2.05 : 1.5)} L ${x + r} ${y - r * (side === 1 ? 1.7 : 1.6)}`}
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

/** The warm mouth set: short curves, and nothing wider than a third of a head. */
function WarmMouth({
  rig,
  colors,
  expression,
  detail,
}: {
  rig: Rig;
  colors: Colorway;
  expression: ExpressionId;
  detail: DetailLevel;
}): ReactElement {
  const x = rig.head.x;
  const y = rig.mouthY;
  const ink = MASCOT_INK.line;
  const line = {
    fill: "none",
    stroke: ink,
    strokeWidth: detail === "icon" ? 4.4 : 3.4,
    strokeLinecap: "round" as const,
  };
  switch (expression) {
    case "happy":
      return <path d={`M ${x - 8} ${y - 1} Q ${x} ${y + 8} ${x + 8} ${y - 1}`} {...line} />;
    case "excited":
      return <path d={`M ${x - 8.5} ${y - 2} Q ${x} ${y + 12} ${x + 8.5} ${y - 2} Z`} fill={ink} />;
    case "laughing":
      return (
        <>
          <path d={`M ${x - 11} ${y - 3} Q ${x} ${y + 16} ${x + 11} ${y - 3} Z`} fill={ink} />
          {showsFiligree(detail) && (
            <path d={`M ${x - 5.5} ${y + 6} Q ${x} ${y + 14} ${x + 5.5} ${y + 6} Z`} fill={colors.blush} />
          )}
        </>
      );
    case "thinking":
      return <path d={`M ${x - 3} ${y + 1} Q ${x + 4} ${y + 6} ${x + 10} ${y - 1}`} {...line} />;
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
  style = "warm",
  blinkClass,
}: FaceProps): ReactElement {
  const r = rig.eyeR * featureScale(detail);
  const filigree = showsFiligree(detail);
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
  else eyes = <WarmEyes {...eyeProps} />;

  const mouth =
    mode === "screen" ? (
      <LegacyMouth
        rig={rig}
        colors={colors}
        expression={expression}
        lit={colors.sclera}
        soft={false}
        detail={detail}
      />
    ) : style === "legacy" ? (
      <LegacyMouth
        rig={rig}
        colors={colors}
        expression={expression}
        lit={MASCOT_INK.line}
        soft
        detail={detail}
      />
    ) : (
      <WarmMouth rig={rig} colors={colors} expression={expression} detail={detail} />
    );

  return (
    <g>
      {mode === "eyes" && filigree && BLUSHING.has(expression) && (
        <>
          <ellipse
            cx={rig.head.x - rig.eyeDx - rig.eyeR * 0.85}
            cy={rig.eyeY + rig.eyeR * 1.8}
            rx={6.4}
            ry={3.8}
            fill={colors.blush}
            opacity={0.6}
          />
          <ellipse
            cx={rig.head.x + rig.eyeDx + rig.eyeR * 0.85}
            cy={rig.eyeY + rig.eyeR * 1.8}
            rx={6.4}
            ry={3.8}
            fill={colors.blush}
            opacity={0.6}
          />
        </>
      )}
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
