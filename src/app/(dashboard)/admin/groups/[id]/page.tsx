import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { AdminGroupDetailContent } from "@/components/admin/AdminGroupDetailContent";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("adminGroupDetails"), description: "View group details and enrolled gamers" };
}

export default async function AdminGroupDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AdminGroupDetailContent groupId={id} />;
}
