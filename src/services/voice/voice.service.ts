import type { AvailableVoiceRoom } from "@/types";
import { computeSessionWindow } from "@/lib/voice-schedule";

// Using generic type to avoid version-specific Supabase type incompatibilities
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClientType = any;

export interface AvailableVoiceRoomWithWindow extends AvailableVoiceRoom {
  isOpen: boolean;
  nextSessionStart: Date | null;
  windowClosesAt: Date | null;
}

export class VoiceService {
  constructor(private supabase: SupabaseClientType) {}

  /** Get all voice rooms available to the current user, with computed session window */
  async getAvailableRooms(): Promise<AvailableVoiceRoomWithWindow[]> {
    const { data, error } = await this.supabase.rpc("get_available_voice_rooms");
    if (error) throw error;

    const rooms: AvailableVoiceRoom[] = data || [];

    return rooms.map((room) => {
      if (room.room_type !== "group" || room.day_of_week == null || !room.start_time || !room.timezone || !room.duration_minutes) {
        // Always-open rooms (admin_only, gedu_only)
        return { ...room, isOpen: true, nextSessionStart: null, windowClosesAt: null };
      }

      const window = computeSessionWindow({
        day_of_week: room.day_of_week,
        start_time: room.start_time,
        timezone: room.timezone,
        duration_minutes: room.duration_minutes,
      });

      // If the gamer enrolled after the current session started, treat as not open.
      // They haven't paid for this session — their first paid session is next week.
      const enrolledAfterStart = window.isOpen
        && room.enrolled_at
        && new Date(room.enrolled_at).getTime() >= window.nextSessionStart.getTime();

      return {
        ...room,
        isOpen: window.isOpen && !enrolledAfterStart,
        nextSessionStart: window.nextSessionStart,
        windowClosesAt: window.windowClosesAt,
      };
    });
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
