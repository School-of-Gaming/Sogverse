"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { TopicPrepContent } from "./TopicPrepContent";
import type { TopicPrepPlan } from "@/lib/products/topics";

/**
 * The "Before the first session" guide as an overlay, with two ways out and
 * only one of them putting it away for good.
 *
 * **Reading the guide is not finishing with it.** Opening the dialog, scrolling
 * it, closing it to go and install something and coming back are all the same
 * act — reading — and none of them says the family is set up. Only the
 * affirmative says that, so it is the only thing that reports a dismissal: the
 * negative button, Escape, the backdrop and a back gesture all close the
 * overlay and leave the affordance exactly where it was. That asymmetry is the
 * whole behaviour of this component, and it is why closing and answering are
 * two different outcomes rather than one.
 *
 * **The negative gets a visible button because the honest exit had none.** With
 * the affirmative alone in the footer, a single button is read as the door
 * rather than as an answer, and families who had not done a step pressed it to
 * get out — spending the card's one offer on a guide they never followed. The
 * ways to leave without answering were all there and none of them was a control
 * a thumb could find: Escape is not on a phone at all, and a backdrop is not
 * something a reader knows is clickable. So the honest exit is drawn as what it
 * always was — a second, lesser button, saying the same thing as closing.
 *
 * **The body scrolls inside the box rather than growing it.** The Roblox Studio
 * guide is three steps with per-platform notes and a four-item checklist, which
 * is well past a phone's height, and a dialog taller than the viewport puts its
 * button somewhere no thumb can reach. So the card is capped at the viewport,
 * the header and the footer are fixed to its ends, and the guide is what moves
 * between them.
 *
 * It draws no heading of its own — the dialog's title already says those exact
 * words, and `TopicPrepContent` takes that as a prop precisely so a surface
 * that has said them does not say them twice.
 *
 * Nothing about the card underneath reaches this: the dialog primitive portals
 * to `document.body`, so a click inside it cannot land on the stretched anchor
 * that covers an enrollment card.
 */
export interface TopicPrepDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * The guide to show — `resolveTopicPrep`'s answer, resolved by the card. A
   * card only offers the dialog where there is a guide, so it is holding the
   * plan already and passes it rather than the question it asked.
   */
  plan: TopicPrepPlan;
  /**
   * The family says they are set up. Fires before the dialog closes, and only
   * from the affirmative button.
   */
  onReady: () => void;
}

export function TopicPrepDialog({
  open,
  onOpenChange,
  plan,
  onReady,
}: TopicPrepDialogProps) {
  const t = useTranslations("topicPrep");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* `p-0` so the scrolling middle can carry its own padding — a padded
          card with a scrolling child clips the text against the padding edge
          instead of scrolling past it. `svh` rather than `vh` because a mobile
          browser's `vh` includes the address bar it is about to hide, which is
          how a footer button ends up under the chrome. */}
      <DialogContent className="flex max-h-[85svh] flex-col p-0">
        <DialogHeader className="p-6 pb-4">
          <DialogTitle>{t("dialogTitle")}</DialogTitle>
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-y-auto px-6">
          <TopicPrepContent plan={plan} />
        </div>

        {/* The two halves of one question — "have you done this yet" — so they
            take the order every other dialog in the app uses: the negative
            first in the DOM, the affirmative last, which puts the answer on the
            right of the row and on top of the stack. The footer already carries
            that shape, so nothing here arranges it. The negative is the lesser
            of the two and is drawn as one, because it asks for nothing: it
            closes the overlay and reports nothing, exactly as every other way
            of leaving does. */}
        <DialogFooter className="mt-0 p-6 pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("notYetLabel")}
          </Button>
          <Button
            onClick={() => {
              onReady();
              onOpenChange(false);
            }}
          >
            {t("readyLabel")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
