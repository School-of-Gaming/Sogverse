/**
 * §6 — Heading colour.
 *
 * **What is being asked.** Which inks a heading may wear. The Guidebook says
 * nothing about heading colour. Today almost every heading is ink; about
 * nineteen are quiet ink (`text-muted-foreground`) — most of them the furniture
 * labels §7 asks about, some of them small section headings in tools — and one
 * is act: the gamer dashboard's greeting. The model's question is whether
 * colour is a prop of the heading at all, and if so which values and on which
 * steps.
 *
 * **What is drawn.** Every proposed step in ink and in quiet ink, the same
 * words in both columns. Then the two real sites that are not ink, each beside
 * itself in ink: the gamer greeting in act — on a gamer surface, where the
 * colour budget lets the palette speak — and a tool's results heading in quiet
 * ink.
 *
 * Act on the greeting is a figure, not a fill (nothing is pressed), which the
 * colour rules allow; whether a heading is the place for it is the question,
 * not whether the colour may be spent.
 */

import { Case, Column, Columns, Exemplar, Question } from "./parts";
import { CARD_TITLE_20, LABEL, PAGE_TITLE_DRAWN, STEP } from "./steps";

const STEPS = [
  { name: "hero", cls: STEP.hero, words: "Where Screen Time Becomes Quality Time" },
  { name: "page-title", cls: PAGE_TITLE_DRAWN, words: "Dashboard" },
  { name: "section", cls: STEP.section, words: "Make gaming a great hobby" },
  { name: "card-title", cls: STEP.cardTitle, words: "Needs attention" },
  { name: "card-title — 20px", cls: CARD_TITLE_20, words: "Needs attention" },
  { name: "sub-section", cls: STEP.subSection, words: "Create your account" },
  { name: "label — 14px", cls: LABEL[14], words: "Coming up" },
  { name: "label — 12px", cls: LABEL[12], words: "Coming up" },
] as const;

function StepStack({ ink }: { ink: "text-foreground" | "text-muted-foreground" }) {
  return (
    <div className="space-y-8">
      {STEPS.map(({ name, cls, words }) => (
        <div key={name}>
          <p className="font-mono text-body-s text-muted-foreground">{name}</p>
          <p className={`mt-1 ${cls} ${ink}`}>{words}</p>
        </div>
      ))}
    </div>
  );
}

export function ColourSection() {
  return (
    <Question n={6} title="Heading colour">
      <Case title="Every step">
        <Columns of={2}>
          <Column name="ink">
            <StepStack ink="text-foreground" />
          </Column>
          <Column name="quiet ink">
            <StepStack ink="text-muted-foreground" />
          </Column>
        </Columns>
      </Case>

      <Case title="The gamer greeting">
        <Exemplar
          file="src/components/gamer/gamer-dashboard-page-body.tsx"
          page="Gamer dashboard"
        >
          <Columns of={2}>
            <Column name="today — act">
              <div className="text-center">
                <h2 className="text-xl font-bold break-words text-act md:text-3xl">
                  Welcome, Aino!
                </h2>
                <p className="text-muted-foreground">Ready to play and learn?</p>
              </div>
            </Column>
            <Column name="ink">
              <div className="text-center">
                <h2 className="text-xl font-bold break-words md:text-3xl">
                  Welcome, Aino!
                </h2>
                <p className="text-muted-foreground">Ready to play and learn?</p>
              </div>
            </Column>
          </Columns>
        </Exemplar>
      </Case>

      <Case title="A quiet heading">
        <Exemplar
          file="src/components/tools/minecraft-password-reset-card-view.tsx"
          page="Admin tools"
        >
          <Columns of={2}>
            <Column name="today — quiet ink">
              <div className="space-y-3 border-t border-border pt-6">
                <h3 className="text-sm font-semibold text-muted-foreground">
                  New passwords
                </h3>
                <p className="font-mono text-sm">gamer07@gamer.sog.gg</p>
              </div>
            </Column>
            <Column name="ink">
              <div className="space-y-3 border-t border-border pt-6">
                <h3 className="text-sm font-semibold">New passwords</h3>
                <p className="font-mono text-sm">gamer07@gamer.sog.gg</p>
              </div>
            </Column>
          </Columns>
        </Exemplar>
      </Case>
    </Question>
  );
}
