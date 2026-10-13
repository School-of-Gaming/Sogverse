/**
 * The Heading adoption's ruling page.
 *
 * **Temporary, and linked from nowhere.** It exists so one set of open questions
 * can be ruled on by looking, and it is deleted with this directory once the
 * last of them is ruled. It shrinks as rulings land: a question that has been
 * decided and built leaves the page. The ledger beside it, `RULINGS.md`,
 * carries the record.
 *
 * It obeys the demo's own rule: it is seen, not read. There is no prose, no
 * rationale, no ratio and no pass mark on screen; every reason lives in a doc
 * comment beside the thing it explains, in this file and in the section
 * modules.
 *
 * **The model already accepted.** A heading's outline level (h1–h4) and its
 * visual step are two props, decoupled but constrained by a table of which
 * steps each level may take, enforced by types; and the steps are renamed by
 * role. Round 1 asks what the steps are, what the table is, and the weight,
 * breakpoint, tracking, leading, colour and case questions every step carries.
 *
 * **Nothing here touches the tokens.** A rename is drawn from today's token
 * class; a new step is drawn in plain values in `steps.ts`. The scale changes
 * only when a ruling lands.
 *
 * **The nine sections.** §1 the role-named steps, each with today's real
 * headings beside it; §2 the level → step table and two real pages' outlines
 * under it; §3 600 against 700; §4 one size at every width, with only the hero
 * restepping; §5 tight tracking and CardTitle's leading; §6 which inks a
 * heading may wear; §7 the uppercase furniture labels, and whether each is a
 * heading at all; §8 whether the app's sections need a step of their own
 * beside the marketing one; §9 which step a dialog or sheet title takes.
 */

import type { Metadata } from "next";

import { AppSectionSection } from "./section-app-section";
import { BreakpointsSection } from "./section-breakpoints";
import { ColourSection } from "./section-colour";
import { DialogTitlesSection } from "./section-dialog-titles";
import { FurnitureSection } from "./section-furniture";
import { LevelsSection } from "./section-levels";
import { StepsSection } from "./section-steps";
import { TrackingSection } from "./section-tracking";
import { WeightSection } from "./section-weight";

export const metadata: Metadata = {
  title: "Heading ruling",
  robots: { index: false, follow: false },
};

export default function RulingPage() {
  return (
    <main className="mx-auto max-w-[92rem] px-6 py-16">
      <h1 className="text-h1-mobile sm:text-h1">Heading ruling</h1>
      <StepsSection />
      <LevelsSection />
      <WeightSection />
      <BreakpointsSection />
      <TrackingSection />
      <ColourSection />
      <FurnitureSection />
      <AppSectionSection />
      <DialogTitlesSection />
    </main>
  );
}
