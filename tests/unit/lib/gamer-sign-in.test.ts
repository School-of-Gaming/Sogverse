import { describe, it, expect } from "vitest";
import {
  GAMER_EMAIL_DOMAIN,
  GAMER_USERNAME_PATTERN,
  gamerUsernameFromEmail,
  hasRealEmail,
  identifierToLoginEmail,
  isSyntheticGamerEmail,
  isValidGamerUsername,
  normalizeGamerUsername,
  randomSyntheticGamerEmail,
  usernameToSyntheticEmail,
} from "@/lib/gamer-sign-in";

/**
 * The gamer address helpers, which used to live in `utils.ts` as three loose
 * functions. What they answer now is one question — what a child's stored
 * address *is*, given their sign-in mode — and the cases below are the ones
 * where getting it wrong is expensive: mailing a handle nobody reads, and
 * rewriting an adult's real address into a synthetic one at the login form.
 */

describe("normalizeGamerUsername", () => {
  it("trims and lowercases", () => {
    expect(normalizeGamerUsername("  Aino  ")).toBe("aino");
  });
});

describe("isValidGamerUsername", () => {
  it("accepts 3 to 20 letters and digits, however they were typed", () => {
    expect(isValidGamerUsername("aino")).toBe(true);
    expect(isValidGamerUsername("Aino123")).toBe(true);
    expect(isValidGamerUsername("  aino ")).toBe(true);
    expect(isValidGamerUsername("abc")).toBe(true);
    expect(isValidGamerUsername("a".repeat(20))).toBe(true);
  });

  it("refuses anything shorter, longer, or not alphanumeric", () => {
    expect(isValidGamerUsername("ai")).toBe(false);
    expect(isValidGamerUsername("a".repeat(21))).toBe(false);
    expect(isValidGamerUsername("aino.b")).toBe(false);
    expect(isValidGamerUsername("aino-b")).toBe(false);
    expect(isValidGamerUsername("aino b")).toBe(false);
    expect(isValidGamerUsername("äiti")).toBe(false);
    expect(isValidGamerUsername("")).toBe(false);
  });

  it("exports the pattern it uses, which judges an already-normalised value", () => {
    expect(GAMER_USERNAME_PATTERN.test("aino")).toBe(true);
    // The pattern alone does not fold case — that is what the normaliser is for.
    expect(GAMER_USERNAME_PATTERN.test("Aino")).toBe(false);
  });
});

describe("usernameToSyntheticEmail", () => {
  it("normalises before building the address, so one username is one address", () => {
    expect(usernameToSyntheticEmail("Aino")).toBe(`aino${GAMER_EMAIL_DOMAIN}`);
    expect(usernameToSyntheticEmail(" aino ")).toBe(`aino${GAMER_EMAIL_DOMAIN}`);
  });
});

describe("randomSyntheticGamerEmail", () => {
  it("lands in the synthetic domain and does not repeat", () => {
    const first = randomSyntheticGamerEmail();
    const second = randomSyntheticGamerEmail();
    expect(isSyntheticGamerEmail(first)).toBe(true);
    expect(first).not.toBe(second);
  });
});

describe("isSyntheticGamerEmail", () => {
  it("is true for both synthetic shapes and false for a mailbox", () => {
    expect(isSyntheticGamerEmail(`g0123456789abcdef${GAMER_EMAIL_DOMAIN}`)).toBe(true);
    expect(isSyntheticGamerEmail(`aino${GAMER_EMAIL_DOMAIN}`)).toBe(true);
    expect(isSyntheticGamerEmail("aino@example.com")).toBe(false);
  });

  it("ignores case, because GoTrue's stored address may not match ours", () => {
    expect(isSyntheticGamerEmail("Aino@Gamer.Sogverse.Internal")).toBe(true);
  });

  it("answers false rather than throwing on an absent address", () => {
    expect(isSyntheticGamerEmail(null)).toBe(false);
    expect(isSyntheticGamerEmail(undefined)).toBe(false);
  });
});

describe("hasRealEmail", () => {
  it("is true for every role but gamer", () => {
    expect(hasRealEmail({ role: "customer" })).toBe(true);
    expect(hasRealEmail({ role: "gedu" })).toBe(true);
    expect(hasRealEmail({ role: "admin" })).toBe(true);
  });

  it("is true for a gamer only in email mode", () => {
    expect(hasRealEmail({ role: "gamer", sign_in: "email" })).toBe(true);
    expect(hasRealEmail({ role: "gamer", sign_in: "username" })).toBe(false);
    expect(hasRealEmail({ role: "gamer", sign_in: "parent" })).toBe(false);
    expect(hasRealEmail({ role: "gamer", sign_in: null })).toBe(false);
    expect(hasRealEmail({ role: "gamer" })).toBe(false);
  });
});

describe("identifierToLoginEmail", () => {
  it("passes an address through, trimmed and otherwise untouched", () => {
    expect(identifierToLoginEmail("  Marja@Example.com ")).toBe(
      "Marja@Example.com",
    );
  });

  it("gives a bare identifier the synthetic domain", () => {
    expect(identifierToLoginEmail("Aino")).toBe(`aino${GAMER_EMAIL_DOMAIN}`);
  });

  it("decides on the @ alone — a short lowercase address is still an address", () => {
    expect(identifierToLoginEmail("ab@c.io")).toBe("ab@c.io");
  });
});

describe("gamerUsernameFromEmail", () => {
  it("reads the username back out of the synthetic address", () => {
    expect(gamerUsernameFromEmail(`lily2015${GAMER_EMAIL_DOMAIN}`)).toBe(
      "lily2015",
    );
  });

  it("has nothing to say about a real mailbox", () => {
    expect(gamerUsernameFromEmail("marja@example.test")).toBeNull();
    expect(gamerUsernameFromEmail(null)).toBeNull();
    expect(gamerUsernameFromEmail(undefined)).toBeNull();
  });

  it("refuses a local part no parent could have typed", () => {
    // Over the 20-character bound, so it cannot be a chosen username whatever
    // else it is.
    expect(
      gamerUsernameFromEmail(`abcdefghijklmnopqrstuvw${GAMER_EMAIL_DOMAIN}`),
    ).toBeNull();
  });

  /**
   * **A generated handle and a chosen username share one namespace**, so no
   * string test can separate them — a random `g` + 16 hex characters satisfies
   * the username pattern exactly as `lily2015` does. That is deliberate (it is
   * what makes GoTrue's uniqueness on the address do double duty), and it is why
   * every call site gates on the account's mode instead. Pinned so nobody later
   * mistakes this function for the mode check.
   */
  it("cannot tell a generated handle from a chosen username, by design", () => {
    expect(gamerUsernameFromEmail(`g3f2b1c906a4e4d21${GAMER_EMAIL_DOMAIN}`)).toBe(
      "g3f2b1c906a4e4d21",
    );
  });
});
