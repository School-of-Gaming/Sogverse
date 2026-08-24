/* eslint-disable i18next/no-literal-string -- throwaway developer-facing design-exploration surface; every string here is a caption on a page no user will ever see and that gets deleted with the exploration */
"use client";

import type { ReactElement } from "react";

import { Card, CardContent } from "@/components/ui/card";

import { getConcept } from "../concepts";
import { Mascot } from "../mascot";
import { STADI_FORMS } from "../concepts/stadi";
import { Rubric } from "./controls";

/**
 * Stadi, the inked humanoid, laid out so the three questions it has to answer
 * can be answered by looking rather than by argument.
 *
 * 1. **Do four builds read as four ages?** The row of forms at 200px.
 * 2. **Is it actually a different animal from the other humanoids?** The same
 *    adult beside Kaveri's and Porukka's, at the same size, on the same ground.
 *    This is the row that decides whether "the line is the species" is a real
 *    claim or a sentence in a doc comment.
 * 3. **Does an inked bust survive being an avatar?** Every build and every
 *    colourway at 40 pixels, uncaptioned, which is the size a participant list
 *    renders.
 *
 * And then the Chief Engineer candidate, so the humanoid concepts can be
 * compared on the same character rather than on three different ones.
 */

const CONCEPT = getConcept("stadi");
const VARIANTS = CONCEPT.variants;

/** The fleet member that is the engineer, read off the concept so it cannot drift. */
const ENGINEER = CONCEPT.fleet.find((m) => m.name.startsWith("Chief Engineer"));

function Figure({
  form,
  variant,
  label,
  size,
  bust,
}: {
  form: string;
  variant: string;
  label?: string;
  size: number;
  bust?: boolean;
}): ReactElement {
  return (
    <figure className="flex flex-col items-center gap-1">
      <span
        className={
          bust === true
            ? "overflow-hidden rounded-full border border-border bg-background"
            : "flex items-end justify-center"
        }
      >
        <Mascot
          concept="stadi"
          form={form}
          variant={variant}
          pose="idle"
          expression="happy"
          size={size}
          {...(bust === true ? { crop: "bust" as const } : {})}
        />
      </span>
      {label !== undefined && (
        <figcaption className="text-[10px] leading-tight text-muted-foreground">{label}</figcaption>
      )}
    </figure>
  );
}

export function StadiFamily(): ReactElement {
  return (
    <Card>
      <CardContent className="space-y-8 p-6">
        <div>
          <h3 className="text-xl font-bold tracking-tight text-foreground">
            Stadi — the inked humanoid
          </h3>
          <p className="mt-1 max-w-4xl text-sm leading-relaxed text-muted-foreground">
            The City of Helsinki illustration idiom, taken as a grammar rather than as a picture: a
            heavy brush contour on every shape, exactly two colours plus the line and the paper,
            complexions that are a colour rather than a complexion, and five heads of leg. The
            counterpart to the outline-free flat family, and the opposite answer to the same brief.
          </p>
        </div>

        <section>
          <Rubric
            title="Four builds"
            note="Height, hair shape and shoulder width. Nothing else differs — no makeup, no colour coding, no skirt."
          />
          <div className="flex flex-wrap items-end gap-4 rounded-lg border border-border bg-background p-4">
            {STADI_FORMS.map((form) => (
              <Figure key={form.id} form={form.id} variant="taivas" label={form.label} size={200} />
            ))}
          </div>
        </section>

        <section>
          <Rubric
            title="Beside the other two humanoids, same size, same ground"
            note="Kaveri is the round-two person; Porukka is the outline-free flat family. If the line is the species, it has to be visible here."
          />
          <div className="flex flex-wrap items-end gap-4 rounded-lg border border-border bg-background p-4">
            <Figure form="adult" variant="taivas" label="Stadi — adult" size={200} />
            <figure className="flex flex-col items-center gap-1">
              <Mascot concept="kaveri" form="adult-b" variant="teal" size={200} />
              <figcaption className="text-[10px] leading-tight text-muted-foreground">
                Kaveri — adult
              </figcaption>
            </figure>
            <figure className="flex flex-col items-center gap-1">
              <Mascot concept="porukka" form="adult-a" variant="noki" size={200} />
              <figcaption className="text-[10px] leading-tight text-muted-foreground">
                Porukka — adult
              </figcaption>
            </figure>
          </div>
        </section>

        <section>
          <Rubric
            title="Five colourways, and the palette rule they obey"
            note="Two swatch colours plus the line and the paper, every time — one on the complexion, one on the garment. Measured off the sources, not chosen."
          />
          <div className="flex flex-wrap items-end gap-4 rounded-lg border border-border bg-background p-4">
            {VARIANTS.map((variant) => (
              <Figure
                key={variant.id}
                form="adult"
                variant={variant.id}
                label={variant.label}
                size={160}
              />
            ))}
          </div>
        </section>

        <section>
          <Rubric
            title="Every build and every colourway at 40 pixels"
            note="No captions on purpose. This is the size a name list renders at, and the test is whether you can tell two of them apart without being told which is which."
          />
          <div className="flex flex-wrap gap-2 rounded-lg border border-border bg-background p-4">
            {STADI_FORMS.flatMap((form) =>
              VARIANTS.map((variant) => (
                <Figure
                  key={`${form.id}-${variant.id}`}
                  form={form.id}
                  variant={variant.id}
                  size={40}
                  bust
                />
              )),
            )}
          </div>
        </section>

        {ENGINEER !== undefined && (
          <section>
            <Rubric
              title="Chief Engineer Kyle, on this concept"
              note="The same character every humanoid candidate now has, so the choice is between drawings of one person rather than between three different people."
            />
            <div className="flex flex-wrap items-end gap-6 rounded-lg border border-border bg-background p-4">
              <Mascot
                concept="stadi"
                form={ENGINEER.form}
                variant={ENGINEER.variantId}
                pose={ENGINEER.pose}
                expression={ENGINEER.expression}
                prop={ENGINEER.prop}
                outfit={ENGINEER.outfit}
                size={220}
              />
              <span className="overflow-hidden rounded-full border border-border bg-background">
                <Mascot
                  concept="stadi"
                  form={ENGINEER.form}
                  variant={ENGINEER.variantId}
                  expression={ENGINEER.expression}
                  outfit={ENGINEER.outfit}
                  crop="bust"
                  size={96}
                />
              </span>
              <p className="max-w-md text-sm leading-relaxed text-muted-foreground">
                {ENGINEER.blurb}
              </p>
            </div>
          </section>
        )}
      </CardContent>
    </Card>
  );
}
