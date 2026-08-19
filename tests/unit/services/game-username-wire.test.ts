import { describe, it, expect } from "vitest";
import {
  GAME_USERNAME_MAX_LENGTH,
  normalizeGameUsername,
} from "@/lib/constants/game-platforms";
import {
  minecraftUsernameValue,
  verifyMinecraftQuery,
} from "@/services/minecraft/minecraft.contracts";
import {
  robloxUsernameValue,
  verifyRobloxQuery,
} from "@/services/roblox/roblox.contracts";
import {
  BYTE_ORDER_MARK,
  INVISIBLE_ONLY_NAME,
  RIGHT_TO_LEFT_OVERRIDE,
  ZERO_WIDTH_JOINER,
  ZERO_WIDTH_SPACE,
} from "../../helpers/invisible-characters";

/**
 * The whole of what we still claim about a game username on our own wire.
 *
 * There is no format rule left — each platform is the only authority on which
 * of its handles exist — so what is under test here is a *transport* rule, in a
 * fixed order: **strip the Unicode format characters, trim, bound the length,
 * collapse an empty result to null.** Every step but the bound is incapable of
 * refusing anything; they only decide whether what arrived is a name or a
 * clear.
 *
 * Both platforms' schemas are driven through the same table because the rule is
 * one rule, shared: a divergence between them would mean the same typed name
 * stored differently depending on which row a person opened.
 */

/** The value schemas — the ones a write path parses, where `null` is a clear. */
const VALUE_SCHEMAS = [
  ["minecraft", minecraftUsernameValue],
  ["roblox", robloxUsernameValue],
] as const;

/** The query schemas — a read, where there is nothing to clear. */
const QUERY_SCHEMAS = [
  ["minecraft", verifyMinecraftQuery],
  ["roblox", verifyRobloxQuery],
] as const;

describe("normalizeGameUsername", () => {
  it("strips every format character it is given", () => {
    expect(
      normalizeGameUsername(
        `a${ZERO_WIDTH_SPACE}b${ZERO_WIDTH_JOINER}c${BYTE_ORDER_MARK}d${RIGHT_TO_LEFT_OVERRIDE}e`,
      ),
    ).toBe("abcde");
  });

  it("strips before it trims, so an invisible-only name comes out empty", () => {
    // The order is the point: trimming first leaves the format characters in
    // place, and a string of them is not whitespace, so nothing would be
    // trimmed away and the name would survive as a stored, unreadable row.
    expect(normalizeGameUsername(INVISIBLE_ONLY_NAME)).toBe("");
  });

  it("leaves an ordinary name — including the ones no validator would allow — alone", () => {
    for (const name of ["Notch", "Old Timer", "a_b_c", "ab", "Ëlias"]) {
      expect(normalizeGameUsername(name)).toBe(name);
    }
  });
});

describe.each(VALUE_SCHEMAS)("%s username value schema", (_platform, schema) => {
  it("reads null as a clear", () => {
    expect(schema.parse(null)).toBeNull();
  });

  it.each([
    ["an empty string", ""],
    ["a blank string", "   "],
    ["only invisible characters", INVISIBLE_ONLY_NAME],
  ])("collapses %s to a clear rather than storing it", (_label, raw) => {
    // The destructive reading, and the intended one: there is no name left in
    // the field, so the write empties the row. A schema that returned the
    // string instead would store a name that draws as nothing.
    expect(schema.parse(raw)).toBeNull();
  });

  it.each([
    ["a zero-width space", ZERO_WIDTH_SPACE],
    ["a right-to-left override", RIGHT_TO_LEFT_OVERRIDE],
  ])("strips %s out of a name and keeps the rest", (_label, character) => {
    // The bidi case is the sharper of the two: left in, the override reverses
    // the visual order of the span after it, so the name on screen is not the
    // name in the column.
    expect(schema.parse(`Old${character}Timer`)).toBe("OldTimer");
  });

  it("trims the ends without touching the middle", () => {
    expect(schema.parse("  Old Timer  ")).toBe("Old Timer");
  });

  it("measures the length bound on what survives normalization", () => {
    const atTheBound = "a".repeat(GAME_USERNAME_MAX_LENGTH);

    expect(schema.parse(atTheBound)).toBe(atTheBound);
    expect(() => schema.parse(`${atTheBound}a`)).toThrow();
    // Padding and invisible characters are not part of the request, so they do
    // not count against a bound that exists to describe the request.
    expect(schema.parse(` ${atTheBound}${ZERO_WIDTH_SPACE} `)).toBe(atTheBound);
  });
});

describe.each(QUERY_SCHEMAS)("%s verify query schema", (_platform, schema) => {
  it.each([
    ["an empty string", ""],
    ["a blank string", "   "],
    ["only invisible characters", INVISIBLE_ONLY_NAME],
  ])("refuses %s — a read has nothing to clear", (_label, username) => {
    // Where the value schema collapses to null, the query has no such reading:
    // there is no question in a name that normalizes to nothing, so it is the
    // one place an empty name is a 400 rather than a clear.
    expect(schema.safeParse({ username }).success).toBe(false);
  });

  it("strips format characters out of the name it will ask about", () => {
    expect(
      schema.parse({ username: `Old${ZERO_WIDTH_SPACE}Timer` }),
    ).toEqual({ username: "OldTimer" });
  });

  it("refuses a name past the length bound and accepts one at it", () => {
    const atTheBound = "a".repeat(GAME_USERNAME_MAX_LENGTH);

    expect(schema.parse({ username: atTheBound })).toEqual({
      username: atTheBound,
    });
    expect(schema.safeParse({ username: `${atTheBound}a` }).success).toBe(false);
  });
});
