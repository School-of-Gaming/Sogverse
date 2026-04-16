import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { GamerGroupDetailContent } from "@/components/gamer/GamerGroupDetailContent";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("gamerGroupDetails"), description: "View group details and members" };
}

export default async function GamerGroupDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <GamerGroupDetailContent groupId={id} />;
}
