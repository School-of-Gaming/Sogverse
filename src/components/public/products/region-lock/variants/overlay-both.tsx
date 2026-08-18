import { Globe, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { RegionNote } from "../region-note";
import { regionLockCopy } from "../region-lock-copy";
import { regionNoteText, type RegionSlotBuilder } from "./builder";

/**
 * **Candidate 2 — "overlay-both": one shape for both blocked states. The form
 * is not offered until the family is known to be eligible.**
 *
 * Both states replace the form with the note; the no-location one carries the
 * button that opens the location dialog, so the way forward is the only control
 * on the panel rather than one of six.
 *
 * The argument for it: a picker and a consent box under a sentence saying the
 * purchase cannot proceed are controls that do nothing, and a parent who fills
 * them in has been led on. Withholding the form until the question is answered
 * is the same discipline the panel already applies to a signed-out visitor —
 * sign in first, then the form — and it makes "blocked" one thing a reader
 * learns once.
 *
 * The cost, and the thing to look for in the preview: the panel loses its
 * price, its seat bar keeps its place above the note, and a parent who has not
 * grasped that a location is even relevant is shown a page that has apparently
 * withdrawn the product. It is also the heaviest response to what is, in the
 * no-location case, a missing field.
 */
export const buildOverlayBothRegionSlots: RegionSlotBuilder = ({
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
    replacesForm: (
      <RegionNote
        tone="ask"
        icon={MapPin}
        {...text}
        action={
          <Button size="lg" className="w-full" onClick={onSetLocation}>
            {regionLockCopy.setLocationCta}
          </Button>
        }
      />
    ),
  };
};
