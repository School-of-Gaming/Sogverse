"use client";

import { Eye } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * The family-facing half of a session write-up, marked as such while it is
 * being written.
 *
 * The staff block beside this one has always announced itself — a padlock and
 * an "only Gedus see this" banner sitting above the box — while the public
 * field was the unmarked default. That asymmetry put the burden on the writer
 * the wrong way round: the field where a mistake is recoverable was the labelled
 * one, and the field where a private remark reaches every parent in the group
 * was the one whose audience had to be *inferred* from a muted line underneath.
 * A gedu skimming an editor reads labels, not footnotes.
 *
 * So the two audiences are now stated the same way and read as a pair, and the
 * treatments are deliberately opposite rather than merely different: this block
 * is solid-bordered and sits on the page background, because what goes in it is
 * published; the staff block is dashed and recessed into a muted panel, because
 * what goes in it is an aside. Same banner geometry, inverted visual weight —
 * so which is which survives a glance without either being read.
 *
 * **Editors only, deliberately.** The staff block is also worn in the read
 * views, where it tells a reader that what they are looking at is not something
 * families can see. A published report needs no such warning after the fact:
 * there is nothing for its reader to be careful about, and a banner over the
 * body copy of every entry in a feed would be noise standing where the writing
 * should be.
 */
export function FamilyNoteBlock({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const t = useTranslations("gedu.sessionFeed");

  return (
    <div className={cn("rounded-md border border-border p-3", className)}>
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        <Eye className="h-3 w-3" aria-hidden />
        {t("familyNoteLabel")}
      </p>
      <div className="mt-2">{children}</div>
    </div>
  );
}
