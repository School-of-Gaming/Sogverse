/**
 * §3 — Weight: 600 or 700.
 *
 * **What is being asked.** The scale sets every heading at 600 (SemiBold) but
 * H4, which is 400; about 110 of the app's headings override it to 700 (Bold)
 * with `font-bold`, including both public heroes and nearly every page title.
 * The Guidebook gives 600 for H1–H3 and asks for "two or three weights per
 * piece" — 400 for body, 600 for headings, and 700 only if a third is wanted.
 * So the question is whether the large steps take 600, as the scale says, or
 * 700, as the app does.
 *
 * **What is drawn.** The three steps where weight shows most — hero,
 * page-title, section — each at 600 and at 700 with the words from the page
 * that spends it. Size, leading and tracking are the proposed step's in both
 * columns; only the weight moves. Poppins draws both weights from its own files
 * (the layout loads 400, 500, 600 and 700), so neither column is synthesised.
 */

import type { ReactNode } from "react";

import { Case, Column, Columns, Exemplar, Question } from "./parts";
import { STEP } from "./steps";

function TwoWeights({
  render,
}: {
  render: (weight: "font-semibold" | "font-bold") => ReactNode;
}) {
  return (
    <Columns of={2}>
      <Column name="600">{render("font-semibold")}</Column>
      <Column name="700">{render("font-bold")}</Column>
    </Columns>
  );
}

export function WeightSection() {
  return (
    <Question n={3} title="Weight">
      <Case title="hero">
        <Exemplar file="src/app/[locale]/(public)/page.tsx" page="Home, hero">
          <TwoWeights
            render={(weight) => (
              <h1 className={`${STEP.hero} ${weight}`}>
                Where
                <br />
                Screen Time
                <br />
                Becomes
                <br />
                <span className="text-act">Quality Time</span>
              </h1>
            )}
          />
        </Exemplar>
      </Case>

      <Case title="page-title">
        <Exemplar
          file="src/app/[locale]/(dashboard)/admin/page.tsx"
          page="Admin dashboard"
        >
          <TwoWeights
            render={(weight) => (
              <div>
                <h1 className={`text-[1.875rem] leading-[1.2] ${weight}`}>Dashboard</h1>
                <p className="text-muted-foreground">
                  What needs an admin today, who is on the platform, and what is
                  running.
                </p>
              </div>
            )}
          />
        </Exemplar>
        <Exemplar
          file="src/app/[locale]/(dashboard)/parent/gamers/[id]/page.tsx"
          page="Parent, gamer settings"
        >
          <TwoWeights
            render={(weight) => (
              <div>
                <h1 className={`text-[1.875rem] leading-[1.2] ${weight}`}>
                  Gamer settings
                </h1>
                <p className="text-muted-foreground">Manage settings for Aino</p>
              </div>
            )}
          />
        </Exemplar>
      </Case>

      <Case title="section">
        <Exemplar
          file="src/app/[locale]/(public)/page.tsx"
          page="Home, safety"
        >
          <TwoWeights
            render={(weight) => (
              <h2 className={`${STEP.section} ${weight}`}>
                How is my child kept safe?
              </h2>
            )}
          />
        </Exemplar>
        <Exemplar
          file="src/app/[locale]/(public)/roblox/page.tsx"
          page="Roblox"
        >
          <TwoWeights
            render={(weight) => (
              <h2 className={`${STEP.section} ${weight}`}>
                Learn to build on Roblox.
              </h2>
            )}
          />
        </Exemplar>
      </Case>
    </Question>
  );
}
