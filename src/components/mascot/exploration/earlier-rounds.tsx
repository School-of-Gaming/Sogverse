/* eslint-disable i18next/no-literal-string -- throwaway developer-facing design-exploration surface; every string here is a caption on a page no user will ever see and that gets deleted with the exploration */
"use client";

/**
 * The round-two studies that are no longer part of the main argument.
 *
 * Neither is wrong and neither is finished business: the arm rebuild is the
 * limb system every concept on the page now inherits, and the fold branches
 * are still holding an open question (Nappi against Kaari). They sit here
 * rather than in the flow because a reader forming an opinion about the fleet
 * does not have to pass through either of them to do it.
 */

import { useState, type ReactElement } from "react";

import type { ConceptId } from "../concept";
import { TAITTO_FAMILY } from "../concepts";
import { Mascot } from "../mascot";
import { POSE_LABELS, type PoseId } from "../vocabulary";
import { ChipRow, Panel, Rubric, STUDY_SPECIES, Tile } from "./controls";


const ARM_POSES: PoseId[] = ["wave", "point-right", "hold-up", "walking"];

export function ArmStudy(): ReactElement {
  const [concept, setConcept] = useState<ConceptId>("kaveri");
  return (
    <Panel
      title="Arms — a joint instead of a bow"
      lede="Round one drew a limb as one curved stroke, bowed sideways by a number the pose table carried. That is not an elbow: it is a fixed push, so it bulges the wrong way the moment the hand leaves the character's side, which is exactly the three poses that were called out. Now a limb is two tapered segments meeting at a joint, and the joint is derived from the geometry — outboard of the centre line — so the pose table carries no elbow data at all."
    >
      <ChipRow label="Species" options={STUDY_SPECIES} value={concept} onChange={setConcept} />
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="rounded-lg border border-primary/40 bg-background p-4">
          <Rubric title="New — jointed / tapered" note="Which of the two is a property of the species." />
          <div className="flex flex-wrap gap-3">
            {ARM_POSES.map((pose) => (
              <Tile key={pose} caption={POSE_LABELS[pose]}>
                <Mascot concept={concept} pose={pose} size={150} />
              </Tile>
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-border bg-muted/30 p-4">
          <Rubric title="Old — one bowed stroke" note="The same four poses." />
          <div className="flex flex-wrap gap-3">
            {ARM_POSES.map((pose) => (
              <Tile key={pose} caption={POSE_LABELS[pose]}>
                <Mascot concept={concept} pose={pose} size={150} limbStyle="legacy" />
              </Tile>
            ))}
          </div>
        </div>
      </div>
      <p className="max-w-4xl text-sm leading-relaxed text-muted-foreground">
        Two styles, chosen per species rather than globally. <strong className="text-foreground">Jointed</strong>{" "}
        solves the elbow properly and suits anything constructed — a person, a robot, a folded
        plane. <strong className="text-foreground">Tapered</strong> puts a soft bend at the
        midpoint and no anatomy at all, which is what a round animal or a spark wants; giving a
        bear cub a visible elbow turns it into a small bodybuilder. Both taper from shoulder to
        wrist and cap with a disc, so a limb still reads as a limb at sixteen pixels.
      </p>
    </Panel>
  );
}


const BRANCH_POSES: PoseId[] = ["controller", "point-right", "jumping"];

export function TaittoBranches(): ReactElement {
  return (
    <Panel
      title="Taitto, and three ways to branch off it"
      lede="The fold was the most interesting direction and leaned a tad too hard on geometry. Rather than soften the original and lose what made it sharp, three branches each concede something different — and all four share one palette on purpose, so the comparison is about form and nothing else."
    >
      <div className="grid gap-5 xl:grid-cols-4">
        {TAITTO_FAMILY.map((def) => (
          <div
            key={def.id}
            className="flex flex-col gap-3 rounded-xl border border-border bg-background p-4"
          >
            <div className="flex items-end justify-center">
              <Mascot concept={def.id} pose="wave" expression="happy" size={210} />
            </div>
            <div>
              <h4 className="text-lg font-bold text-foreground">{def.species}</h4>
              <p className="text-xs font-medium text-primary">{def.kind}</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {BRANCH_POSES.map((pose) => (
                <Mascot key={pose} concept={def.id} pose={pose} size={92} />
              ))}
              <Mascot concept={def.id} pose="idle" size={92} silhouette animated={false} />
            </div>
            <p className="text-xs leading-relaxed text-foreground/80">{def.pitch}</p>
            <p className="text-xs leading-relaxed text-muted-foreground">{def.caveat}</p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

