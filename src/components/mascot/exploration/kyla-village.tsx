/* eslint-disable i18next/no-literal-string -- throwaway developer-facing design-exploration surface; every string here is a caption on a page no user will ever see and that gets deleted with the exploration */
"use client";

import type { CSSProperties, ReactElement } from "react";

import { Card, CardContent } from "@/components/ui/card";

import { rigOf } from "../concept";
import { getConcept } from "../concepts";
import { KYLA_FORMS } from "../concepts/kyla";
import { Mascot } from "../mascot";
import { groundY } from "../rig";
import { Rubric } from "./controls";

/**
 * The village study — the three tests this concept exists to pass.
 *
 * **The ensemble.** Every other concept on this page is judged one character
 * at a time, and this one cannot be: the whole argument for it is that a
 * School of Gaming picture can be a *place with people busy in it* rather than
 * a mascot standing on a background. The reference pages are read that way —
 * one large figure, a mid-sized one, a small one, all doing different jobs in
 * one frame — so the first section builds exactly that, out of the real
 * components, with one villager carrying the `village` scene and the other two
 * standing in it.
 *
 * **The row.** Six forms side by side at 200px, which is the size a hero or a
 * card renders, and the size at which "is this six animals or one animal in
 * six hats" gets answered.
 *
 * **The busts.** The same six at 40 pixels, which is the size a participant
 * list renders and the only size the simplicity ruling actually tests at.
 */

/** The one scene the composition is built inside. Everything else is measured off it. */
const SCENE_PX = 460;

/**
 * How the flanking villagers are aligned to the scene's ground.
 *
 * A mascot's canvas is square and its soles sit at the species' own ground
 * line rather than at the bottom edge, so two figures at different sizes do
 * *not* share a baseline when their boxes are bottom-aligned — the gap under
 * the soles scales with the box. This is that gap as a fraction, read off the
 * rig rather than typed, so a change to the species' foot height moves the
 * composition with it instead of quietly un-standing two of the three.
 */
const GROUND_GAP = (200 - groundY(rigOf(getConcept("kyla"), "dog"))) / 200;

/** Places a flanking villager at a given x in the *scene's* viewBox units. */
function standingAt(u: number, size: number): CSSProperties {
  return {
    position: "absolute",
    left: u * (SCENE_PX / 200) - size / 2,
    bottom: (SCENE_PX - size) * GROUND_GAP,
  };
}

function Ensemble(): ReactElement {
  return (
    <div
      className="relative overflow-hidden rounded-lg border border-border bg-background"
      style={{ width: SCENE_PX, height: SCENE_PX }}
    >
      {/* Vilja carries the scene, so she is drawn first and everyone else is
          in front of her. The house is in the left quarter of her canvas and
          the fence in the right quarter, which is what leaves room for two
          more villagers to stand on the same ground. */}
      <Mascot
        concept="kyla"
        form="goat"
        variant="okra"
        pose="wave"
        expression="happy"
        outfit={{ scene: "village" }}
        size={SCENE_PX}
        label="Vilja the goat waving in front of the village house"
      />
      <span style={standingAt(44, 360)}>
        <Mascot
          concept="kyla"
          form="dog"
          variant="kaura"
          role="gedu"
          pose="reading"
          expression="thinking"
          size={360}
          label="Aarne the dog reading outside the house"
        />
      </span>
      <span style={standingAt(162, 300)}>
        <Mascot
          concept="kyla"
          form="mouse"
          variant="sammal"
          pose="reading"
          expression="happy"
          prop="kantele"
          size={300}
          label="Nyppy the mouse playing a kantele by the fence"
        />
      </span>
    </div>
  );
}

export function KylaVillage(): ReactElement {
  const def = getConcept("kyla");
  const cast: readonly { form: string; variant: string }[] = [
    { form: "dog", variant: "okra" },
    { form: "cat", variant: "tervas" },
    { form: "pig", variant: "karpalo" },
    { form: "goat", variant: "okra" },
    { form: "rooster", variant: "savi" },
    { form: "mouse", variant: "sammal" },
  ];
  const labelOf = (form: string): string =>
    KYLA_FORMS.find((f) => f.id === form)?.label ?? form;

  return (
    <Card>
      <CardContent className="space-y-8 p-6">
        <div>
          <h3 className="text-xl font-bold tracking-tight text-foreground">
            Kylä — three villagers in one frame
          </h3>
          <p className="mt-1 max-w-4xl text-sm leading-relaxed text-muted-foreground">
            {def.kind}. The point of this concept is the group picture, so the group picture is the
            first thing to look at: one scene, three characters at three sizes, each doing a
            different job, all standing on the same ground.
          </p>
        </div>

        <section>
          <Rubric
            title="The ensemble"
            note="One villager carries the scene; the other two stand in it. Sizes differ on purpose — a big figure, a mid one and a small one is how a crowded page is read."
          />
          <Ensemble />
        </section>

        <section>
          <Rubric
            title="The six forms at 200 pixels"
            note="One rig, one coat grammar, six heads. Colour separates the members; the ears, horns and comb separate the species."
          />
          <div className="flex flex-wrap items-end gap-4 rounded-lg border border-border bg-background p-4">
            {cast.map(({ form, variant }) => (
              <figure key={form} className="flex flex-col items-center gap-1">
                <Mascot concept="kyla" form={form} variant={variant} size={200} />
                <figcaption className="text-[11px] leading-tight text-muted-foreground">
                  {labelOf(form)}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section>
          <Rubric
            title="The same six at 40 pixels"
            note="No captions on purpose — this is the size a name list renders, and the test is whether you can say which animal each one is without being told."
          />
          <div className="flex flex-wrap gap-3 rounded-lg border border-border bg-background p-4">
            {cast.map(({ form, variant }) => (
              <span
                key={form}
                className="overflow-hidden rounded-full border border-border bg-background"
              >
                <Mascot concept="kyla" form={form} variant={variant} size={40} crop="bust" />
              </span>
            ))}
          </div>
        </section>

        <section>
          <Rubric
            title="The contour question, and what the rasters said"
            note="Answered offline against the reference, at 420 / 200 / 40 on this exact background."
          />
          <div className="rounded-lg border border-border bg-background p-4">
            <p className="max-w-4xl text-sm leading-relaxed text-muted-foreground">
              The idiom this concept learns from is an ink line, so the species was drawn three
              ways — flat, with the shared plum ink at 1.6 units, and with a contour mixed out of
              the coat&rsquo;s own dark. Outlined, a 420-pixel bust genuinely reads more like a{" "}
              <em>drawing</em>. It loses anyway, for two reasons that only show up on this
              background: a near-black line on a near-black page fades the silhouette&rsquo;s outer
              edge instead of drawing it, and the shared limb renderer has no stroke — so an
              outlined head and coat arrive attached to unoutlined sleeves, and that seam is the
              first thing the eye finds. At 40 pixels a 1.6-unit stroke is a third of a pixel and
              all three are the same picture. The species ships flat, and the separation an
              outline was doing is done in colour instead. Giving the whole system an outline is a
              change to the limb renderer, which is a decision for whoever owns that module.
            </p>
          </div>
        </section>
      </CardContent>
    </Card>
  );
}
