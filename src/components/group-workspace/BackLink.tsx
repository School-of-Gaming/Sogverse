"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { ROUTES } from "@/lib/constants";

/**
 * "Back to My SOG" at the top of the group workspace — the gedu shell's back
 * link, and the workspace's default when a shell hands it none.
 *
 * It lives here rather than in the gedu tree because the workspace's default
 * cannot import upward out of a role's directory; a shell whose way back is
 * somewhere else (the admin's is the product this group belongs to) passes its
 * own and never renders this one. Shared by the loaded page and its skeleton so
 * the two can't drift on the one piece of navigation held across the wait.
 */
export function SessionDetailsBackLink() {
  const t = useTranslations("gedu.sessionDetails");
  return (
    <Link
      href={ROUTES.gedu.dashboard}
      className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="h-4 w-4" />
      {t("back")}
    </Link>
  );
}
