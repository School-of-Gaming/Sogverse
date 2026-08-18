import { describe, expect, it } from "vitest";
import { parseUsernameInput } from "@/components/tools/parse-username-input";

/**
 * The password-reset field is built for pasting a class list, so what it
 * accepts is the whole point: whatever separator the list happened to arrive
 * with, and whatever a hurried paste left behind.
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

  it("separates out anything carrying an @ instead of submitting it", () => {
    const { usernames, emailLike } = parseUsernameInput(
      "alice alice@gamer.sog.gg bob",
    );
    expect(usernames).toEqual(["alice", "bob"]);
    expect(emailLike).toEqual(["alice@gamer.sog.gg"]);
  });

  it("lists each email-like entry once, however many times it was pasted", () => {
    expect(
      parseUsernameInput("a@b.c a@b.c d@e.f").emailLike,
    ).toEqual(["a@b.c", "d@e.f"]);
  });

  it("answers two empty lists for an empty field", () => {
    expect(parseUsernameInput("   \n  ")).toEqual({
      usernames: [],
      emailLike: [],
    });
  });
});
