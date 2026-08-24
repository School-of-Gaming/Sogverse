/* eslint-disable i18next/no-literal-string -- throwaway developer-facing design-exploration surface; every string here is a caption on a page no user will ever see and that gets deleted with the exploration */
"use client";

import type { CSSProperties, ReactElement } from "react";

import { Card, CardContent } from "@/components/ui/card";

import { rigOf } from "../concept";
import { getConcept } from "../concepts";
import { GALAKSI_FORMS } from "../concepts/galaksi";
import { Mascot } from "../mascot";
import { groundY } from "../rig";
import { Rubric } from "./controls";

/**
 * The Galaksi study — the four things the concept section cannot show.
 *
 * **The landing party.** The premise is a crew, and a crew is only a crew when
 * more than one of them is in the picture: three builds at three sizes on one
 * pad, with the saucer parked behind. It is also the only place the `saucer`
 * scene can be judged, because a scene is a composition rather than a drawing.
 *
 * **The three builds, big.** Proportion is the whole of what separates a
 * pilot from an engineer, so they have to be seen at a size where proportion
 * exists.
 *
 * **The helmet on somebody else.** The dome is fitted to whatever `head.r` it
 * lands on, and the only honest test of that is putting it on the species it
 * was not drawn for.
 *
 * **The busts.** Forty pixels, no captions, which is where the ruling actually
 * bites: colour has to carry the difference, because build does not survive.
 */

/** The one scene the composition is built inside. Everything else is measured off it. */
const SCENE_PX = 460;

/**
 * How the flanking crew are aligned to the pad's ground.
 *
 * A mascot's canvas is square and its soles sit at the species' own ground
 * line rather than at the bottom edge, so two figures at different sizes do
 * *not* share a baseline when their boxes are bottom-aligned — the gap under
 * the soles scales with the box. This is that gap as a fraction, read off the
 * rig rather than typed, so a change to a build's foot line moves the
 * composition with it instead of quietly un-standing two of the three.
 */
const GROUND_GAP = (200 - groundY(rigOf(getConcept("galaksi"), "pilot"))) / 200;

/** Places a flanking crew member at a given x in the *scene's* viewBox units. */
function standingAt(u: number, size: number): CSSProperties {
  return {
    position: "absolute",
    left: u * (SCENE_PX / 200) - size / 2,
    bottom: (SCENE_PX - size) * GROUND_GAP,
  };
}

function LandingParty(): ReactElement {
  return (
    <div
      className="relative overflow-hidden rounded-lg border border-border bg-background"
      style={{ width: SCENE_PX, height: SCENE_PX }}
    >
      {/* Tähti carries the scene, so she is drawn first and everybody else is
          in front of her. The saucer sits in the top right quarter of her
          canvas and the pad runs the full width of the bottom, which is what
          leaves room for two more of the crew to stand on the same ground. */}
      <Mascot
        concept="galaksi"
        variant="revontuli"
        pose="wave"
        expression="excited"
        outfit={{ scene: "saucer" }}
        size={SCENE_PX}
        label="Tähti the pilot waving on the landing pad, the saucer parked behind her"
      />
      <span style={standingAt(46, 340)}>
        <Mascot
          concept="galaksi"
          form="engineer"
          variant="plasma"
          pose="idle"
          expression="focused"
          prop="wrench"
          size={340}
          label="Ruuvi the flight engineer with a spanner, on the pad"
        />
      </span>
      <span style={standingAt(158, 300)}>
        <Mascot
          concept="galaksi"
          form="navigator"
          variant="syvyys"
          pose="idle"
          expression="happy"
          outfit={{ hat: "space-helmet" }}
          size={300}
          label="A navigator in a space helmet, standing at the edge of the pad"
        />
      </span>
    </div>
  );
}

/** The species the helmet is tested on. One of each body plan in the set. */
const HELMET_TEST: readonly { concept: "galaksi" | "silmu" | "otso" | "kaveri" | "palikka" | "nappi"; form?: string; variant: string; label: string }[] = [
  { concept: "galaksi", form: "pilot", variant: "komeetta", label: "Galaksi" },
  { concept: "silmu", variant: "sky", label: "Silmu — fused" },
  { concept: "otso", form: "bear", variant: "honey", label: "Otso — ears" },
  { concept: "kaveri", form: "kid-a", variant: "lilac", label: "Kaveri — person" },
  { concept: "palikka", form: "trex", variant: "oliivi", label: "Palikka — voxel" },
  { concept: "nappi", variant: "prism", label: "Nappi — corners" },
];

const CREW: readonly { form: string; variant: string }[] = [
  { form: "pilot", variant: "revontuli" },
  { form: "pilot", variant: "komeetta" },
  { form: "navigator", variant: "tahtisumu" },
  { form: "navigator", variant: "kiertorata" },
  { form: "engineer", variant: "plasma" },
  { form: "engineer", variant: "syvyys" },
];

export function GalaksiCrew(): ReactElement {
  const def = getConcept("galaksi");

  return (
    <Card>
      <CardContent className="space-y-8 p-6">
        <div>
          <h3 className="text-xl font-bold tracking-tight text-foreground">
            Galaksi — the crew, the helmet and the pad
          </h3>
          <p className="mt-1 max-w-4xl text-sm leading-relaxed text-muted-foreground">
            {def.kind}. School of Gaming Galactic Oy is the name on the paperwork, and this is the
            joke cashed in: a crew that flies the saucer, plays the games and answers the parents.
            The helmet and the landing pad are built for every species here, not only for this one.
          </p>
        </div>

        <section>
          <Rubric
            title="The landing party"
            note="One crew member carries the scene; the other two stand on the same pad. Three sizes on purpose — a big figure, a mid one and a small one is how a crowded picture is read."
          />
          <LandingParty />
        </section>

        <section>
          <Rubric
            title="The three builds at 200 pixels"
            note="Proportion only: cranium height, brow width, eye size, body weight. Not one of them is wearing anything to say which job it does."
          />
          <div className="flex flex-wrap items-end gap-4 rounded-lg border border-border bg-background p-4">
            {GALAKSI_FORMS.map((form) => (
              <figure key={form.id} className="flex flex-col items-center gap-1">
                <Mascot concept="galaksi" form={form.id} variant="revontuli" size={200} />
                <figcaption className="text-[11px] leading-tight text-muted-foreground">
                  {form.label}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section>
          <Rubric
            title="The space helmet, on five other species"
            note="The dome is derived from each species' own head radius and clamped to the canvas, so it fits a bean, a bear, a person, a stack of cubes and a folded plane without any of them knowing it exists."
          />
          <div className="flex flex-wrap items-end gap-4 rounded-lg border border-border bg-background p-4">
            {HELMET_TEST.map((item) => (
              <figure key={`${item.concept}-${item.form ?? ""}`} className="flex flex-col items-center gap-1">
                <Mascot
                  concept={item.concept}
                  {...(item.form === undefined ? {} : { form: item.form })}
                  variant={item.variant}
                  outfit={{ hat: "space-helmet" }}
                  size={180}
                />
                <figcaption className="text-[11px] leading-tight text-muted-foreground">
                  {item.label}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section>
          <Rubric
            title="Six of the crew at 40 pixels"
            note="No captions on purpose — this is the size a participant list renders. The test is whether you can tell six crew members apart, not which build each one is."
          />
          <div className="flex flex-wrap gap-3 rounded-lg border border-border bg-background p-4">
            {CREW.map(({ form, variant }) => (
              <span
                key={`${form}-${variant}`}
                className="overflow-hidden rounded-full border border-border bg-background"
              >
                <Mascot
                  concept="galaksi"
                  form={form}
                  variant={variant}
                  size={40}
                  crop="bust"
                />
              </span>
            ))}
          </div>
        </section>

        <section>
          <Rubric
            title="One eye, two or three — what the rasters said"
            note="Answered offline on this exact body, full figure and bust crop, at 200 / 64 / 40 / 28 on this exact background."
          />
          <div className="space-y-3 rounded-lg border border-border bg-background p-4">
            <p className="max-w-4xl text-sm leading-relaxed text-muted-foreground">
              The face grammar allows a species to change the eye <em>count</em> as long as every
              eye is the same symbol, so all three were drawn and looked at rather than argued
              about. <strong>Three eyes is the best of the three at 200 pixels and the worst
              everywhere else:</strong> a third white only fits if each drops to about two thirds
              of the paired radius, and by the 40-pixel bust the three have merged into one pale
              bar with a smear in it. Every avatar use is a bust between 28 and 64, so that is the
              band that decides it.
            </p>
            <p className="max-w-4xl text-sm leading-relaxed text-muted-foreground">
              <strong>One eye is legible at every size and belongs to somebody else.</strong> The
              cyclops crop at 28 is genuinely strong — one pupil is worth four of a pair — but this
              directory already has a one-eyed rounded critter in Silmu, and the cyclops face
              carries no brow at all by design, so adopting it would cost this species two of its
              four mood dials to arrive somewhere we have already been. The wide cranium is also
              what two eyes set far apart <em>explain</em>; put one in the middle and the width
              above it stops having a reason.
            </p>
          </div>
        </section>
      </CardContent>
    </Card>
  );
}
