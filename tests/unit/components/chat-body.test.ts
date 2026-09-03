import { describe, expect, it } from "vitest";
import {
  parseChatBody,
  resolveChatMentions,
} from "@/components/chat/chat-body";
import type { ChatAccount } from "@/components/chat/types";

/**
 * ============================================================================
 * A mention is written as `@Name` and stored as `@[Name](id)`.
 * ============================================================================
 *
 * The composer works in the display form the whole way — that is the owner's
 * ruling, and it is why the cap counts what the writer sees — so exactly one
 * function stands between what somebody typed and what the wire carries. These
 * cases are that function's contract.
 *
 * They matter more than their size suggests: resolution is the only place a
 * name becomes an *account*, so getting it wrong either drops a mention
 * silently (nobody is highlighted, and nobody finds out) or attaches somebody's
 * id to a word that was not their name.
 *
 * The ids are real UUIDs, hardcoded, because the stored token is only
 * well-formed with one — and a round-trip through the parser is what proves
 * the two halves of this module still agree.
 */

const AINO: ChatAccount = {
  id: "b00b7a58-662f-4587-914a-2c100042de31",
  name: "Aino",
  role: "gamer",
};
const AINO_VIRTANEN: ChatAccount = {
  id: "25b93099-e6dc-41f6-9dd3-f10f2d6dea40",
  name: "Aino Virtanen",
  role: "gamer",
};
const VAINO: ChatAccount = {
  id: "789a4f4e-9afb-4c75-8714-823c129bfbff",
  name: "Väinö",
  role: "gamer",
};
/** A second Aino, to pin what a duplicate name resolves to. */
const OTHER_AINO: ChatAccount = {
  id: "09becaae-d91e-4071-aaeb-3b157f954251",
  name: "Aino",
  role: "customer",
};

const roster = [AINO, VAINO];

function token(account: ChatAccount): string {
  return `@[${account.name}](${account.id})`;
}

describe("resolveChatMentions", () => {
  it("turns a picked or typed @Name into the stored token", () => {
    expect(resolveChatMentions("@Aino hello", roster)).toBe(
      `${token(AINO)} hello`,
    );
  });

  it("resolves at the start, the middle and the end of a sentence", () => {
    expect(resolveChatMentions("@Aino", roster)).toBe(token(AINO));
    expect(resolveChatMentions("hey @Aino look", roster)).toBe(
      `hey ${token(AINO)} look`,
    );
    expect(resolveChatMentions("ask @Aino", roster)).toBe(`ask ${token(AINO)}`);
  });

  it("ignores case, because nobody capitalises to satisfy a parser", () => {
    // And the token carries the account's own spelling either way.
    expect(resolveChatMentions("@aino @AINO", roster)).toBe(
      `${token(AINO)} ${token(AINO)}`,
    );
    expect(resolveChatMentions("@väinö", roster)).toBe(token(VAINO));
  });

  it("takes the longest name first, so a prefix does not strand the rest", () => {
    // "Aino" prefixes "Aino Virtanen": shortest-first would chip the first
    // word and leave the surname as text beside somebody else's name.
    const both = [AINO, AINO_VIRTANEN];
    expect(resolveChatMentions("@Aino Virtanen hi", both)).toBe(
      `${token(AINO_VIRTANEN)} hi`,
    );
    // The shorter one still resolves where the longer one cannot.
    expect(resolveChatMentions("@Aino hi", both)).toBe(`${token(AINO)} hi`);
  });

  it("leaves an @ that matches nobody exactly as it was typed", () => {
    expect(resolveChatMentions("@nobody and @ and email@example.com", roster)).toBe(
      "@nobody and @ and email@example.com",
    );
  });

  it("does not half-match a longer word", () => {
    // `@Ainoa` names no account on this roster, so it is a mention of nobody
    // rather than Aino with a stray letter stuck to her chip.
    expect(resolveChatMentions("@Ainoa", roster)).toBe("@Ainoa");
  });

  it("stops a name at punctuation", () => {
    expect(resolveChatMentions("@Aino, look", roster)).toBe(
      `${token(AINO)}, look`,
    );
    expect(resolveChatMentions("(@Aino)", roster)).toBe(`(${token(AINO)})`);
  });

  it("resolves a duplicate name to whichever account was listed first", () => {
    // The accepted v1 tolerance: the display form genuinely cannot tell two
    // people called Aino apart, and the cost is a highlight the wrong Aino
    // sees — there is no notification behind it.
    expect(resolveChatMentions("@Aino", [AINO, OTHER_AINO])).toBe(token(AINO));
    expect(resolveChatMentions("@Aino", [OTHER_AINO, AINO])).toBe(
      token(OTHER_AINO),
    );
  });

  it("resolves several mentions in one message", () => {
    expect(resolveChatMentions("@Aino and @Väinö, ready?", roster)).toBe(
      `${token(AINO)} and ${token(VAINO)}, ready?`,
    );
  });

  it("leaves a message with no mentions untouched", () => {
    expect(resolveChatMentions("no names here", roster)).toBe("no names here");
    expect(resolveChatMentions("@Aino", [])).toBe("@Aino");
    expect(resolveChatMentions("", roster)).toBe("");
  });

  it("produces what the parser reads back as a mention", () => {
    // The two halves of this module in one assertion: what the composer sends
    // is what a renderer draws as a chip.
    const stored = resolveChatMentions("hi @Aino!", roster);
    expect(parseChatBody(stored)).toEqual([
      { kind: "text", text: "hi " },
      { kind: "mention", id: AINO.id, name: AINO.name },
      { kind: "text", text: "!" },
    ]);
  });
});
