/**
 * The four faces, and the two monospaces against machine text.
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
 * **The machine-text block is the one-monospace question drawn.** Today the
 * library names `--font-brand-mono` (Space Mono, the world voice) and leaves
 * Tailwind's `--font-mono` as the UA stack, so a room code, an id and a password
 * are set in whatever the reader's OS ships. The proposal is that the library
 * owns `--font-mono` too and points it at Space Mono, which makes one monospace
 * on the site. The thing that has to be judged by eye is whether Space Mono is a
 * face a person can read a password out of: the ambiguous set is `0O o 1lI |`,
 * and a room code dictated over a call, a UUID copied by hand and a generated
 * password typed into a launcher are the three places in this product where
 * getting one glyph wrong costs a support ticket. Drawn side by side with the UA
 * mono, at the sizes the app actually sets them.
 */

import { FACES } from "../../../src/tokens/typography";
import { FACE_CLASS } from "../token-classes";
import { Case, Columns, Column, Question } from "./parts";

const LATIN = "Sogverse — the ally at the table";
const DIACRITICS = "ÄäÖöÅåÉéÇç";
const DIGITS = "0123456789";
const AMBIGUOUS = "0O o 1lI |";

/** A room code in the shape the instant voice rooms generate. */
const ROOM_CODE = "KX7-Q0O-1IL";
/** A real generated UUID, hardcoded — the library's rule for any fixture id. */
const UUID = "9f1c4b0e-7d3a-4a51-b0c6-2e8f5d17a94b";
/** A generated Minecraft password, in the shape the reset tool hands out. */
const PASSWORD = "Wolf1lI-Q0Oz";

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

function MachineText() {
  return (
    <div className="space-y-3">
      <p className="text-2xl font-bold tracking-[0.3em] break-all">{ROOM_CODE}</p>
      <p className="text-sm break-all">{UUID}</p>
      <p className="text-sm break-all">{PASSWORD}</p>
      <p className="text-body-l">{AMBIGUOUS}</p>
      <p className="text-body-l">{DIACRITICS}</p>
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
        <Case title={FACES.brandMono.name}>
          <div className={FACE_CLASS.brandMono ?? ""}>
            <Lines />
          </div>
        </Case>
        <Case title={FACES.cursive.name}>
          <div className={FACE_CLASS.cursive ?? ""}>
            <Lines />
          </div>
        </Case>
      </div>

      <Case title="Machine text">
        <Columns of={2}>
          <Column name="font-mono — today">
            <div className="font-mono">
              <MachineText />
            </div>
          </Column>
          <Column name="Space Mono">
            <div className="font-brand-mono">
              <MachineText />
            </div>
          </Column>
        </Columns>
      </Case>
    </Question>
  );
}
