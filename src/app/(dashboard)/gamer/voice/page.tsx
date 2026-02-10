import type { Metadata } from "next";
import { VoiceRoomList } from "@/components/gamer/VoiceRoomList";

export const metadata: Metadata = {
  title: "Voice Rooms",
  description: "Join a live voice session with your educator",
};

export default function GamerVoicePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Voice Rooms</h1>
        <p className="text-muted-foreground">
          Join a live voice session with your educator.
        </p>
      </div>

      <VoiceRoomList />
    </div>
  );
}
