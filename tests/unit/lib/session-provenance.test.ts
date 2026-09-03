import { describe, it, expect } from "vitest";
import { sessionProvenanceFromAmr } from "@/lib/session-provenance";

/**
 * The derivation that decides what leaving a gamer session costs. The two shapes
 * asserted first are the ones observed in production tokens: a switch-created
 * session records `otp`, a typed sign-in records `password`.
 *
 * Everything after them is the same claim: **anything we cannot read as a
 * password login is `family`**, which is the conservative answer, because it
 * asks for a PIN rather than waiving a gate.
 */
describe("sessionProvenanceFromAmr", () => {
  it("reads a password login as its own session", () => {
    expect(
      sessionProvenanceFromAmr([{ method: "password", timestamp: 1756800000 }]),
    ).toBe("own");
  });

  it("reads a switch-created OTP session as a family session", () => {
    expect(
      sessionProvenanceFromAmr([{ method: "otp", timestamp: 1756800000 }]),
    ).toBe("family");
  });

  it("finds `password` anywhere in the list, not only first", () => {
    expect(
      sessionProvenanceFromAmr([
        { method: "otp", timestamp: 1 },
        { method: "password", timestamp: 2 },
      ]),
    ).toBe("own");
  });

  it("reads a recovery session as a family session", () => {
    // Documented consequence rather than an accident: the reset form signs its
    // own session out after setting the password, so no such session survives.
    expect(
      sessionProvenanceFromAmr([{ method: "recovery", timestamp: 1 }]),
    ).toBe("family");
  });

  it("falls to `family` for anything it cannot read", () => {
    expect(sessionProvenanceFromAmr(undefined)).toBe("family");
    expect(sessionProvenanceFromAmr(null)).toBe("family");
    expect(sessionProvenanceFromAmr([])).toBe("family");
    expect(sessionProvenanceFromAmr("password")).toBe("family");
    expect(sessionProvenanceFromAmr([null])).toBe("family");
    expect(sessionProvenanceFromAmr([{ method: 42 }])).toBe("family");
    expect(sessionProvenanceFromAmr([{ timestamp: 1 }])).toBe("family");
  });
});
