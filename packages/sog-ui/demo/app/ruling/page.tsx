/**
 * The theme-adoption ruling page.
 *
 * **Temporary, and linked from nowhere.** It exists so one set of open
 * questions can be ruled on by looking, and it is deleted with this directory
 * once the last of them is ruled. It shrinks as rulings land: a question that
 * has been decided and built leaves the page, and what stays is only what is
 * still being asked.
 *
 * It obeys the demo's own rule: it is seen, not read. There is no prose, no
 * rationale, no ratio and no pass mark on screen; every reason lives in a doc
 * comment beside the value it explains, in `inventory.ts`.
 *
 * **The inventory, and the last question.** Every question that was drawn here
 * — the alpha steps, the greys, the Yty recipe, the status set, the picks, the
 * identicon, act as a figure, the gradients, the role chip, the Klingon easter
 * egg — has been ruled and built, so each left the page as it landed, which is
 * the whole shape of this page's life. One is left, and it is the tail of that
 * work rather than new ground: **figure and fill**, which confirms the sentence
 * the status and act sweeps already applied and decides what the nineteen
 * filled badges wear. When it is answered the page goes, and this directory
 * with it.
 *
 * Scope: colour only. Faces and headings are a later adoption.
 */

import type { Metadata } from "next";
import { FigureAndFillSection } from "./section-figure-and-fill";
import { SummarySection } from "./section-summary";

export const metadata: Metadata = {
  title: "Theme ruling",
  robots: { index: false, follow: false },
};

export default function RulingPage() {
  return (
    <main className="mx-auto max-w-[92rem] px-6 py-16">
      <h1 className="text-h1-mobile sm:text-h1">Theme ruling</h1>
      <SummarySection />
      <FigureAndFillSection />
    </main>
  );
}
