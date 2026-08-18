import { Globe, MapPin } from "lucide-react";
import { RegionNote } from "../region-note";
import { regionLockCopy } from "../region-lock-copy";
import { regionNoteText, type RegionSlotBuilder } from "./builder";

/**
 * **Candidate 3 — "checklist-both": the form always stays, and the region lock
 * is just another line on the CTA's checklist.**
 *
 * The panel's button already doubles as the instruction for the next missing
 * step — add a child, agree to the rules, wait for the window — and this
 * candidate says a region block is one more of those. Both states keep the
 * picker and the consent box; a note above the form says what is wrong, and the
 * button says it again in the place a parent's eye already goes for "why can I
 * not click this".
 *
 * The two states differ only in whether the button has anywhere to go: the
 * missing location makes it live and opens the dialog, the wrong country leaves
 * it permanently disabled — the one disabled state on this panel that nothing
 * the reader does will ever clear.
 *
 * The argument for it: the panel never changes shape, so a family that sets a
 * location and turns out to be ineligible sees the same page say something
 * different rather than a different page. The cost, and the thing to look for
 * in the preview: a fully working form sitting under a permanent refusal, which
 * invites somebody to fill it in and press a button that will never do
 * anything.
 */
export const buildChecklistBothRegionSlots: RegionSlotBuilder = ({
  gate,
  locale,
  onSetLocation,
}) => {
  if (gate.kind === "unlocked") return undefined;
  const text = regionNoteText(gate, locale);

  if (gate.kind === "wrong_country") {
    return {
      note: <RegionNote tone="closed" icon={Globe} {...text} />,
      // No handler: the CTA states the refusal and stays disabled. There is no
      // step behind it, which is exactly what distinguishes this from every
      // other label the button can wear.
      cta: { label: regionLockCopy.wrongCountryCta },
    };
  }

  return {
    note: <RegionNote tone="ask" icon={MapPin} {...text} />,
    cta: { label: regionLockCopy.setLocationCta, onClick: onSetLocation },
  };
};
