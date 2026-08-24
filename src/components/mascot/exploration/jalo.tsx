/* eslint-disable i18next/no-literal-string -- throwaway developer-facing design-exploration surface; every string here is a caption on a page no user will ever see and that gets deleted with the exploration */
"use client";

import type { ReactElement } from "react";

import { Card, CardContent } from "@/components/ui/card";

import { getConcept } from "../concepts";
import { GEM_CHEVRON, GEM_PATH } from "../concepts/jalo";
import { Mascot } from "../mascot";
import { swatchHex, tintHex } from "../palette";
import { Rubric } from "./controls";

/**
 * Jalo — the brand mark with a face, and the two questions it has to answer.
 *
 * **One: does it read as the mark?** The bust crop is the favicon's own
 * framing of the favicon's own path, so the last row here puts them side by
 * side at the sizes each is actually used at — a 64, 40 and 28 pixel avatar
 * against a 32 and 16 pixel browser tab. Nothing on this page is a drawing of
 * the logo; the hexagon in every one of these figures is the same path string
 * as the one in the tab.
 *
 * **Two: does a species whose identity is a brand colour survive being
 * repainted?** Twenty-six colourways say the honest answer out loud. The
 * amber is the mark, the purple is the other half of the brand, and the
 * twenty-four swatch bodies are a green hexagon with eyes — which is a
 * different company's logo rather than a different member of ours. They are
 * shown because the argument is worth having in front of the pictures rather
 * than in prose.
 */

/** The colours the mark itself is cut in, read off the species' first colourway. */
function markColours(): { amber: string; ink: string } {
  const jalo = getConcept("jalo").variants[0].colors;
  return { amber: jalo.bodyTop, ink: jalo.pupil };
}

/** The real favicon candidate, at the size a browser tab renders it. */
function Favicon({ size, chevron }: { size: number; chevron: boolean }): ReactElement {
  const { amber, ink } = markColours();
  return (
    <svg width={size} height={size} viewBox="0 0 128 128" aria-hidden>
      <path d={GEM_PATH} fill={amber} />
      {chevron && (
        <path
          d={GEM_CHEVRON}
          fill="none"
          stroke={ink}
          strokeWidth={15}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}
    </svg>
  );
}

function Tile({ label, children }: { label: string; children: ReactElement }): ReactElement {
  return (
    <figure className="flex flex-col items-center gap-1">
      {children}
      <figcaption className="text-[10px] leading-tight text-muted-foreground">{label}</figcaption>
    </figure>
  );
}

const CREST_SPECIES: readonly { concept: "kaveri" | "porukka" | "otso" | "palikka" | "jalo"; form?: string; variant: string; label: string }[] = [
  { concept: "kaveri", variant: "teal", label: "Kaveri" },
  { concept: "porukka", form: "adult-a", variant: "ruis", label: "Porukka" },
  { concept: "otso", form: "bear", variant: "honey", label: "Otso" },
  { concept: "palikka", form: "trex", variant: "oliivi", label: "Palikka" },
  { concept: "jalo", variant: "jalo", label: "Jalo" },
];

export function JaloStudy(): ReactElement {
  const def = getConcept("jalo");

  return (
    <Card>
      <CardContent className="space-y-8 p-6">
        <div>
          <h3 className="text-xl font-bold tracking-tight text-foreground">
            Jalo — the brand mark that grew feet
          </h3>
          <p className="mt-1 max-w-4xl text-sm leading-relaxed text-muted-foreground">
            The body is the favicon candidate&apos;s own hexagon path, translated into the mascot
            canvas and not scaled or redrawn. Everything below is that one path with a face on it.
          </p>
        </div>

        <section>
          <Rubric
            title="The two brand pairs, then every swatch"
            note="The amber under the near-black its chevron is cut in; the white-on-purple candidate; then the twenty-four colours the product already owns, hatted in a repeating cycle so no two neighbours match."
          />
          <div className="flex flex-wrap items-end gap-4 rounded-lg border border-border bg-background p-4">
            {def.variants.map((variant, i) => (
              <Tile key={variant.id} label={variant.label}>
                <Mascot
                  concept="jalo"
                  variant={variant.id}
                  size={96}
                  outfit={i % 3 === 1 ? { hat: "beanie" } : i % 3 === 2 ? { hat: "swept-cap" } : {}}
                />
              </Tile>
            ))}
          </div>
        </section>

        <section>
          <Rubric
            title="The fleet"
            note="An introducer holding the mark's own chevron, a gamer, a parent, a Gedu, and the Chief Engineer candidate this species puts up."
          />
          <div className="flex flex-wrap items-end gap-6 rounded-lg border border-border bg-background p-4">
            {def.fleet.map((member) => (
              <figure key={member.name} className="flex w-52 flex-col items-center gap-1">
                <Mascot
                  concept="jalo"
                  variant={member.variantId}
                  role={member.role}
                  pose={member.pose}
                  expression={member.expression}
                  prop={member.prop}
                  colors={
                    member.garment === undefined
                      ? {}
                      : {
                          clothing: swatchHex(member.garment),
                          clothingAccent: tintHex(swatchHex(member.garment), 0.84),
                        }
                  }
                  outfit={member.outfit}
                  size={200}
                />
                <figcaption className="text-center">
                  <span className="block text-base font-semibold text-foreground">
                    {member.name}
                  </span>
                  <span className="block text-xs font-medium text-primary">{member.job}</span>
                </figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section>
          <Rubric
            title="The bust against the browser tab"
            note="Left: the avatar at 64, 40 and 28. Right: the favicon candidate at 32 and 16, with and without its chevron. Same path, same framing — the only difference is that one of them has a face and two feet under its chin."
          />
          <div className="flex flex-wrap items-end gap-6 rounded-lg border border-border bg-background p-4">
            {[64, 40, 28].map((size) => (
              <Tile key={size} label={`bust ${size}`}>
                <span className="overflow-hidden rounded-full border border-border bg-background">
                  <Mascot concept="jalo" variant="jalo" size={size} crop="bust" />
                </span>
              </Tile>
            ))}
            <span className="mx-2 h-16 w-px bg-border" />
            <Tile label="favicon 32">
              <Favicon size={32} chevron />
            </Tile>
            <Tile label="favicon 16">
              <Favicon size={16} chevron />
            </Tile>
            <Tile label="bare 32">
              <Favicon size={32} chevron={false} />
            </Tile>
            <Tile label="bare 16">
              <Favicon size={16} chevron={false} />
            </Tile>
            <span className="mx-2 h-16 w-px bg-border" />
            {["secondary", "cyan", "pink"].map((variant) => (
              <Tile key={variant} label={`${variant} 40`}>
                <span className="overflow-hidden rounded-full border border-border bg-background">
                  <Mascot concept="jalo" variant={variant} size={40} crop="bust" />
                </span>
              </Tile>
            ))}
          </div>
        </section>

        <section>
          <Rubric
            title="The crest, on five species"
            note="The stripe-S on the badge field, fitted to whatever chest box the species has. The letter needs about a fifth of the body's width to survive, so it is drawn from 96 pixels up and the badge alone carries it below that."
          />
          <div className="flex flex-wrap items-end gap-4 rounded-lg border border-border bg-background p-4">
            {CREST_SPECIES.map((s) => (
              <Tile key={s.label} label={s.label}>
                <Mascot
                  concept={s.concept}
                  {...(s.form === undefined ? {} : { form: s.form })}
                  variant={s.variant}
                  outfit={{ torso: "sog-crest" }}
                  colors={{ clothing: swatchHex("purple"), clothingAccent: swatchHex("amber") }}
                  size={120}
                />
              </Tile>
            ))}
          </div>
        </section>

        <section>
          <Rubric
            title="The rest of the brand-motif pass"
            note="The chevron held as a pointer, the wordmark's corner radius on the boards a character carries, and the two hats off the legacy sog.gg site — the SOG beanie and Reksi's crown."
          />
          <div className="flex flex-wrap items-end gap-4 rounded-lg border border-border bg-background p-4">
            <Tile label="chevron prop">
              <Mascot
                concept="jalo"
                variant="jalo"
                pose="point-right"
                expression="excited"
                prop="chevron"
                size={150}
              />
            </Tile>
            <Tile label="sign board">
              <Mascot concept="jalo" variant="jalo" pose="hold-up" prop="sign" size={150} />
            </Tile>
            <Tile label="half-painted board">
              <Mascot
                concept="silmu"
                variant="musta"
                pose="painting"
                prop="paintbrush"
                outfit={{ scene: "sign-painting" }}
                size={150}
              />
            </Tile>
            <Tile label="SOG beanie">
              <Mascot
                concept="silmu"
                variant="musta"
                outfit={{ hat: "cap" }}
                colors={{ clothing: swatchHex("amber"), clothingAccent: swatchHex("orange") }}
                size={150}
              />
            </Tile>
            <Tile label="crown — voxel Reksi">
              <Mascot
                concept="palikka"
                form="trex"
                variant="oliivi"
                pose="wave"
                outfit={{ hat: "crown", face: "shades" }}
                colors={{ clothing: swatchHex("purple"), clothingAccent: swatchHex("amber") }}
                size={150}
              />
            </Tile>
            <Tile label="crown — human Reksi">
              <Mascot
                concept="kaveri"
                form="elder-b"
                variant="lilac"
                prop="briefcase"
                outfit={{ hat: "crown", face: "shades" }}
                colors={{ clothing: swatchHex("purple"), clothingAccent: swatchHex("amber") }}
                size={150}
              />
            </Tile>
          </div>
        </section>
      </CardContent>
    </Card>
  );
}
