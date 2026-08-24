/* eslint-disable i18next/no-literal-string -- throwaway developer-facing design-exploration surface; every string here is a caption on a page no user will ever see and that gets deleted with the exploration */
"use client";

/**
 * Dressing up: the two studies about what a character puts on and sits at,
 * as opposed to what it is. Both are species-agnostic on purpose — a desk and
 * a calendar have to work for every base model or they are not a system.
 */

import { useState, type ReactElement } from "react";

import type { ConceptId } from "../concept";
import { getConcept } from "../concepts";
import { Mascot } from "../mascot";
import { lookForDate, MASCOT_LOOKS, SEASONS } from "../seasons";
import { ChipRow, Panel, STUDY_SPECIES } from "./controls";


export function DeskScene(): ReactElement {
  const [concept, setConcept] = useState<ConceptId>("kaveri");
  const def = getConcept(concept);
  const form = def.forms?.[1]?.id ?? def.forms?.[0]?.id;
  return (
    <Panel
      title="At a desk"
      lede="A keyboard and mouse held in mid-air read as a character who had picked them up. Nothing was wrong with the props — what was missing was the desk. Furniture is a scene layer rather than a garment: it draws a chair behind the character and a surface in front, outside every motion group, so it composes with any species and does not breathe along with the person sitting at it."
    >
      <ChipRow label="Species" options={STUDY_SPECIES} value={concept} onChange={setConcept} />
      <div className="flex flex-wrap items-end justify-center gap-4 rounded-xl border border-border bg-background p-6">
        <Mascot
          concept={concept}
          {...(form === undefined ? {} : { form })}
          role="gamer"
          pose="seated"
          expression="excited"
          outfit={{ scene: "desk-setup" }}
          size={420}
        />
        <div className="flex flex-wrap items-end gap-2">
          <Mascot concept={concept} {...(form === undefined ? {} : { form })} pose="seated" expression="focused" outfit={{ scene: "desk" }} size={200} />
          <Mascot
            concept={concept}
            {...(form === undefined ? {} : { form })}
            pose="seated"
            prop="laptop"
            expression="thinking"
            outfit={{ scene: "desk" }}
            size={200}
          />
          <Mascot
            concept={concept}
            {...(form === undefined ? {} : { form })}
            role="gedu"
            pose="seated"
            prop="clipboard"
            outfit={{ scene: "desk-setup" }}
            size={200}
          />
        </div>
      </div>
    </Panel>
  );
}


export function SeasonStrip(): ReactElement {
  const [concept, setConcept] = useState<ConceptId>("kaveri");
  // Resolved during render on both sides of the boundary. `lookForDate`
  // depends only on the Helsinki *calendar date*, so a server render and the
  // hydration that follows it agree unless the two land either side of
  // midnight in Helsinki — which is a millisecond a year and costs a
  // highlight, not a layout.
  const todayId = lookForDate(new Date()).id;

  const def = getConcept(concept);
  const form = def.forms?.[0]?.id;

  return (
    <Panel
      title="Four seasons, six days that matter, and one function"
      lede="A season that only recolours a shirt is invisible on a character wearing no shirt — which is exactly why the round-one palette control appeared to do nothing. A look here is a hat, a scarf, something on the ground and, in summer, a mosquito. `lookForDate` is pure, resolves against the Europe/Helsinki calendar date, and is what a product surface calls when it wants to say “dress for today” and never think about the calendar again."
    >
      <ChipRow label="Species" options={STUDY_SPECIES} value={concept} onChange={setConcept} />
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-background p-4">
        {MASCOT_LOOKS.map((look) => {
          const isToday = look.id === todayId;
          const isSeason = (SEASONS as readonly string[]).includes(look.id);
          return (
            <figure
              key={look.id}
              className={`flex w-[9.5rem] flex-col items-center gap-1 rounded-lg border p-2 ${
                isToday ? "border-primary bg-primary/10" : "border-transparent"
              }`}
            >
              <Mascot
                concept={concept}
                {...(form === undefined ? {} : { form })}
                look={look.id}
                pose={isSeason ? "idle" : "wave"}
                expression="happy"
                size={150}
              />
              <figcaption className="text-center text-[11px] leading-tight text-muted-foreground">
                <span className="block font-medium text-foreground">
                  {look.label}
                  {isToday ? " · today" : ""}
                </span>
                {look.note}
              </figcaption>
            </figure>
          );
        })}
      </div>
      <p className="max-w-4xl text-sm leading-relaxed text-muted-foreground">
        The boundaries are a product judgement, written down in one place because Finland has no
        single official answer — the meteorological definition moves every year and by hundreds of
        kilometres of latitude, and the astronomical one puts midsummer at the start of summer,
        which no Finn experiences that way. These are calendar dates matched to how the year is
        lived in the south: <strong className="text-foreground">talvi</strong> 1 Dec – 15 Mar,{" "}
        <strong className="text-foreground">kevät</strong> 16 Mar – 31 May,{" "}
        <strong className="text-foreground">kesä</strong> 1 Jun – 31 Aug,{" "}
        <strong className="text-foreground">syksy</strong> 1 Sep – 30 Nov. A holiday wins over its
        season; Easter is computed, and juhannus is found by looking for the Friday between the
        19th and the 25th of June.
      </p>
    </Panel>
  );
}

