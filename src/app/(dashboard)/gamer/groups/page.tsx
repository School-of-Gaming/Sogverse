import type { Metadata } from "next";
import { GamerGroupsPageContent } from "@/components/gamer/GamerGroupsPageContent";

export const metadata: Metadata = {
  title: "My Groups",
  description: "View your enrolled groups and voice sessions",
};

export default function GamerGroupsPage() {
  return <GamerGroupsPageContent />;
}
