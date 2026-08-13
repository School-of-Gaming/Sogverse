"use client";

import { Eye } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * The family-facing half of a session write-up, marked as such while it is
 * being written.
 *
 * **The two audiences are treated as opposites, not merely as different.** This
 * block is solid-bordered and sits on the page background, because what goes in
 * it is published; its staff-only counterpart is dashed and recessed into a
 * muted panel, because what goes in it is an aside. That inversion is the part
 * a reader gets without reading anything, and it holds wherever either block is
 * used.
 *
 * **The banner is for a caller with nowhere else to say who reads this.** A
 * block wrapped straight around body copy, or around a field whose label is
 * only the field's name, has no other place to name its audience, so the block
 * supplies one: a small uppercase line above the content. A caller whose own
 * title already names the audience in words passes `audienceStatedByField` and
 * gets the container treatment without the banner — two labels stacked on one
 * box is a heading competing with a heading, and the words a writer actually
 * reads are the ones attached to the field they are typing into.
 *
 * Whichever way it is composed, the audience must be *stated*: the risk this
 * whole feature carries is a gedu writing for one audience while picturing the
 * other, and inference from a border style is not a statement.
 */
export function FamilyNoteBlock({
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
    <div className={cn("rounded-md border border-border p-3", className)}>
      {audienceStatedByField ? (
        children
      ) : (
        <>
          <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            <Eye className="h-3 w-3" aria-hidden />
            {t("familyNoteLabel")}
          </p>
          <div className="mt-2">{children}</div>
        </>
      )}
    </div>
  );
}
