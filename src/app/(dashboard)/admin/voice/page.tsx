import type { Metadata } from "next";
import { VoiceRoomPanel } from "@/components/gedu/VoiceRoomPanel";

export const metadata: Metadata = {
  title: "Voice Rooms",
  description: "Manage and join voice sessions",
};

export default function AdminVoicePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Voice Rooms</h1>
        <p className="text-muted-foreground">
          Create your own session or join an open room.
        </p>
      </div>

      <VoiceRoomPanel />
    </div>
  );
}
