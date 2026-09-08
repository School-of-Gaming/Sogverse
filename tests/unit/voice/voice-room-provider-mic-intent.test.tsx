import { act, render, waitFor } from "@testing-library/react";
import { useContext, useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The regression this file exists for: the local mic/camera on/off state is the
 * user's *intent*, and must never be re-derived from Daily's local track state.
 * A track that goes `interrupted` (device stalled at the OS/Bluetooth level)
 * used to flip the button to "muted" although Daily still counted the mic as
 * on — so the next click sent `setLocalAudio(true)`, a no-op, and the very next
 * Daily event flipped the button back. See src/components/voice/CLAUDE.md.
 */

// ---------- The fake call object ----------

type Handler = (event: unknown) => void;

interface FakeTrack {
  state: "blocked" | "off" | "playable" | "interrupted";
}

function makeParticipant(overrides: {
  session_id: string;
  user_name: string;
  local: boolean;
  owner?: boolean;
  audioState?: FakeTrack["state"];
  videoState?: FakeTrack["state"];
}) {
  return {
    session_id: overrides.session_id,
    user_name: overrides.user_name,
    local: overrides.local,
    owner: overrides.owner ?? false,
    audio: false,
    video: false,
    screen: false,
    userData: undefined,
    tracks: {
      audio: { state: overrides.audioState ?? "off" },
      video: { state: overrides.videoState ?? "off" },
      screenVideo: { state: "off" },
    },
  };
}

function createFakeCall() {
  const handlers = new Map<string, Set<Handler>>();
  const local = makeParticipant({
    session_id: "local-sid",
    user_name: "user-1|gamer|Local",
    local: true,
  });
  const mod = makeParticipant({
    session_id: "mod-sid",
    user_name: "user-2|gedu|Mod",
    local: false,
    owner: true,
  });

  const emit = (event: string, payload?: unknown) => {
    for (const h of handlers.get(event) ?? []) h(payload);
  };

  const co = {
    // event plumbing
    on: vi.fn((event: string, handler: Handler) => {
      if (!handlers.has(event)) handlers.set(event, new Set());
      handlers.get(event)!.add(handler);
      return co;
    }),
    off: vi.fn((event: string, handler: Handler) => {
      handlers.get(event)?.delete(handler);
      return co;
    }),
    // lifecycle
    join: vi.fn(async () => {
      emit("joined-meeting");
      return {};
    }),
    leave: vi.fn(async () => undefined),
    destroy: vi.fn(async () => undefined),
    // state
    participants: vi.fn(() => ({ local, "mod-sid": mod })),
    setUserData: vi.fn(async () => undefined),
    sendAppMessage: vi.fn(),
    updateParticipant: vi.fn(),
    updateParticipants: vi.fn(),
    setLocalAudio: vi.fn(),
    setLocalVideo: vi.fn(async () => undefined),
    enumerateDevices: vi.fn(async () => ({ devices: [] })),
    getInputDevices: vi.fn(async () => ({ mic: {} })),
    setInputDevicesAsync: vi.fn(async () => ({})),
    // test handles
    __emit: emit,
    __local: local,
    __mod: mod,
  };
  return co;
}

let fakeCall: ReturnType<typeof createFakeCall>;

vi.mock("@daily-co/daily-js", () => ({
  default: { createCallObject: () => fakeCall },
}));

// jsdom ships neither of these; the provider constructs an AudioContext at join
// and the mic-device hook subscribes to `devicechange` once joined.
class FakeAudioContext {
  state = "running";
  async resume() {}
  async close() {}
  createAnalyser() {
    return { fftSize: 0, connect() {}, disconnect() {} };
  }
  createMediaStreamSource() {
    return { connect() {}, disconnect() {} };
  }
}

import { VoiceRoomProvider, VoiceRoomContext } from "@/components/voice/VoiceRoomProvider";
import type { VoiceRoomContextValue } from "@/components/voice/hooks/types";

// The context value, republished after every render. Captured in an effect
// rather than during render, so the probe stays a pure component.
const held: { current: VoiceRoomContextValue | null } = { current: null };
const ctx = () => held.current!;

function Probe() {
  const value = useContext(VoiceRoomContext)!;
  useEffect(() => {
    held.current = value;
  });
  return null;
}

function mount() {
  return render(
    <VoiceRoomProvider groupId={null}>
      <Probe />
    </VoiceRoomProvider>,
  );
}

// Defined on the real `navigator` rather than stubbed, because Testing
// Library's own afterEach unmounts the tree — and the mic-device hook's cleanup
// reads `navigator.mediaDevices` on the way out, after any unstubbing would
// have run.
Object.defineProperty(globalThis.navigator, "mediaDevices", {
  configurable: true,
  value: { addEventListener: vi.fn(), removeEventListener: vi.fn() },
});

beforeEach(() => {
  fakeCall = createFakeCall();
  vi.stubGlobal("AudioContext", FakeAudioContext);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("VoiceRoomProvider — local mic state is intent", () => {
  it("joins mic-on by default", async () => {
    mount();
    await act(async () => {
      await ctx().join("https://example.daily.co/room", "token");
    });
    await waitFor(() => expect(ctx().joined).toBe(true));
    expect(ctx().micOn).toBe(true);
  });

  it("seeds the intent from the join meta, so an instant room's lobby pick survives", async () => {
    mount();
    await act(async () => {
      await ctx().join("https://example.daily.co/room", "token", { micOn: false });
    });
    await waitFor(() => expect(ctx().joined).toBe(true));
    expect(ctx().micOn).toBe(false);
  });

  it("keeps the mic on when the local track goes interrupted, and reports it as a health error", async () => {
    mount();
    await act(async () => {
      await ctx().join("https://example.daily.co/room", "token");
    });
    await waitFor(() => expect(ctx().joined).toBe(true));

    await act(async () => {
      fakeCall.__local.tracks.audio.state = "interrupted";
      fakeCall.__emit("participant-updated", { participant: fakeCall.__local });
    });

    expect(ctx().micOn).toBe(true);
    expect(ctx().mediaError).toBe("interrupted");
  });

  it("mutes — not unmutes — on the click after an interruption", async () => {
    mount();
    await act(async () => {
      await ctx().join("https://example.daily.co/room", "token");
    });
    await waitFor(() => expect(ctx().joined).toBe(true));

    await act(async () => {
      fakeCall.__local.tracks.audio.state = "interrupted";
      fakeCall.__emit("participant-updated", { participant: fakeCall.__local });
    });
    await act(async () => {
      ctx().toggleMic();
    });

    expect(fakeCall.setLocalAudio).toHaveBeenCalledWith(false);
    expect(fakeCall.setLocalAudio).not.toHaveBeenCalledWith(true);
    expect(ctx().micOn).toBe(false);
  });

  it("follows a moderator's mute app message rather than the track echo", async () => {
    mount();
    await act(async () => {
      await ctx().join("https://example.daily.co/room", "token");
    });
    await waitFor(() => expect(ctx().joined).toBe(true));
    expect(ctx().micOn).toBe(true);

    await act(async () => {
      fakeCall.__emit("app-message", {
        fromId: "mod-sid",
        data: { type: "moderatorMute", targetSessionId: "local-sid", track: "audio" },
      });
    });

    expect(ctx().micOn).toBe(false);
  });

  it("ignores a mute app message from a non-owner", async () => {
    mount();
    await act(async () => {
      await ctx().join("https://example.daily.co/room", "token");
    });
    await waitFor(() => expect(ctx().joined).toBe(true));

    fakeCall.__mod.owner = false;
    await act(async () => {
      fakeCall.__emit("app-message", {
        fromId: "mod-sid",
        data: { type: "moderatorMute", targetSessionId: "local-sid", track: "audio" },
      });
    });

    expect(ctx().micOn).toBe(true);
  });
});
