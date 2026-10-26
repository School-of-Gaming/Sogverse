"use client";

import { useTranslations } from "next-intl";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  useAdminLandingPages,
} from "@/services/landing-pages/landing-pages.queries";
import { AdminLandingPagesPage } from "./admin-landing-pages-page";

/**
 * The live data shell for `/admin/landing-pages`: one read, into the body
 * beside it. Nothing is drawn until the read answers, and a read that fails
 * says so rather than reading as an empty list; a failed refetch keeps the
 * rows it had.
 */
export function AdminLandingPagesView() {
  const t = useTranslations("admin.landingPages");
  const { data, isError } = useAdminLandingPages();

  if (data !== undefined) return <AdminLandingPagesPage pages={data} />;
  if (!isError) return null;
  return (
    <Alert variant="destructive">
      <AlertDescription>{t("listLoadError")}</AlertDescription>
    </Alert>
  );
}
