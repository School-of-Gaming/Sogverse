import { describe, expect, it } from "vitest";
import { parseUsernameInput } from "@/components/tools/parse-username-input";

/**
 * The password-reset field is built for pasting a class list, so what it
 * accepts is the whole point: whatever separator the list happened to arrive
 * with, whatever a hurried paste left behind, and whichever of the two ways an
 * account can be written the exporting system chose.
 */
describe("parseUsernameInput", () => {
  it("accepts spaces, commas and new lines as separators, together", () => {
    expect(parseUsernameInput("alice, bob\ncarol dave").usernames).toEqual([
      "alice",
      "bob",
      "carol",
      "dave",
    ]);
  });

  it("ignores empty runs, trailing separators and surrounding whitespace", () => {
    expect(parseUsernameInput("  ,,\n alice , \n\n bob ,\n").usernames).toEqual([
      "alice",
      "bob",
    ]);
  });

  it("collapses duplicates case-insensitively, keeping the first spelling", () => {
    // A name pasted twice would otherwise be reset twice, and the second
    // password would silently invalidate the first one the reader just copied.
    expect(parseUsernameInput("Builder07 builder07 BUILDER07").usernames).toEqual(
      ["Builder07"],
    );
  });

  it("submits an address on either Minecraft Education domain", () => {
    const { usernames, unsupportedDomain } = parseUsernameInput(
      "alice@gamer.sog.gg bob@GEDU.SOG.GG carol",
    );
    // The domain is matched case-insensitively — a spreadsheet export is under
    // no obligation to agree with us about capitals.
    expect(usernames).toEqual(["alice@gamer.sog.gg", "bob@GEDU.SOG.GG", "carol"]);
    expect(unsupportedDomain).toEqual([]);
  });

  it("keeps a bare name and its own address apart", () => {
    // They are one account and cannot be known to be until Graph resolves the
    // bare one, so both are submitted and the batch reset behind the route is
    // what stops the second reset.
    expect(parseUsernameInput("alice alice@gamer.sog.gg").usernames).toEqual([
      "alice",
      "alice@gamer.sog.gg",
    ]);
  });

  it("separates out an address on any other domain instead of submitting it", () => {
    const { usernames, unsupportedDomain } = parseUsernameInput(
      "alice principal@sog.gg bob@example.com carol",
    );
    expect(usernames).toEqual(["alice", "carol"]);
    expect(unsupportedDomain).toEqual(["principal@sog.gg", "bob@example.com"]);
  });

  it("refuses a malformed address rather than reading past its second @", () => {
    expect(
      parseUsernameInput("alice@gamer.sog.gg@evil.com @gamer.sog.gg")
        .unsupportedDomain,
    ).toEqual(["alice@gamer.sog.gg@evil.com", "@gamer.sog.gg"]);
  });

  it("lists each rejected entry once, however many times it was pasted", () => {
    expect(parseUsernameInput("a@b.c a@b.c d@e.f").unsupportedDomain).toEqual([
      "a@b.c",
      "d@e.f",
    ]);
  });

  it("answers two empty lists for an empty field", () => {
    expect(parseUsernameInput("   \n  ")).toEqual({
      usernames: [],
      unsupportedDomain: [],
    });
  });
});
