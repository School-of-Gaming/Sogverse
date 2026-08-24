/* eslint-disable i18next/no-literal-string -- throwaway developer-facing design-exploration surface; every string here is a caption on a page no user will ever see and that gets deleted with the exploration */
"use client";

import type { ReactElement } from "react";

import { Card, CardContent } from "@/components/ui/card";

import { Mascot } from "../mascot";
import type { MascotProps } from "../mascot";
import { Rubric } from "./controls";

/**
 * Saaristo — the archipelago pack, which is a **theme rather than a species**.
 *
 * Every other section on this page asks "does this character work?". This one
 * asks the question the outfit layer was built to answer and has never
 * actually been made to answer: **can one set of clothes and one set of places
 * hold four unrelated bodies at once?** So nothing here is drawn for a
 * particular species — there is no archipelago animal — and every row puts the
 * same item on species that share nothing but a rig.
 *
 * What each row decides:
 *
 * 1. **Four species in the boat.** Whether the hull cuts every one of them at
 *    the same believable height, given that their soles sit anywhere between
 *    y=172 and y=182. Also, and this is the finding the scene was rebuilt
 *    around, whether a row of boats butted edge to edge reads as one long boat
 *    (it does not — see the note under the row).
 * 2. **At the lighthouse.** The other kind of scene: a place with something
 *    tall in it, where the character has to stay the subject.
 * 3. **The garments on three bodies.** A bear with shoulders, a bean with
 *    none, and a person. The bean is why two of these items carry an
 *    exclusion.
 * 4. **The three props.** All held at the side grip, which leaves fifty units
 *    of canvas below the hand and forces every one of them to lean its length
 *    upward.
 * 5. **Forty pixels.** The two hats at avatar size, which is where a hat has
 *    to do its whole job.
 */

const TEAL = { clothing: "#2AB6A6", clothingAccent: "#FFF7DC" };

/** The three bodies every wardrobe row is tested on. */
const BODIES: readonly { label: string; props: MascotProps }[] = [
  { label: "Otso — shoulders", props: { concept: "otso", form: "bear" } },
  { label: "Silmu — none", props: { concept: "silmu" } },
  { label: "Porukka — a person", props: { concept: "porukka", form: "adult-b" } },
];

const CREW: readonly { caption: string; props: MascotProps }[] = [
  {
    caption: "Otso, no kit",
    props: { concept: "otso", form: "bear", expression: "happy" },
  },
  {
    caption: "Silmu, captain",
    props: { concept: "silmu", pose: "wave", outfit: { hat: "captain-cap" } },
  },
  {
    caption: "Porukka, at the oar",
    props: {
      concept: "porukka",
      form: "kid-a",
      expression: "excited",
      prop: "oar",
      outfit: { torso: "sailor-shirt" },
    },
  },
  {
    caption: "Palikka, in the wet",
    props: {
      concept: "palikka",
      form: "hirvi",
      expression: "focused",
      outfit: { hat: "sou-wester" },
    },
  },
];

function Figure({
  label,
  size,
  bust,
  ...rest
}: MascotProps & { label?: string; bust?: boolean }): ReactElement {
  return (
    <figure className="flex flex-col items-center gap-1">
      <span
        className={
          bust === true
            ? "overflow-hidden rounded-full border border-border bg-background"
            : "flex items-end justify-center"
        }
      >
        <Mascot {...rest} size={size} {...(bust === true ? { crop: "bust" as const } : {})} />
      </span>
      {label !== undefined && (
        <figcaption className="text-center text-[10px] leading-tight text-muted-foreground">
          {label}
        </figcaption>
      )}
    </figure>
  );
}

export function SaaristoPack(): ReactElement {
  return (
    <Card>
      <CardContent className="space-y-9 p-6">
        <div>
          <h3 className="text-xl font-bold tracking-tight text-foreground">
            Saaristo — a theme pack, not a species
          </h3>
          <p className="mt-1 max-w-4xl text-sm leading-relaxed text-muted-foreground">
            Two hats, two garments, three props and two places, and not one line of it belongs to
            any species. The archipelago is where this country goes in July, so the right way to
            build it is as something the whole fleet can put on — which makes it the hardest test
            the outfit layer has had: four unrelated bodies, four different crown lines, one cap
            that knows nothing about any of them.
          </p>
        </div>

        <div>
          <Rubric
            title="Four species in one boat"
            note="Soles land between y=172 and y=182; the hull covers all of them at y=166."
          />
          <div className="flex flex-wrap items-end gap-3">
            {CREW.map((member) => (
              <Figure
                key={member.caption}
                {...member.props}
                outfit={{ ...member.props.outfit, scene: "rowing-boat" }}
                pose={member.props.pose ?? "idle"}
                size={320}
                label={member.caption}
              />
            ))}
          </div>
          <p className="mt-2 max-w-4xl text-xs leading-relaxed text-muted-foreground">
            <strong className="text-foreground">The gap is deliberate.</strong> The forest-night
            scene butts edge to edge into one long shore, and this one was built expecting to do
            the same — four species sharing one hull is a better picture than four portraits of one
            boat. Rasterised, it is not: with no gap the repeated sheer reads as a scalloped
            embankment and the boat disappears, because nothing says where one hull ends. Spaced
            out, each is a boat, and the row is a flotilla.
          </p>
        </div>

        <div>
          <Rubric
            title="At the lighthouse"
            note="A place with something tall in it. The tower keeps to the left quarter."
          />
          <div className="flex flex-wrap items-end gap-3">
            <Figure
              concept="kaveri"
              form="adult-a"
              pose="hold-up"
              expression="happy"
              prop="spyglass"
              outfit={{ scene: "lighthouse", hat: "captain-cap", torso: "sailor-shirt" }}
              size={320}
              label="Kaveri, with the glass up"
            />
            <Figure
              concept="otso"
              form="fox"
              pose="idle"
              expression="happy"
              prop="fishing-rod"
              outfit={{ scene: "lighthouse", hat: "sou-wester" }}
              size={320}
              label="Repo, fishing off the rock"
            />
          </div>
        </div>

        <div>
          <Rubric
            title="The wardrobe, on three bodies"
            note="Captain's cap, sou'wester, Breton shirt, life vest — all dyed from one garment pair."
          />
          <div className="space-y-2">
            {BODIES.map((body) => (
              <div key={body.label} className="flex flex-wrap items-end gap-2">
                <span className="w-28 shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
                  {body.label}
                </span>
                {(
                  [
                    { hat: "captain-cap" },
                    { hat: "sou-wester" },
                    { torso: "sailor-shirt" },
                    { torso: "life-vest" },
                  ] as const
                ).map((worn, i) => (
                  <Figure
                    key={i}
                    {...body.props}
                    pose="idle"
                    expression="happy"
                    outfit={worn}
                    colors={TEAL}
                    size={190}
                  />
                ))}
              </div>
            ))}
          </div>
          <p className="mt-2 max-w-4xl text-xs leading-relaxed text-muted-foreground">
            The bean is the reason the shirt and the vest carry an exclusion. It has no shoulders,
            so a torso garment slides to the foot of the body and reads as a striped skirt — which
            is exactly what its own wardrobe note already says about a tee. Both hats fit it
            perfectly, and on that species the hat was always the character anyway.
          </p>
        </div>

        <div>
          <Rubric
            title="The three props"
            note="Oar, spyglass, rod. All of them lean upward, because the hand is at y=148."
          />
          <div className="flex flex-wrap items-end gap-3">
            <Figure
              concept="kaveri"
              form="adult-b"
              pose="idle"
              expression="happy"
              prop="oar"
              colors={TEAL}
              size={200}
              label="Oar — shouldered"
            />
            <Figure
              concept="kaveri"
              form="adult-b"
              pose="hold-up"
              expression="happy"
              prop="spyglass"
              colors={TEAL}
              size={200}
              label="Spyglass — up to the eye"
            />
            <Figure
              concept="kaveri"
              form="adult-b"
              pose="idle"
              expression="happy"
              prop="fishing-rod"
              colors={TEAL}
              size={200}
              label="Rod, line and bobber"
            />
          </div>
          <p className="mt-2 max-w-4xl text-xs leading-relaxed text-muted-foreground">
            The oar&apos;s blade started at the bottom, where a blade belongs, and the boat hid it —
            what
            was left read as a wooden spoon. Carried blade-up over the shoulder it is unmistakable
            and it clears every head in the set. The spyglass earns the raised hand rather than the
            side grip: the same object at the hip is a rolling pin, and at the eye there is nothing
            else it could be.
          </p>
        </div>

        <div>
          <Rubric
            title="Dressed for July"
            note="What the auto-season path picks between the 1st and the 31st."
          />
          <div className="flex flex-wrap items-end gap-3">
            {BODIES.map((body) => (
              <Figure
                key={body.label}
                {...body.props}
                pose="idle"
                expression="happy"
                look="saaristo"
                size={200}
                label={body.label}
              />
            ))}
          </div>
          <p className="mt-2 max-w-4xl text-xs leading-relaxed text-muted-foreground">
            Filed with the holidays rather than the seasons, and the odd one there: every other
            entry is a day or a weekend and this is a whole month. It is the month the country is
            away — the leave is taken in it, the clubs stop, the coast fills up — and a generic
            summer look on the one month nobody is at their desk is the wrong picture of the year.
          </p>
        </div>

        <div>
          <Rubric title="Forty pixels" note="Where a hat has to do the entire job." />
          <div className="flex flex-wrap items-center gap-3">
            {(["captain-cap", "sou-wester"] as const).map((hat) =>
              BODIES.map((body) => (
                <Figure
                  key={`${hat}-${body.label}`}
                  {...body.props}
                  pose="idle"
                  expression="happy"
                  outfit={{ hat }}
                  colors={TEAL}
                  size={40}
                  bust
                />
              )),
            )}
            <span className="mx-2 text-[10px] uppercase tracking-wide text-muted-foreground">
              and the same six at 64
            </span>
            {(["captain-cap", "sou-wester"] as const).map((hat) =>
              BODIES.map((body) => (
                <Figure
                  key={`${hat}-${body.label}-64`}
                  {...body.props}
                  pose="idle"
                  expression="happy"
                  outfit={{ hat }}
                  colors={TEAL}
                  size={64}
                  bust
                />
              )),
            )}
          </div>
          <p className="mt-2 max-w-4xl text-xs leading-relaxed text-muted-foreground">
            Both survive. The cap reads because its crown is flat and every other peaked thing in
            the registry is domed; the sou&apos;wester reads because its brim is wider than
            anything but the straw hat and its two corners hang past the head. Its first draft
            dropped those corners to the eye line and turned the hat into a blindfold on all three
            species — the 40px tile is where that showed up first.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
