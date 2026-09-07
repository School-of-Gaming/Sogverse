import Image from "next/image";
import {
  AlertCircle,
  AlertTriangle,
  Check,
  Info,
  type LucideIcon,
} from "lucide-react";

import {
  BRAND,
  NEUTRALS,
  STATUS,
  STATUS_IDS,
  YTY_FAMILIES,
  statusHex,
  type StatusId,
  type YtyFamilyId,
} from "../../src/tokens/brand";
import {
  PRODUCT_KIND_GRAMMAR,
  ROLE_GRAMMAR,
  YTY_ELEMENT_GRAMMAR,
  type ProductKindId,
  type RoleId,
} from "../../src/tokens/grammar";
import { IDENTICON } from "../../src/tokens/identicon";
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
  ON_FILL,
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

/** Three rows, so the hovered one can be seen against the rows that are not. */
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

/** The roles in the order the grammar table declares them. */
const ROLES = [
  "gamer",
  "customer",
  "gedu",
  "admin",
] as const satisfies readonly RoleId[];

/** The word each role's own chip carries. */
const ROLE_NAME: Record<RoleId, string> = {
  gamer: "Gamer",
  customer: "Parent",
  gedu: "Gedu",
  admin: "Admin",
};

/**
 * The mark each status is drawn beside, chosen here rather than in the library.
 *
 * An element's mark is grammar and lives in `YTY_ELEMENT_GRAMMAR`, because an
 * element *is* its family and the pair is one fact. A status mark is not settled
 * yet: it belongs to the alert, the badge and the chip that will carry it, and
 * nothing is defined in the library before the component that spends it. So the
 * floor picks four marks to draw the label rule with, exactly as a consumer
 * would today.
 */
const STATUS_GLYPH: Record<StatusId, LucideIcon> = {
  destructive: AlertCircle,
  success: Check,
  info: Info,
  warning: AlertTriangle,
};

/**
 * The words a status label is allowed to be: the name of a state, and nothing
 * a reader reads through.
 */
const STATUS_LABEL: Record<StatusId, string> = {
  destructive: "Payment failed",
  success: "Seat confirmed",
  info: "Next session",
  warning: "Two seats left",
};

function Label({ children }: { children: React.ReactNode }) {
  return <p className="text-body-s text-muted-foreground">{children}</p>;
}

/**
 * A photograph, because the scrim and the glass can only be seen over one.
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

/** One run of hoverable rows, drawn wherever it is nested. */
function HoverRows() {
  return PEOPLE.map((person) => (
    <button
      key={person}
      type="button"
      className="flex w-full items-center rounded-md px-3 py-2 text-left text-body-s transition-colors hover:bg-hover"
    >
      {person}
    </button>
  ));
}

/**
 * The hover layer on all three grounds at once, and the lifted grey at rest.
 *
 * A swatch cannot show either. The hover is a *layer* rather than a ground, and
 * the whole claim it makes is that one value lifts a row by the same visible
 * step wherever the row happens to be — which is a claim about three grounds,
 * so all three are here at once, nested the way a real page nests them: rows on
 * the page, rows on a card on the page, rows on a lifted panel on that card.
 * The hover is live because a lift has to be findable by moving a cursor, not
 * by comparing two squares, and the run of three rows on each ground is what
 * gives the hovered one something unhovered to be seen against.
 *
 * The skeleton beside it is the other construct: `lifted` as an authored,
 * static ground. Drawing them together is the point rather than a collision —
 * a panel that is set back and a row that lifts under the pointer are different
 * statements, and nothing is confused by them appearing on one screen.
 */
function GroundsInUse() {
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <div>
        <div className="rounded-lg p-2">
          <HoverRows />
          <div className="mt-2 rounded-lg border border-border bg-card p-2">
            <HoverRows />
            <div className="mt-2 rounded-lg bg-lifted p-2">
              <HoverRows />
            </div>
          </div>
        </div>
        <p className="mt-2 text-h4 font-medium">Hover, on each ground</p>
        <p className="font-brand-mono text-body-s text-muted-foreground">
          hover:bg-hover
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
  fill,
}: {
  /** The token, when the theme emits a class for it. */
  token?: string;
  name: string;
  hex: string;
  /**
   * The colour, painted inline, for a value the theme emits no class for.
   *
   * The identicon's four are the case: nothing spends one as a class, so the
   * generator emits none, and a class assembled from a hex at render time is a
   * class the stylesheet does not contain. Passing it here rather than falling
   * back to `hex` on a missing entry keeps a token whose class went missing
   * looking as wrong as it is.
   */
  fill?: string;
}) {
  return (
    <div>
      <div
        className={`h-16 border border-border ${token === undefined ? "" : (FILL[token] ?? "")}`}
        style={fill === undefined ? undefined : { backgroundColor: fill }}
      />
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
          <GroundsInUse />
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
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {FAMILIES.map((id) => {
            const family = YTY_FAMILIES[id];
            const Glyph = YTY_ELEMENT_GRAMMAR[id].glyph;
            return (
              <div key={id}>
                <div className={`h-16 border border-border ${FILL[`yty-${id}`] ?? ""}`} />
                <div className="mt-2 flex items-center gap-2">
                  <Glyph
                    className={`h-5 w-5 ${INK[`yty-${id}`] ?? ""}`}
                    aria-hidden
                  />
                  <p className={`text-h4 font-medium ${INK[`yty-${id}`] ?? ""}`}>
                    {family.name}
                  </p>
                </div>
                <p className="font-brand-mono text-body-s text-muted-foreground">
                  {family.hex}
                </p>
              </div>
            );
          })}
        </div>
      </Section>

      {/* The badge and the label are the two shapes a status colour is allowed
          to take, drawn together: filled under its own ink, and inked beside a
          mark in the same hue on the card it really sits on. */}
      <Section title="Status">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {STATUS_IDS.map((id) => {
            const Glyph = STATUS_GLYPH[id];
            return (
              <div key={id}>
                <div className="rounded-lg border border-border bg-card p-4">
                  <span
                    className={`inline-flex items-center rounded-full px-3 py-1 text-body-s font-medium ${FILL[id] ?? ""} ${ON_FILL[id] ?? ""}`}
                  >
                    {STATUS_LABEL[id]}
                  </span>
                  <span
                    className={`mt-4 flex items-center gap-2 text-body-s font-medium ${INK[id] ?? ""}`}
                  >
                    <Glyph className="h-4 w-4 shrink-0" aria-hidden />
                    {STATUS_LABEL[id]}
                  </span>
                </div>
                <p className="mt-2 text-h4 font-medium">{STATUS[id].name}</p>
                <p className="font-brand-mono text-body-s text-muted-foreground">
                  {statusHex(id)}
                </p>
              </div>
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
                  className={`flex h-16 items-center justify-center border border-border ${FILL[`yty-${row.family}`] ?? ""}`}
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

      {/* A role is its word in its family's colour, and there is no role mark:
          the word is always present, so a glyph would say the same thing twice.
          The chip is that word inside the neutral edge the app draws it in. */}
      <Section title="What each role wears">
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {ROLES.map((role) => {
            const row = ROLE_GRAMMAR[role];
            const family = row.family === null ? null : YTY_FAMILIES[row.family];
            const ink =
              row.family === null
                ? "text-muted-foreground"
                : (INK[`yty-${row.family}`] ?? "");
            return (
              <div key={role}>
                <div className="flex h-16 items-center justify-center gap-4 rounded-lg border border-border bg-card">
                  <span className={`text-h4 font-medium ${ink}`}>
                    {ROLE_NAME[role]}
                  </span>
                  <span
                    className={`inline-flex items-center rounded-full border border-border px-2.5 py-0.5 text-body-s font-semibold ${ink}`}
                  >
                    {ROLE_NAME[role]}
                  </span>
                </div>
                <p className="mt-2 text-h4 font-medium">{ROLE_NAME[role]}</p>
                <p className="font-brand-mono text-body-s text-muted-foreground">
                  {family === null ? "\u2014" : family.name}
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

      <Section title="The identicon's four">
        <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
          {IDENTICON.map((colour) => (
            <Swatch
              key={colour.id}
              name={`Identicon ${colour.id}`}
              hex={colour.hex}
              fill={colour.hex}
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
