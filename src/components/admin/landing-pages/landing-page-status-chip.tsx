"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { AdminLandingPageListItem } from "@/services/landing-pages";

/**
 * Where a page stands with readers, as one word: `draft` (not on the site),
 * `live` (on the site exactly as saved), `changed` (on the site, with saved
 * changes readers do not see yet).
 */
export type LandingPageStatus = "draft" | "live" | "changed";

export function landingPageStatus(
  page: Pick<AdminLandingPageListItem, "isPublished" | "hasUnpublishedChanges">,
): LandingPageStatus {
  if (!page.isPublished) return "draft";
  return page.hasUnpublishedChanges ? "changed" : "live";
}

/**
 * Where a landing page stands with readers — the Library status chip's shape
 * and colours: `live` is success, `changed` is info (saved changes readers do
 * not see yet), and `draft` spends no colour.
 */
const STATUS_STYLE: Record<LandingPageStatus, string> = {
  draft: "text-muted-foreground",
  live: "text-success",
  changed: "text-info",
};

export function LandingPageStatusChip({ status }: { status: LandingPageStatus }) {
  const t = useTranslations("admin.landingPages.status");

  return (
    <span
      className={cn(
        "inline-block shrink-0 rounded-full border border-border px-2 py-0.5 text-xs font-medium",
        STATUS_STYLE[status],
      )}
    >
      {t(status)}
    </span>
  );
}
