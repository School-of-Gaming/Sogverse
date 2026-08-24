/* eslint-disable i18next/no-literal-string -- throwaway developer-facing design-exploration surface; every string here is a caption on a page no user will ever see and that gets deleted with the exploration */
"use client";

import { useState, type ReactElement } from "react";

import type { ConceptId } from "../concept";
import { getConcept } from "../concepts";
import { FACE_STYLE_LABELS, type FaceStyle } from "../face";
import { Mascot } from "../mascot";
import { EXPRESSION_LABELS, type ExpressionId } from "../vocabulary";
import { ChipRow, Panel, Rubric, STUDY_SPECIES, Tile } from "./controls";

/** One line per round on what it was trying to do. */
const FACE_ROUND_NOTES: Record<FaceStyle, string> = {
  symbol: "Live. Four dials, zero detail on any eye or mouth.",
  warm: "Dropped the white eye and kept the highlight — removed the half that worked.",
  legacy: "Symbol grammar for three moods, realism cues stacked on the other three.",
};


const ALL_EXPRESSIONS: ExpressionId[] = [
  "happy",
  "excited",
  "laughing",
  "thinking",
  "surprised",
  "focused",
];

/** Newest first, so the eye lands on the live one before the two dead ones. */
const FACE_ROUNDS: FaceStyle[] = ["symbol", "warm", "legacy"];

export function FaceStudy(): ReactElement {
  const [concept, setConcept] = useState<ConceptId>("kaveri");
  const [form, setForm] = useState<string>("kid-a");
  const def = getConcept(concept);
  const activeForm = def.forms?.some((f) => f.id === form) === true ? form : undefined;

  return (
    <Panel
      title="Faces — three goes at the same problem"
      lede="A face here is a symbol system: every part is a flat primitive that means something only through its geometry. An eye is a white ellipse and a pupil, and the mood is the ellipse's size and where the pupil sits in it. A brow is one line doing its work by angle. A mouth is a small curve or a small solid glyph with no interior. Round one had that grammar and only obeyed it for half the set; round two removed the wrong half of what broke it. Round three deletes every realism cue instead."
    >
      <div className="space-y-2">
        <ChipRow label="Species" options={STUDY_SPECIES} value={concept} onChange={setConcept} />
        {def.forms !== undefined && (
          <ChipRow
            label="Build"
            options={def.forms.map((f) => ({ id: f.id, label: f.label }))}
            value={activeForm ?? def.forms[0].id}
            onChange={setForm}
          />
        )}
      </div>
      <div className="space-y-4">
        {FACE_ROUNDS.map((style) => (
          <div
            key={style}
            className={`rounded-lg border p-4 ${
              style === "symbol" ? "border-primary/50 bg-background" : "border-border bg-muted/30"
            }`}
          >
            <Rubric
              title={FACE_STYLE_LABELS[style]}
              note={FACE_ROUND_NOTES[style]}
            />
            <div className="flex flex-wrap gap-3">
              {ALL_EXPRESSIONS.map((expression) => (
                <Tile key={expression} caption={EXPRESSION_LABELS[expression]}>
                  <Mascot
                    concept={concept}
                    {...(activeForm === undefined ? {} : { form: activeForm })}
                    expression={expression}
                    crop="bust"
                    size={132}
                    faceStyle={style}
                  />
                </Tile>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-md border border-border bg-muted/40 p-4 text-sm leading-relaxed text-muted-foreground">
          <p className="mb-2 font-semibold text-foreground">The four dials, and nothing else</p>
          <p>
            <strong className="text-foreground">Happy</strong> — the Thinking eye with the pupil
            brought back from its glance and left sitting slightly low; small upward curve; no brow.
            This is the default face.{" "}
            <strong className="text-foreground">Excited</strong> — the same eye bigger and rounder
            with a bigger pupil, raised arc brows, a bigger open curve.{" "}
            <strong className="text-foreground">Laughing</strong> — eyes closed to two arcs, which
            is a shape change rather than added detail, and one solid mouth glyph.{" "}
            <strong className="text-foreground">Focused</strong> — the round white with a lid
            brought down across the top of it and the pupil tucked underneath.{" "}
            <strong className="text-foreground">Thinking</strong> and{" "}
            <strong className="text-foreground">Surprised</strong> are round one&rsquo;s, unchanged,
            because they were already doing exactly this.
          </p>
        </div>
        <div className="rounded-md border border-border bg-muted/40 p-4 text-sm leading-relaxed text-muted-foreground">
          <p className="mb-2 font-semibold text-foreground">What came off</p>
          <p>
            Eye highlights, eye sparkles, cheek blush, the tongue inside the open mouths, and every
            second colour on a mouth. Each one is a cue that says the thing you are looking at is a
            surface catching light, and there is no light in this drawing for it to catch. Konsu is
            untouched: a screen face is lit flat shapes with no interior, which is the grammar
            everything else was rebuilt to match. Two more things came off afterwards: Happy and
            Excited stared dead ahead, which on a pair of eyes is a doll&rsquo;s glass stare rather
            than a look, and Focused was a pointed lens, which is a caricature whatever it was drawn
            to mean. Compare the symbol row against round one for both.
          </p>
        </div>
      </div>
    </Panel>
  );
}

