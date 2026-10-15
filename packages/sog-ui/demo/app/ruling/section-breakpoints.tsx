/**
 * §4 — Breakpoints: only the hero resteps.
 *
 * **What is being asked.** About fifty headings change size at a breakpoint
 * today, each choosing its own pair — the public section heading goes 30 → 36
 * at `sm:`, page titles 24 → 30 at `sm:`, the home hero 30 → 60 at `md:`. The
 * proposed library rule is that a step is one size at every width, and only
 * `hero` carries a narrow size of its own (today's `h1-mobile`). The question
 * is whether the fixed sizes hold at the 360px floor.
 *
 * **What is drawn.** Each case at a 360px frame and an 840px frame, side by
 * side, today and proposed. The frames are containers, not viewports (see
 * `Frame` in `parts.tsx`): today's `sm:` and `md:` classes are reproduced as
 * container queries at the same widths and nothing else is changed, so the
 * narrow drawing is what a 360px phone renders and the wide one is what a
 * tablet or laptop column does.
 *
 * **Why these three.** The section heading and the page title are the two
 * biggest resizing clusters (14 sites each). The family product page's masthead
 * is the page title under the hardest test the app has: a Finnish club name
 * that is one long word. The hero is drawn so the one step that keeps its
 * resize is seen doing it.
 */

import type { ReactNode } from "react";

import { Case, Column, Exemplar, Frame, Question } from "./parts";
import { PAGE_TITLE_DRAWN, STEP } from "./steps";

/** Four frames: today and proposed, each narrow and wide. */
function NarrowWide({
  today,
  proposed,
  proposedName,
}: {
  today: ReactNode;
  proposed: ReactNode;
  proposedName: string;
}) {
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-start gap-8">
        <Column name="today — 360">
          <Frame width={360}>{today}</Frame>
        </Column>
        <Column name="today — 840">
          <Frame width={840}>{today}</Frame>
        </Column>
      </div>
      <div className="flex flex-wrap items-start gap-8">
        <Column name={`${proposedName} — 360`}>
          <Frame width={360}>{proposed}</Frame>
        </Column>
        <Column name={`${proposedName} — 840`}>
          <Frame width={840}>{proposed}</Frame>
        </Column>
      </div>
    </div>
  );
}

export function BreakpointsSection() {
  return (
    <Question n={4} title="Breakpoints">
      <Case title="section">
        <Exemplar
          file="src/app/[locale]/(public)/page.tsx"
          page="Home, features"
        >
          <NarrowWide
            proposedName="section"
            today={
              <h2 className="text-3xl font-bold tracking-tight @min-[40rem]:text-4xl">
                Make gaming a great hobby
              </h2>
            }
            proposed={<h2 className={STEP.section}>Make gaming a great hobby</h2>}
          />
        </Exemplar>
      </Case>

      <Case title="page-title">
        <Exemplar file="src/app/not-found.tsx" page="Not found">
          <NarrowWide
            proposedName="page-title"
            today={
              <h1 className="text-2xl font-bold tracking-tight @min-[40rem]:text-3xl">
                Page not found
              </h1>
            }
            proposed={<h1 className={PAGE_TITLE_DRAWN}>Page not found</h1>}
          />
        </Exemplar>
        <Exemplar
          file="src/components/family/product-page/FamilyProductPageBody.tsx"
          page="Family club page"
        >
          <NarrowWide
            proposedName="page-title"
            today={
              <header className="border-b border-border pb-5">
                <span className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
                  Club
                </span>
                <h1 className="mt-1 text-2xl font-bold tracking-tight @min-[40rem]:text-3xl">
                  Minecraft-maanantaikerho
                </h1>
              </header>
            }
            proposed={
              <header className="border-b border-border pb-5">
                <span className="text-xs font-medium tracking-wider text-muted-foreground uppercase">
                  Club
                </span>
                <h1 className={`mt-1 ${PAGE_TITLE_DRAWN}`}>
                  Minecraft-maanantaikerho
                </h1>
              </header>
            }
          />
        </Exemplar>
      </Case>

      <Case title="hero">
        <Exemplar file="src/app/[locale]/(public)/page.tsx" page="Home, hero">
          <NarrowWide
            proposedName="hero"
            today={
              <h1 className="text-hero-mobile font-bold tracking-tight @min-[48rem]:text-6xl">
                Where
                <br />
                Screen Time
                <br />
                Becomes
                <br />
                <span className="text-act">Quality Time</span>
              </h1>
            }
            proposed={
              <h1 className="text-hero-mobile @min-[48rem]:text-hero">
                Where
                <br />
                Screen Time
                <br />
                Becomes
                <br />
                <span className="text-act">Quality Time</span>
              </h1>
            }
          />
        </Exemplar>
      </Case>
    </Question>
  );
}
