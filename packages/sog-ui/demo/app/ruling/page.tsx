/**
 * The theme-adoption ruling page.
 *
 * **Temporary, and linked from nowhere.** It exists so one set of open questions
 * can be ruled on by looking, and it is deleted with this directory once the
 * ruling is made. It is exempt from the demo's "seen, not read" rule for the
 * same reason: the rest of the demo shows a thing and its name because a
 * decision has already been taken about it, and nothing here has been decided
 * yet, so each question carries the context, the measurement and the pass mark
 * a decision needs.
 *
 * Everything it draws is either a library token, read from `src/tokens/`, or a
 * value Sogverse spells today, written out in `inventory.ts`. Every ratio comes
 * from the library's own `contrastRatio`; none is typed by hand. Colours that
 * are not library tokens are drawn through inline `style` rather than classes,
 * because Tailwind scans source text and a class assembled from a hex at render
 * time is a class the stylesheet does not contain.
 */

import type { Metadata } from "next";
import { FacesSection } from "./section-faces";
import { GreysSection } from "./section-greys";
import {
  IdenticonSection,
  LynxSection,
  ScrimSection,
} from "./section-media";
import { PalettesSection } from "./section-palettes";
import { StatusSection } from "./section-status";
import { SummarySection } from "./section-summary";
import { YtySection } from "./section-yty";
import { Note } from "./parts";

export const metadata: Metadata = {
  title: "Theme ruling",
  robots: { index: false, follow: false },
};

export default function RulingPage() {
  return (
    <main className="mx-auto max-w-[92rem] px-6 py-16">
      <h1 className="text-h1-mobile sm:text-h1">Theme ruling</h1>
      <div className="mt-6 space-y-4">
        <Note>
          Sogverse is to define no colour of its own. Every colour it defines
          today is below, beside what is proposed for it: deleted, replaced by a
          library token it already equals, admitted to the library unchanged, or
          admitted retuned. Each question is answered by looking at the two
          columns, not by reading the argument.
        </Note>
        <Note>
          One thing to know before the first picture. Sogverse&rsquo;s stylesheet
          carries an unlayered `* &#123; border-color &#125;` rule, which
          outranks every `border-*` utility because utilities live in a cascade
          layer. So no coloured border in the app has ever rendered — every
          authored `border-yty-harmony/30` and `border-destructive/50` has drawn
          the grey border instead. That is fixed on this branch, which means the
          &ldquo;as authored&rdquo; column below shows those edges for the first
          time. Wherever a coloured border is involved there are three columns:
          what has actually been on screen, what the code has always said, and
          what is proposed.
        </Note>
      </div>

      <SummarySection />
      <YtySection />
      <StatusSection />
      <GreysSection />
      <PalettesSection />
      <ScrimSection />
      <IdenticonSection />
      <LynxSection />
      <FacesSection />
    </main>
  );
}
