import type { Metadata } from "next";
import { VoiceRoomPanel } from "@/components/gedu/VoiceRoomPanel";

export const metadata: Metadata = {
  title: "Voice Room",
  description: "Manage your live voice session",
};

export default function GeduVoicePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Voice Room</h1>
        <p className="text-muted-foreground">
          Run live voice sessions with your gamers.
        </p>
      </div>

      <VoiceRoomPanel />
    </div>
  );
}
