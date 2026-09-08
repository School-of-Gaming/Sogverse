/**
 * The About page's pull quote, drawn three times.
 *
 * **What is being asked.** The library names four placements for the serif —
 * editorial headlines, quotes, pull quotes, long-form in a person's voice — and
 * this one construct is two of them: a pull quote, attributed to the
 * Princi-Pal. The ledger said Crimson Pro had no placement in Sogverse; it has
 * this one, and the entry is reopened around it. So the first question is which
 * face the quote takes.
 *
 * **Why there is a third column.** The question has a second half. The app
 * loads Crimson Pro upright only, and the quote is set in `italic` today, so
 * the serif applied on its own would leave the browser to slant the upright
 * glyphs itself. A synthesised slant is a skew of the drawn shapes — a serif's
 * true italic is a different alphabet, with its own strokes, terminals and
 * narrower fit — and the difference is at its most visible on exactly this
 * face. Drawing the serif once faked and once true is what lets the two halves
 * be answered together: the serif upright with `italic` dropped costs nothing,
 * and the serif in its true italic costs one more file in the face contract.
 * The faked middle ground is not on the table, and the column that would draw
 * it is not here.
 *
 * **Every class is reproduced from the component.** The block is
 * `src/components/about/about-section.tsx` — a `max-w-3xl` centred column, the
 * quote at `text-xl italic text-muted-foreground`, the attribution at `mt-2
 * text-sm text-muted-foreground` — with only the face and the `italic` class
 * moving between columns. The page offset (`mt-16`) is the section's own
 * spacing rather than the quote's and is the one class not reproduced, because
 * inside a column it would only push each drawing down by the same amount.
 *
 * **The copy is the real English message**, both halves of it, so the line
 * breaks land at the measure a reader meets and the em dash before the
 * attribution is drawn by the face being judged.
 */

import { crimsonProItalic } from "./crimson-italic";
import { Case, Columns, Column, Exemplar, Question } from "./parts";

const QUOTE = "“What is true now, was once just your imagination.”";
const ATTRIBUTION = "— The Princi-Pal";

/**
 * The quote block, taking the classes that move as props.
 *
 * `face` is a utility for the two library-drawn columns and the locally-loaded
 * italic's className for the third; `slant` is the app's own `italic`, kept
 * where the browser is doing the slanting and dropped where the face is.
 */
function Quote({ face, slant }: { face: string; slant: string }) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <blockquote className={`${face} ${slant} text-xl text-muted-foreground`}>
        {QUOTE}
      </blockquote>
      <p className={`${face} mt-2 text-sm text-muted-foreground`}>
        {ATTRIBUTION}
      </p>
    </div>
  );
}

export function AboutQuoteSection() {
  return (
    <Question n={3} title="The About page's pull quote">
      <Case title="The Princi-Pal's line">
        <Exemplar file="src/components/about/about-section.tsx" page="About">
          <Columns of={3}>
            <Column name="today — Poppins italic">
              <Quote face="font-sans" slant="italic" />
            </Column>
            <Column name="Crimson Pro upright">
              <Quote face="font-serif" slant="" />
            </Column>
            <Column name="Crimson Pro italic">
              <Quote face={crimsonProItalic.className} slant="" />
            </Column>
          </Columns>
        </Exemplar>
      </Case>
    </Question>
  );
}
