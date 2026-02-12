import type { VoiceRoom, OpenVoiceRoom } from "@/types";

// Using generic type to avoid version-specific Supabase type incompatibilities
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClientType = any;

export class VoiceService {
  constructor(private supabase: SupabaseClientType) {}

  /** Get all currently open voice rooms */
  async getOpenRooms(): Promise<OpenVoiceRoom[]> {
    const { data, error } = await this.supabase.rpc("get_open_voice_rooms");
    if (error) throw error;
    return data || [];
  }

  /** Get the current user's voice room (creator's own room) */
  async getMyRoom(): Promise<VoiceRoom | null> {
    const {
      data: { user },
    } = await this.supabase.auth.getUser();
    if (!user) throw new Error("Not authenticated");

    const { data, error } = await this.supabase
      .from("voice_rooms")
      .select("*")
      .eq("creator_id", user.id)
      .single();

    if (error && error.code === "PGRST116") {
      // No rows returned — user hasn't created a room yet
      return null;
    }
    if (error) throw error;
    return data;
  }

  /** Open a voice room (creates if needed) */
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

  /** Close a voice room. Optionally pass roomId for admin closing another creator's room. */
  async closeRoom(roomId?: string): Promise<VoiceRoom> {
    const response = await fetch("/api/voice/room", {
      method: "PATCH",
      ...(roomId
        ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roomId }) }
        : {}),
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || "Failed to close room");
    }

    const { room } = await response.json();
    return room;
  }

  /** Get a Daily.co meeting token for a room */
  async getToken(roomId: string): Promise<{ token: string; roomUrl: string; role: string }> {
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
