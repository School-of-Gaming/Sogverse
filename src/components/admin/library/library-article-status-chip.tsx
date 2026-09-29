"use client";

import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";
import type { LibraryArticleStatus } from "./library-article-form";

/**
 * The one chip that says where an article stands with readers — the product
 * status chip's shape: a neutral edge, no fill, the word in the state's colour.
 *
 * `published` is success, the state where the article is doing its job.
 * `changed` is info, as the product chip's `pending` is: something is coming
 * that readers do not see yet — saved changes waiting to be published. `draft`
 * spends no colour, since most articles begin there and a coloured chip on
 * every one of them would be the loudest thing in the list.
 */
const STATUS_STYLE: Record<LibraryArticleStatus, string> = {
  draft: "text-muted-foreground",
  published: "text-success",
  changed: "text-info",
};

export function LibraryArticleStatusChip({
  status,
}: {
  status: LibraryArticleStatus;
}) {
  const t = useTranslations("admin.library.status");

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
