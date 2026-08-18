import { Globe, MapPin } from "lucide-react";
import { RegionNote } from "../region-note";
import { regionLockCopy } from "../region-lock-copy";
import { regionNoteText, type RegionSlotBuilder } from "./builder";

/**
 * **Candidate 1 — "hybrid": treat the two blocked states as different kinds of
 * thing, and shape each to what the reader can do about it.**
 *
 * - **Wrong country** replaces the form. There is nothing on this page for this
 *   family, so leaving a picker, a consent box and a dead button under the
 *   sentence would be furniture for a purchase that cannot happen. It is the
 *   same swap the panel already makes for a signed-in gedu who lands on a shop
 *   URL, and it reads as the same kind of statement.
 * - **No location** keeps the form, adds the note above it, and turns the CTA
 *   into the step that unblocks the page. The parent came here to buy; the form
 *   they were about to fill in is still theirs to fill in, and the missing
 *   location is one dialog away. Hiding it would be telling somebody they had
 *   been refused when they had only been asked a question.
 *
 * The cost, and the thing to look for in the preview: the two states look
 * nothing alike, so a reader who meets both (a family that sets a location and
 * turns out to be in the wrong country) sees the panel change shape underneath
 * them rather than change its words.
 */
export const buildHybridRegionSlots: RegionSlotBuilder = ({
  gate,
  locale,
  onSetLocation,
}) => {
  if (gate.kind === "unlocked") return undefined;
  const text = regionNoteText(gate, locale);

  if (gate.kind === "wrong_country") {
    return {
      replacesForm: <RegionNote tone="closed" icon={Globe} {...text} />,
    };
  }

  return {
    note: <RegionNote tone="ask" icon={MapPin} {...text} />,
    cta: { label: regionLockCopy.setLocationCta, onClick: onSetLocation },
  };
};
