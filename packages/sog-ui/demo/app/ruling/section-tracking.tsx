/**
 * §5 — Tracking and leading.
 *
 * **Tracking.** `tracking-tight` (-0.025em) rides on most large headings today —
 * CardTitle, DialogTitle, SheetTitle, the heroes, the public section headings,
 * page titles — and on none of the scale's steps. The Guidebook says nothing
 * about heading tracking. The question is whether tight tracking belongs to the
 * large steps (and if so, which) or goes. Drawn: page-title, section and
 * card-title, each tight and normal, everything else held.
 *
 * **Leading.** CardTitle asks for `leading-none` (a line height of 1), which
 * sets a single-line title flush to its box — and a title that wraps then sits
 * its two lines on top of each other. But 28 of its 58 call sites override the
 * size, and today's class merger treats a font size and a line height as one
 * conflict group, so the override silently drops `leading-none` and the title
 * takes the size utility's own line height instead. So two leadings are live
 * for the same primitive today, chosen by whether a call site passed a size.
 * Drawn: the home page's feature card — a CardTitle at `text-xl` beside a
 * glyph tile, in a 280px card, where the real English title wraps — as it
 * renders today, as the primitive asks for it, and at the card-title step's
 * 1.3 at both candidate sizes.
 */

import type { ReactNode } from "react";
import { Users } from "lucide-react";

import { Case, CardGround, Column, Columns, Exemplar, Question } from "./parts";
import { CARD_TITLE_20, PAGE_TITLE_DRAWN, STEP } from "./steps";

function TightNormal({
  render,
}: {
  render: (tracking: "tracking-tight" | "tracking-normal") => ReactNode;
}) {
  return (
    <Columns of={2}>
      <Column name="tracking-tight">{render("tracking-tight")}</Column>
      <Column name="normal">{render("tracking-normal")}</Column>
    </Columns>
  );
}

/** The home page's feature card, at a fixed 280px, with its title in the given class. */
function FeatureCard({ titleClass }: { titleClass: string }) {
  return (
    <div className="w-[280px] rounded-lg border border-border bg-card">
      <div className="flex flex-col space-y-1.5 p-6">
        <div className="flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg border border-act bg-lifted">
            <Users className="h-6 w-6 text-act" />
          </div>
          <h3 className={titleClass}>New friends, real connections</h3>
        </div>
      </div>
      <div className="p-6 pt-0">
        <p className="text-base text-muted-foreground">
          Children build genuine, lasting friendships through shared adventures.
        </p>
      </div>
    </div>
  );
}

export function TrackingSection() {
  return (
    <Question n={5} title="Tracking and leading">
      <Case title="Tracking">
        <Exemplar
          file="src/app/[locale]/(dashboard)/admin/page.tsx"
          page="Admin dashboard"
        >
          <TightNormal
            render={(tracking) => (
              <h1 className={`${PAGE_TITLE_DRAWN} ${tracking}`}>Dashboard</h1>
            )}
          />
        </Exemplar>
        <Exemplar
          file="src/app/[locale]/(public)/page.tsx"
          page="Home, features"
        >
          <TightNormal
            render={(tracking) => (
              <h2 className={`${STEP.section} ${tracking}`}>
                Make gaming a great hobby
              </h2>
            )}
          />
        </Exemplar>
        <Exemplar
          file="src/components/admin/dashboard/needs-attention-panel.tsx"
          page="Admin dashboard"
        >
          <TightNormal
            render={(tracking) => (
              <CardGround>
                <h3 className={`${STEP.cardTitle} ${tracking}`}>
                  Needs attention
                </h3>
              </CardGround>
            )}
          />
        </Exemplar>
      </Case>

      <Case title="Leading">
        <Exemplar
          file="src/app/[locale]/(public)/page.tsx"
          page="Home, features"
        >
          <Columns of={4}>
            <Column name="today">
              <FeatureCard titleClass="font-semibold tracking-tight text-xl" />
            </Column>
            <Column name="leading-none">
              <FeatureCard titleClass="text-xl leading-none font-semibold tracking-tight" />
            </Column>
            <Column name="card-title">
              <FeatureCard titleClass={STEP.cardTitle} />
            </Column>
            <Column name="card-title — 20px">
              <FeatureCard titleClass={CARD_TITLE_20} />
            </Column>
          </Columns>
        </Exemplar>
      </Case>
    </Question>
  );
}
