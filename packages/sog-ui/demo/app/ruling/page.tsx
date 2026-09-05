/**
 * The theme-adoption ruling page.
 *
 * **Temporary, and linked from nowhere.** It exists so one set of open
 * questions can be ruled on by looking, and it is deleted with this directory
 * once the ruling is made.
 *
 * It obeys the demo's own rule: it is seen, not read. Each question is a title,
 * the things it is about, and their names — a token, a hex, a `today` /
 * `as authored` / `proposed` label, and each exemplar's `component — page`
 * locator. There is no prose, no rationale, no ratio and no pass mark on
 * screen. Every reason lives in a doc comment beside the value it explains, in
 * `inventory.ts` and in each section file; where the point used to be a
 * measurement it is now a rendering, drawn at real size on the real ground with
 * today beside the candidate.
 *
 * Scope: colour only. Faces and headings are a later adoption.
 *
 * Colours that are not library tokens are drawn through inline `style` rather
 * than classes, because Tailwind scans source text and a class assembled from a
 * hex at render time is a class the stylesheet does not contain.
 */

import type { Metadata } from "next";
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

export const metadata: Metadata = {
  title: "Theme ruling",
  robots: { index: false, follow: false },
};

export default function RulingPage() {
  return (
    <main className="mx-auto max-w-[92rem] px-6 py-16">
      <h1 className="text-h1-mobile sm:text-h1">Theme ruling</h1>
      <SummarySection />
      <YtySection />
      <StatusSection />
      <GreysSection />
      <PalettesSection />
      <ScrimSection />
      <IdenticonSection />
      <LynxSection />
    </main>
  );
}
