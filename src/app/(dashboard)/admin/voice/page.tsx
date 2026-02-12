import type { Metadata } from "next";
import { VoiceRoomPanel } from "@/components/gedu/VoiceRoomPanel";

export const metadata: Metadata = {
  title: "Voice Rooms",
  description: "Manage and join voice sessions",
};

export default function AdminVoicePage() {
  return <VoiceRoomPanel />;
}
