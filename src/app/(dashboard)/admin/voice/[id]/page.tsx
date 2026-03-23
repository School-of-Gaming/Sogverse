import type { Metadata } from "next";
import { VoiceSessionPage } from "@/components/voice/VoiceSessionPage";
import { ROUTES } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Voice Session",
  description: "Join a voice session",
};

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
