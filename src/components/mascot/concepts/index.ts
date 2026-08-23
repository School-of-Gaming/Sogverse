import type { ConceptDef, ConceptId } from "../concept";
import { KAARI } from "./kaari";
import { KAVERI } from "./kaveri";
import { KIDE } from "./kide";
import { KONSU } from "./konsu";
import { NAPPI } from "./nappi";
import { OTSO } from "./otso";
import { PALIKKA } from "./palikka";
import { SILMU } from "./silmu";
import { TAITTO } from "./taitto";
import { YTYMO } from "./ytymo";

/**
 * Every base model, in the order the exploration page presents them: the two
 * families first (they are the ones doing the product's actual job), then the
 * fold and its three branches, then the two round-one concepts that round two
 * only touched lightly, and last the one that is not a proposal at all —
 * Silmu is the mascot this company already had, brought into the same rig so
 * it can be compared against the new work on equal terms — followed by
 * Palikka, which is the other half of that same argument: the two voxel files
 * in the legacy folder, rebuilt front-facing so they can stand in the lineup.
 */
export const CONCEPTS: readonly ConceptDef[] = [
  KAVERI,
  OTSO,
  TAITTO,
  KAARI,
  KIDE,
  NAPPI,
  YTYMO,
  KONSU,
  SILMU,
  PALIKKA,
];

/** The fold and everything branched off it, for the side-by-side comparison. */
export const TAITTO_FAMILY: readonly ConceptDef[] = [TAITTO, KAARI, KIDE, NAPPI];

const BY_ID = new Map<ConceptId, ConceptDef>(CONCEPTS.map((c) => [c.id, c]));

export function getConcept(id: ConceptId): ConceptDef {
  const found = BY_ID.get(id);
  if (found === undefined) throw new Error(`Unknown mascot concept: ${id}`);
  return found;
}

export { KAARI, KAVERI, KIDE, KONSU, NAPPI, OTSO, PALIKKA, SILMU, TAITTO, YTYMO };
