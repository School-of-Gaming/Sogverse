"use client";

import { Lock } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * The staff-only half of a session write-up.
 *
 * Two audiences read a session entry — families read the public note, the team
 * reads this — and the whole risk of the feature is a gedu typing something for
 * one audience while picturing the other. So this never looks like body copy:
 * it is a recessed, dashed, muted panel, the deliberate opposite of the
 * solid-bordered box its family-facing counterpart uses, and it keeps that
 * treatment in the editors as much as in the read views, so the boundary is
 * visible at the moment of writing and not only at the moment of reading.
 *
 * **The banner is for a caller with nowhere else to say who reads this.** A
 * block wrapped straight around body copy, or around a field whose label is
 * only the field's name, has no other place to name its audience, so the block
 * supplies one: a padlock and a small uppercase line above the content. A
 * caller whose own title already names the audience in words passes
 * `audienceStatedByField` and gets the container treatment without the banner —
 * two labels stacked on one box is a heading competing with a heading, and the
 * words a writer actually reads are the ones attached to the field they are
 * typing into.
 *
 * Whichever way it is composed, the audience must be *stated* — a recessed
 * panel is a signal to notice, not a sentence, and nothing here may be left to
 * inference from a border style.
 */
export function StaffNoteBlock({
  className,
  audienceStatedByField = false,
  children,
}: {
  className?: string;
  /**
   * The content inside carries the audience in its own title, so the block's
   * banner would only repeat it.
   */
  audienceStatedByField?: boolean;
  children: React.ReactNode;
}) {
  const t = useTranslations("gedu.sessionFeed");

  return (
    <div
      className={cn(
        "rounded-md border border-dashed border-border bg-muted/60 p-3",
        className,
      )}
    >
      {audienceStatedByField ? (
        children
      ) : (
        <>
          <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            <Lock className="h-3 w-3" aria-hidden />
            {t("staffNoteLabel")}
          </p>
          <div className="mt-2">{children}</div>
        </>
      )}
    </div>
  );
}
