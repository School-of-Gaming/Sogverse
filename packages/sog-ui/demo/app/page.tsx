import Image from "next/image";

import {
  BRAND,
  NEUTRALS,
  YTY_FAMILIES,
  type YtyFamilyId,
} from "../../src/tokens/brand";
import {
  PRODUCT_KIND_GRAMMAR,
  YTY_ELEMENT_GRAMMAR,
  type ProductKindId,
} from "../../src/tokens/grammar";
import { PICKS } from "../../src/tokens/picks";
import {
  FACES,
  MOBILE_FLOOR_PX,
  TYPE_SCALE,
} from "../../src/tokens/typography";
import {
  FACE_CLASS,
  FILL,
  INK,
  STEP_CLASS,
  STEP_MOBILE_CLASS,
  WEIGHT_CLASS,
} from "./token-classes";

/**
 * The foundations floor.
 *
 * This page is seen, not read. A human opens it to check that things look
 * right; an agent reads the code to understand why. So it shows a thing and its
 * name and nothing else — no prose, no rationale, no numbers beyond a value's
 * own hex, no pass marks and no captions. What a colour is for, where a face
 * may and may not be set, why a step is the size it is: all of that lives in
 * the JSDoc on the token modules in `src/tokens/`, which is where it can be
 * read beside the value it governs and cannot rot into a paragraph nobody
 * updates. Every value drawn below is read from that source, so a token that
 * moves moves here too.
 */

const SPECIMEN = "Sogverse ABCÄÖ abcäö 0123";
const SIGNATURE = "Aino Virtanen";

/** Three rows, so the lift can be seen against the rows that are not lifted. */
const PEOPLE = ["Aino Virtanen", "Mikael Korhonen", "Sofia Lindgren"];

/** The families in the order the palette declares them. */
const FAMILIES = [
  "harmony",
  "glow",
  "valor",
  "wit",
] as const satisfies readonly YtyFamilyId[];

/** The kinds in the order the grammar table declares them. */
const KINDS = [
  "consumer_club",
  "municipality_club",
  "camp",
  "event",
] as const satisfies readonly ProductKindId[];

/** The kinds as an admin reads them; literal English is legal on this floor. */
const KIND_NAME: Record<ProductKindId, string> = {
  consumer_club: "Consumer club",
  municipality_club: "Municipality club",
  camp: "Camp",
  event: "Event",
};

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-body-s text-muted-foreground">{children}</p>;
}

/**
 * A photograph, because the two constructs below can only be seen over one.
 *
 * Both are drawn over the brightest thing they have to cover: a scrim shown
 * over the page's own ground is a slightly darker ground, and glass shown over
 * a flat colour is a flat colour. What each one does to a picture — the scrim
 * taking the light out of it, the blur destroying its detail while keeping its
 * colour — is the whole of what there is to look at.
 */
function Photograph() {
  return (
    <Image
      src="/photograph.jpg"
      alt=""
      fill
      sizes="(min-width: 1024px) 24rem, 100vw"
      className="object-cover"
    />
  );
}

/**
 * The lifted grey doing both of its jobs, live, on the card it really sits on.
 *
 * A swatch cannot show this one. The grey is the ground a thing takes when it
 * is raised off what is behind it, and there are exactly two reasons a thing is
 * — a pointer is on it, or it is set back from its neighbours — so the pair is
 * drawn together and the hover is real: the lift has to be findable by moving a
 * cursor, not by comparing two squares. The skeleton beside it is the same
 * value at rest, which is the point rather than a collision: one is transient
 * and one is not, and nothing is confused by them agreeing, because a skeleton
 * bar is not something a pointer can be on.
 */
function LiftedInUse() {
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <div>
        <div className="rounded-lg border border-border bg-card p-2">
          {PEOPLE.map((person) => (
            <button
              key={person}
              type="button"
              className="flex w-full items-center rounded-md px-3 py-2 text-left text-body-s transition-colors hover:bg-lifted"
            >
              {person}
            </button>
          ))}
        </div>
        <p className="mt-2 text-h4 font-medium">Under the pointer</p>
        <p className="font-brand-mono text-body-s text-muted-foreground">
          hover:bg-lifted
        </p>
      </div>

      <div>
        <div className="space-y-2 rounded-lg border border-border bg-card p-4">
          <div className="h-4 w-40 max-w-full animate-pulse rounded bg-lifted" />
          <div className="h-4 w-56 max-w-full animate-pulse rounded bg-lifted" />
          <div className="h-4 w-32 max-w-full animate-pulse rounded bg-lifted" />
        </div>
        <p className="mt-2 text-h4 font-medium">Set back</p>
        <p className="font-brand-mono text-body-s text-muted-foreground">
          bg-lifted
        </p>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-20">
      <h2 className="text-h2">{title}</h2>
      <div className="mt-8">{children}</div>
    </section>
  );
}

function Swatch({
  token,
  name,
  hex,
}: {
  token: string;
  name: string;
  hex: string;
}) {
  return (
    <div>
      <div className={`h-16 border border-border ${FILL[token] ?? ""}`} />
      <p className="mt-2 text-h4 font-medium">{name}</p>
      <p className="font-brand-mono text-body-s text-muted-foreground">{hex}</p>
    </div>
  );
}

export default function FoundationsPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-16">
      <h1 className="text-h1-mobile sm:text-h1">SOG-UI</h1>

      <Section title="Ground and ink">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {Object.entries(NEUTRALS).map(([id, neutral]) => (
            <Swatch
              key={id}
              token={id.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}
              name={neutral.name}
              hex={neutral.hex}
            />
          ))}
        </div>
        <div className="mt-10">
          <LiftedInUse />
        </div>
      </Section>

      <Section title="The signature pair">
        <div className="grid gap-6 sm:grid-cols-2">
          {Object.entries(BRAND).map(([id, colour]) => (
            <Swatch
              key={id}
              token={id}
              name={colour.name}
              hex={colour.hex}
            />
          ))}
        </div>
      </Section>

      <Section title="The four families">
        <div className="space-y-8">
          {FAMILIES.map((id) => {
            const family = YTY_FAMILIES[id];
            const Glyph = YTY_ELEMENT_GRAMMAR[id].glyph;
            return (
              <article key={id}>
                <div className="flex items-center gap-3">
                  <Glyph
                    className={`h-7 w-7 ${INK[`yty-${id}-soft`] ?? ""}`}
                    aria-hidden
                  />
                  <h3 className="text-h3">{family.name}</h3>
                </div>
                <div className="mt-4 grid gap-6 sm:grid-cols-2">
                  {(["strong", "soft"] as const).map((variant) => (
                    <Swatch
                      key={variant}
                      token={`yty-${id}-${variant}`}
                      name={`${family.name} ${variant}`}
                      hex={family[variant]}
                    />
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      </Section>

      <Section title="What each kind wears">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {KINDS.map((kind) => {
            const row = PRODUCT_KIND_GRAMMAR[kind];
            const family = YTY_FAMILIES[row.family];
            const Icon = row.glyph;
            return (
              <div key={kind}>
                <div
                  className={`flex h-16 items-center justify-center border border-border ${FILL[`yty-${row.family}-strong`] ?? ""}`}
                >
                  <Icon className="h-7 w-7" style={{ color: NEUTRALS.background.hex }} aria-hidden />
                </div>
                <p className="mt-2 text-h4 font-medium">{KIND_NAME[kind]}</p>
                <p className="font-brand-mono text-body-s text-muted-foreground">
                  {family.name}
                </p>
              </div>
            );
          })}
        </div>
      </Section>

      <Section title="The picks">
        <div className="grid gap-6 grid-cols-2 sm:grid-cols-4 lg:grid-cols-8">
          {PICKS.map((pick) => (
            <Swatch
              key={pick.id}
              token={`pick-${pick.id}`}
              name={`Pick ${pick.id}`}
              hex={pick.hex}
            />
          ))}
        </div>
      </Section>

      <Section title="The scrim and the glass">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <div className="relative h-64 overflow-hidden rounded-lg border border-border">
              <Photograph />
              <div className="absolute inset-0 bg-scrim" />
              <div className="absolute inset-0 flex items-center justify-center p-6">
                <div className="w-full rounded-lg border border-border bg-card p-4">
                  <p className="text-h4">{SPECIMEN}</p>
                  <p className="mt-2 text-body-s text-muted-foreground">
                    {SPECIMEN}
                  </p>
                </div>
              </div>
            </div>
            <p className="mt-2 text-h4 font-medium">Scrim</p>
            <p className="font-brand-mono text-body-s text-muted-foreground">
              bg-scrim
            </p>
          </div>

          <div>
            <div className="relative h-64 overflow-hidden rounded-lg border border-border">
              <Photograph />
              <div className="glass absolute inset-x-0 top-0 border-b border-border px-4 py-3">
                <p className="text-h4">{SPECIMEN}</p>
              </div>
            </div>
            <p className="mt-2 text-h4 font-medium">Glass over media</p>
            <p className="font-brand-mono text-body-s text-muted-foreground">
              glass
            </p>
          </div>

          {/* Really scrolls, because a panel that stays legible over whatever
              passes under it is a claim that only moves when the thing moves. */}
          <div>
            <div className="relative h-64 overflow-y-auto rounded-lg border border-border">
              <div className="glass sticky top-0 z-10 border-b border-border px-4 py-3">
                <p className="text-h4">{SPECIMEN}</p>
              </div>
              <div className="space-y-4 p-4">
                <div className="rounded-lg border border-border bg-card p-4">
                  <p className="text-body-s">{SPECIMEN}</p>
                </div>
                <p className="text-body-l">{SPECIMEN}</p>
                <p className="w-fit rounded-lg bg-act px-4 py-2 text-cta text-act-foreground">
                  {SIGNATURE}
                </p>
                <p className="text-body-l">{SPECIMEN}</p>
                <div className="rounded-lg border border-border bg-lifted p-4">
                  <p className="text-body-s">{SPECIMEN}</p>
                </div>
                <p className="text-body-l">{SPECIMEN}</p>
              </div>
            </div>
            <p className="mt-2 text-h4 font-medium">Glass over content</p>
            <p className="font-brand-mono text-body-s text-muted-foreground">
              glass
            </p>
          </div>
        </div>
      </Section>

      <Section title="Type faces">
        <div className="space-y-10">
          {Object.entries(FACES).map(([id, face]) => (
            <article key={id}>
              <h3 className="text-h3">{face.name}</h3>
              <div className="mt-4 space-y-2">
                {face.weights.map((weight) => (
                  <p
                    key={weight}
                    className={`text-h3 ${FACE_CLASS[id] ?? ""} ${WEIGHT_CLASS[weight] ?? ""}`}
                  >
                    {id === "cursive" ? SIGNATURE : SPECIMEN}
                  </p>
                ))}
              </div>
            </article>
          ))}
        </div>
      </Section>

      <Section title="The type scale">
        <div className="space-y-8">
          {TYPE_SCALE.map((step) => (
            <div key={step.id} className="border-b border-border pb-8">
              <Label>{step.label}</Label>
              <p className={`mt-1 ${STEP_CLASS[step.id] ?? ""}`}>{SPECIMEN}</p>
              {step.mobilePx === null ? null : (
                <div className="mt-6">
                  <Label>{`${step.label} at ${MOBILE_FLOOR_PX}`}</Label>
                  {/* Mirrors MOBILE_FLOOR_PX in src/tokens/typography.ts. */}
                  <div className="mt-1 w-[360px] max-w-full border border-dashed border-border p-4">
                    <p className={STEP_MOBILE_CLASS[step.id] ?? ""}>
                      {SPECIMEN}
                    </p>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </Section>
    </main>
  );
}
