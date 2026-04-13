import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { GeduGroupDetailContent } from "@/components/gedu/GeduGroupDetailContent";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("geduGroupDetails"), description: "View group details and enrolled gamers" };
}

export default async function GeduGroupDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <GeduGroupDetailContent groupId={id} />;
}
