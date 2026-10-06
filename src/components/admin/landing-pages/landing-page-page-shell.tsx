"use client";

import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";

/**
 * The chrome a landing page's status page sits in: the way back to the list
 * and the page's own title. The title is the page's rather than the landing
 * page's, so it is painted from the first frame and never rewrites itself
 * when the read lands.
 */
export function LandingPagePageShell({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const t = useTranslations("admin.landingPages");

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Link
        href={ROUTES.admin.landingPages}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("backToList")}
      </Link>

      <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>

      {children}
    </div>
  );
}
