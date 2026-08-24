/* eslint-disable i18next/no-literal-string -- throwaway developer-facing design-exploration surface; every string here is a caption on a page no user will ever see and that gets deleted with the exploration */
"use client";

import { useState, type ReactElement } from "react";

import type { ConceptId } from "../concept";
import { Mascot } from "../mascot";
import { EXPRESSION_LABELS, POSE_LABELS, type ExpressionId, type PoseId } from "../vocabulary";
import { ChipRow, Panel, STUDY_SPECIES, Tile } from "./controls";


const MOTION_POSES: PoseId[] = [
  "idle",
  "wave",
  "walking",
  "jumping",
  "controller",
  "keyboard-mouse",
  "seated",
  "laptop",
  "reading",
  "point-left",
  "point-right",
  "hold-up",
];

export function MotionRow(): ReactElement {
  const [concept, setConcept] = useState<ConceptId>("kaveri");
  const [expression, setExpression] = useState<ExpressionId>("happy");
  return (
    <Panel
      title="Every pose owns its animation"
      lede="Round one shared one near-invisible idle loop across every pose — a two-and-a-half pixel rise and a degree and a half of tilt — and it read as a glitch rather than as a decision. Motion too small to be intentional is worse than none, because the viewer notices something moved and cannot tell what. So the amplitudes are legible now and the motion belongs to the pose: walking walks, a jump has anticipation and a landing, thumbs tap on a controller, fingers move on a keyboard, a page gets turned, a laptop screen pulses."
    >
      <div className="space-y-2">
        <ChipRow label="Species" options={STUDY_SPECIES} value={concept} onChange={setConcept} />
        <ChipRow
          label="Mood"
          options={(["happy", "excited", "laughing", "focused", "thinking", "surprised"] as ExpressionId[]).map(
            (id) => ({ id, label: EXPRESSION_LABELS[id] }),
          )}
          value={expression}
          onChange={setExpression}
        />
      </div>
      <div className="flex flex-wrap gap-3 rounded-xl border border-border bg-background p-4">
        {MOTION_POSES.map((pose) => (
          <Tile key={pose} caption={POSE_LABELS[pose]}>
            <Mascot
              concept={concept}
              pose={pose}
              expression={expression}
              {...(pose === "seated" ? { outfit: { scene: "desk" } } : {})}
              size={158}
            />
          </Tile>
        ))}
      </div>
      <p className="max-w-4xl text-sm leading-relaxed text-muted-foreground">
        The mood reaches outside the head for one thing only: the pace of the body loop. Excited
        bounces, laughing shakes, focused stops moving altogether. Everything else an expression
        does is still an eye swap and a mouth swap. Turning motion off leaves the identical still
        image, standing on the pose&rsquo;s own key frame — which is what an email client and a
        rasteriser see, and why the jump&rsquo;s key frame is the apex rather than the ground.
      </p>
    </Panel>
  );
}

