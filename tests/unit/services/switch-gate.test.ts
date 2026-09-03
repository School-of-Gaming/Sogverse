import { describe, it, expect } from "vitest";
import { switchGateFor } from "@/services/family/switch-gate";
import type { FamilyMember } from "@/services/family";
import type { UserRole } from "@/lib/constants";
import type { SessionProvenance } from "@/lib/session-provenance";

/**
 * The switch gate, decided once for all three surfaces that initiate a switch.
 *
 * The table below is the whole rule, and it is a restatement of what the switch
 * route enforces — so these cases are also the place a drift between the two
 * would show up as a decision nobody meant to make. Exhaustive on purpose: every
 * viewer role, both provenances plus the absence of one, and every sign-in mode
 * a target can carry, including a member row that names none at all.
 */

const PARENT: FamilyMember = {
  id: "4d0f6f52-4a97-4f0e-8ba3-6a63a1e33e34",
  role: "customer",
  first_name: "Riikka",
  sign_in: null,
};

function gamer(sign_in: FamilyMember["sign_in"]): FamilyMember {
  return {
    id: "f1c9a1e3-3d1a-4d0b-9a94-2b6f2a6f4a11",
    role: "gamer",
    first_name: "Zoe",
    sign_in,
  };
}

const ROLES: UserRole[] = ["admin", "customer", "gamer", "gedu"];
const PROVENANCES: (SessionProvenance | null)[] = ["own", "family", null];

describe("switchGateFor — the viewer's role decides first", () => {
  it("never gates a viewer who is not a gamer, whatever their session or the target", () => {
    for (const role of ROLES.filter((r) => r !== "gamer")) {
      for (const provenance of PROVENANCES) {
        for (const target of [PARENT, gamer("parent"), gamer("username"), gamer("email")]) {
          expect(switchGateFor(role, provenance, target)).toEqual({ kind: "none" });
        }
      }
    }
  });

  it("waits when the viewer's own role is not known yet", () => {
    // "Not a gamer" cannot be concluded from "we do not know yet" — the absence
    // of a role is not a value, and guessing `none` fires a switch the route
    // would refuse.
    expect(switchGateFor(null, "family", PARENT)).toEqual({ kind: "unknown" });
    expect(switchGateFor(undefined, "own", PARENT)).toEqual({ kind: "unknown" });
  });
});

describe("switchGateFor — a gamer viewer", () => {
  it("waits while the session's provenance has not landed", () => {
    for (const target of [PARENT, gamer("parent"), gamer("username")]) {
      expect(switchGateFor("gamer", null, target)).toEqual({ kind: "unknown" });
      expect(switchGateFor("gamer", undefined, target)).toEqual({ kind: "unknown" });
    }
  });

  it("charges a parent's PIN from a family session, whoever the target is", () => {
    for (const target of [PARENT, gamer("parent"), gamer("username"), gamer("email")]) {
      expect(switchGateFor("gamer", "family", target)).toEqual({ kind: "pin" });
    }
  });

  it("charges the target's own password from an own session", () => {
    // The parent always holds one; so does a sibling who was given a sign-in.
    expect(switchGateFor("gamer", "own", PARENT)).toEqual({ kind: "password" });
    expect(switchGateFor("gamer", "own", gamer("username"))).toEqual({
      kind: "password",
    });
    expect(switchGateFor("gamer", "own", gamer("email"))).toEqual({
      kind: "password",
    });
  });

  it("calls a sibling in parent mode unreachable rather than asking for a password nobody set", () => {
    expect(switchGateFor("gamer", "own", gamer("parent"))).toEqual({
      kind: "unreachable",
    });
  });

  it("reads a member row with no sign-in mode as holding no credential", () => {
    // A fixture, or a row built before the modes existed. Withholding a path is
    // the conservative answer; offering one the account cannot satisfy is not.
    expect(switchGateFor("gamer", "own", gamer(null))).toEqual({
      kind: "unreachable",
    });
    const noMode: FamilyMember = {
      id: gamer(null).id,
      role: "gamer",
      first_name: "Zoe",
    };
    expect(switchGateFor("gamer", "own", noMode)).toEqual({ kind: "unreachable" });
  });

  it("never returns `none` — a gamer with a known session always pays something", () => {
    for (const provenance of ["own", "family"] as const) {
      for (const target of [PARENT, gamer("parent"), gamer("username"), gamer("email")]) {
        expect(switchGateFor("gamer", provenance, target).kind).not.toBe("none");
      }
    }
  });
});
