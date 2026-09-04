import { describe, it, expect } from "vitest";
import { amrNamesPassword, sessionProvenance } from "@/lib/session-provenance";

/**
 * What leaving a gamer session costs is decided here, and the model this file
 * pins is that **`family` is a marker the switch route minted, never something
 * inferred from the token**.
 *
 * The inference is what this used to be, and the case that killed it is asserted
 * below: a password-RECOVERY session records `otp` in its `amr` exactly as a
 * switch does, so "no password method" cannot mean "switched in" — a child who
 * opens their own reset link would otherwise hold a PIN-only path into the
 * parent's account. Only the mint site separates the two.
 */
describe("sessionProvenance", () => {
  it("is `family` only when the switch route's marker validated", () => {
    expect(
      sessionProvenance({
        amr: [{ method: "otp", timestamp: 1756800000 }],
        familyMarkerValid: true,
      }),
    ).toBe("family");
  });

  it("is `own` for an otp session carrying no marker", () => {
    // The case the marker exists for. `amr` says the same thing a switch-created
    // session says, and it is not one — a recovery click looks identical from
    // inside the token.
    expect(
      sessionProvenance({
        amr: [{ method: "otp", timestamp: 1756800000 }],
        familyMarkerValid: false,
      }),
    ).toBe("own");
    expect(
      sessionProvenance({
        amr: [{ method: "recovery", timestamp: 1 }],
        familyMarkerValid: false,
      }),
    ).toBe("own");
  });

  it("is `own` for a password login, marker or not", () => {
    // `amr` survives as a redundant second condition: a token saying a password
    // was typed wins over a marker. The session_id binding already makes the
    // combination unreachable — this guards a future mint site, not anything
    // reachable today.
    expect(
      sessionProvenance({
        amr: [{ method: "password", timestamp: 1756800000 }],
        familyMarkerValid: false,
      }),
    ).toBe("own");
    expect(
      sessionProvenance({
        amr: [{ method: "password", timestamp: 1756800000 }],
        familyMarkerValid: true,
      }),
    ).toBe("own");
  });

  it("keeps a marked session `family` through any `amr` it cannot read", () => {
    // The marker is the whole classification and `amr` is only allowed to veto
    // it, so an `amr` that says nothing legible must leave the verdict alone.
    // Asserted against the marker-holder because that is the only caller a
    // misread could move: with no marker the answer is `own` before `amr` is
    // ever looked at, so a loop there would pass however `amrNamesPassword`
    // behaved.
    for (const amr of [undefined, null, [], "password", [null], [{ method: 42 }]]) {
      expect(sessionProvenance({ amr, familyMarkerValid: true })).toBe("family");
    }
  });

  it("falls to `own` with no marker, whatever the token says", () => {
    // The conservative direction, and the point of the marker model: an
    // unclassifiable session is refused the switch rather than offered it for
    // four digits, so it can never be the cheap way in. The old derivation
    // defaulted to `family`, which was fail-open toward the weaker gate.
    expect(sessionProvenance({ amr: undefined, familyMarkerValid: false })).toBe(
      "own",
    );
  });
});

describe("amrNamesPassword", () => {
  it("finds `password` anywhere in the list, not only first", () => {
    expect(
      amrNamesPassword([
        { method: "otp", timestamp: 1 },
        { method: "password", timestamp: 2 },
      ]),
    ).toBe(true);
  });

  it("answers false for anything that is not a list of methods", () => {
    expect(amrNamesPassword(undefined)).toBe(false);
    expect(amrNamesPassword(null)).toBe(false);
    expect(amrNamesPassword([])).toBe(false);
    expect(amrNamesPassword("password")).toBe(false);
    expect(amrNamesPassword([null])).toBe(false);
    expect(amrNamesPassword([{ method: 42 }])).toBe(false);
    expect(amrNamesPassword([{ timestamp: 1 }])).toBe(false);
  });
});
