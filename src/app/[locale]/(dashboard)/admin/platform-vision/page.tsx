import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { PlatformVisionPage } from "@/components/admin/platform-vision/platform-vision-page";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("adminPlatformVision") };
}

export default function AdminPlatformVisionPage() {
  return <PlatformVisionPage />;
}
