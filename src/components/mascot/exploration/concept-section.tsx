/* eslint-disable i18next/no-literal-string -- throwaway developer-facing design-exploration surface; every string here is a caption on a page no user will ever see and that gets deleted with the exploration */
"use client";

import type { ReactElement } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";

import { accessory, accessoryFits } from "../accessories";
import type { ConceptId } from "../concept";
import { getConcept } from "../concepts";
import { Mascot } from "../mascot";
import { OUTFIT_PRESETS } from "../outfit";
import { PALETTE_PRESETS } from "../palette";
import {
  EXPRESSION_LABELS,
  MASCOT_EXPRESSIONS,
  MASCOT_POSES,
  POSE_LABELS,
  ROLE_LABELS,
  type MascotRole,
} from "../vocabulary";
import { Rubric, Tile } from "./controls";

/** The sizes the scale ladder walks, smallest first. */
const LADDER = [16, 24, 32, 48, 64, 128];

const LINEUP: MascotRole[] = ["gamer", "parent", "gedu"];

function paletteFor(id: string) {
  return PALETTE_PRESETS.find((p) => p.id === id)?.colors ?? {};
}

/**
 * Takes the concept *id*, not its definition: the page is a server component
 * and a definition carries React components (`Body`, `Head`, `Crown`), which
 * cannot cross the server→client boundary. The lookup happens here, on the
 * client, against the same registry.
 */
export function ConceptSection({ conceptId }: { conceptId: ConceptId }): ReactElement {
  const def = getConcept(conceptId);
  const primary = def.variants[0];
  return (
    <Card id={def.id} className="scroll-mt-24 overflow-hidden">
      <CardContent className="space-y-10 p-6">
        {/* --- identity ------------------------------------------------- */}
        <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
          <div className="flex items-end justify-center rounded-xl border border-border bg-background p-4">
            <Mascot
              concept={def.id}
              variant={primary.id}
              pose="wave"
              expression="excited"
              size={288}
            />
          </div>
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <h3 className="text-3xl font-bold tracking-tight text-foreground">{def.species}</h3>
              <Badge variant={def.origin === "yty" ? "secondary" : "outline"}>
                {def.origin === "yty" ? "Yty-compatible" : "Fresh lore"}
              </Badge>
            </div>
            <p className="text-sm font-medium text-primary">{def.kind}</p>
            <p className="text-sm leading-relaxed text-foreground/90">{def.pitch}</p>
            <dl className="grid gap-2 text-xs sm:grid-cols-2">
              <div className="rounded-md border border-border bg-muted/40 p-3">
                <dt className="mb-1 font-semibold uppercase tracking-wide text-muted-foreground">
                  Honest caveat
                </dt>
                <dd className="text-foreground/80">{def.caveat}</dd>
              </div>
              <div className="rounded-md border border-border bg-muted/40 p-3">
                <dt className="mb-1 font-semibold uppercase tracking-wide text-muted-foreground">
                  Carries the identity at 24px
                </dt>
                <dd className="text-foreground/80">{def.landmark}</dd>
              </div>
            </dl>
            <div className="rounded-md border border-border bg-muted/40 p-3 text-xs">
              <p className="mb-1 font-semibold uppercase tracking-wide text-muted-foreground">
                Wardrobe
              </p>
              <p className="text-foreground/80">{def.wardrobeLimit}</p>
            </div>
          </div>
        </div>

        {/* --- colourways ----------------------------------------------- */}
        <section>
          <Rubric
            title="Colourways"
            note="Named palettes on the base model. Nothing here touches the silhouette."
          />
          <div className="flex flex-wrap gap-4">
            {def.variants.map((variant) => (
              <Tile key={variant.id} caption={variant.label} sub={variant.note}>
                <Mascot concept={def.id} variant={variant.id} pose="idle" size={124} />
              </Tile>
            ))}
          </div>
        </section>

        {/* --- poses ----------------------------------------------------- */}
        <section>
          <Rubric
            title="Pose sheet"
            note="One shared pose table drives all five species — these are the same eleven entries."
          />
          <div className="flex flex-wrap gap-3">
            {MASCOT_POSES.map((pose) => (
              <Tile key={pose} caption={POSE_LABELS[pose]}>
                <Mascot concept={def.id} pose={pose} size={116} />
              </Tile>
            ))}
          </div>
        </section>

        {/* --- expressions ---------------------------------------------- */}
        <section>
          <Rubric title="Expressions" note="An eye swap and a mouth swap. Nothing else moves." />
          <div className="flex flex-wrap gap-3">
            {MASCOT_EXPRESSIONS.map((expression) => (
              <Tile key={expression} caption={EXPRESSION_LABELS[expression]}>
                <Mascot
                  concept={def.id}
                  pose="idle"
                  expression={expression}
                  size={116}
                  crop="bust"
                />
              </Tile>
            ))}
          </div>
        </section>

        {/* --- the three roles ------------------------------------------ */}
        <section>
          <Rubric
            title="Standing in for a person"
            note="The reason this exists: no child's photograph goes on the site, so one base model has to be able to be all three."
          />
          <div className="flex flex-wrap gap-4">
            {LINEUP.map((role) => (
              <Tile key={role} caption={ROLE_LABELS[role]}>
                <Mascot concept={def.id} role={role} pose="idle" size={150} />
              </Tile>
            ))}
          </div>
        </section>

        {/* --- dress-up -------------------------------------------------- */}
        <section>
          <Rubric
            title="Dress-up"
            note="Layered outfits over one unchanged identity core. Items a species cannot wear are simply not drawn."
          />
          <div className="flex flex-wrap gap-4">
            {OUTFIT_PRESETS.map((preset) => {
              // A species that cannot wear part of a look says why, rather than
              // silently rendering a look that is missing a piece.
              const refused = Object.values(preset.outfit).flatMap((id) => {
                const item = accessory(id);
                return item !== undefined && !accessoryFits(item, def.id) ? [item] : [];
              });
              return (
                <Tile
                  key={preset.id}
                  caption={preset.label}
                  sub={
                    refused.length > 0
                      ? refused
                          .map((item) => `no ${item.label.toLowerCase()} — ${item.incapableBecause ?? ""}`)
                          .join(" ")
                      : undefined
                  }
                >
                  <Mascot
                    concept={def.id}
                    pose="idle"
                    expression="happy"
                    outfit={preset.outfit}
                    colors={paletteFor(preset.paletteId)}
                    size={140}
                  />
                </Tile>
              );
            })}
          </div>
        </section>

        {/* --- scale ----------------------------------------------------- */}
        <section>
          <Rubric
            title="Scale ladder"
            note="Detail drops out as the render shrinks: filigree below 96px, props and small face items below 40px. Note where the whole figure stops working — that is what the avatar crop beside it is for."
          />
          <div className="flex flex-wrap items-end gap-5 rounded-lg border border-border bg-background p-4">
            {LADDER.map((size) => (
              <figure key={size} className="flex flex-col items-center gap-1.5">
                <Mascot concept={def.id} role="gamer" pose="idle" size={size} />
                <figcaption className="text-[11px] text-muted-foreground">{size}px</figcaption>
              </figure>
            ))}
            <figure className="flex flex-col items-center gap-1.5">
              <Mascot concept={def.id} role="gamer" pose="idle" size={288} />
              <figcaption className="text-[11px] text-muted-foreground">288px (hero)</figcaption>
            </figure>
          </div>
        </section>

        {/* --- silhouette + avatars -------------------------------------- */}
        <section className="grid gap-6 md:grid-cols-2">
          <div>
            <Rubric
              title="Silhouette test"
              note="If the flat shape is unrecognisable, the identity is living in the detail."
            />
            <div className="flex flex-wrap gap-4">
              <Tile caption="Full">
                <Mascot concept={def.id} pose="idle" size={150} />
              </Tile>
              <Tile caption="Flattened" tone="paper">
                <Mascot concept={def.id} pose="idle" size={150} silhouette animated={false} />
              </Tile>
            </div>
          </div>
          <div>
            <Rubric
              title="Avatar crop"
              note="The same drawing, framed on the head. This is how it appears beside a name."
            />
            <div className="flex flex-wrap items-end gap-4">
              {[
                { size: 32, crop: "bust" as const, caption: "32px bust" },
                { size: 48, crop: "bust" as const, caption: "48px bust" },
                { size: 48, crop: "head" as const, caption: "48px head" },
                { size: 72, crop: "bust" as const, caption: "72px bust" },
              ].map((spec) => (
                <figure
                  key={spec.caption}
                  className="flex flex-col items-center gap-1.5"
                >
                  <span className="overflow-hidden rounded-full border border-border bg-muted">
                    <Mascot
                      concept={def.id}
                      role="gamer"
                      pose="idle"
                      size={spec.size}
                      crop={spec.crop}
                    />
                  </span>
                  <figcaption className="text-[11px] text-muted-foreground">
                    {spec.caption}
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>

        {/* --- the fleet -------------------------------------------------- */}
        <section>
          <Rubric title="The fleet" note="Four named characters off one base model." />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {def.fleet.map((member) => (
              <div
                key={member.name}
                className="flex flex-col items-center gap-2 rounded-lg border border-border bg-background p-4 text-center"
              >
                <Mascot
                  concept={def.id}
                  variant={member.variantId}
                  role={member.role}
                  pose={member.pose}
                  expression={member.expression}
                  prop={member.prop}
                  size={132}
                />
                <p className="text-base font-semibold text-foreground">{member.name}</p>
                <p className="text-xs font-medium text-primary">{member.job}</p>
                <p className="text-xs leading-relaxed text-muted-foreground">{member.blurb}</p>
              </div>
            ))}
          </div>
        </section>
      </CardContent>
    </Card>
  );
}
