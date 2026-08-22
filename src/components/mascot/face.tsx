/**
 * The face — six expressions, two kinds of head, three levels of detail.
 *
 * An expression is only ever an eye swap plus a mouth swap. Nothing else in
 * the character moves, which is the whole reason a model can edit this file
 * safely: adding a seventh expression means adding two small shapes to two
 * switch statements, not redrawing a head.
 *
 * "Screen" mode is the second kind of head — a face that is a lit display
 * rather than a pair of eyeballs. It needs different eye shapes (a display
 * draws glyphs, not spheres) but the same expression vocabulary, so it lives
 * here as a mode rather than as a separate component that would drift.
 *
 * The face is also where level of detail does most of its work, because the
 * face is what a viewer reads first at any size. Small means bigger eyes, a
 * fatter mouth stroke, and none of the highlight-and-blush filigree that turns
 * to grit below about forty pixels.
 */

import type { ReactElement } from "react";

import { featureScale, showsFiligree, type DetailLevel } from "./detail";
import { MASCOT_INK, type Colorway } from "./palette";
import type { Rig } from "./rig";
import type { ExpressionId } from "./vocabulary";

/** Whether the head has eyeballs on it or a display in it. */
export type FaceMode = "eyes" | "screen";

type FaceProps = {
  rig: Rig;
  colors: Colorway;
  expression: ExpressionId;
  mode: FaceMode;
  detail: DetailLevel;
  /** Empty string when the mascot is static. */
  blinkClass: string;
};

type EyeProps = {
  rig: Rig;
  colors: Colorway;
  expression: ExpressionId;
  r: number;
  filigree: boolean;
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
function eyeCentres(rig: Rig): { x: number; y: number; side: -1 | 1 }[] {
  return [
    { x: rig.head.x - rig.eyeDx, y: rig.eyeY, side: -1 },
    { x: rig.head.x + rig.eyeDx, y: rig.eyeY, side: 1 },
  ];
}

function Eyeballs({ rig, colors, expression, r, filigree }: EyeProps): ReactElement {
  return (
    <>
      {eyeCentres(rig).map(({ x, y, side }) => {
        switch (expression) {
          case "happy":
            return (
              <g key={side}>
                <circle cx={x} cy={y} r={r} fill={colors.sclera} />
                <circle cx={x} cy={y + r * 0.1} r={r * 0.6} fill={colors.pupil} />
                {filigree && (
                  <circle cx={x - r * 0.26} cy={y - r * 0.3} r={r * 0.22} fill={MASCOT_INK.paper} />
                )}
              </g>
            );
          case "excited":
            return (
              <g key={side}>
                <circle cx={x} cy={y} r={r * 1.08} fill={colors.sclera} />
                <circle cx={x} cy={y + r * 0.06} r={r * 0.68} fill={colors.pupil} />
                {filigree && (
                  <>
                    <circle cx={x - r * 0.3} cy={y - r * 0.34} r={r * 0.26} fill={MASCOT_INK.paper} />
                    <circle cx={x + r * 0.3} cy={y + r * 0.36} r={r * 0.14} fill={MASCOT_INK.paper} />
                  </>
                )}
              </g>
            );
          case "thinking":
            return (
              <g key={side}>
                <circle cx={x} cy={y} r={r} fill={colors.sclera} />
                <circle cx={x + r * 0.34} cy={y - r * 0.32} r={r * 0.56} fill={colors.pupil} />
              </g>
            );
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
          case "surprised":
            return (
              <g key={side}>
                <circle cx={x} cy={y} r={r * 1.16} fill={colors.sclera} />
                <circle cx={x} cy={y} r={r * 0.4} fill={colors.pupil} />
              </g>
            );
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

function ScreenEyes({ rig, colors, expression, r }: EyeProps): ReactElement {
  const lit = colors.sclera;
  return (
    <>
      {eyeCentres(rig).map(({ x, y, side }) => {
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

function Brows({ rig, expression, r }: { rig: Rig; expression: ExpressionId; r: number }): ReactElement | null {
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
          {eyeCentres(rig).map(({ x, y, side }) => (
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
          {eyeCentres(rig).map(({ x, y, side }) => (
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
          {eyeCentres(rig).map(({ x, y, side }) => (
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
          {eyeCentres(rig).map(({ x, y, side }) => (
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

function Mouth({
  rig,
  colors,
  expression,
  mode,
  detail,
}: {
  rig: Rig;
  colors: Colorway;
  expression: ExpressionId;
  mode: FaceMode;
  detail: DetailLevel;
}): ReactElement {
  const x = rig.head.x;
  const y = rig.mouthY;
  const lit = mode === "screen" ? colors.sclera : MASCOT_INK.line;
  const line = {
    fill: "none",
    stroke: lit,
    strokeWidth: detail === "icon" ? 5 : 3.6,
    strokeLinecap: "round" as const,
  };
  switch (expression) {
    case "happy":
      return <path d={`M ${x - 13} ${y - 2} Q ${x} ${y + 10} ${x + 13} ${y - 2}`} {...line} />;
    case "thinking":
      return <path d={`M ${x - 3} ${y + 1} Q ${x + 4} ${y + 6} ${x + 11} ${y - 1}`} {...line} />;
    case "focused":
      return <path d={`M ${x - 11} ${y} Q ${x} ${y + 6} ${x + 11} ${y - 3}`} {...line} />;
    case "surprised":
      return mode === "screen" ? (
        <circle cx={x} cy={y + 2} r={5.5} fill="none" stroke={lit} strokeWidth={line.strokeWidth} />
      ) : (
        <ellipse cx={x} cy={y + 2} rx={6.2} ry={7.8} fill={lit} />
      );
    case "excited":
      return (
        <>
          <path d={`M ${x - 14} ${y - 3} Q ${x} ${y + 17} ${x + 14} ${y - 3} Z`} fill={lit} />
          {mode === "eyes" && showsFiligree(detail) && (
            <path d={`M ${x - 7} ${y + 5} Q ${x} ${y + 15} ${x + 7} ${y + 5} Z`} fill={colors.blush} />
          )}
        </>
      );
    case "laughing":
      return (
        <>
          <path d={`M ${x - 16} ${y - 5} Q ${x} ${y + 20} ${x + 16} ${y - 5} Z`} fill={lit} />
          {mode === "eyes" && showsFiligree(detail) && (
            <path d={`M ${x - 8} ${y + 6} Q ${x} ${y + 17} ${x + 8} ${y + 6} Z`} fill={colors.blush} />
          )}
        </>
      );
  }
}

export function Face({
  rig,
  colors,
  expression,
  mode,
  detail,
  blinkClass,
}: FaceProps): ReactElement {
  const r = rig.eyeR * featureScale(detail);
  const filigree = showsFiligree(detail);
  const canBlink = blinkClass !== "" && !BLINKLESS.has(expression);
  const eyeProps: EyeProps = { rig, colors, expression, r, filigree };
  const eyes = mode === "screen" ? <ScreenEyes {...eyeProps} /> : <Eyeballs {...eyeProps} />;
  return (
    <g>
      {mode === "eyes" && filigree && BLUSHING.has(expression) && (
        <>
          <ellipse
            cx={rig.head.x - rig.eyeDx - rig.eyeR * 0.7}
            cy={rig.eyeY + rig.eyeR * 1.7}
            rx={6.4}
            ry={3.8}
            fill={colors.blush}
            opacity={0.6}
          />
          <ellipse
            cx={rig.head.x + rig.eyeDx + rig.eyeR * 0.7}
            cy={rig.eyeY + rig.eyeR * 1.7}
            rx={6.4}
            ry={3.8}
            fill={colors.blush}
            opacity={0.6}
          />
        </>
      )}
      {canBlink ? <g className={blinkClass}>{eyes}</g> : eyes}
      {mode === "eyes" && detail !== "icon" && <Brows rig={rig} expression={expression} r={r} />}
      <Mouth rig={rig} colors={colors} expression={expression} mode={mode} detail={detail} />
    </g>
  );
}
