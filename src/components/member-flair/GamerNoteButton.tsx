"use client";

import { NotebookPen } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The "this member has a Gedu note" marker, and the way in to writing one: a
 * note icon at the far end of the member's row, lit when a note exists and
 * dimmed when there is none.
 *
 * **It is present on every row, which is the whole of why it won.** Two
 * alternatives were built and reviewed in place — a dot straddling the corner
 * of the avatar, and the note's own first line under the name. The dot is the
 * smallest mark and sits where the eye already is, but it makes the *face* the
 * control, which is not self-evident, and it leaves no affordance at all on the
 * rows that have no note yet — which is most of them, and writing the first one
 * is the common action. The inline preview answers "what does it say" without a
 * click, at the cost of a list whose rows are no longer the same height, and it
 * has the same no-way-in gap. A constant icon has neither problem: every row can
 * be written about, and the lit/dimmed state carries the marker.
 *
 * It is a real control rather than an indicator, so it carries its own
 * accessible name and the row around it stays inert.
 */
export function GamerNoteButton({
  name,
  hasNote,
  onOpen,
  className,
}: {
  name: string;
  /** Whether a note already exists — lights the icon. */
  hasNote: boolean;
  onOpen: () => void;
  className?: string;
}) {
  const t = useTranslations("memberFlair");

  return (
    <Button
      variant="ghost"
      size="icon"
      // The glyph override lives here, not on the icon: the Button base's
      // `[&_svg]:size-4` out-specifies any size class on the svg itself.
      className={cn("h-7 w-7 shrink-0 [&_svg]:size-5", className)}
      onClick={onOpen}
      aria-label={t("openNote", { name })}
      title={t("openNote", { name })}
    >
      <NotebookPen
        className={hasNote ? "text-info" : "text-muted-foreground opacity-50"}
      />
    </Button>
  );
}
