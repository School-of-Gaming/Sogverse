import type { VoiceParticipant } from "@/components/voice/hooks/types";
import type { ChatTypingBurst } from "./chat-scene-store";

/**
 * A pretend call for the redesigned room's preview scene: the people, what they
 * are doing and the timers that change it, with no React in it. The scene reads
 * it as an external store, so the room re-renders once per thing that happens
 * and never on a clock.
 *
 * What differs between rooms is a {@link SimulationScript}, so another kind of
 * session is a new script rather than a branch in here. Timing comes from a
 * seeded generator: every load plays the same room, as far as the clicks allow.
 */

type MsRange = readonly [min: number, max: number];

/** One thread of talking. Several lanes at once are what makes people overlap. */
export interface VoiceLane {
  /** Whether this lane's speakers are in the reader's zone or the others. */
  where: "here" | "elsewhere";
  talkMs: MsRange;
  /** The silence before the next person, so a lane's long gaps are the room's pauses. */
  gapMs: MsRange;
}

export interface SimulationScript {
  voices: readonly VoiceLane[];
  /** How often somebody moves, joins, leaves or flips their camera or mic. */
  crowdGapMs: MsRange;
  /** How long between one share ending and the next starting. */
  shareGapMs: MsRange;
  shareLengthMs: MsRange;
  /** The chat beside the call: who is typing, how long, and whether it lands. */
  chat: {
    gapMs: MsRange;
    typingMs: MsRange;
    twoTypersChance: number;
    messageChance: number;
  };
}

export interface SimulationSetup {
  /** Everyone in the call at the start, the reader marked `isLocal`. */
  participants: VoiceParticipant[];
  /** People who can arrive during the session. */
  bench: VoiceParticipant[];
  /** The zones anybody may wander into: never a private one. */
  openZoneIds: readonly string[];
  script: SimulationScript;
}

export interface SimulationState {
  participants: VoiceParticipant[];
  paused: boolean;
  /** How many people the crowd drifts towards in the reader's zone. */
  roomSize: number;
}

export const ROOM_SIZES = [3, 6, 12, 25] as const;

/** The most likely of the crowd's moves when the zone is off its target size. */
const TOWARDS_TARGET_CHANCE = 0.75;
const SEED = 20261030;

/** mulberry32: small, seedable, and good enough to shuffle a pretend crowd. */
function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

export class RoomSimulation {
  private state: SimulationState;
  private bench: VoiceParticipant[];
  private readonly openZoneIds: readonly string[];
  private readonly script: SimulationScript;
  private readonly random = seededRandom(SEED);
  private readonly listeners = new Set<() => void>();
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private mounted = false;
  private chatListener: ((burst: ChatTypingBurst) => void) | null = null;
  /** The script's own share, which outlives a pause so a resume still ends it. */
  private scriptedSharer: string | null = null;

  constructor({ participants, bench, openZoneIds, script }: SimulationSetup) {
    this.bench = bench;
    this.openZoneIds = openZoneIds;
    this.script = script;
    const local = participants.find((p) => p.isLocal);
    this.state = {
      participants,
      paused: false,
      roomSize: participants.filter((p) => p.zoneId === local?.zoneId).length,
    };
  }

  // --- The store's face, in the shape useSyncExternalStore asks for -----------

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.state;

  /** The chat lives in its own store, so the script tells it what to do. */
  onChatBurst(listener: (burst: ChatTypingBurst) => void) {
    this.chatListener = listener;
    return () => {
      this.chatListener = null;
    };
  }

  /** Idempotent, so React's strict double effect is harmless. */
  mount() {
    this.mounted = true;
    this.run();
  }

  unmount() {
    this.mounted = false;
    this.halt();
  }

  setPaused(paused: boolean) {
    this.update({ paused });
    if (paused) this.halt();
    else this.run();
  }

  // --- What the reader's own clicks and the control panel do ------------------

  moveSelf(zoneId: string) {
    this.patchLocal({ zoneId });
  }

  /** A move the reader did not make: on to the next open zone. */
  moderatorMovesReader() {
    const here = this.hereZoneId();
    const next = this.openZoneIds[(this.openZoneIds.indexOf(here) + 1) % this.openZoneIds.length];
    this.patchLocal({ zoneId: next });
  }

  moveParticipant(sessionId: string, zoneId: string) {
    this.patch(sessionId, { zoneId });
  }

  toggleMic() {
    const local = this.local();
    if (local) this.patchLocal({ audioOn: !local.audioOn });
  }

  toggleCamera() {
    const local = this.local();
    if (local) this.patchLocal({ videoOn: !local.videoOn });
  }

  /**
   * `sessionId` shares, or else somebody in the reader's zone who is not sharing
   * yet, a member of staff if there is one. Says who, or nothing if nobody is left.
   */
  startShare(sessionId?: string) {
    const others = this.peopleHere().filter((p) => !p.isLocal && !p.screenShareOn);
    const sharer =
      sessionId ?? (others.find((p) => p.role === "gedu") ?? this.pick(others))?.sessionId;
    if (sharer !== undefined) this.patch(sharer, { screenShareOn: true });
    return sharer;
  }

  stopShare(sessionId: string) {
    this.patch(sessionId, { screenShareOn: false });
  }

  /** Someone new arrives in the reader's zone. */
  someoneJoins() {
    this.join(this.hereZoneId());
  }

  /** Fills or empties the reader's zone to `size` at once, reader included. */
  setRoomSize(size: number) {
    this.update({ roomSize: size });
    while (this.peopleHere().length > size) {
      const leaver = this.pick(this.movablePeopleHere());
      if (!leaver) break;
      this.leave(leaver);
    }
    while (this.peopleHere().length < size) {
      if (!this.join(this.hereZoneId())) break;
    }
  }

  // --- The script ------------------------------------------------------------

  private run() {
    if (!this.mounted || this.state.paused || this.timers.size > 0) return;
    this.script.voices.forEach((lane) => this.runVoice(lane));
    this.runCrowd();
    this.runShare();
    this.runChat();
  }

  /** Stops every timer and leaves nobody talking into a frozen room. */
  private halt() {
    this.timers.forEach(clearTimeout);
    this.timers.clear();
    this.state = {
      ...this.state,
      participants: this.state.participants.map((p) =>
        p.isSpeaking ? { ...p, isSpeaking: false } : p,
      ),
    };
    this.notify();
  }

  private between([min, max]: MsRange) {
    return min + this.random() * (max - min);
  }

  private after(range: MsRange, action: () => void) {
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      action();
    }, this.between(range));
    this.timers.add(timer);
  }

  private runChat() {
    const { gapMs, typingMs, twoTypersChance, messageChance } = this.script.chat;
    this.after(gapMs, () => {
      this.chatListener?.({
        typingMs: this.between(typingMs),
        twoTypers: this.random() < twoTypersChance,
        landsMessage: this.random() < messageChance,
      });
      this.runChat();
    });
  }

  private runVoice(lane: VoiceLane) {
    this.after(lane.gapMs, () => {
      const speaker = this.pick(this.availableSpeakers(lane));
      if (!speaker) {
        this.runVoice(lane);
        return;
      }
      this.patch(speaker.sessionId, { isSpeaking: true });
      this.after(lane.talkMs, () => {
        this.patch(speaker.sessionId, { isSpeaking: false });
        this.runVoice(lane);
      });
    });
  }

  private availableSpeakers(lane: VoiceLane) {
    const here = this.hereZoneId();
    return this.state.participants.filter(
      (p) =>
        !p.isLocal &&
        p.audioOn &&
        !p.isSpeaking &&
        this.openZoneIds.includes(p.zoneId) &&
        (p.zoneId === here) === (lane.where === "here"),
    );
  }

  private runCrowd() {
    this.after(this.script.crowdGapMs, () => {
      this.crowdMoment();
      this.runCrowd();
    });
  }

  private crowdMoment() {
    const here = this.hereZoneId();
    const count = this.peopleHere().length;
    const { roomSize } = this.state;
    if (count !== roomSize && this.random() < TOWARDS_TARGET_CHANCE) {
      if (count < roomSize) {
        this.join(here);
        return;
      }
      const leaver = this.pick(this.movablePeopleHere());
      if (leaver) this.departs(leaver);
      return;
    }

    const person = this.pick(this.state.participants.filter((p) => this.isMovable(p)));
    if (!person) return;
    const roll = this.random();
    if (roll < 0.35) this.patch(person.sessionId, { zoneId: this.anotherOpenZone(person.zoneId) });
    else if (roll < 0.55) this.patch(person.sessionId, { videoOn: !person.videoOn });
    else if (roll < 0.7) this.patch(person.sessionId, { audioOn: !person.audioOn });
    else if (roll < 0.85) this.leave(person);
    else this.join(this.anotherOpenZone(here));
  }

  /** Half of those going from the reader's zone stay in the call, in another zone. */
  private departs(person: VoiceParticipant) {
    if (this.random() < 0.5) this.leave(person);
    else this.patch(person.sessionId, { zoneId: this.anotherOpenZone(person.zoneId) });
  }

  private runShare() {
    this.after(this.script.shareGapMs, () => {
      this.scriptedSharer ??= this.startShare() ?? null;
      this.after(this.script.shareLengthMs, () => {
        if (this.scriptedSharer !== null) this.stopShare(this.scriptedSharer);
        this.scriptedSharer = null;
        this.runShare();
      });
    });
  }

  // --- Small helpers ---------------------------------------------------------

  private local() {
    return this.state.participants.find((p) => p.isLocal);
  }

  private hereZoneId() {
    return this.local()?.zoneId ?? this.openZoneIds[0];
  }

  private peopleHere() {
    const here = this.hereZoneId();
    return this.state.participants.filter((p) => p.zoneId === here);
  }

  /** A sharer stays put, so a share never ends by its owner wandering off. */
  private isMovable(p: VoiceParticipant) {
    return (
      !p.isLocal &&
      !p.screenShareOn &&
      this.openZoneIds.includes(p.zoneId)
    );
  }

  private movablePeopleHere() {
    return this.peopleHere().filter((p) => this.isMovable(p));
  }

  private anotherOpenZone(zoneId: string) {
    return this.pick(this.openZoneIds.filter((id) => id !== zoneId)) ?? zoneId;
  }

  private pick<T>(items: readonly T[]): T | undefined {
    return items[Math.floor(this.random() * items.length)];
  }

  /** Whether anybody came: the bench can run out. */
  private join(zoneId: string) {
    const person = this.pick(this.bench);
    if (!person) return false;
    this.bench = this.bench.filter((p) => p !== person);
    this.update({ participants: [...this.state.participants, { ...person, zoneId }] });
    return true;
  }

  private leave(person: VoiceParticipant) {
    this.bench = [...this.bench, { ...person, isSpeaking: false }];
    this.update({
      participants: this.state.participants.filter((p) => p.sessionId !== person.sessionId),
    });
  }

  private patchLocal(change: Partial<VoiceParticipant>) {
    const local = this.local();
    if (local) this.patch(local.sessionId, change);
  }

  private patch(sessionId: string, change: Partial<VoiceParticipant>) {
    this.update({
      participants: this.state.participants.map((p) =>
        p.sessionId === sessionId ? { ...p, ...change } : p,
      ),
    });
  }

  private update(change: Partial<SimulationState>) {
    this.state = { ...this.state, ...change };
    this.notify();
  }

  private notify() {
    this.listeners.forEach((listener) => listener());
  }
}
