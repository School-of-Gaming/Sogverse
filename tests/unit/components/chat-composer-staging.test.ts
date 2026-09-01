import { describe, expect, it } from "vitest";
import {
  chatSendIsEmpty,
  fanOutChatSend,
  stageChatImages,
  type StagedChatImage,
} from "@/components/chat/composer-staging";
import type { ChatAccount } from "@/components/chat/types";
import {
  MAX_CHAT_MESSAGE_LENGTH,
  MAX_STAGED_CHAT_IMAGES,
} from "@/lib/constants/chat";

/**
 * The composer stages and the send fans out — the decision that makes a message
 * text XOR one image, and with it removes captions, an attachment child table
 * and the question of what a caption on the third of five pictures means.
 *
 * Both halves are pure because both are decisions rather than effects, and both
 * are worth pinning: the cap is the only thing standing between a folder drop
 * and a hundred messages, and the fan-out's *order* is what the log's grouping
 * then reads back.
 */

function image(name: string): StagedChatImage {
  return {
    key: `key-${name}`,
    src: `blob:${name}`,
    width: 1600,
    height: 900,
    name,
  };
}

/** `count` distinct staged pictures. */
function images(count: number): StagedChatImage[] {
  return Array.from({ length: count }, (_, index) => image(`p${index}`));
}

describe("stageChatImages", () => {
  it("appends to the queue in the order they were handed over", () => {
    const result = stageChatImages([image("a")], [image("b"), image("c")]);
    expect(result.staged.map((entry) => entry.name)).toEqual(["a", "b", "c"]);
    expect(result.refused).toBe(0);
  });

  it("takes what fits and reports what did not", () => {
    // The refusal count is what the composer's one error line is written from;
    // taking ten and quietly sending two would be the same gesture with no way
    // to notice.
    const result = stageChatImages(images(MAX_STAGED_CHAT_IMAGES - 2), images(5), MAX_STAGED_CHAT_IMAGES);
    expect(result.staged).toHaveLength(MAX_STAGED_CHAT_IMAGES);
    expect(result.refused).toBe(3);
  });

  it("refuses everything once the queue is already full", () => {
    const full = images(MAX_STAGED_CHAT_IMAGES);
    const result = stageChatImages(full, images(2), MAX_STAGED_CHAT_IMAGES);
    expect(result.staged).toHaveLength(MAX_STAGED_CHAT_IMAGES);
    expect(result.refused).toBe(2);
  });

  it("never shortens a queue that is somehow already over the cap", () => {
    // Not reachable through the composer, and the honest answer anyway: a
    // staging pass adds pictures, so it must not silently throw some away.
    const over = images(MAX_STAGED_CHAT_IMAGES + 2);
    const result = stageChatImages(over, [image("x")], MAX_STAGED_CHAT_IMAGES);
    expect(result.staged).toHaveLength(over.length);
    expect(result.refused).toBe(1);
  });

  it("leaves the input arrays alone", () => {
    const current = [image("a")];
    stageChatImages(current, [image("b")]);
    expect(current).toHaveLength(1);
  });
});

describe("fanOutChatSend", () => {
  it("makes one image-only message per picture, then the words", () => {
    const drafts = fanOutChatSend("look what we made", images(3), []);

    expect(drafts).toHaveLength(4);
    expect(drafts.slice(0, 3).every((draft) => draft.body === null)).toBe(true);
    expect(drafts.slice(0, 3).map((draft) => draft.image?.name)).toEqual([
      "p0",
      "p1",
      "p2",
    ]);
    // The words last, so a burst reads as the set and then what the sender
    // wanted to say about it.
    expect(drafts[3].image).toBeNull();
    expect(drafts[3].body).toBe("look what we made");
  });

  it("sends words alone when nothing is staged", () => {
    expect(fanOutChatSend("just talking", [], [])).toEqual([
      { body: "just talking", image: null, replyToId: null },
    ]);
  });

  it("sends pictures alone when nothing was typed", () => {
    const drafts = fanOutChatSend("   ", images(2), []);
    expect(drafts).toHaveLength(2);
    expect(drafts.every((draft) => draft.body === null)).toBe(true);
  });

  it("produces nothing at all from an empty composer", () => {
    expect(fanOutChatSend("", [], [])).toEqual([]);
    expect(fanOutChatSend("\n  \t ", [], [])).toEqual([]);
  });

  it("trims and caps the words", () => {
    expect(fanOutChatSend("  padded  ", [], [])[0].body).toBe("padded");

    const long = "x".repeat(MAX_CHAT_MESSAGE_LENGTH + 50);
    expect(fanOutChatSend(long, [], [], null, MAX_CHAT_MESSAGE_LENGTH)[0].body)
      .toHaveLength(MAX_CHAT_MESSAGE_LENGTH);
  });

  /**
   * ==========================================================================
   * The cap bites the composed text, and resolution runs *after* it.
   * ==========================================================================
   *
   * The order is the whole correctness argument, and getting it backwards is
   * invisible in every other test here: capping the *resolved* string leaves a
   * draft that is at the limit and names somebody cut somewhere inside a token,
   * so the log shows `@[Väinö](789a4f…` as literal text — the plumbing, in
   * public, on exactly the messages that name the most people. This is the case
   * that fails if a later refactor lets a resolved body reach the cap.
   */
  it("resolves after capping, so a mention at the limit survives whole", () => {
    const vaino: ChatAccount = {
      id: "789a4f4e-9afb-4c75-8714-823c129bfbff",
      name: "Väinö",
      role: "gamer",
    };
    const token = `@[${vaino.name}](${vaino.id})`;

    // Exactly the cap in the form the writer sees, with the mention last —
    // where a cap applied one step too late would land inside it.
    const typed = `${"x".repeat(MAX_CHAT_MESSAGE_LENGTH - 7)} @${vaino.name}`;
    expect(typed).toHaveLength(MAX_CHAT_MESSAGE_LENGTH);

    const body = fanOutChatSend(typed, [], [vaino])[0].body;
    expect(body?.endsWith(token)).toBe(true);
    // The stored body running *longer* than the cap is the contract, not a
    // leak: the cap is a promise about the sentence, and the token is markup
    // the writer never saw.
    expect(body?.length).toBeGreaterThan(MAX_CHAT_MESSAGE_LENGTH);
  });

  /**
   * The reply target has to survive the fan-out or a composed reply is sent as
   * an ordinary message — the quote the sender put on it silently gone. It
   * rides on exactly **one** draft of the burst, because the composer answers
   * one message and five copies of the same quote over one set of pictures is
   * not what the sender wrote.
   */
  describe("the reply target", () => {
    it("rides on the words, once, when anything was typed", () => {
      const drafts = fanOutChatSend("what he said", images(3), [], "seed-4");
      expect(drafts.map((draft) => draft.replyToId)).toEqual([
        null,
        null,
        null,
        "seed-4",
      ]);
    });

    it("falls to the first picture when nothing was typed", () => {
      // An image-only reply that dropped its target would be a reply to
      // nothing, which is the one outcome worse than quoting twice.
      const drafts = fanOutChatSend("", images(2), [], "seed-4");
      expect(drafts.map((draft) => draft.replyToId)).toEqual(["seed-4", null]);
    });

    it("is null throughout when nothing is being answered", () => {
      const drafts = fanOutChatSend("just talking", images(1), []);
      expect(drafts.every((draft) => draft.replyToId === null)).toBe(true);
    });

    it("produces nothing at all from an empty composer, reply or not", () => {
      expect(fanOutChatSend("  ", [], [], "seed-4")).toEqual([]);
    });
  });
});

describe("chatSendIsEmpty", () => {
  it("is true only when there is neither a word nor a picture", () => {
    expect(chatSendIsEmpty("", [])).toBe(true);
    expect(chatSendIsEmpty("   ", [])).toBe(true);
    expect(chatSendIsEmpty("hi", [])).toBe(false);
    expect(chatSendIsEmpty("  ", images(1))).toBe(false);
  });

  it("agrees with the fan-out, which is what the disabled Send depends on", () => {
    const cases: readonly [string, StagedChatImage[]][] = [
      ["", []],
      ["  ", []],
      ["hi", []],
      ["", images(1)],
      ["hi", images(2)],
    ];
    for (const [text, staged] of cases) {
      expect(chatSendIsEmpty(text, staged), text).toBe(
        fanOutChatSend(text, staged, []).length === 0,
      );
    }
  });
});
