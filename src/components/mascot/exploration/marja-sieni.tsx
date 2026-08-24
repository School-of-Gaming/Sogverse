/* eslint-disable i18next/no-literal-string -- throwaway developer-facing design-exploration surface; every string here is a caption on a page no user will ever see and that gets deleted with the exploration */
"use client";

import type { ReactElement } from "react";

import { Card, CardContent } from "@/components/ui/card";

import { getConcept } from "../concepts";
import { Mascot } from "../mascot";
import { swatchHex, tintHex } from "../palette";
import { Rubric, Tile } from "./controls";

/**
 * Berries and mushrooms — the forest floor.
 *
 * Two concepts rather than one, and this page is where that decision is meant
 * to be judged rather than read about: the seven forms stand in one row, and
 * either the split reads as two families sharing a world or it reads as one
 * family that was cut in half for no reason.
 *
 * The sections after it are each a single question:
 *
 * - **Does colour alone tell two characters apart?** The two reds and the two
 *   chanterelles are the same drawing twice, in a different colourway. If they
 *   are not nameable side by side, the ruling that colour carries distinction
 *   is wrong and these two species are built on it.
 * - **Does any of it survive 40 pixels?** The bust row, uncaptioned, at the
 *   size a participant list actually renders.
 * - **Do they belong somewhere?** The forest-night scene is these two casts'
 *   home, and a species that only works on an empty background is decoration.
 */

const BERRIES = ["mustikka", "puolukka", "lakka", "mansikka"];
const MUSHROOMS: readonly { form: string; variant: string }[] = [
  { form: "kantarelli", variant: "kantarelli" },
  { form: "tatti", variant: "tatti" },
  { form: "karpassieni", variant: "karpassieni" },
];

/** One form at whatever size the row wants, with its own colourway on it. */
function Pick({
  concept,
  form,
  variant,
  size,
  caption,
  sub,
  scene,
}: {
  concept: "marja" | "sieni";
  form: string;
  variant: string;
  size: number;
  caption: string;
  sub?: string;
  scene?: boolean;
}): ReactElement {
  return (
    <Tile caption={caption} {...(sub === undefined ? {} : { sub })}>
      <Mascot
        concept={concept}
        form={form}
        variant={variant}
        size={size}
        {...(scene === true ? { outfit: { scene: "forest-night" } } : {})}
      />
    </Tile>
  );
}

/** The uncaptioned bust — the only honest version of the small-size test. */
function Bust({
  concept,
  form,
  variant,
}: {
  concept: "marja" | "sieni";
  form: string;
  variant: string;
}): ReactElement {
  return (
    <span className="overflow-hidden rounded-full border border-border bg-background">
      <Mascot concept={concept} form={form} variant={variant} size={40} crop="bust" />
    </span>
  );
}

function FleetRow({ concept }: { concept: "marja" | "sieni" }): ReactElement {
  const def = getConcept(concept);
  return (
    <div className="flex flex-wrap gap-4 rounded-lg border border-border bg-background p-4">
      {def.fleet.map((member) => (
        <figure key={member.name} className="w-56 space-y-2">
          <div className="flex items-end justify-center rounded-lg bg-muted/40 py-2">
            <Mascot
              concept={concept}
              {...(member.form === undefined ? {} : { form: member.form })}
              variant={member.variantId}
              role={member.role}
              pose={member.pose}
              expression={member.expression}
              {...(member.prop === undefined ? {} : { prop: member.prop })}
              colors={
                member.garment === undefined
                  ? {}
                  : {
                      clothing: swatchHex(member.garment),
                      clothingAccent: tintHex(swatchHex(member.garment), 0.84),
                    }
              }
              size={132}
            />
          </div>
          <figcaption className="space-y-1">
            <p className="text-sm font-semibold text-foreground">{member.name}</p>
            <p className="text-[11px] uppercase tracking-wide text-primary">{member.job}</p>
            <p className="text-xs leading-relaxed text-muted-foreground">{member.blurb}</p>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

export function BerriesAndMushrooms(): ReactElement {
  const marja = getConcept("marja");
  const sieni = getConcept("sieni");
  const formLabel = (concept: "marja" | "sieni", id: string): string =>
    (concept === "marja" ? marja : sieni).forms?.find((f) => f.id === id)?.label ?? id;

  return (
    <Card>
      <CardContent className="space-y-8 p-6">
        <div>
          <h3 className="text-xl font-bold tracking-tight text-foreground">
            Marja and Sieni — the forest floor
          </h3>
          <p className="mt-1 max-w-4xl text-sm leading-relaxed text-muted-foreground">
            Seven characters, one flat colour block each. The berries keep one green constant and
            vary the fruit; the mushrooms keep one cream constant and vary the cap. Both are the
            simplicity ruling stated as a species rather than applied to one — there is nothing on
            any of these bodies to take off.
          </p>
        </div>

        <section>
          <Rubric
            title="All seven, together"
            note="Two concepts and not one: a berry is a ball that is its own head, a mushroom is mostly head. Judge the split here."
          />
          <div className="flex flex-wrap items-end gap-4 rounded-lg border border-border bg-background p-4">
            {BERRIES.map((form) => (
              <Pick
                key={form}
                concept="marja"
                form={form}
                variant={form}
                size={140}
                caption={formLabel("marja", form)}
              />
            ))}
            {MUSHROOMS.map((m) => (
              <Pick
                key={m.form}
                concept="sieni"
                form={m.form}
                variant={m.variant}
                size={140}
                caption={formLabel("sieni", m.form)}
              />
            ))}
          </div>
        </section>

        <section>
          <Rubric
            title="Colour, doing the work detail is not allowed to do"
            note="Each pair is the same drawing twice. If a pair is not nameable apart, the ruling these two species are built on is wrong."
          />
          <div className="flex flex-wrap items-end gap-6 rounded-lg border border-border bg-background p-4">
            <Pick
              concept="marja"
              form="puolukka"
              variant="puolukka"
              size={120}
              caption="Puolukka"
              sub="the zone red, a quarter down"
            />
            <Pick
              concept="marja"
              form="mansikka"
              variant="mansikka"
              size={120}
              caption="Mansikka"
              sub="the zone red, untouched"
            />
            <span className="w-6" />
            <Pick
              concept="sieni"
              form="kantarelli"
              variant="kantarelli"
              size={120}
              caption="Kantarelli"
              sub="amber cap, amber stem"
            />
            <Pick
              concept="sieni"
              form="kantarelli"
              variant="vahvero"
              size={120}
              caption="Vahvero"
              sub="the same form, tinted, on the shared cream"
            />
            <span className="w-6" />
            <Pick
              concept="marja"
              form="mustikka"
              variant="vadelma"
              size={120}
              caption="Vadelma"
              sub="a colourway with no form of its own"
            />
          </div>
        </section>

        <section>
          <Rubric
            title="The 40-pixel test"
            note="No captions on purpose. This is the size a participant list renders, and the question is whether you can name any of them without being told."
          />
          <div className="flex flex-wrap gap-2 rounded-lg border border-border bg-background p-4">
            {BERRIES.map((form) => (
              <Bust key={form} concept="marja" form={form} variant={form} />
            ))}
            <Bust concept="marja" form="mustikka" variant="vadelma" />
            {MUSHROOMS.map((m) => (
              <Bust key={m.form} concept="sieni" form={m.form} variant={m.variant} />
            ))}
            <Bust concept="sieni" form="kantarelli" variant="vahvero" />
          </div>
        </section>

        <section>
          <Rubric
            title="Where they live"
            note="The forest-night scene the pen-line species built. These two casts are the ones it was always going to be a home for rather than a backdrop."
          />
          <div className="flex flex-wrap items-end gap-4 rounded-lg border border-border bg-background p-4">
            <Pick
              concept="marja"
              form="mustikka"
              variant="mustikka"
              size={200}
              caption="Mustis on the bank"
              scene
            />
            <Pick
              concept="marja"
              form="lakka"
              variant="lakka"
              size={200}
              caption="Hilla on the bog"
              scene
            />
            <Pick
              concept="sieni"
              form="karpassieni"
              variant="karpassieni"
              size={200}
              caption="Kärpi, admired from a distance"
              scene
            />
            <Pick
              concept="sieni"
              form="tatti"
              variant="tatti"
              size={200}
              caption="Tatu under the spruces"
              scene
            />
          </div>
        </section>

        <section>
          <Rubric
            title="Marja — the fleet"
            note="One member per role, and the berry each role got is an argument rather than a colour swap."
          />
          <FleetRow concept="marja" />
        </section>

        <section>
          <Rubric
            title="Sieni — the fleet"
            note="Three caps, four members: the gedu and the gamer are the same form in two colourways, which is the point."
          />
          <FleetRow concept="sieni" />
        </section>
      </CardContent>
    </Card>
  );
}
