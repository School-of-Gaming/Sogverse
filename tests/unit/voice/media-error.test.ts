import { describe, expect, it } from "vitest";
import {
  categoryFromDailyCameraError,
  classifyMediaError,
  nextLocalMediaError,
} from "@/lib/voice/media-error";

describe("nextLocalMediaError", () => {
  it("maps each blocked reason onto its acquisition category", () => {
    expect(
      nextLocalMediaError(null, { state: "blocked", blocked: { byPermissions: true } }),
    ).toBe("denied");
    expect(
      nextLocalMediaError(null, { state: "blocked", blocked: { byDeviceMissing: true } }),
    ).toBe("no-device");
    expect(
      nextLocalMediaError(null, { state: "blocked", blocked: { byDeviceInUse: true } }),
    ).toBe("in-use");
  });

  it("keeps a richer prior report when a blocked track names no reason", () => {
    // Daily's `camera-error` event is the only source for the reasons the
    // blocked object cannot express, so a vaguer answer must not overwrite it.
    expect(nextLocalMediaError("insecure", { state: "blocked" })).toBe("insecure");
    expect(nextLocalMediaError("unknown", { state: "blocked", blocked: {} })).toBe("unknown");
  });

  it("falls back to unknown for a blocked track with no reason and nothing to keep", () => {
    expect(nextLocalMediaError(null, { state: "blocked" })).toBe("unknown");
  });

  it("reports an interrupted mic regardless of what came before", () => {
    expect(nextLocalMediaError(null, { state: "interrupted" })).toBe("interrupted");
    expect(nextLocalMediaError("denied", { state: "interrupted" })).toBe("interrupted");
  });

  it("clears any error once the mic plays", () => {
    expect(nextLocalMediaError("denied", { state: "playable" })).toBeNull();
    expect(nextLocalMediaError("interrupted", { state: "playable" })).toBeNull();
    expect(nextLocalMediaError(null, { state: "playable" })).toBeNull();
  });

  it("clears any error once the user turns the mic off", () => {
    // Nothing about the mic is wrong when its owner switched it off — and a mic
    // that could not be acquired reads as `blocked`, never `off`, so this
    // cannot hide a real failure.
    expect(nextLocalMediaError("interrupted", { state: "off" })).toBeNull();
    expect(nextLocalMediaError("denied", { state: "off" })).toBeNull();
    expect(nextLocalMediaError(null, { state: "off" })).toBeNull();
  });

  it("keeps what it had for a state a local track never reaches", () => {
    expect(nextLocalMediaError("denied", { state: "loading" })).toBe("denied");
    expect(nextLocalMediaError(null, { state: "sendable" })).toBeNull();
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
