import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { CreateInstantRoomCard } from "@/components/voice/instant/CreateInstantRoomCard";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("geduDashboard"), description: "Spin up a voice room" };
}

export default function GeduDashboardPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <CreateInstantRoomCard />
    </div>
  );
}
