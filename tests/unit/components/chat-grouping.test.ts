import { describe, expect, it } from "vitest";
import { groupChatMessages } from "@/components/chat/chat-grouping";
import { CHAT_GROUP_WINDOW_MS } from "@/lib/constants/chat";
import type { ChatImageRef, ChatMessage } from "@/components/chat/types";

/**
 * Sender grouping is what makes a chat log readable rather than a column of
 * identical rows, and every one of its rules is invisible when it goes wrong:
 * a run that should have broken just reads as somebody talking for longer, and
 * a burst that failed to collapse just reads as a wall of pictures.
 *
 * Every case is anchored to one instant and offsets hand-computed from the
 * grouping window, so the arithmetic is checked against times a reader can
 * verify rather than against a second copy of the formula.
 */
const T0 = Date.parse("2026-06-15T17:00:00.000Z");

const IMAGE: ChatImageRef = {
  id: "img",
  src: "/preview-art/session-build.jpg",
  width: 1600,
  height: 900,
};

function message(over: Partial<ChatMessage> & { id: string }): ChatMessage {
  return {
    senderId: "aino",
    createdAt: new Date(T0).toISOString(),
    body: "hello",
    image: null,
    replyToId: null,
    editedAt: null,
    hiddenAt: null,
    hiddenBy: null,
    reactions: [],
    delivery: "sent",
    ...over,
  };
}

/** A message `ms` after the anchor. */
function at(ms: number, over: Partial<ChatMessage> & { id: string }): ChatMessage {
  return message({ ...over, createdAt: new Date(T0 + ms).toISOString() });
}

describe("groupChatMessages", () => {
  it("returns nothing for an empty log", () => {
    expect(groupChatMessages([])).toEqual([]);
  });

  it("puts one sender's close-together messages under one header", () => {
    const groups = groupChatMessages([
      at(0, { id: "a" }),
      at(60_000, { id: "b" }),
      at(120_000, { id: "c" }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].senderId).toBe("aino");
    expect(groups[0].items).toHaveLength(3);
    // The header's time is the run's first message, not its last.
    expect(groups[0].startedAt).toBe(new Date(T0).toISOString());
    // The key is stable across a re-group, which is what keeps React from
    // discarding a run's subtree every time a message lands.
    expect(groups[0].key).toBe("a");
  });

  it("breaks the run when the sender changes", () => {
    const groups = groupChatMessages([
      at(0, { id: "a" }),
      at(1000, { id: "b", senderId: "vaino" }),
      at(2000, { id: "c" }),
    ]);

    expect(groups.map((group) => group.senderId)).toEqual([
      "aino",
      "vaino",
      "aino",
    ]);
  });

  it("breaks the run on a long enough pause, and only then", () => {
    const inside = groupChatMessages([
      at(0, { id: "a" }),
      at(CHAT_GROUP_WINDOW_MS, { id: "b" }),
    ]);
    expect(inside).toHaveLength(1);

    const outside = groupChatMessages([
      at(0, { id: "a" }),
      at(CHAT_GROUP_WINDOW_MS + 1, { id: "b" }),
    ]);
    expect(outside).toHaveLength(2);
  });

  it("measures the pause against the previous message, not the run's start", () => {
    // Three messages a full window apart each: one slow but unbroken
    // conversation, which is what the convention is for.
    const groups = groupChatMessages([
      at(0, { id: "a" }),
      at(CHAT_GROUP_WINDOW_MS, { id: "b" }),
      at(CHAT_GROUP_WINDOW_MS * 2, { id: "c" }),
    ]);
    expect(groups).toHaveLength(1);
  });

  it("breaks the run rather than folding in a message with an unreadable time", () => {
    const groups = groupChatMessages([
      at(0, { id: "a" }),
      message({ id: "b", createdAt: "not a date" }),
    ]);
    expect(groups).toHaveLength(2);
  });

  it("collapses a fanned-out burst into one wrapping row", () => {
    // Exactly what one press of Send produces: an image-only message per
    // picture, then the words.
    const groups = groupChatMessages([
      at(0, { id: "i1", body: null, image: IMAGE }),
      at(10, { id: "i2", body: null, image: IMAGE }),
      at(20, { id: "i3", body: null, image: IMAGE }),
      at(30, { id: "text", body: "look what we made" }),
    ]);

    expect(groups).toHaveLength(1);
    const items = groups[0].items;
    expect(items).toHaveLength(2);
    expect(items[0].kind).toBe("images");
    if (items[0].kind !== "images") throw new Error("expected an image run");
    expect(items[0].messages.map((m) => m.id)).toEqual(["i1", "i2", "i3"]);
    expect(items[1].kind).toBe("message");
  });

  it("starts a second run of images when words come between them", () => {
    const groups = groupChatMessages([
      at(0, { id: "i1", body: null, image: IMAGE }),
      at(10, { id: "text", body: "and this one" }),
      at(20, { id: "i2", body: null, image: IMAGE }),
    ]);

    expect(groups[0].items.map((item) => item.kind)).toEqual([
      "images",
      "message",
      "images",
    ]);
  });

  it("never folds a removed message into an image run", () => {
    // A tombstone has no picture left to put in a row, and it has to keep its
    // own place in the log — that is the whole point of not deleting the row.
    const groups = groupChatMessages([
      at(0, { id: "i1", body: null, image: IMAGE }),
      at(10, {
        id: "gone",
        body: null,
        image: IMAGE,
        hiddenAt: new Date(T0 + 20).toISOString(),
        hiddenBy: "sanna",
      }),
      at(20, { id: "i2", body: null, image: IMAGE }),
    ]);

    expect(groups[0].items.map((item) => item.kind)).toEqual([
      "images",
      "message",
      "images",
    ]);
  });

  it("keeps every message, in the order it was handed over", () => {
    const input = [
      at(0, { id: "a" }),
      at(10, { id: "i1", body: null, image: IMAGE }),
      at(20, { id: "i2", body: null, image: IMAGE }),
      at(30, { id: "b", senderId: "vaino" }),
    ];
    const flat = groupChatMessages(input).flatMap((group) =>
      group.items.flatMap((item) =>
        item.kind === "message" ? [item.message] : [...item.messages],
      ),
    );
    expect(flat.map((m) => m.id)).toEqual(input.map((m) => m.id));
  });
});
