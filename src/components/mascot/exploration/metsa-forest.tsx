/* eslint-disable i18next/no-literal-string -- throwaway developer-facing design-exploration surface; every string here is a caption on a page no user will ever see and that gets deleted with the exploration */
"use client";

import type { ReactElement } from "react";

import { Card, CardContent } from "@/components/ui/card";

import { getConcept } from "../concepts";
import { Mascot } from "../mascot";
import { swatchHex, tintHex } from "../palette";
import { Rubric } from "./controls";

/**
 * The forest folk, and the one question this species was built to answer:
 * **what does a pen-and-wash drawing do on a page that has no paper?**
 *
 * Three rows, in the order they decide things:
 *
 * 1. **The forms at 200px.** Six silhouettes, one nib weight, one wash. This
 *    is the size the idiom is designed for and the only size at which the line
 *    is a line.
 * 2. **The three colour registers, side by side on the real ground.** The
 *    inverted ink, the paper card, and the wash. The card is drawn here rather
 *    than described, because "it reads fine" and "what reads is the card" are
 *    the same sentence until you look at it.
 * 3. **The 40px busts.** Where the line has stopped existing and the wash is
 *    the whole character. If two of these are the same tile, the species does
 *    not work at avatar size, and no amount of drawing at 200px fixes it.
 *
 * Then one composition: three of them on a shore at night, which is the thing
 * the whole species is *for* — small creatures in a lot of landscape, the mood
 * carried by the scene rather than by the faces.
 */

const FORM_NOTES: readonly { form: string; label: string; silhouette: string }[] = [
  { form: "siili", label: "Siili", silhouette: "A bumpy mound" },
  { form: "hiiri", label: "Hiiri", silhouette: "Two round ears" },
  { form: "pollo", label: "Pöllö", silhouette: "A tufted egg" },
  { form: "haltija", label: "Haltija", silhouette: "Height and a sprig" },
  { form: "tonttu", label: "Tonttu", silhouette: "The cap" },
  { form: "kettu", label: "Kettu", silhouette: "Two points and a brush" },
];

/** The three answers to the colour problem, drawn rather than argued about. */
const REGISTERS: readonly { id: string; title: string; note: string; card: boolean }[] = [
  {
    id: "hamara",
    title: "(a) Ink inverted",
    note: "A pale nib straight onto the night. The best of the three at this size.",
    card: false,
  },
  {
    id: "kuu",
    title: "(b) On a paper card",
    note: "The drawing pinned to a page. Reads at every size — but the card is what reads.",
    card: true,
  },
  {
    id: "havu",
    title: "(c) One wash, dark nib",
    note: "The wash is the silhouette, the nib is the drawing. The shipped register.",
    card: false,
  },
];

function Figure({
  form,
  variant,
  label,
  sub,
  size,
  bust,
}: {
  form: string;
  variant: string;
  label?: string;
  sub?: string;
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
          concept="metsa"
          form={form}
          variant={variant}
          pose="idle"
          expression="happy"
          size={size}
          {...(bust === true ? { crop: "bust" as const } : {})}
        />
      </span>
      {label !== undefined && (
        <figcaption className="text-center text-[10px] leading-tight text-muted-foreground">
          {label}
          {sub !== undefined && <span className="block opacity-70">{sub}</span>}
        </figcaption>
      )}
    </figure>
  );
}

export function MetsaForest(): ReactElement {
  const def = getConcept("metsa");

  return (
    <Card>
      <CardContent className="space-y-9 p-6">
        <div>
          <h3 className="text-xl font-bold tracking-tight text-foreground">
            Metsänväki — a pen line on a page with no paper
          </h3>
          <p className="mt-1 max-w-4xl text-sm leading-relaxed text-muted-foreground">
            Six forest creatures drawn with one nib weight and one wash, a face of two dots, and
            the acting done by the lean of the body. The grammar is measured off the reference
            sheets and written at the top of the concept file; what is settled here is the colour,
            because a pen-and-wash species on a `#121212` ground is a problem none of the other
            concepts have.
          </p>
        </div>

        <div>
          <Rubric
            title="The six forms"
            note="Each one designed as a silhouette first and a drawing second."
          />
          <div className="flex flex-wrap items-end gap-4">
            {FORM_NOTES.map((entry) => (
              <Figure
                key={entry.form}
                form={entry.form}
                variant="kuu"
                label={entry.label}
                sub={entry.silhouette}
                size={200}
              />
            ))}
          </div>
        </div>

        <div>
          <Rubric
            title="The colour decision"
            note="The same drawing in the three registers, on the real background."
          />
          <div className="flex flex-wrap gap-6">
            {REGISTERS.map((register) => (
              <figure key={register.title} className="flex w-64 flex-col gap-2">
                <span
                  className={
                    register.card
                      ? "flex items-end justify-center rounded-md bg-muted"
                      : "flex items-end justify-center"
                  }
                >
                  <Mascot
                    concept="metsa"
                    form="pollo"
                    variant={register.id}
                    pose="idle"
                    expression="happy"
                    size={200}
                  />
                </span>
                <figcaption className="text-xs leading-snug text-muted-foreground">
                  <strong className="text-foreground">{register.title}</strong>
                  <span className="mt-0.5 block">{register.note}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>

        <div>
          <Rubric
            title="Forty pixels"
            note="The line is a third of a pixel here. Everything nameable is the wash."
          />
          <div className="flex flex-wrap items-center gap-3">
            {FORM_NOTES.map((entry) => (
              <Figure key={entry.form} form={entry.form} variant="havu" size={40} bust />
            ))}
            <span className="mx-3 text-[10px] uppercase tracking-wide text-muted-foreground">
              the inverted register, same size
            </span>
            {FORM_NOTES.map((entry) => (
              <Figure key={`${entry.form}-night`} form={entry.form} variant="hamara" size={40} bust />
            ))}
          </div>
        </div>

        <div>
          <Rubric
            title="Night on the shore"
            note="What the species is for: small creatures, a lot of landscape, one lantern."
          />
          <div className="flex flex-wrap items-end gap-1">
            <Mascot
              concept="metsa"
              form="pollo"
              variant="usva"
              pose="idle"
              expression="thinking"
              outfit={{ scene: "forest-night" }}
              size={360}
            />
            <Mascot
              concept="metsa"
              form="hiiri"
              variant="sammal"
              pose="idle"
              expression="happy"
              prop="lantern"
              outfit={{ scene: "forest-night", torso: "scarf" }}
              colors={{ clothing: swatchHex("red"), clothingAccent: tintHex(swatchHex("red"), 0.72) }}
              size={360}
            />
            <Mascot
              concept="metsa"
              form="haltija"
              variant="kuu"
              pose="wave"
              expression="happy"
              outfit={{ scene: "forest-night" }}
              size={360}
            />
          </div>
          <p className="mt-2 max-w-4xl text-xs leading-relaxed text-muted-foreground">
            The scene is a backdrop rather than furniture — a moon left as paper, three cut-paper
            spruces and two flat water values — so it composes with every other species too. The
            three panels butt together on purpose: the shoreline and the water run straight across
            the seam, which is what makes a row of them read as one long night rather than as three
            portraits.
          </p>
        </div>

        <p className="max-w-4xl text-xs leading-relaxed text-muted-foreground">
          <strong className="text-foreground">Honest caveat.</strong> {def.caveat}
        </p>
      </CardContent>
    </Card>
  );
}
