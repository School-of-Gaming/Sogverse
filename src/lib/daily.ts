import { VOICE_CONFIG } from "@/lib/constants/voice";

const DAILY_API_BASE = "https://api.daily.co/v1";

function getApiKey(): string {
  const key = process.env.DAILY_API_KEY;
  if (!key) {
    throw new Error("Missing DAILY_API_KEY environment variable");
  }
  return key;
}

async function dailyFetch(path: string, options?: RequestInit) {
  const response = await fetch(`${DAILY_API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getApiKey()}`,
      ...options?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    console.error("Daily.co API error:", response.status, response.statusText, JSON.stringify(body));
    throw new Error(
      body.info || body.error || `Daily.co API error: ${response.status} ${response.statusText}`
    );
  }

  return response.json();
}

interface CreateRoomConfig {
  name: string;
  maxParticipants?: number;
}

interface DailyRoom {
  id: string;
  name: string;
  url: string;
  privacy: string;
  created_at: string;
}

export async function createDailyRoom(config: CreateRoomConfig): Promise<DailyRoom> {
  return dailyFetch("/rooms", {
    method: "POST",
    body: JSON.stringify({
      name: config.name,
      privacy: "private",
      properties: {
        max_participants: config.maxParticipants ?? VOICE_CONFIG.MAX_PARTICIPANTS,
        enable_chat: false,
        enable_screenshare: false,
      },
    }),
  });
}

export async function getDailyRoom(name: string): Promise<DailyRoom | null> {
  try {
    return await dailyFetch(`/rooms/${encodeURIComponent(name)}`);
  } catch {
    return null;
  }
}

export async function deleteDailyRoom(name: string): Promise<void> {
  await dailyFetch(`/rooms/${encodeURIComponent(name)}`, { method: "DELETE" });
}

interface CreateTokenOptions {
  roomName: string;
  isOwner: boolean;
  enableCamera: boolean;
  enableMic: boolean;
  userName?: string;
}

interface DailyToken {
  token: string;
}

export async function createMeetingToken(options: CreateTokenOptions): Promise<string> {
  const exp = Math.round(Date.now() / 1000) + VOICE_CONFIG.TOKEN_EXPIRY_SECONDS;

  const result: DailyToken = await dailyFetch("/meeting-tokens", {
    method: "POST",
    body: JSON.stringify({
      properties: {
        room_name: options.roomName,
        is_owner: options.isOwner,
        start_video_off: !options.enableCamera,
        start_audio_off: !options.enableMic,
        user_name: options.userName,
        exp,
      },
    }),
  });

  return result.token;
}
