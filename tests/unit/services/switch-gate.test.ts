import { describe, it, expect } from "vitest";
import { switchGateFor } from "@/services/family/switch-gate";
import type { UserRole } from "@/lib/constants";
import type { SessionProvenance } from "@/lib/session-provenance";

/**
 * The switch gate, decided once for all three surfaces that initiate a switch.
 *
 * The table below is the whole rule, and it is a restatement of what the switch
 * route enforces — so these cases are also the place a drift between the two
 * would show up as a decision nobody meant to make. Exhaustive on purpose:
 * every viewer role, both provenances, and the absence of either.
 *
 * The thing worth noticing about the table is what is *not* in it. The target
 * used to be an argument, and a sibling holding no credential of their own used
 * to be a fourth answer; both are gone, because the route no longer asks the
 * target for anything. What a switch costs is now a fact about the caller's
 * session and nothing else, so there is no per-target axis left to enumerate.
 */

const ROLES: UserRole[] = ["admin", "customer", "gamer", "gedu"];
const ABSENT = [null, undefined] as const;
const PROVENANCES: SessionProvenance[] = ["own", "family"];

describe("switchGateFor — the viewer's role decides first", () => {
  it("never gates a viewer who is not a gamer, whatever their session", () => {
    for (const role of ROLES.filter((r) => r !== "gamer")) {
      for (const provenance of [...PROVENANCES, ...ABSENT]) {
        expect(switchGateFor(role, provenance)).toEqual({ kind: "none" });
      }
    }
  });

  it("waits when the viewer's own role is not known yet", () => {
    // "Not a gamer" cannot be concluded from "we do not know yet" — the absence
    // of a role is not a value, and guessing `none` fires a switch the route
    // would refuse.
    for (const role of ABSENT) {
      for (const provenance of [...PROVENANCES, ...ABSENT]) {
        expect(switchGateFor(role, provenance)).toEqual({ kind: "unknown" });
      }
    }
  });
});

describe("switchGateFor — a gamer viewer", () => {
  it("waits while the session's provenance has not landed", () => {
    for (const provenance of ABSENT) {
      expect(switchGateFor("gamer", provenance)).toEqual({ kind: "unknown" });
    }
  });

  it("charges a parent's PIN from a family session", () => {
    expect(switchGateFor("gamer", "family")).toEqual({ kind: "pin" });
  });

  it("refuses an own session outright — no credential is collected at all", () => {
    // The previous design priced this at the target's own password, which made
    // the platform a password oracle. The answer now is that the session
    // belongs to one account, and the login page is where another one is
    // opened.
    expect(switchGateFor("gamer", "own")).toEqual({ kind: "signOut" });
  });

  it("never returns `none` — a gamer with a known session never switches freely", () => {
    for (const provenance of PROVENANCES) {
      expect(switchGateFor("gamer", provenance).kind).not.toBe("none");
    }
  });
});
