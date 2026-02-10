import type { VoiceRoom, OpenVoiceRoom } from "@/types";

// Using generic type to avoid version-specific Supabase type incompatibilities
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClientType = any;

export class VoiceService {
  constructor(private supabase: SupabaseClientType) {}

  /** Get all currently open voice rooms (for gamers) */
  async getOpenRooms(): Promise<OpenVoiceRoom[]> {
    const { data, error } = await this.supabase.rpc("get_open_voice_rooms");
    if (error) throw error;
    return data || [];
  }

  /** Get the current gedu's voice room */
  async getMyRoom(): Promise<VoiceRoom | null> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { data, error } = await this.supabase
      .from("voice_rooms")
      .select("*")
      .eq("gedu_id", user.id)
      .single();

    if (error && error.code === "PGRST116") {
      // No rows returned — gedu hasn't created a room yet
      return null;
    }
    if (error) throw error;
    return data;
  }

  /** Open the gedu's voice room (creates if needed) */
  async openRoom(name?: string): Promise<VoiceRoom> {
    const response = await fetch("/api/voice/room", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Failed to open room");
    }

    const { room } = await response.json();
    return room;
  }

  /** Close the gedu's voice room */
  async closeRoom(): Promise<VoiceRoom> {
    const response = await fetch("/api/voice/room", {
      method: "PATCH",
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Failed to close room");
    }

    const { room } = await response.json();
    return room;
  }

  /** Get a Daily.co meeting token for a room */
  async getToken(roomId: string): Promise<{ token: string; roomUrl: string }> {
    const response = await fetch("/api/voice/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId }),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Failed to get token");
    }

    return response.json();
  }
}
