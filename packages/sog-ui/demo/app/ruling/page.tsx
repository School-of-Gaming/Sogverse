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
 * comment beside the thing it explains, in this file and in the five section
 * modules.
 *
 * **Scope: faces only.** Which family every site in Sogverse is set in, and
 * nothing else. Weight, caps, italics, tracking and the type scale are the
 * Heading adoption's, and where a site asks for a weight its face does not load
 * — which several do — the finding is written into the ledger rather than fixed
 * or hidden here. The one italic on the page is not an exception to that: what
 * the About quote asks is which *files* the serif is loaded with, which is the
 * face contract's shape rather than a styling choice at a call site.
 *
 * **What the five sections ask.** The specimens are the ground everything else
 * is judged against: the four faces, each drawn through its semantic utility.
 * The Press Start section is the retirement — one case per site still open,
 * three columns each, and one ruling per site; the two public-site heroes have
 * been ruled and their drawings have left. The About quote is the opposite
 * question: a face with no placement meeting the one construct that asks for it.
 * The world-voice section asks the question underneath two of the Press Start
 * sites: whether Space Mono has any placement in this product beyond machine
 * text, put on the strongest cases the app has rather than site by site. The
 * last section is where a family is spelled by hand as a literal string — two
 * surfaces that have to (a PNG renderer, a mail client) and one inline SVG that
 * chose to — and so has to be named by somebody.
 */

import type { Metadata } from "next";

import { AboutQuoteSection } from "./section-about-quote";
import { PressStartSection } from "./section-press-start";
import { SpecimensSection } from "./section-specimens";
import { UnreachableSection } from "./section-unreachable";
import { WorldVoiceSection } from "./section-world-voice";

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
      <AboutQuoteSection />
      <WorldVoiceSection />
      <UnreachableSection />
    </main>
  );
}
