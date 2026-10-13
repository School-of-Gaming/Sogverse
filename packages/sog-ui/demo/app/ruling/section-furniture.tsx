/**
 * §7 — Furniture labels: a sentence-case step, or not a heading at all.
 *
 * **What is being asked.** Twelve headings in the app are 11–12px, uppercase and
 * tracked, in quiet ink: the small markers over a feed, a rail panel, a list.
 * The Guidebook says headings are sentence case and never all caps. Two
 * questions sit on each one, and the drawing asks both:
 *
 * 1. If it is a heading, does it take the proposed `label` step — sentence case,
 *    no tracking, at 14px or 12px?
 * 2. Is it a heading at all? A marker a reader scans past may be furniture
 *    rather than a node in the outline — a paragraph, not an h2 — in which case
 *    it leaves the heading component entirely and §2's table does not need
 *    `label` at h2 and h3.
 *
 * **What is drawn.** Three of the twelve, each with a little of what it heads
 * under it, four ways: today, class-for-class; the `label` step at both
 * candidate sizes; and the same words as plain body-s text in a paragraph. The
 * ink is held at today's quiet ink in all four so only case, size, weight and
 * tracking move — §6 is where the ink is asked.
 *
 * **Why these three.** They are the three shapes the twelve come in: a label
 * over a page region (the family product page's session feed), a label inside a
 * card with a control beside it (the group workspace's rail), and a label over a
 * list of links at the foot of a public page (Roblox's documents). The last one
 * is also the one the code comments call furniture outright while keeping it an
 * h2, because it heads the list in the outline.
 */

import type { ReactNode } from "react";

import { Case, Column, Columns, Exemplar, Question } from "./parts";
import { LABEL } from "./steps";

type Way = "today" | "14" | "12" | "plain";

const WAYS: readonly { way: Way; name: string }[] = [
  { way: "today", name: "today" },
  { way: "14", name: "label — 14px" },
  { way: "12", name: "label — 12px" },
  { way: "plain", name: "not a heading" },
];

/**
 * One label drawn one of four ways. The words are the message's own, which are
 * already sentence case: today's capitals are drawn by `uppercase`, so dropping
 * the class is the whole of the case change. `today` is the call site's own
 * element and classes.
 */
function Label({
  way,
  today,
  todayClass,
  words,
  className = "",
}: {
  way: Way;
  today: "h2" | "h3";
  todayClass: string;
  words: string;
  className?: string;
}) {
  if (way === "today") {
    const Today = today;
    return <Today className={todayClass}>{words}</Today>;
  }
  if (way === "plain") {
    return (
      <p className={`text-body-s text-muted-foreground ${className}`}>{words}</p>
    );
  }
  const Heading = today;
  return (
    <Heading className={`${LABEL[way]} text-muted-foreground ${className}`}>
      {words}
    </Heading>
  );
}

function FourWays({ render }: { render: (way: Way) => ReactNode }) {
  return (
    <Columns of={4}>
      {WAYS.map(({ way, name }) => (
        <Column key={way} name={name}>
          {render(way)}
        </Column>
      ))}
    </Columns>
  );
}

export function FurnitureSection() {
  return (
    <Question n={7} title="Furniture labels">
      <Case title="Over a page region">
        <Exemplar
          file="src/components/family/product-page/FamilyProductPageBody.tsx"
          page="Family club page"
        >
          <FourWays
            render={(way) => (
              <section>
                <Label
                  way={way}
                  today="h2"
                  todayClass="mb-3 text-[11px] font-medium tracking-wider text-muted-foreground uppercase"
                  words="Sessions"
                  className="mb-3"
                />
                <div className="rounded-lg border border-border bg-card p-4 text-sm">
                  <p className="tabular-nums">Mon 6 Oct · 17:00–18:30</p>
                </div>
              </section>
            )}
          />
        </Exemplar>
      </Case>

      <Case title="Inside a card">
        <Exemplar
          file="src/components/group-workspace/GroupWorkspace.tsx"
          page="Gedu group workspace"
        >
          <FourWays
            render={(way) => (
              <div className="rounded-lg border border-border bg-card">
                <div className="space-y-3 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <Label
                      way={way}
                      today="h2"
                      todayClass="text-[11px] font-medium tracking-wider text-muted-foreground uppercase"
                      words="Other groups"
                    />
                  </div>
                  <p className="text-sm">Minecraft-maanantaikerho</p>
                </div>
              </div>
            )}
          />
        </Exemplar>
      </Case>

      <Case title="Over a list of links">
        <Exemplar
          file="src/app/[locale]/(public)/roblox/page.tsx"
          page="Roblox, foot of the page"
        >
          <FourWays
            render={(way) => (
              <div className="border-t border-border pt-8">
                <Label
                  way={way}
                  today="h2"
                  todayClass="text-xs font-semibold tracking-widest text-muted-foreground uppercase"
                  words="Creator Academy documents"
                />
                <div className="mt-3 space-y-1.5 text-sm text-muted-foreground">
                  <p className="underline underline-offset-2">
                    Terms &amp; Conditions
                  </p>
                  <p className="underline underline-offset-2">
                    Child Safeguarding Policy
                  </p>
                  <p className="underline underline-offset-2">Privacy Policy</p>
                </div>
              </div>
            )}
          />
        </Exemplar>
      </Case>
    </Question>
  );
}
