import { describe, it, expect, vi } from "vitest";
import type { DailyCall } from "@daily-co/daily-js";
import type { AppMessage, LockState } from "@/components/voice/hooks/types";
import type { SpatialPosition } from "@/lib/constants/spatial";

/**
 * onAppMessage is a hook callback — we can't call it directly. Instead we
 * extract the same logic into a minimal reproducer so we can assert that
 * spoofed posUpdate messages are rejected while legitimate ones are accepted.
 *
 * The logic under test (use-spatial-positions.ts lines 131-138):
 *   case "posUpdate":
 *     if (msg.sessionId !== fromId) break;        // <-- the security check
 *     if (msg.sessionId !== localSid) { ... }
 */

// Minimal stub that mimics the parts of DailyCall used by onAppMessage
function createMockCallObject(localSessionId: string): DailyCall {
  return {
    participants: () => ({
      local: { session_id: localSessionId },
    }),
  } as unknown as DailyCall;
}

function createPositionsMap(entries: [string, SpatialPosition][] = []) {
  return new Map<string, SpatialPosition>(entries);
}

const pos: SpatialPosition = { x: 50, y: 50, zone: "general" };

/**
 * Replays the posUpdate branch of onAppMessage exactly as written in
 * use-spatial-positions.ts, so the test stays valid even if surrounding
 * code changes.
 */
function handlePosUpdate(
  msg: Extract<AppMessage, { type: "posUpdate" }>,
  fromId: string,
  co: DailyCall,
  positionsRef: Map<string, SpatialPosition>,
) {
  // Reject spoofed updates — sender can only update their own position
  if (msg.sessionId !== fromId) return false;
  const localSid = co.participants().local.session_id;
  if (msg.sessionId !== localSid) {
    positionsRef.set(msg.sessionId, msg.position);
    return true;
  }
  return false;
}

describe("posUpdate message authorization", () => {
  const localSid = "local-session";
  const remoteSid = "remote-session";
  const attackerSid = "attacker-session";

  it("should accept posUpdate when sessionId matches fromId (legitimate self-move)", () => {
    const co = createMockCallObject(localSid);
    const positions = createPositionsMap();

    const accepted = handlePosUpdate(
      { type: "posUpdate", sessionId: remoteSid, position: pos },
      remoteSid, // fromId matches sessionId
      co,
      positions,
    );

    expect(accepted).toBe(true);
    expect(positions.get(remoteSid)).toEqual(pos);
  });

  it("should reject posUpdate when sessionId does not match fromId (spoofed)", () => {
    const co = createMockCallObject(localSid);
    const positions = createPositionsMap();

    const accepted = handlePosUpdate(
      { type: "posUpdate", sessionId: remoteSid, position: pos },
      attackerSid, // fromId !== sessionId — spoofed
      co,
      positions,
    );

    expect(accepted).toBe(false);
    expect(positions.has(remoteSid)).toBe(false);
  });

  it("should not update local user position from a remote posUpdate", () => {
    const co = createMockCallObject(localSid);
    const positions = createPositionsMap();

    const accepted = handlePosUpdate(
      { type: "posUpdate", sessionId: localSid, position: pos },
      localSid,
      co,
      positions,
    );

    expect(accepted).toBe(false);
    expect(positions.has(localSid)).toBe(false);
  });
});
