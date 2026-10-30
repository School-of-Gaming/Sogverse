import type { VoiceParticipant } from "@/components/voice/hooks/types";
import type { SimulationScript } from "./voice-room-simulation";

/** Everyone who can arrive mid-session, enough to fill a zone to 50 with people left over for the other zones. */
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
  ["Aleksi", "62d7e5e2-1401-4918-99a3-548f081b5854"],
  ["Anni", "047e43e7-df53-4784-bf84-88bf30252fc2"],
  ["Eetu", "9003a714-c74c-43b4-82aa-2866bc8d730f"],
  ["Emma", "1c5fdd46-686d-47f1-8c59-51dc4ffe4adf"],
  ["Hugo", "1e465dd9-ecd7-4b0a-a810-fab0eecee9ff"],
  ["Inka", "81e1c8ad-d510-47ba-a321-32533f828859"],
  ["Joona", "61056f6f-c293-4cf8-9537-cd28a0bc0103"],
  ["Kaisla", "728b127e-0626-48d6-a47e-d56b001270e0"],
  ["Leo", "65c01afd-697a-4628-bdaa-4c2068d929fd"],
  ["Lotta", "f652a7a3-5ccf-49a2-a844-dc281903c9a1"],
  ["Matias", "e1ad19be-e46c-4991-80a3-48c9b2fe10e8"],
  ["Minea", "b81d0ce6-e5ed-452c-9463-48d974a029af"],
  ["Nooa", "e55f84fb-809e-445f-a421-2e571e8fd83e"],
  ["Oona", "bf6ab371-f1ee-473d-9573-8f634a6e4b2e"],
  ["Paavo", "fce9e569-dd58-4de3-a526-7526d115bd23"],
  ["Peppi", "2a9abe4a-72a2-4256-8be2-f0c7fe3c77fb"],
  ["Roope", "03ff5d98-a142-42e6-9ae7-d5b2c157147d"],
  ["Senja", "50972b3a-bd5b-4e79-bfd7-5305e11d94c7"],
  ["Santeri", "4986ea09-f5a8-44ae-af7f-336f6d6ba1d0"],
  ["Tilda", "4bda1870-2897-4f4b-9d59-53f1f8a6396e"],
  ["Urho", "c913af3a-f0a7-4e09-9a15-f158a0d01b8c"],
  ["Vilma", "d286b6f2-b8a3-4b81-abbb-b97b8a26cc25"],
  ["Veeti", "3eb4f2ba-a4f3-481f-8643-4305888ef040"],
  ["Aurora", "d3ea3f49-cdee-4949-9b47-a882c2257ccc"],
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
  chat: {
    gapMs: [8000, 18000],
    typingMs: [2500, 6000],
    twoTypersChance: 0.3,
    messageChance: 0.6,
  },
};
