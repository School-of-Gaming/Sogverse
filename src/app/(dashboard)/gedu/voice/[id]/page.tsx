import type { Metadata } from "next";
import { VoiceSessionPage } from "@/components/voice/VoiceSessionPage";
import { ROUTES } from "@/lib/constants";

export const metadata: Metadata = {
  title: "Voice Session",
  description: "Join a voice session",
};

export default async function GeduVoiceSessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const { groupId } = await searchParams;
  const backHref =
    typeof groupId === "string" ? ROUTES.gedu.group(groupId) : ROUTES.gedu.groups;
  return <VoiceSessionPage roomId={id} backHref={backHref} />;
}
