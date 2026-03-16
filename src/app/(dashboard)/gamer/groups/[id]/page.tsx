import type { Metadata } from "next";
import { GamerGroupDetailContent } from "@/components/gamer/GamerGroupDetailContent";

export const metadata: Metadata = {
  title: "Group Details",
  description: "View group details and members",
};

export default async function GamerGroupDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <GamerGroupDetailContent groupId={id} />;
}
