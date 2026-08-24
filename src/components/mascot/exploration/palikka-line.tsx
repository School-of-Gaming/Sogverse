/* eslint-disable i18next/no-literal-string -- throwaway developer-facing design-exploration surface; every string here is a caption on a page no user will ever see and that gets deleted with the exploration */
"use client";

/**
 * The voxel line, and the one question it has to survive.
 *
 * Palikka exists because two of the thirty-four legacy files are blocky
 * animals and the first pass refused them for looking like Minecraft. That
 * refusal was overturned — the ruling forbids rebuilding somebody else's
 * *character*, not building out of cubes — so the species is here, and the
 * check it still owes is a commercial one rather than an artistic one: we are
 * a Roblox partner, and the row below is what somebody would be looking at
 * while deciding whether that is a problem.
 *
 * Three rows, and the last is the one that matters:
 *
 * 1. **The three builds at 200px**, where the block grammar is legible and the
 *    three-tone facet on every cube reads as light rather than as noise.
 * 2. **The five colourways**, two of which are sampled face-by-face off the
 *    legacy files and three of which come from the shared swatch list — which
 *    is the whole claim that a voxel species obeys the same colour rule as
 *    every other one.
 * 3. **Forty pixels.** A cube is the one body plan that should gain from being
 *    small, because a block is already a pixel. If that turns out to be true
 *    it is the strongest thing anyone can say for this line.
 */

import type { ReactElement } from "react";

import { Card, CardContent } from "@/components/ui/card";

import { getConcept } from "../concepts";
import { PALIKKA_FORMS } from "../concepts/palikka";
import { Mascot } from "../mascot";
import { Rubric } from "./controls";

const PALIKKA = getConcept("palikka");

/** The colourway each build is drawn in for the size rows. */
const HOUSE_VARIANT: Record<string, string> = {
  trex: "oliivi",
  hippo: "violetti",
  hirvi: "ruska",
};

export function PalikkaLine(): ReactElement {
  return (
    <Card>
      <CardContent className="space-y-8 p-6">
        <div>
          <h3 className="text-xl font-bold tracking-tight text-foreground">
            Palikka — the voxel line
          </h3>
          <p className="mt-1 max-w-4xl text-sm leading-relaxed text-muted-foreground">
            A child&rsquo;s building block as a body plan: every part is a cube drawn in
            three tones so one face is lit, one is front-on and one is in shadow. It is
            front-facing like everything else here, which means it inherits the same rig,
            the same joint solver and the same animations rather than forking them —
            a voxel character that walks is the same code as a bear that walks.
          </p>
        </div>

        <section>
          <Rubric
            title="The three builds"
            note="Two came out of the legacy folder. The elk is ours, and is here to show the style is a style rather than two rebuilt files."
          />
          <div className="flex flex-wrap items-end justify-center gap-4 rounded-lg border border-border bg-background p-4">
            {PALIKKA_FORMS.map((form) => (
              <figure key={form.id} className="flex w-[13rem] flex-col items-center gap-1">
                <Mascot
                  concept="palikka"
                  form={form.id}
                  variant={HOUSE_VARIANT[form.id]}
                  size={210}
                />
                <figcaption className="text-center text-[11px] leading-tight text-muted-foreground">
                  <span className="block font-medium text-foreground">{form.label}</span>
                  {form.note}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section>
          <Rubric
            title="Five colourways on one build"
            note="The first two are sampled off the legacy art. The rest are swatches off the shared list, shaded by the same ratios the sampling found."
          />
          <div className="flex flex-wrap items-end justify-center gap-4 rounded-lg border border-border bg-background p-4">
            {PALIKKA.variants.map((variant) => (
              <figure key={variant.id} className="flex w-[10rem] flex-col items-center gap-1">
                <Mascot concept="palikka" form="hippo" variant={variant.id} size={150} />
                <figcaption className="text-center text-[11px] leading-tight text-muted-foreground">
                  <span className="block font-medium text-foreground">{variant.label}</span>
                  {variant.note}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section>
          <Rubric
            title="Forty pixels"
            note="Every build in every colourway, uncaptioned. A block is already a pixel — this row is where that either pays off or does not."
          />
          <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-background p-4">
            {PALIKKA_FORMS.flatMap((form) =>
              PALIKKA.variants.map((variant) => (
                <Mascot
                  key={`${form.id}-${variant.id}`}
                  concept="palikka"
                  form={form.id}
                  variant={variant.id}
                  crop="bust"
                  size={40}
                />
              )),
            )}
          </div>
        </section>

        <section>
          <Rubric
            title="The fleet"
            note="Read off the concept, so this row cannot drift from the characters it is showing."
          />
          <div className="flex flex-wrap items-end gap-6 rounded-lg border border-border bg-background p-4">
            {PALIKKA.fleet.map((member) => (
              <figure key={member.name} className="flex w-[15rem] flex-col items-center gap-2">
                <Mascot
                  concept="palikka"
                  form={member.form}
                  variant={member.variantId}
                  pose={member.pose}
                  expression={member.expression}
                  prop={member.prop}
                  outfit={member.outfit}
                  size={190}
                />
                <figcaption className="text-center text-[11px] leading-snug text-muted-foreground">
                  <span className="block font-medium text-foreground">{member.name}</span>
                  {member.blurb}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      </CardContent>
    </Card>
  );
}
