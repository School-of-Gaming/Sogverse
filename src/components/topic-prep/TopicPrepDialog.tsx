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
import type { ProductTopic } from "@/types";

/**
 * The "Before the first session" guide as an overlay, with the one button that
 * puts it away for good.
 *
 * **Reading the guide is not finishing with it.** Opening the dialog, scrolling
 * it, closing it to go and install something and coming back are all the same
 * act — reading — and none of them says the family is set up. Only the
 * affirmative button says that, so it is the only thing that reports a
 * dismissal: Escape, the backdrop and a back gesture all close the overlay and
 * leave the affordance exactly where it was. That asymmetry is the whole
 * behaviour of this component, and it is why "close" and "I'm ready" are two
 * different outcomes rather than one.
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
  topic: ProductTopic;
  /** The product's `is_remote` — decides which steps the guide renders. */
  isRemote: boolean;
  /**
   * The family says they are set up. Fires before the dialog closes, and only
   * from the affirmative button.
   */
  onReady: () => void;
}

export function TopicPrepDialog({
  open,
  onOpenChange,
  topic,
  isRemote,
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
          <TopicPrepContent topic={topic} isRemote={isRemote} />
        </div>

        {/* One button, and it is the affirmative — so it is last in the DOM and
            lands on the right of the row, exactly where every other dialog in
            the app puts the answer to its own question. There is no negative
            half to pair it with: the question is "have you done this yet", and
            "not yet" is answered by closing the overlay rather than by a button
            that would have to claim the family is not ready. */}
        <DialogFooter className="mt-0 p-6 pt-4">
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
