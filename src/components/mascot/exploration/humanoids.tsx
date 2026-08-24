/* eslint-disable i18next/no-literal-string -- throwaway developer-facing design-exploration surface; every string here is a caption on a page no user will ever see and that gets deleted with the exploration */
"use client";

/**
 * The three humanoid idioms on one row, before any of them is argued for.
 *
 * Each family has a study of its own below this, and each of those studies is
 * persuasive on its own terms — which is exactly the problem. Three separate
 * sections are three separate impressions formed minutes apart, and the
 * decision this page is actually asking for is a comparison. So the same life
 * stage is drawn from every family, at one size, in one pose, with one mood,
 * on one ground: the only thing differing between these figures is the idiom
 * that drew them.
 *
 * The second row is the same six at forty pixels, which is where a
 * participant list meets them, and where the line weight that separates two
 * of these families stops existing.
 */

import type { ReactElement } from "react";

import { Card, CardContent } from "@/components/ui/card";

import type { ConceptId } from "../concept";
import { getConcept } from "../concepts";
import { Mascot } from "../mascot";
import { Rubric } from "./controls";

/**
 * One grown-up per idiom, and every build that could be called one.
 *
 * `note` says what the family is doing differently, because at 200px the
 * differences are visible and unnameable — a reader can see that two of these
 * are not the same drawing and still not have words for it.
 */
const ADULTS: readonly {
  concept: ConceptId;
  form: string;
  label: string;
  note: string;
}[] = [
  {
    concept: "kaveri",
    form: "adult-a",
    label: "Kaveri — long hair",
    note: "Round one's person. The most drawn of the three.",
  },
  {
    concept: "kaveri",
    form: "adult-b",
    label: "Kaveri — short hair",
    note: "Same body, broader shoulders.",
  },
  {
    concept: "kaveri",
    form: "adult-c",
    label: "Kaveri — bob",
    note: "The middle build.",
  },
  {
    concept: "porukka",
    form: "adult-a",
    label: "Porukka — bob",
    note: "The flat idiom: no outline, one unreal skin, six shapes on the whole figure.",
  },
  {
    concept: "porukka",
    form: "adult-b",
    label: "Porukka — crop",
    note: "The broadest shoulders in the set.",
  },
  {
    concept: "stadi",
    form: "adult",
    label: "Stadi — adult",
    note: "The inked idiom: a thick pen line, two colours, five heads tall.",
  },
];

export function HumanoidRow(): ReactElement {
  return (
    <Card>
      <CardContent className="space-y-8 p-6">
        <div>
          <h3 className="text-xl font-bold tracking-tight text-foreground">
            The three families, one row
          </h3>
          <p className="mt-1 max-w-4xl text-sm leading-relaxed text-muted-foreground">
            Six grown-ups, one pose, one mood, one ground. Whatever separates the three
            idioms has to be visible here, because this is the only place on the page
            they are seen without a page break between them.
          </p>
        </div>

        <section>
          <Rubric
            title="At 200 pixels"
            note="Hero and card size — where the line weight, the proportion and the palette all still exist."
          />
          <div className="flex flex-wrap items-end justify-center gap-4 rounded-lg border border-border bg-background p-4">
            {ADULTS.map((adult) => (
              <figure
                key={`${adult.concept}-${adult.form}`}
                className="flex w-[12rem] flex-col items-center gap-1"
              >
                <Mascot concept={adult.concept} form={adult.form} size={200} />
                <figcaption className="text-center text-[11px] leading-tight text-muted-foreground">
                  <span className="block font-medium text-foreground">{adult.label}</span>
                  {adult.note}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section>
          <Rubric
            title="The same six at 40 pixels"
            note="Uncaptioned on purpose. If two of these are the same tile, one of the three families is not a family here."
          />
          <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-background p-4">
            {ADULTS.map((adult) => (
              <Mascot
                key={`bust-${adult.concept}-${adult.form}`}
                concept={adult.concept}
                form={adult.form}
                crop="bust"
                size={40}
              />
            ))}
          </div>
        </section>

        <section>
          <Rubric
            title="The same six at 64 pixels"
            note="The other avatar size, because 40 is where a difference dies and 64 is where it is decided."
          />
          <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border bg-background p-4">
            {ADULTS.map((adult) => (
              <figure
                key={`bust64-${adult.concept}-${adult.form}`}
                className="flex w-24 flex-col items-center gap-1"
              >
                <Mascot
                  concept={adult.concept}
                  form={adult.form}
                  crop="bust"
                  size={64}
                />
                <figcaption className="text-center text-[10px] leading-tight text-muted-foreground">
                  {getConcept(adult.concept).species}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      </CardContent>
    </Card>
  );
}
