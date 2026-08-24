/* eslint-disable i18next/no-literal-string -- throwaway developer-facing design-exploration surface; every string here is a caption on a page no user will ever see and that gets deleted with the exploration */
"use client";

import type { ReactElement } from "react";

import { Card, CardContent } from "@/components/ui/card";

import { PORUKKA } from "../concepts";
import { Mascot } from "../mascot";
import { PORUKKA_SKIN, shadeHex, swatchHex } from "../palette";
import { Rubric, Tile } from "./controls";

/**
 * Porukka — the age ladder, and the two decisions that need Kyle's eye.
 *
 * This study exists to answer three questions and nothing else:
 *
 * 1. **Does the ladder read?** Five figures at one size, differing only in
 *    height, hair and shoulder width. If a stranger cannot put them in age
 *    order without captions, the whole premise of a "population" concept is
 *    wrong and it should go back to being one figure with builds.
 * 2. **Is it actually simpler than Kaveri?** The two are drawn side by side at
 *    the same 200 px so the comparison is a look rather than an argument. The
 *    claim is that Porukka has six shapes on it and Kaveri has fourteen.
 * 3. **The pink nose dot.** Built behind a switchable slot and shown both ways
 *    at three sizes. See the note above that row.
 *
 * Everything else Porukka can do — poses, expressions, props, outfits, gaze,
 * the grounded idle, the avatar crop — it inherits, and inherited behaviour is
 * shown in the playground and the avatar section rather than duplicated here.
 */

/** The five ages, one build each: the row the concept lives or dies on. */
const LADDER = [
  { form: "baby", label: "Baby", sub: "2.5 heads · sits" },
  { form: "kid-a", label: "Kid", sub: "3.5 heads" },
  { form: "teen-a", label: "Teen", sub: "4 heads" },
  { form: "adult-a", label: "Adult", sub: "4.5 heads" },
  { form: "elder-a", label: "Elder", sub: "4.5 heads, shorter" },
] as const;

/** Every build, so the hair silhouettes can be compared against each other. */
const BUILDS = [
  { form: "kid-a", variant: "noki" },
  { form: "kid-b", variant: "ruis" },
  { form: "teen-a", variant: "kupari" },
  { form: "teen-b", variant: "noki" },
  { form: "adult-a", variant: "puola" },
  { form: "adult-b", variant: "ruis" },
  { form: "elder-a", variant: "usva" },
  { form: "elder-b", variant: "usva" },
  { form: "baby", variant: "kupari" },
] as const;

/**
 * Real stature relative to a grown-up, for the group row.
 *
 * The concept's own rigs compress this hard on purpose: an age's *heads-tall*
 * ratio is what carries drawn age at a single size, and every mascot has to
 * fill its own box because that is how every other surface renders one. The
 * numbers here are the uncompressed truth, read off the reference — a
 * three-year-old really is under half a parent's height — and they belong in
 * the layout rather than in the rig.
 */
const STATURE: Record<string, number> = {
  baby: 0.36,
  "kid-a": 0.56,
  "teen-a": 0.86,
  "adult-a": 1,
  "elder-a": 0.94,
};

const NOSE_SIZES = [200, 64, 40] as const;

/**
 * Engineering gold, mixed here rather than hardcoded: the amber swatch as the
 * hoodie and a deep shade of it as the trousers. Same rule as everywhere else
 * in this module — no colour literal outside the palette.
 */
const ENGINEER_GOLD = {
  clothing: swatchHex("amber"),
  clothingAccent: shadeHex(swatchHex("amber"), 0.52),
};

/**
 * How the dot is turned off: the skin colour in the slot that paints it.
 *
 * Not a second component and not a prop on `<Mascot>` — the nose is painted
 * from `spark`, so setting `spark` to the complexion removes it without
 * changing a single coordinate. Both columns below are therefore literally the
 * same drawing, which is the only way an A/B like this is worth looking at.
 */
const NO_NOSE = { spark: PORUKKA_SKIN };

function label(formId: string): string {
  return PORUKKA.forms?.find((f) => f.id === formId)?.label ?? formId;
}

export function PorukkaFamily(): ReactElement {
  return (
    <Card>
      <CardContent className="space-y-8 p-6">
        <div>
          <h3 className="text-xl font-bold tracking-tight text-foreground">
            Porukka — five ages, six shapes, one impossible complexion
          </h3>
          <p className="mt-1 max-w-4xl text-sm leading-relaxed text-muted-foreground">
            The simplest person the set can hold, built from Mari Huhtala&rsquo;s Terveyskylä
            grammar rather than from her drawings: flat fills, no outline, one unreal yellow skin
            for the whole cast, hair as a single shape, warmth from posture. The proportions are
            measured off the two reference files and written at the top of the concept.
          </p>
        </div>

        <section>
          <Rubric
            title="The ladder"
            note="Height, hair and shoulder width are the only three things that change. Put them in age order without reading the captions."
          />
          <div className="flex flex-wrap items-end gap-4 rounded-lg border border-border bg-background p-4">
            {LADDER.map((entry) => (
              <Tile key={entry.form} caption={entry.label} sub={entry.sub}>
                <Mascot concept="porukka" form={entry.form} variant="noki" size={200} />
              </Tile>
            ))}
          </div>
        </section>

        <section>
          <Rubric
            title="The same five, scaled to real stature"
            note="Every mascot fills its own 200px box, which is right for a hero and wrong for a group. A scene putting a family together scales them; this is what that looks like. The reference's own child is 47% of the adult's height."
          />
          <div className="flex flex-wrap items-end gap-4 rounded-lg border border-border bg-background p-4">
            {LADDER.map((entry) => (
              <Mascot
                key={entry.form}
                concept="porukka"
                form={entry.form}
                variant="noki"
                size={Math.round(200 * STATURE[entry.form])}
              />
            ))}
          </div>
        </section>

        <section>
          <Rubric
            title="Against Kaveri, at the same size"
            note="The other humanoid. Count what is drawn on each: a neck seam, a collar, a placket, a hood roll, a pocket, two drawstrings and four freckles, against head, hair, garment, limbs, hands, feet."
          />
          <div className="flex flex-wrap items-end gap-4 rounded-lg border border-border bg-background p-4">
            <Tile caption="Porukka — kid" sub="six shapes">
              <Mascot concept="porukka" form="kid-a" variant="noki" size={200} />
            </Tile>
            <Tile caption="Kaveri — kid" sub="the round-two humanoid">
              <Mascot concept="kaveri" form="kid-a" variant="lilac" size={200} />
            </Tile>
            <Tile caption="Porukka — adult" sub="six shapes">
              <Mascot concept="porukka" form="adult-a" variant="ruis" size={200} />
            </Tile>
            <Tile caption="Kaveri — adult" sub="the round-two humanoid">
              <Mascot concept="kaveri" form="adult-a" variant="coral" size={200} />
            </Tile>
          </div>
        </section>

        <section>
          <Rubric
            title="The nose dot — Kyle rules"
            note="Same drawing both ways: the dot is painted from a colour slot, and the lower row paints that slot the skin colour. The doc bans nose glints, which are highlights; this is a flat symbol, the same kind of thing the mouth is."
          />
          <div className="space-y-3 rounded-lg border border-border bg-background p-4">
            {NOSE_SIZES.map((size) => (
              <div key={size} className="flex flex-wrap items-end gap-4">
                <span className="w-16 shrink-0 text-[11px] text-muted-foreground">{size}px</span>
                <Tile caption="With" sub={`${size}px`}>
                  <Mascot concept="porukka" form="kid-a" variant="ruis" size={size} crop="bust" />
                </Tile>
                <Tile caption="Without" sub={`${size}px`}>
                  <Mascot
                    concept="porukka"
                    form="kid-a"
                    variant="ruis"
                    size={size}
                    crop="bust"
                    colors={NO_NOSE}
                  />
                </Tile>
                <Tile caption="With" sub="elder, beard">
                  <Mascot concept="porukka" form="elder-b" variant="usva" size={size} crop="bust" />
                </Tile>
                <Tile caption="Without" sub="elder, beard">
                  <Mascot
                    concept="porukka"
                    form="elder-b"
                    variant="usva"
                    size={size}
                    crop="bust"
                    colors={NO_NOSE}
                  />
                </Tile>
              </div>
            ))}
          </div>
        </section>

        <section>
          <Rubric
            title="Every build"
            note="Two hair shapes per age, plus the baby's one wisp. Nothing else differs inside an age band."
          />
          <div className="flex flex-wrap items-end gap-4 rounded-lg border border-border bg-background p-4">
            {BUILDS.map((build) => (
              <Tile key={build.form} caption={label(build.form)}>
                <Mascot concept="porukka" form={build.form} variant={build.variant} size={150} />
              </Tile>
            ))}
          </div>
        </section>

        <section>
          <Rubric
            title="Five colourways, one skin"
            note="Hair and the two garments are all that change. The complexion is the same hex on every member of the fleet, which is the safeguard the whole concept is built on."
          />
          <div className="flex flex-wrap items-end gap-4 rounded-lg border border-border bg-background p-4">
            {PORUKKA.variants.map((variant) => (
              <Tile key={variant.id} caption={variant.label} sub={variant.note}>
                <Mascot concept="porukka" form="adult-b" variant={variant.id} size={150} />
              </Tile>
            ))}
          </div>
        </section>

        <section>
          <Rubric
            title="The fleet"
            note="A household: a kid gamer, her older brother, a parent, a gedu, a grandparent and a baby sibling — plus the Chief Engineer candidate on this body."
          />
          <div className="flex flex-wrap items-end gap-4 rounded-lg border border-border bg-background p-4">
            {PORUKKA.fleet.map((member) => (
              <Tile key={member.name} caption={member.name} sub={member.job}>
                <Mascot
                  concept="porukka"
                  form={member.form}
                  variant={member.variantId}
                  role={member.role}
                  pose={member.pose}
                  expression={member.expression}
                  prop={member.prop}
                  outfit={member.outfit}
                  size={170}
                />
              </Tile>
            ))}
          </div>
        </section>

        <section>
          <Rubric
            title="The Chief Engineer candidate"
            note="Hardhat, engineering-gold hoodie, a rolled drawing. Shown at the sizes it would actually be used at, because the argument for this body is that nothing on it competes with the two things that say what he does."
          />
          <div className="flex flex-wrap items-end gap-4 rounded-lg border border-border bg-background p-4">
            {([220, 150, 96] as const).map((size) => (
              <Tile key={size} caption={`${size}px`}>
                <Mascot
                  concept="porukka"
                  form="adult-b"
                  variant="noki"
                  pose="idle"
                  expression="focused"
                  prop="blueprint"
                  outfit={{ hat: "hardhat", torso: "hoodie" }}
                  colors={ENGINEER_GOLD}
                  size={size}
                />
              </Tile>
            ))}
            {([64, 40, 28] as const).map((size) => (
              <Tile key={`bust-${size}`} caption={`${size}px bust`}>
                <Mascot
                  concept="porukka"
                  form="adult-b"
                  variant="noki"
                  expression="focused"
                  outfit={{ hat: "hardhat" }}
                  size={size}
                  crop="bust"
                />
              </Tile>
            ))}
          </div>
        </section>

        <section>
          <Rubric
            title="At the sizes that matter"
            note="The last two rows are the test. A 40px bust is what a participant list renders; below that only the head shape, the hair block and one colour survive on anything."
          />
          <div className="space-y-3 rounded-lg border border-border bg-background p-4">
            {([64, 40] as const).map((size) => (
              <div key={`full-${size}`} className="flex flex-wrap items-end gap-3">
                <span className="w-20 shrink-0 text-[11px] text-muted-foreground">
                  {size}px full
                </span>
                {LADDER.map((entry) => (
                  <Mascot
                    key={entry.form}
                    concept="porukka"
                    form={entry.form}
                    variant="kupari"
                    size={size}
                  />
                ))}
              </div>
            ))}
            {([64, 40, 28] as const).map((size) => (
              <div key={`bust-${size}`} className="flex flex-wrap items-end gap-3">
                <span className="w-20 shrink-0 text-[11px] text-muted-foreground">
                  {size}px bust
                </span>
                {BUILDS.map((build) => (
                  <Mascot
                    key={build.form}
                    concept="porukka"
                    form={build.form}
                    variant={build.variant}
                    size={size}
                    crop="bust"
                  />
                ))}
              </div>
            ))}
          </div>
        </section>
      </CardContent>
    </Card>
  );
}
