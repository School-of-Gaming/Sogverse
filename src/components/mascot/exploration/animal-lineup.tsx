/* eslint-disable i18next/no-literal-string -- throwaway developer-facing design-exploration surface; every string here is a caption on a page no user will ever see and that gets deleted with the exploration */
"use client";

import { useState, type ReactElement } from "react";

import { getConcept } from "../concepts";
import { OTSO_FORMS } from "../concepts/otso";
import { Mascot } from "../mascot";
import { ChipRow, Panel, type Choice } from "./controls";


export function AnimalLineup(): ReactElement {
  const [variant, setVariant] = useState("honey");
  const variants: Choice<string>[] = getConcept("otso").variants.map((v) => ({
    id: v.id,
    label: v.label,
  }));
  return (
    <Panel
      title="Otso is a family, not a bear"
      lede="A pose sheet is per body plan, not per animal — a bear, a fox, a lynx, a hare, a moose and an owl are all “round torso, four limbs, head on top”, differing above the neck and in one appendage. So an extra species costs a head and a tail, about thirty lines, and seven of them cost less than two whole concepts did. The ringed seal is the deliberate exception: no ears, no tail, and a silhouette that fights the rig."
    >
      <ChipRow label="Coat" options={variants} value={variant} onChange={setVariant} />
      <div className="flex flex-wrap items-end justify-center gap-2 rounded-xl border border-border bg-background p-4">
        {OTSO_FORMS.map((form) => (
          <figure key={form.id} className="flex w-[9.5rem] flex-col items-center gap-1">
            <Mascot concept="otso" form={form.id} variant={variant} size={168} />
            <figcaption className="text-center text-[11px] leading-tight text-muted-foreground">
              <span className="block font-medium text-foreground">{form.label}</span>
              {form.note}
            </figcaption>
          </figure>
        ))}
      </div>
      <div className="flex flex-wrap items-end justify-center gap-2 rounded-xl border border-border bg-background p-4">
        <Mascot concept="otso" form="fox" role="gamer" pose="seated" outfit={{ scene: "desk" }} expression="focused" size={210} />
        <Mascot concept="otso" form="owl" role="gedu" pose="reading" expression="thinking" size={190} />
        <Mascot concept="otso" form="seal" role="parent" pose="idle" prop="mug" size={190} />
        <Mascot concept="otso" form="hare" pose="jumping" expression="laughing" size={190} />
        <Mascot concept="otso" form="lynx" pose="walking" expression="focused" size={190} />
      </div>
    </Panel>
  );
}

