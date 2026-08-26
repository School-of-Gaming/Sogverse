"use client";

import { CircleCheck, Info } from "lucide-react";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { AutoPlacement } from "./panel-rules";

/**
 * Where the next participant will land, said in one line — the answer an admin
 * who has just been handed a product comes to this panel for.
 *
 * **It rides the Unassigned card's header row rather than taking a row of its
 * own**, right-packed into the slack that row already has. Two things follow
 * from living there. It costs no vertical space, so stating the rule never
 * pushes the board down; and the copy gets shorter, because the card supplies
 * the referent — "waits here" needs no naming of the inbox it is sitting in.
 *
 * The settled state is the one worth noticing, so it alone is drawn as an
 * info-coloured chip; the three states that mean "you or the rule still have
 * something to say" stay muted text, because a permanent coloured badge on a
 * product that will never auto-place is noise, not an answer.
 *
 * Every product shows exactly one of the four states, and only the admin adding
 * or deleting a group can move between them — so nothing here appears,
 * disappears or changes size on data's own schedule.
 */
export function AutoPlacementNote({ placement }: { placement: AutoPlacement }) {
  const t = useTranslations("admin.products.groupsPanel.autoPlacement");

  // "Everything is done" — the only state that is a confirmation rather than a
  // reason, and the only one that gets the colour.
  const settled = placement.kind === "single";

  const text = (() => {
    switch (placement.kind) {
      case "single":
        return t("single", { group: placement.groupName });
      case "noGroups":
        return t("noGroups");
      case "manyGroups":
        return t("manyGroups");
      case "charged":
        return t("charged");
    }
  })();

  return (
    <p
      className={cn(
        "flex items-start gap-1.5 text-xs leading-snug sm:max-w-xs sm:shrink-0",
        settled
          ? "rounded-md border border-info/40 bg-info/10 px-2 py-1 text-info"
          : "text-muted-foreground",
      )}
    >
      {settled ? (
        <CircleCheck className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
      ) : (
        <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
      )}
      <span>{text}</span>
    </p>
  );
}
