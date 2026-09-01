"use client";

import { NotebookPen } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * The way in to a member's per-gamer dialog, and the marker for what is already
 * in it: a note icon at the far end of the member's row, lit when there is
 * something recorded and dimmed when there is not.
 *
 * **It is present on every row, which is the whole of why it won.** Two
 * alternatives were built and reviewed in place — a dot straddling the corner
 * of the avatar, and the note's own first line under the name. The dot is the
 * smallest mark and sits where the eye already is, but it makes the *face* the
 * control, which is not self-evident, and it leaves no affordance at all on the
 * rows that have nothing yet — which is most of them, and writing the first
 * thing is the common action. The inline preview answers "what does it say"
 * without a click, at the cost of a list whose rows are no longer the same
 * height, and it has the same no-way-in gap. A constant icon has neither
 * problem: every row can be written about, and the tone carries the marker.
 *
 * **Three tones, one control**, because all three answer the same question —
 * what is recorded about this person, and is anything wanted:
 *
 * - **dim** — nothing recorded. Most rows.
 * - **lit** — a note, a creation, or both.
 * - **warning** — this group's final session is owed a creation from this
 *   member. It outranks "lit" because it is the only one of the three that is
 *   *work*, and the row it sits on is where that work is done.
 *
 * The tone is never the whole signal: the owed state renames the control, so
 * the reason reaches a screen reader and a hovering cursor as words rather than
 * as a colour. That is also what makes it a marker rather than a second
 * affordance — the plan's one-authoring-surface rule wants every creations
 * signal to route into this same dialog, and toning the control that already
 * opens it is the only rendering that cannot become a second way in. It costs
 * no layout either: a colour change moves nothing on a row whose trailing
 * controls are already the right-packed sink for anything arriving late.
 *
 * It is a real control rather than an indicator, so it carries its own
 * accessible name and the row around it stays inert.
 */
export function GamerFlairButton({
  name,
  hasContent,
  owesCreation = false,
  onOpen,
  className,
}: {
  name: string;
  /** Whether a note or any creation already exists — lights the icon. */
  hasContent: boolean;
  /**
   * Whether this member still owes a creation for the group's final session.
   * Only ever true on a flagged product whose run has finished; every other
   * surface leaves it at its default.
   */
  owesCreation?: boolean;
  onOpen: () => void;
  className?: string;
}) {
  const t = useTranslations("memberFlair");
  const label = owesCreation
    ? t("openMemberCreationOwed", { name })
    : t("openMember", { name });

  return (
    <Button
      variant="ghost"
      size="icon"
      // The glyph override lives here, not on the icon: the Button base's
      // `[&_svg]:size-4` out-specifies any size class on the svg itself.
      className={cn("h-7 w-7 shrink-0 [&_svg]:size-5", className)}
      onClick={onOpen}
      aria-label={label}
      title={label}
    >
      <NotebookPen
        className={
          owesCreation
            ? "text-warning"
            : hasContent
              ? "text-yty-wit-soft"
              : "text-muted-foreground opacity-50"
        }
      />
    </Button>
  );
}
