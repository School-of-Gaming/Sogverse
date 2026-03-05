import type { Metadata } from "next";
import { VoiceRoomDashboard } from "@/components/voice/VoiceRoomDashboard";

export const metadata: Metadata = {
  title: "Voice Rooms",
  description: "Join a live voice session with your educator",
};

export default function GamerVoicePage() {
  return <VoiceRoomDashboard />;
}
