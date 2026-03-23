import type { Metadata } from "next";
import { AdminGroupsPageContent } from "@/components/admin/AdminGroupsPageContent";

export const metadata: Metadata = {
  title: "Groups",
  description: "View all groups, educators, and students",
};

export default function AdminGroupsPage() {
  return <AdminGroupsPageContent />;
}
