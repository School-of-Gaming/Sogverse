/* eslint-disable i18next/no-literal-string -- throwaway developer-facing design-exploration surface; every string here is a caption on a page no user will ever see and that gets deleted with the exploration */
"use client";

import Image from "next/image";
import type { ReactElement } from "react";

import { Card, CardContent } from "@/components/ui/card";

import { Mascot, type MascotProps } from "../mascot";
import { swatchHex, tintHex } from "../palette";
import { Rubric } from "./controls";

/**
 * Reksi — one character, five bodies, and the question of what makes him him.
 *
 * The CEO of School of Gaming goes by Reksi and is titled the Princi-Pal. The
 * legacy set draws him twice and the two drawings agree about almost nothing:
 * `REKSI.png` is a man with white hair and a full beard, black sunglasses, a
 * purple jacket and a briefcase, and `treksi.png` is an olive voxel
 * Tyrannosaurus with a cream belly and a red mouth block. A third asset — the
 * sog.gg about-us page — draws a grey-blue cartoon T-rex in a small gold crown.
 *
 * So the fleet has him in a T-rex body and in a human one, and the honest
 * question is not which body is better. It is **what a viewer is actually
 * recognising**, because whatever that is has to survive being moved from one
 * body to another or the two are not one character.
 *
 * The page below is that test, run five ways:
 *
 * - **The marks are held constant.** Every figure carries the white beard, the
 *   sunglasses, the purple and the briefcase — the four Kyle names as stable —
 *   and nothing else changes between the two columns except the crown.
 * - **The crown is the variable**, because it is disputed: it appears in one
 *   asset out of thirty-four and Kyle does not recognise it as part of him. It
 *   is carried here as a candidate rather than as identity, and the two columns
 *   are the whole of the argument.
 * - **Every body is shown at 240 and then as a 64, 40 and 28 pixel bust**,
 *   because a fleet member is met at avatar size far more often than at hero
 *   size, and a mark that only works large is not a mark.
 */

/** The garment pair a swatch id resolves to wherever a fleet member is drawn. */
function garment(id: string): { clothing: string; clothingAccent: string } {
  return { clothing: swatchHex(id), clothingAccent: tintHex(swatchHex(id), 0.84) };
}

/**
 * One candidate body, minus the crown.
 *
 * `crownless` is the base and the crowned column adds the hat, rather than the
 * other way round, so that no entry can accidentally differ in a second way.
 */
type Body = {
  id: string;
  name: string;
  /** The one line under the figure. */
  caption: string;
  /** Everything but the hat. */
  props: MascotProps;
  /**
   * A hat this body cannot give up, and therefore the reason it cannot be
   * crowned. Set on exactly one entry, and the collision it records is worth
   * more than the pair it costs: the crown and the costume hood are both `hat`
   * items, so a character wearing one can never wear the other. If the crown
   * survives as identity it needs a slot of its own, because it is the only
   * mark in Reksi's set that competes with a hat.
   */
  fixedHat?: string;
};

const PURPLE = garment("purple");

const BODIES: readonly Body[] = [
  {
    id: "palikka",
    name: "Palikka — the voxel T-rex",
    caption:
      "The build off `treksi.png`, front-facing. Three-tone cubes, a stepped tail, and a head that is now nearly twice the torso — the change this round made, because the red mouth block was doing all the work at 40px.",
    props: {
      concept: "palikka",
      form: "trex",
      variant: "oliivi",
      pose: "wave",
      expression: "happy",
      prop: "briefcase",
      outfit: { face: "beard-shades" },
      colors: PURPLE,
    },
  },
  {
    id: "otso",
    name: "Otso — the rex form",
    caption:
      "The same animal in the family that already has sixteen others: a flat broad skull, a snout hanging below it, no ears, a scalloped back and a thick tapering tail. Grey-blue mixed off the sog.gg drawing's own coat.",
    props: {
      concept: "otso",
      form: "rex",
      variant: "reksi",
      pose: "wave",
      expression: "happy",
      prop: "briefcase",
      outfit: { face: "beard-shades" },
      colors: PURPLE,
    },
  },
  {
    id: "kigurumi",
    name: "Kaveri — the kigurumi",
    caption:
      "The human headmaster inside the dinosaur, which is the only version that is both at once. The hood carries the crest and its own muzzle; the tail is the same costume. Everything under it is the plain elder, unchanged.",
    props: {
      concept: "kaveri",
      form: "elder-b",
      variant: "lilac",
      pose: "wave",
      expression: "excited",
      prop: "briefcase",
      outfit: { face: "shades", back: "rex-tail" },
      colors: garment("sky"),
    },
    fixedHat: "rex-hood",
  },
  {
    id: "kaveri",
    name: "Kaveri — the human elder",
    caption:
      "`REKSI.png` rebuilt: white hair and a full beard drawn into the build, shades, the purple jacket off the colourway's accent slot, briefcase in hand. The one body that can stand next to a parent and be a person.",
    props: {
      concept: "kaveri",
      form: "elder-b",
      variant: "lilac",
      pose: "wave",
      expression: "happy",
      prop: "briefcase",
      outfit: { face: "shades" },
      colors: PURPLE,
    },
  },
  {
    id: "jalo",
    name: "Jalo — the brand gem",
    caption:
      "No animal at all: the company's own mark, wearing the four marks. The sharpest form of the question — if this reads as Reksi then he is a set of marks and any body will carry him.",
    props: {
      concept: "jalo",
      variant: "jalo",
      pose: "wave",
      expression: "happy",
      prop: "briefcase",
      outfit: { face: "beard-shades" },
      colors: PURPLE,
    },
  },
];

/** The hat each column adds. The crownless column adds nothing. */
const COLUMNS: readonly { id: string; label: string; hat?: string }[] = [
  { id: "bare", label: "no crown" },
  { id: "crowned", label: "crown", hat: "crown" },
];

function withHat(props: MascotProps, hat?: string): MascotProps {
  return hat === undefined ? props : { ...props, outfit: { ...props.outfit, hat } };
}

/** One figure and its bust ladder. */
function Column({ label, props }: { label: string; props: MascotProps }): ReactElement {
  return (
    <div className="flex flex-col items-center gap-2">
      <Mascot {...props} size={240} />
      <Busts props={props} />
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
    </div>
  );
}

function Busts({ props }: { props: MascotProps }): ReactElement {
  return (
    <div className="flex items-end gap-2">
      {[64, 40, 28].map((size) => (
        <span
          key={size}
          className="overflow-hidden rounded-full border border-border bg-background"
        >
          <Mascot {...props} size={size} crop="bust" animated={false} />
        </span>
      ))}
    </div>
  );
}

/** One body, both columns, with the bust ladder under each. */
function BodyCard({ body }: { body: Body }): ReactElement {
  return (
    <figure className="flex w-full max-w-[36rem] flex-col gap-2 rounded-lg border border-border bg-background p-4">
      <figcaption>
        <span className="block text-base font-semibold text-foreground">{body.name}</span>
        <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
          {body.caption}
        </span>
      </figcaption>
      <div className="flex flex-wrap gap-4">
        {body.fixedHat === undefined ? (
          COLUMNS.map((column) => (
            <Column
              key={column.id}
              label={column.label}
              props={withHat(body.props, column.hat)}
            />
          ))
        ) : (
          <>
            <Column label="hood" props={withHat(body.props, body.fixedHat)} />
            <p className="max-w-[13rem] self-center text-xs leading-relaxed text-muted-foreground">
              This is the one body with no crowned twin, and the reason is the slot table rather
              than taste: the hood and the crown are both <code>hat</code> items and a character
              wears one thing per slot. It is worth knowing — the crown is the only mark in
              Reksi&rsquo;s set that competes with a hat, and every other mark he has composes
              with everything.
            </p>
          </>
        )}
      </div>
    </figure>
  );
}

/** The two legacy files this whole section is arguing about. */
const SOURCES: readonly { file: string; label: string }[] = [
  { file: "reksi.png", label: "REKSI.png — the human" },
  { file: "treksi.png", label: "treksi.png — the voxel T-rex" },
];

export function ReksiRiffs(): ReactElement {
  return (
    <Card>
      <CardContent className="space-y-8 p-6">
        <div>
          <h3 className="text-xl font-bold tracking-tight text-foreground">
            Reksi — the Princi-Pal, in five bodies
          </h3>
          <p className="mt-1 max-w-4xl text-sm leading-relaxed text-muted-foreground">
            One character, five builds, the same four marks on every one of them, and the crown
            switched on and off beside itself. The question the page is asking is not which body
            wins — it is which of these a viewer would name as the same person, and what they are
            recognising when they do.
          </p>
        </div>

        <section>
          <Rubric
            title="The two sources"
            note="Everything below is derived from these. They agree on the shades, the purple, the briefcase and the white beard, and on nothing else — one is a man and one is an olive voxel dinosaur. Neither has a crown; the crown comes from a third asset, the sog.gg about-us page."
          />
          <div className="flex flex-wrap gap-3 rounded-lg border border-border bg-background p-4">
            {SOURCES.map((source) => (
              <figure key={source.file} className="flex flex-col items-center gap-1">
                <span className="flex h-40 w-40 items-center justify-center overflow-hidden rounded-lg border border-border bg-foreground">
                  <Image
                    src={`/mascot-legacy/${source.file}`}
                    alt={source.label}
                    width={256}
                    height={256}
                    className="h-36 w-36 object-contain"
                    unoptimized
                  />
                </span>
                <figcaption className="font-mono text-[10px] leading-tight text-muted-foreground">
                  {source.label}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section>
          <Rubric
            title="Five bodies, crowned and bare"
            note="Each pair is one build drawn twice; the only difference inside a pair is the hat. Under each figure is the same character as a 64, 40 and 28 pixel bust, because that is where most of a fleet member's life is spent."
          />
          <div className="flex flex-wrap gap-4">
            {BODIES.map((body) => (
              <BodyCard key={body.id} body={body} />
            ))}
          </div>
        </section>

        <section>
          <Rubric
            title="The marks, one at a time"
            note="The same body with each mark added in turn, so it is possible to see which one is doing the recognising rather than guessing from the finished figure."
          />
          <div className="flex flex-wrap items-end gap-4 rounded-lg border border-border bg-background p-4">
            {(
              [
                { label: "bare", outfit: {} },
                { label: "+ shades", outfit: { face: "shades" } },
                { label: "+ beard", outfit: { face: "beard" } },
                { label: "+ both", outfit: { face: "beard-shades" } },
                { label: "+ crown", outfit: { face: "beard-shades", hat: "crown" } },
              ] as const
            ).map((step) => (
              <figure key={step.label} className="flex flex-col items-center gap-1">
                <Mascot
                  concept="otso"
                  form="rex"
                  variant="reksi"
                  pose="idle"
                  expression="happy"
                  outfit={step.outfit}
                  colors={PURPLE}
                  size={150}
                />
                <span className="overflow-hidden rounded-full border border-border bg-background">
                  <Mascot
                    concept="otso"
                    form="rex"
                    variant="reksi"
                    outfit={step.outfit}
                    colors={PURPLE}
                    size={40}
                    crop="bust"
                    animated={false}
                  />
                </span>
                <figcaption className="text-[10px] leading-tight text-muted-foreground">
                  {step.label}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section>
          <Rubric
            title="The beard and the hood on other species"
            note="Both are ordinary registry items rather than anything Reksi owns, so they have to work on whatever wears them. The beard hangs off the mouth line, which every species has; the hood is measured off the head and the eye row."
          />
          <div className="flex flex-wrap items-end gap-4 rounded-lg border border-border bg-background p-4">
            {(
              [
                { concept: "otso", form: "bear", variant: "honey", outfit: { face: "beard" } },
                { concept: "kaveri", form: "adult-b", variant: "teal", outfit: { face: "beard" } },
                { concept: "silmu", variant: "musta", outfit: { face: "beard" } },
                { concept: "jalo", variant: "cyan", outfit: { face: "beard" } },
                { concept: "otso", form: "bear", variant: "honey", outfit: { hat: "rex-hood" } },
                {
                  concept: "kaveri",
                  form: "kid-a",
                  variant: "teal",
                  outfit: { hat: "rex-hood", back: "rex-tail" },
                },
                { concept: "silmu", variant: "musta", outfit: { hat: "rex-hood" } },
                {
                  concept: "palikka",
                  form: "hippo",
                  variant: "violetti",
                  outfit: { hat: "rex-hood" },
                },
              ] as const
            ).map((item, i) => (
              <figure key={`${item.concept}-${i}`} className="flex flex-col items-center gap-1">
                <Mascot {...item} colors={garment("sky")} size={140} />
                <figcaption className="text-[10px] leading-tight text-muted-foreground">
                  {item.concept}
                </figcaption>
              </figure>
            ))}
          </div>
        </section>
      </CardContent>
    </Card>
  );
}
