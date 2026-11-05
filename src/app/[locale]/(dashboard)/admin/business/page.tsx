import type { Metadata } from "next";
import { Suspense } from "react";
import { getTranslations } from "next-intl/server";
import { Heading } from "@sog/ui";
import { BusinessOverviewSection } from "@/components/admin/business/business-overview-section";
import { BusinessOverviewSkeleton } from "@/components/admin/business/business-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("adminBusiness") };
}

/**
 * `/admin/business` — leadership's monthly read on how School of Gaming is
 * doing: families, revenue and Gedu capacity, by Helsinki month.
 *
 * The proxy admits only admins here, and every read behind the figures is one
 * an admin's own session is allowed. The title waits on nothing; the figures
 * stream in under their own `<Suspense>`. `now` is fixed once, here, so every
 * figure on the page — and both invoicing builds behind it — is read at one
 * instant.
 */
export default async function AdminBusinessRoute() {
  const now = new Date();
  const t = await getTranslations("admin.business");

  return (
    <div className="space-y-6 pb-12">
      <div className="space-y-1">
        <Heading level={1} step="section">{t("title")}</Heading>
        <p className="text-sm text-muted-foreground">{t("description")}</p>
      </div>
      <Suspense fallback={<BusinessOverviewSkeleton />}>
        <BusinessOverviewSection now={now} />
      </Suspense>
    </div>
  );
}
