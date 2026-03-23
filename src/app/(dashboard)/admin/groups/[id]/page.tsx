import type { Metadata } from "next";
import { AdminGroupDetailContent } from "@/components/admin/AdminGroupDetailContent";

export const metadata: Metadata = {
  title: "Group Details",
  description: "View group details and enrolled gamers",
};

export default async function AdminGroupDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <AdminGroupDetailContent groupId={id} />;
}
