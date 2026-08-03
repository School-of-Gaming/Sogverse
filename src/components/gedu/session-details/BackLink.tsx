"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { ROUTES } from "@/lib/constants";

/**
 * "Back to dashboard" at the top of the gedu's product page. Shared by the
 * live page and its draft redesign so the two can't drift on the one piece of
 * navigation the page owns.
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
