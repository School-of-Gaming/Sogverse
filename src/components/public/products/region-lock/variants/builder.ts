import type { SignupRegionGateSlots } from "../../signup-panel-view";
import { countryDisplayName, type RegionGate } from "../region-gate";
import { regionLockCopy } from "../region-lock-copy";

/**
 * **What every region-lock candidate is: one pure function.**
 *
 * A candidate takes the gate and returns the slots the signup panel should
 * place — nothing else. No hooks, no state, no component of its own, which is
 * what keeps them genuinely interchangeable: the panel is identical under all
 * three, so a difference on screen between two preview scenes is a difference
 * in the proposal rather than in the plumbing around it.
 *
 * It is also what makes the losers cheap to delete. Two of these three files go
 * when the owner picks, and each is a file plus one entry in the scene's map;
 * there is no branch in the panel to unpick and no shared component to
 * disentangle.
 *
 * `undefined` is the unlocked answer, and it is the same `undefined` a product
 * with no lock at all produces — so an unlocked page is not "the gate rendering
 * nothing", it is the panel with no gate, which is the third scenario on the
 * scene.
 */
export interface RegionSlotContext {
  gate: RegionGate;
  /** The viewer's locale, for naming the country in their own language. */
  locale: string;
  /** Opens the set-location dialog, wherever a candidate offers one. */
  onSetLocation: () => void;
}

export type RegionSlotBuilder = (
  ctx: RegionSlotContext,
) => SignupRegionGateSlots | undefined;

/**
 * The title and sentence for a blocked gate, resolved once so all three
 * candidates say the same words and differ only in where they put them.
 *
 * The country is named in the wrong-country sentence and nowhere else — see the
 * copy module for why that asymmetry is deliberate.
 */
export function regionNoteText(
  gate: Exclude<RegionGate, { kind: "unlocked" }>,
  locale: string,
): { title: string; body: string } {
  if (gate.kind === "no_location") {
    return {
      title: regionLockCopy.noLocationTitle,
      body: regionLockCopy.noLocationBody,
    };
  }
  return {
    title: regionLockCopy.wrongCountryTitle,
    body: regionLockCopy.wrongCountryBody(
      countryDisplayName(gate.requiredCountry, locale),
    ),
  };
}
