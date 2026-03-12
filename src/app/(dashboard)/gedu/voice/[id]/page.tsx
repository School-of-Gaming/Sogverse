import type { Metadata } from "next";
import { VoiceSessionPage } from "@/components/voice/VoiceSessionPage";

export const metadata: Metadata = {
  title: "Voice Session",
  description: "Join a voice session",
};

export default async function GeduVoiceSessionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <VoiceSessionPage roomId={id} backHref="/gedu/groups" />;
}
