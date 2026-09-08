/**
 * The faces-adoption ruling page.
 *
 * **Temporary, and linked from nowhere.** It exists so one set of open questions
 * can be ruled on by looking, and it is deleted with this directory once the
 * last of them is ruled. It shrinks as rulings land: a question that has been
 * decided and built leaves the page, and what stays is only what is still being
 * asked. The ledger beside it, `RULINGS.md`, carries the record.
 *
 * It obeys the demo's own rule: it is seen, not read. There is no prose, no
 * rationale, no ratio and no pass mark on screen; every reason lives in a doc
 * comment beside the thing it explains, in this file and in the three section
 * modules.
 *
 * **Scope: faces only.** Which family every site in Sogverse is set in, and
 * nothing else. Weight, caps, italics, tracking and the type scale are the
 * Heading adoption's, and where a site asks for a weight its face does not load
 * — which several do — the finding is written into the ledger rather than fixed
 * or hidden here.
 *
 * **What the three sections ask.** The specimens are the ground everything else
 * is judged against: the four faces, each drawn through its semantic utility.
 * The Press Start section is the retirement — one case per site still open,
 * three columns each, and one ruling per site; the two public-site heroes have
 * been ruled and their drawings have left. The last section is the two surfaces
 * a stylesheet never reaches, where a family is named as a literal string and so
 * has to be named by somebody.
 */

import type { Metadata } from "next";

import { PressStartSection } from "./section-press-start";
import { SpecimensSection } from "./section-specimens";
import { UnreachableSection } from "./section-unreachable";

export const metadata: Metadata = {
  title: "Faces ruling",
  robots: { index: false, follow: false },
};

export default function RulingPage() {
  return (
    <main className="mx-auto max-w-[92rem] px-6 py-16">
      <h1 className="text-h1-mobile sm:text-h1">Faces ruling</h1>
      <SpecimensSection />
      <PressStartSection />
      <UnreachableSection />
    </main>
  );
}
