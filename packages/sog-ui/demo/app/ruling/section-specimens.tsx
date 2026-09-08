/**
 * The four faces.
 *
 * **Why the specimens come first.** Every ruling below is "which of these
 * families should this site be set in", and none of them can be answered by
 * someone who has not just looked at the families themselves. The four are
 * drawn through their semantic utilities rather than by family name, which is
 * also the contract under test: a surface asks for "the app face" and never for
 * Poppins.
 *
 * **The diacritic line is not decoration.** The product ships Finnish, Swedish
 * and French, so every face is loaded with `latin-ext` and every face has to be
 * looked at with the marks on. A face whose ä sits differently from its a, or
 * whose ç collides with the line below, is a face that is wrong for this product
 * however it reads in English — and Press Start 2P, which is loaded `latin` only,
 * is exactly the family where that goes wrong out of sight.
 *
 * **The machine-text block went with the question it asked.** It drew a room
 * code, a UUID, a generated password and the ambiguous set `0O o 1lI |` in the
 * UA monospace beside Space Mono, so the one-monospace question could be
 * answered by eye. It was answered: the library owns `--font-mono` and points it
 * at Space Mono, there is one monospace on the site, and nothing on this page is
 * the UA stack any more — so there is nothing left to draw it against. Space
 * Mono itself stays below, drawn from the library like the other three, because
 * the Press Start rulings are still choosing between the faces.
 */

import { FACES } from "../../../src/tokens/typography";
import { FACE_CLASS } from "../token-classes";
import { Case, Question } from "./parts";

const LATIN = "Sogverse — the ally at the table";
const DIACRITICS = "ÄäÖöÅåÉéÇç";
const DIGITS = "0123456789";
const AMBIGUOUS = "0O o 1lI |";

function Lines() {
  return (
    <div className="space-y-2 text-body-l">
      <p>{LATIN}</p>
      <p>{DIACRITICS}</p>
      <p>{DIGITS}</p>
      <p>{AMBIGUOUS}</p>
    </div>
  );
}

export function SpecimensSection() {
  return (
    <Question n={1} title="The faces">
      <div className="space-y-10">
        <Case title={FACES.sans.name}>
          <div className={FACE_CLASS.sans ?? ""}>
            <Lines />
          </div>
        </Case>
        <Case title={FACES.serif.name}>
          <div className={FACE_CLASS.serif ?? ""}>
            <Lines />
          </div>
        </Case>
        <Case title={FACES.mono.name}>
          <div className={FACE_CLASS.mono ?? ""}>
            <Lines />
          </div>
        </Case>
        <Case title={FACES.cursive.name}>
          <div className={FACE_CLASS.cursive ?? ""}>
            <Lines />
          </div>
        </Case>
      </div>
    </Question>
  );
}
