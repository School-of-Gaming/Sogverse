import { describe, expect, it } from "vitest";
import {
  categoryFromDailyCameraError,
  classifyMediaError,
  nextLocalMediaError,
} from "@/lib/voice/media-error";

describe("nextLocalMediaError", () => {
  it("reports an interrupted mic regardless of what came before", () => {
    expect(nextLocalMediaError(null, "interrupted", "off")).toBe("interrupted");
    expect(nextLocalMediaError("denied", "interrupted", "off")).toBe("interrupted");
    // An interrupted mic wins even while the camera is happily playing — the
    // playable-clears rule below must not mask a stalled microphone.
    expect(nextLocalMediaError(null, "interrupted", "playable")).toBe("interrupted");
  });

  it("clears a stale error once the local audio track plays", () => {
    expect(nextLocalMediaError("denied", "playable", "off")).toBeNull();
    expect(nextLocalMediaError("in-use", "playable", "blocked")).toBeNull();
  });

  it("clears a stale error once the local video track plays (iOS shares one grant)", () => {
    expect(nextLocalMediaError("denied", "off", "playable")).toBeNull();
    expect(nextLocalMediaError("no-device", "blocked", "playable")).toBeNull();
  });

  it("clears an interrupted report when the user turns the mic off", () => {
    expect(nextLocalMediaError("interrupted", "off", "off")).toBeNull();
  });

  it("keeps an acquisition error when the mic is off — nothing has been fixed", () => {
    expect(nextLocalMediaError("denied", "off", "off")).toBe("denied");
    expect(nextLocalMediaError("in-use", "off", "off")).toBe("in-use");
    expect(nextLocalMediaError("no-device", "off", "off")).toBe("no-device");
  });

  it("keeps whatever it had for a blocked track", () => {
    expect(nextLocalMediaError("denied", "blocked", "blocked")).toBe("denied");
    expect(nextLocalMediaError("interrupted", "blocked", "off")).toBe("interrupted");
  });

  it("stays null when nothing is wrong", () => {
    expect(nextLocalMediaError(null, "off", "off")).toBeNull();
    expect(nextLocalMediaError(null, "blocked", "blocked")).toBeNull();
    expect(nextLocalMediaError(null, "playable", "playable")).toBeNull();
  });
});

describe("categoryFromDailyCameraError", () => {
  it("maps Daily's normalized types onto our categories", () => {
    expect(categoryFromDailyCameraError("permissions")).toBe("denied");
    expect(categoryFromDailyCameraError("not-found")).toBe("no-device");
    expect(categoryFromDailyCameraError("cam-in-use")).toBe("in-use");
    expect(categoryFromDailyCameraError("mic-in-use")).toBe("in-use");
    expect(categoryFromDailyCameraError("cam-mic-in-use")).toBe("in-use");
    expect(categoryFromDailyCameraError("undefined-mediadevices")).toBe("insecure");
    expect(categoryFromDailyCameraError("constraints")).toBe("unknown");
    expect(categoryFromDailyCameraError("unknown")).toBe("unknown");
  });
});

describe("classifyMediaError", () => {
  // The node environment has no `navigator`, which is the insecure-context
  // branch: with no `navigator.mediaDevices` there was never a getUserMedia to
  // fail, so the DOMException name is not even consulted.
  it("reports an insecure context when mediaDevices is unavailable", () => {
    expect(classifyMediaError(new Error("whatever"))).toBe("insecure");
  });
});
