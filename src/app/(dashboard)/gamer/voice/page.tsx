import type { Metadata } from "next";
import { VoiceRoomList } from "@/components/gamer/VoiceRoomList";

export const metadata: Metadata = {
  title: "Voice Rooms",
  description: "Join a live voice session with your educator",
};

export default function GamerVoicePage() {
  return <VoiceRoomList />;
}
