/**
 * Round one's face, kept alive for exactly one reason: the side-by-side strip
 * on the exploration page that shows why it was replaced.
 *
 * The verdict on it was "creepy, soulless", and the diagnosis is visible here
 * in two lines of geometry. Every eye is a **large pale sclera with a small
 * pupil floating in it**, which is the anatomy of a stare — a real friendly
 * face shows almost no white, and a cartoon one shows none at all. Every warm
 * expression then widens a **rigid filled grin** across a third of the head,
 * so the mouth is doing all the emotional work while the eyes hold still and
 * watch you. Wide eyes plus a fixed smile is the uncanny recipe, and it landed
 * hardest on `happy` and `excited` because those are the two the whole product
 * would have used most.
 *
 * Konsu was the exception and the clue: its screen face has no sclera at all,
 * just lit shapes on a dark panel, and nobody found it creepy. The replacement
 * in `face.tsx` generalises that.
 *
 * Delete this file with the exploration page.
 */

import type { ReactElement } from "react";

import { showsFiligree, type DetailLevel } from "./detail";
import { MASCOT_INK, type Colorway } from "./palette";
import type { Rig } from "./rig";
import type { ExpressionId } from "./vocabulary";

type LegacyEyeProps = {
  centres: { x: number; y: number; side: -1 | 1 }[];
  colors: Colorway;
  expression: ExpressionId;
  r: number;
  filigree: boolean;
};

export function LegacyEyeballs({
  centres,
  colors,
  expression,
  r,
  filigree,
}: LegacyEyeProps): ReactElement {
  return (
    <>
      {centres.map(({ x, y, side }) => {
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

/**
 * The old mouth. Still the live one for a screen face, where a lit shape on a
 * dark panel is the whole idiom and none of the criticism applied.
 */
export function LegacyMouth({
  rig,
  colors,
  expression,
  lit,
  soft,
  detail,
}: {
  rig: Rig;
  colors: Colorway;
  expression: ExpressionId;
  /** Line colour — the ink on a face, the glow on a screen. */
  lit: string;
  /** Whether the inner-mouth fill is drawn. A screen has no tongue. */
  soft: boolean;
  detail: DetailLevel;
}): ReactElement {
  const x = rig.head.x;
  const y = rig.mouthY;
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
      return soft ? (
        <ellipse cx={x} cy={y + 2} rx={6.2} ry={7.8} fill={lit} />
      ) : (
        <circle cx={x} cy={y + 2} r={5.5} fill="none" stroke={lit} strokeWidth={line.strokeWidth} />
      );
    case "excited":
      return (
        <>
          <path d={`M ${x - 14} ${y - 3} Q ${x} ${y + 17} ${x + 14} ${y - 3} Z`} fill={lit} />
          {soft && showsFiligree(detail) && (
            <path d={`M ${x - 7} ${y + 5} Q ${x} ${y + 15} ${x + 7} ${y + 5} Z`} fill={colors.blush} />
          )}
        </>
      );
    case "laughing":
      return (
        <>
          <path d={`M ${x - 16} ${y - 5} Q ${x} ${y + 20} ${x + 16} ${y - 5} Z`} fill={lit} />
          {soft && showsFiligree(detail) && (
            <path d={`M ${x - 8} ${y + 6} Q ${x} ${y + 17} ${x + 8} ${y + 6} Z`} fill={colors.blush} />
          )}
        </>
      );
  }
}
