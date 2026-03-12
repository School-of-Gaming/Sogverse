import type { Metadata } from "next";
import { GeduGroupDetailContent } from "@/components/gedu/GeduGroupDetailContent";

export const metadata: Metadata = {
  title: "Group Details",
  description: "View group details and enrolled gamers",
};

export default async function GeduGroupDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <GeduGroupDetailContent groupId={id} />;
}
