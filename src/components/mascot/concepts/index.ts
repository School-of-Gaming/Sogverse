import type { ConceptDef, ConceptId } from "../concept";
import { KAVERI } from "./kaveri";
import { KONSU } from "./konsu";
import { OTSO } from "./otso";
import { TAITTO } from "./taitto";
import { YTYMO } from "./ytymo";

/** Every base model, in the order the exploration page presents them. */
export const CONCEPTS: readonly ConceptDef[] = [YTYMO, KONSU, OTSO, KAVERI, TAITTO];

const BY_ID = new Map<ConceptId, ConceptDef>(CONCEPTS.map((c) => [c.id, c]));

export function getConcept(id: ConceptId): ConceptDef {
  const found = BY_ID.get(id);
  if (found === undefined) throw new Error(`Unknown mascot concept: ${id}`);
  return found;
}

export { KAVERI, KONSU, OTSO, TAITTO, YTYMO };
