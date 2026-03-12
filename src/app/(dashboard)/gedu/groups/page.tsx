import type { Metadata } from "next";
import { GeduGroupsPageContent } from "@/components/gedu/GeduGroupsPageContent";

export const metadata: Metadata = {
  title: "Groups",
  description: "View your assigned groups and students",
};

export default function GeduGroupsPage() {
  return <GeduGroupsPageContent />;
}
