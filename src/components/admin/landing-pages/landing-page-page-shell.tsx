"use client";

import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";

/**
 * The chrome both landing page editor pages sit in: the way back to the list
 * and the page's own title, painted from the first frame. Wider than the
 * Library's, because the editor sets the structure and the words side by
 * side on a desk-sized screen.
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
    <div className="mx-auto max-w-7xl space-y-6">
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
