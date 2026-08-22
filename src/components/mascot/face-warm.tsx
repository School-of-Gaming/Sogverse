/**
 * Round two's face, kept alive only for the three-way comparison strip on the
 * exploration page.
 *
 * It was an answer to a correct diagnosis — round one's warm expressions read
 * as uncanny — that removed the wrong thing. The reasoning was "no cartoon
 * face shows white in the eye", so the sclera went and every eye became a
 * solid dark shape with a highlight on it.
 *
 * That was backwards on both counts.
 *
 * **The sclera was not the problem.** Round one's Thinking, Surprised and
 * Focused faces worked, and they worked *because* of the white ellipse: the
 * eye is a flat symbol whose meaning is carried by the ellipse's size and the
 * pupil's position inside it. Take the white away and the pupil has nothing to
 * be positioned *in*, so an entire dial disappears from the vocabulary.
 *
 * **The highlight was the problem, and it survived.** A specular highlight is
 * a realism cue: it says the eye is a wet sphere catching a light source. On a
 * face drawn as flat symbols that cue has nothing to agree with, and a
 * rendered eyeball that still cannot express anything is precisely the
 * uncanny reading. Round two added sparkles on top of it.
 *
 * So this file is the record of a wrong turn, not a fallback. `face.tsx` went
 * back to the white ellipse and deleted every realism cue instead. Delete this
 * with the exploration page.
 */

import type { ReactElement } from "react";

import { showsFiligree, type DetailLevel } from "./detail";
import { MASCOT_INK, type Colorway } from "./palette";
import type { Rig } from "./rig";
import type { ExpressionId } from "./vocabulary";

type EyeCentre = { x: number; y: number; side: -1 | 1 };

type WarmEyeProps = {
  centres: EyeCentre[];
  colors: Colorway;
  expression: ExpressionId;
  r: number;
  filigree: boolean;
  highlights: boolean;
};

function Highlight({ x, y, r, scale = 1 }: { x: number; y: number; r: number; scale?: number }) {
  return <circle cx={x - r * 0.3} cy={y - r * 0.38} r={r * 0.3 * scale} fill={MASCOT_INK.paper} />;
}

function Sparkle({ x, y, r }: { x: number; y: number; r: number }) {
  return (
    <path
      d={`M ${x} ${y - r} Q ${x + r * 0.22} ${y - r * 0.22} ${x + r} ${y} Q ${x + r * 0.22} ${y + r * 0.22} ${x} ${y + r} Q ${x - r * 0.22} ${y + r * 0.22} ${x - r} ${y} Q ${x - r * 0.22} ${y - r * 0.22} ${x} ${y - r} Z`}
      fill={MASCOT_INK.paper}
      opacity={0.9}
    />
  );
}

export function WarmEyes({
  centres,
  colors,
  expression,
  r,
  filigree,
  highlights,
}: WarmEyeProps): ReactElement {
  const ink = colors.pupil;
  return (
    <>
      {centres.map(({ x, y, side }) => {
        switch (expression) {
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
          case "thinking":
            return (
              <g key={side}>
                <ellipse cx={x + r * 0.18} cy={y - r * 0.12} rx={r * 0.78} ry={r * 0.92} fill={ink} />
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

export function WarmMouth({
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
            <path
              d={`M ${x - 5.5} ${y + 6} Q ${x} ${y + 14} ${x + 5.5} ${y + 6} Z`}
              fill={colors.blush}
            />
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

/** Round two also put cheeks on the three warm moods. Another realism cue. */
export function WarmBlush({ rig, colors }: { rig: Rig; colors: Colorway }): ReactElement {
  return (
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
  );
}

/** Which moods round two gave cheeks to. */
export const WARM_BLUSHING: ReadonlySet<ExpressionId> = new Set<ExpressionId>([
  "happy",
  "excited",
  "laughing",
]);
