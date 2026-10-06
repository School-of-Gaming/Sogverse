import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { LandingPageStatusView } from "@/components/admin/landing-pages/landing-page-status-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("adminLandingPage") };
}

export default async function LandingPageRoute({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <LandingPageStatusView pageId={id} />;
}
