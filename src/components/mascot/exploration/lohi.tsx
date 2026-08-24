/* eslint-disable i18next/no-literal-string -- throwaway developer-facing design-exploration surface; every string here is a caption on a page no user will ever see and that gets deleted with the exploration */
"use client";

import type { ReactElement } from "react";

import { Card, CardContent } from "@/components/ui/card";

import { getConcept } from "../concepts";
import { LOHI_FORMS } from "../concepts/lohi";
import { Mascot } from "../mascot";
import { swatchHex, tintHex } from "../palette";
import { Rubric, Tile } from "./controls";

/**
 * Lohi, laid out so the three questions a dragon has to answer can be answered
 * by looking.
 *
 * 1. **Is it a dragon, or is it a pony with wings?** The three builds at 200,
 *    then the same three beside the animals in this set they could be confused
 *    with. Four drafts failed this row before the muzzle joined the silhouette
 *    and the horns learned to taper; the row is kept because it is the only
 *    honest way to ask it.
 * 2. **Do three ages read as three ages?** Head size, neck, horn weight and a
 *    beard, and nothing else — no costume difference anywhere.
 * 3. **Does it survive being an avatar?** Every build and every colourway at
 *    40 pixels, uncaptioned.
 *
 * And then the fleet, including the Chief Engineer candidate, so this species
 * can be compared with the other candidates on the same character.
 */

const CONCEPT = getConcept("lohi");
const ENGINEER = CONCEPT.fleet.find((m) => m.name.startsWith("Chief Engineer"));

/** The garment override a fleet member's swatch id stands for. */
function garmentColors(garment: string | undefined): { clothing: string; clothingAccent: string } | Record<string, never> {
  if (garment === undefined) return {};
  return { clothing: swatchHex(garment), clothingAccent: tintHex(swatchHex(garment), 0.84) };
}

export function LohiCast(): ReactElement {
  return (
    <Card>
      <CardContent className="space-y-8 p-6">
        <div>
          <h3 className="text-xl font-bold tracking-tight text-foreground">
            Lohi — the dragon cast
          </h3>
          <p className="mt-1 max-w-4xl text-sm leading-relaxed text-muted-foreground">
            A cute dragon, drawn as far from the black wyvern everybody pictures as the geometry
            allows: round, two heads tall, salmon-pink, with wings too small to be any use and a
            leaf on the end of its tail. <em>Lohikäärme</em> is dragon and <em>lohi</em> is salmon,
            so the species is named for the fish and its members for the rivers the fish runs up.
            Three builds, and the axis is age rather than breed — a hatchling, a grown one with a
            neck, and an elder whose crown frill has moved under his chin.
          </p>
        </div>

        <section>
          <Rubric
            title="Three ages, one rig"
            note="Head radius, whether there is a neck, horn weight, and a frill that moves. No costume difference anywhere."
          />
          <div className="flex flex-wrap items-end gap-4 rounded-lg border border-border bg-background p-4">
            {LOHI_FORMS.map((form) => (
              <Tile key={form.id} caption={form.label} sub={form.note}>
                <Mascot concept="lohi" form={form.id} variant="lohi" size={200} />
              </Tile>
            ))}
          </div>
        </section>

        <section>
          <Rubric
            title="Is it its own animal?"
            note="Beside the three forms in the animal family it could be mistaken for. The horn pair, the muzzle and the wing lobes are what separate them, and all three are silhouette."
          />
          <div className="flex flex-wrap items-end gap-4 rounded-lg border border-border bg-background p-4">
            <Tile caption="Lohi — aikuinen">
              <Mascot concept="lohi" form="grown" variant="lohi" size={180} />
            </Tile>
            <Tile caption="Otso — yksisarvinen">
              <Mascot concept="otso" form="unicorn" variant="berry" size={180} />
            </Tile>
            <Tile caption="Otso — karhu">
              <Mascot concept="otso" form="bear" variant="honey" size={180} />
            </Tile>
            <Tile caption="Otso — pörriäinen">
              <Mascot concept="otso" form="bug" variant="honey" size={180} />
            </Tile>
          </div>
        </section>

        <section>
          <Rubric
            title="Five river colourways"
            note="One mix (the salmon, halfway between the zone pink and the zone red) and four single swatches, one per hue family. No black one is offered: this is the species where a black body would be the one mistake it cannot make."
          />
          <div className="flex flex-wrap items-end gap-4 rounded-lg border border-border bg-background p-4">
            {CONCEPT.variants.map((variant) => (
              <Tile key={variant.id} caption={variant.label} sub={variant.note}>
                <Mascot concept="lohi" form="grown" variant={variant.id} size={160} />
              </Tile>
            ))}
          </div>
        </section>

        <section>
          <Rubric
            title="Every build and every colourway at 40 pixels"
            note="No captions on purpose — this is the size a participant list renders at. The kid separates from the other two by head size; the grown one and the elder do not separate at all, because the beard is sub-pixel here."
          />
          <div className="flex flex-wrap gap-2 rounded-lg border border-border bg-background p-4">
            {LOHI_FORMS.flatMap((form) =>
              CONCEPT.variants.map((variant) => (
                <span
                  key={`${form.id}-${variant.id}`}
                  className="overflow-hidden rounded-full border border-border bg-background"
                >
                  <Mascot
                    concept="lohi"
                    form={form.id}
                    variant={variant.id}
                    crop="bust"
                    size={40}
                  />
                </span>
              )),
            )}
          </div>
        </section>

        <section>
          <Rubric
            title="The fleet"
            note="Named for salmon rivers. The two excited ones are letting out a puff of flame — one amber teardrop off the corner of the snout, drawn on the excited mood only and only above 96 pixels, where it is a flame rather than a speck. Grounded at rest on purpose: the hover loop was drawn and looked at, and a body this round hanging seven units above its own shadow reads as pasted onto the page rather than as flying."
          />
          <div className="grid gap-6 rounded-lg border border-border bg-background p-4 sm:grid-cols-2 xl:grid-cols-3">
            {CONCEPT.fleet.map((member) => (
              <div key={member.name} className="flex flex-col items-center gap-2 text-center">
                <Mascot
                  concept="lohi"
                  form={member.form}
                  variant={member.variantId}
                  role={member.role}
                  pose={member.pose}
                  expression={member.expression}
                  prop={member.prop}
                  colors={garmentColors(member.garment)}
                  outfit={member.outfit}
                  size={176}
                />
                <p className="text-base font-semibold text-foreground">{member.name}</p>
                <p className="text-xs font-medium text-primary">{member.job}</p>
                <p className="text-xs leading-relaxed text-muted-foreground">{member.blurb}</p>
              </div>
            ))}
          </div>
        </section>

        {ENGINEER !== undefined && (
          <section>
            <Rubric
              title="Chief Engineer Kyle, on this concept"
              note="The same character the other candidates have, so the choice is between drawings of one person rather than between different people."
            />
            <div className="flex flex-wrap items-end gap-6 rounded-lg border border-border bg-background p-4">
              <Mascot
                concept="lohi"
                form={ENGINEER.form}
                variant={ENGINEER.variantId}
                pose={ENGINEER.pose}
                expression={ENGINEER.expression}
                prop={ENGINEER.prop}
                colors={garmentColors(ENGINEER.garment)}
                outfit={ENGINEER.outfit}
                size={240}
              />
              <span className="overflow-hidden rounded-full border border-border bg-background">
                <Mascot
                  concept="lohi"
                  form={ENGINEER.form}
                  variant={ENGINEER.variantId}
                  expression={ENGINEER.expression}
                  colors={garmentColors(ENGINEER.garment)}
                  outfit={{ hat: ENGINEER.outfit?.hat }}
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
