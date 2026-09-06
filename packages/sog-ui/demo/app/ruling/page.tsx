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
 * **What is left is the inventory alone.** Every question that was drawn here
 * — the alpha steps, the greys, the Yty recipe, the status set, the picks, the
 * identicon, act as a figure, the gradients, the role chip — has been ruled and
 * built, so each left the page as it landed, which is the whole shape of this
 * page's life. What the two tables still hold is what no ruling has reached:
 * the colours with no token behind them, and the handful of alpha steps that
 * belong to a later question. When those are answered the page goes, and this
 * directory with it.
 *
 * Scope: colour only. Faces and headings are a later adoption.
 */

import type { Metadata } from "next";
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
    </main>
  );
}
