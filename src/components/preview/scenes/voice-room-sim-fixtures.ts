import type { VoiceParticipant } from "@/components/voice/hooks/types";
import type { SimulationScript } from "./voice-room-simulation";

/** Everyone who can arrive mid-session, enough to fill a zone to 25. */
const BENCH_PEOPLE = [
  ["Leevi", "84b49abd-52ac-469c-b6e4-b2045b537f28"],
  ["Ella", "67c2f97d-62e4-4513-82d6-2ad82895d705"],
  ["Onni", "c7d68533-8761-4143-9f66-fc14469e0dc9"],
  ["Venla", "dc4f2885-9797-4f99-a945-a7982d11b5f9"],
  ["Eino", "e145f7df-1c24-407b-b7a2-166b56193826"],
  ["Helmi", "3d1d5c07-c80d-44fb-9a61-a0a35ba5828e"],
  ["Toivo", "49c231b2-a903-4cbd-9f65-ed16c5f7ff39"],
  ["Lilja", "ce3b6467-ad21-4082-ac96-577bac58372d"],
  ["Noel", "98d0262f-6fb3-4dc5-9640-7e3484c9fec6"],
  ["Sofia", "7147e79c-eddc-47fc-82bf-9eccf94f7118"],
  ["Veikko", "38ddb1b9-a41b-4cef-8a5e-eb214e8dff72"],
  ["Isla", "2cca84ae-f09a-44f7-815a-eacd66581fdc"],
  ["Aatos", "40daedb6-5b62-427e-8a50-d531a90846df"],
  ["Enni", "02bdd5da-f7dc-48a5-81c5-1bb91dc831c1"],
  ["Niilo", "70e6077d-1757-4e19-9dad-87fa2e6b5f83"],
  ["Pihla", "96b67275-34d6-4451-9be0-0cae35ed3bf2"],
  ["Lauri", "126e18de-b5b2-4a19-b195-2f909eaab932"],
  ["Aada", "39808bf7-3cfb-44ae-b3e3-34eda797028d"],
  ["Rasmus", "11fd7d4c-6899-4695-bdd0-4547fb0ff719"],
  ["Iida", "802c3a0a-2207-43ef-90b9-96353cb29486"],
  ["Otso", "475552de-2871-4cec-945e-07ca1baa3c7a"],
  ["Saga", "e39c5a4a-cade-4938-9be3-7de88c490ff9"],
  ["Mikael", "aa631c77-69d9-4d8d-b90b-1adf0be8db86"],
  ["Stella", "5ecb096e-1719-4dfa-98e4-c36b88f5832a"],
] as const;

/** The camera habit of a crowd: two in three on, in a fixed pattern. */
const cameraOn = (index: number) => index % 3 !== 2;

export function buildBench(): VoiceParticipant[] {
  return BENCH_PEOPLE.map(([userName, userId], index) => ({
    sessionId: `s-bench-${index}`,
    userId,
    userName,
    role: "gamer",
    zoneId: "lobby",
    audioOn: index % 5 !== 4,
    videoOn: cameraOn(index),
    screenShareOn: false,
    isLocal: false,
    isOwner: false,
    isSpeaking: false,
    isBroadcasting: false,
    gamePlatform: "minecraft",
    gameUsername: null,
    gameExternalId: null,
  }));
}

/** The fixture room with its cameras on and nobody speaking until the script says so. */
export function withLiveCameras(participants: VoiceParticipant[]): VoiceParticipant[] {
  return participants.map((p, index) => ({
    ...p,
    isSpeaking: false,
    videoOn: !p.isLocal && cameraOn(index),
  }));
}

/** A club session: one or two people talking where the reader is, a little chatter elsewhere. */
export const GROUP_SESSION_SCRIPT: SimulationScript = {
  voices: [
    { where: "here", talkMs: [1400, 5200], gapMs: [300, 2600] },
    { where: "here", talkMs: [700, 2400], gapMs: [3000, 9000] },
    { where: "elsewhere", talkMs: [1200, 4000], gapMs: [800, 4000] },
  ],
  crowdGapMs: [3500, 8000],
  shareGapMs: [9000, 14000],
  shareLengthMs: [18000, 26000],
};
