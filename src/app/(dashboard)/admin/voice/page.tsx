import type { Metadata } from "next";
import { VoiceRoomDashboard } from "@/components/voice/VoiceRoomDashboard";

export const metadata: Metadata = {
  title: "Voice Rooms",
  description: "Manage and join voice sessions",
};

export default function AdminVoicePage() {
  return <VoiceRoomDashboard />;
}
