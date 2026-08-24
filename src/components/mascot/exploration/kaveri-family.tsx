/* eslint-disable i18next/no-literal-string -- throwaway developer-facing design-exploration surface; every string here is a caption on a page no user will ever see and that gets deleted with the exploration */
"use client";

import { useState, type ReactElement } from "react";

import { getConcept } from "../concepts";
import { KAVERI_FORMS } from "../concepts/kaveri";
import { Mascot } from "../mascot";
import { ChipRow, Panel, Rubric, type Choice } from "./controls";


export function KaveriFamily(): ReactElement {
  const [variant, setVariant] = useState("lilac");
  const variants: Choice<string>[] = getConcept("kaveri").variants.map((v) => ({
    id: v.id,
    label: v.label,
  }));
  return (
    <Panel
      title="The Kaveri family"
      lede="Three kid builds and three adult ones, cued by hair silhouette, build and garment cut — and by nothing else. No makeup on one and not another, no colour coding, no skirt. Each build leans; none of them commits, which is the property worth keeping: a gamer should be able to look at the three kids and decide for themselves which one is them."
    >
      <ChipRow label="Complexion" options={variants} value={variant} onChange={setVariant} />
      <div className="flex flex-wrap items-end justify-center gap-2 rounded-xl border border-border bg-background p-4">
        {KAVERI_FORMS.map((form) => (
          <figure key={form.id} className="flex w-[10.5rem] flex-col items-center gap-1">
            <Mascot concept="kaveri" form={form.id} variant={variant} size={190} />
            <figcaption className="text-center text-[11px] leading-tight text-muted-foreground">
              <span className="block font-medium text-foreground">{form.label}</span>
              {form.note}
            </figcaption>
          </figure>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="rounded-xl border border-border bg-background p-4">
          <Rubric
            title="A session, as a picture"
            note="A gamer at the desk and their gedu beside it — the shot the site has no photograph for."
          />
          <div className="flex flex-wrap items-end justify-center">
            <Mascot
              concept="kaveri"
              form="adult-b"
              variant="teal"
              role="gedu"
              pose="point-left"
              expression="happy"
              size={300}
            />
            <Mascot
              concept="kaveri"
              form="kid-b"
              variant={variant}
              role="gamer"
              pose="seated"
              expression="excited"
              outfit={{ scene: "desk-setup" }}
              size={340}
            />
          </div>
        </div>
        <div className="rounded-xl border border-border bg-background p-4">
          <Rubric title="A family" note="Same drawing, four people." />
          <div className="flex flex-wrap items-end justify-center">
            <Mascot concept="kaveri" form="adult-a" variant="coral" role="parent" size={150} />
            <Mascot concept="kaveri" form="kid-a" variant={variant} role="gamer" size={132} />
            <Mascot concept="kaveri" form="kid-c" variant="teal" pose="jumping" expression="laughing" size={132} />
            <Mascot concept="kaveri" form="adult-c" variant="lilac" role="parent" prop="phone" size={150} />
          </div>
        </div>
      </div>
    </Panel>
  );
}

