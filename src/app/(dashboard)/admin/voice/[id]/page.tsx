import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { VoiceSessionPage } from "@/components/voice/VoiceSessionPage";
import { ROUTES } from "@/lib/constants";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return { title: t("voiceSession"), description: "Join a voice session" };
}

export default async function AdminVoiceSessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const { groupId } = await searchParams;
  const backHref =
    typeof groupId === "string" ? ROUTES.admin.group(groupId) : ROUTES.admin.groups;
  return <VoiceSessionPage roomId={id} backHref={backHref} />;
}
