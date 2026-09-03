import { describe, expect, it } from "vitest";
import {
  deriveChatComposerCapabilities,
  deriveChatLockControl,
  deriveChatMessageCapabilities,
  isChatModerator,
} from "@/components/chat/capabilities";
import type { ChatAccount, ChatMessage } from "@/components/chat/types";

/**
 * The capability module is the one piece of chat permission logic that is
 * genuinely the client's — everything else is a guarded RPC or an RLS policy —
 * so it is also the one piece a test can hold to account before any backend
 * exists. What it decides is the *offer*: which controls a composer and a
 * message menu put in front of somebody.
 *
 * The cases below are written per rule rather than per role, because the rules
 * are what a future reader has to not break: a lock takes away everything that
 * writes, a removed message offers only putting it back, moderation comes from
 * an allow-list of roles rather than from excluding one, and per-person
 * moderation is symmetric while a lock is not.
 */

const AINO: ChatAccount = { id: "aino", name: "Aino", role: "gamer" };
const VAINO: ChatAccount = { id: "vaino", name: "Väinö", role: "gamer" };
const MARJA: ChatAccount = { id: "marja", name: "Marja", role: "customer" };
const SANNA: ChatAccount = { id: "sanna", name: "Sanna", role: "gedu" };
const PETRA: ChatAccount = { id: "petra", name: "Petra", role: "admin" };

function message(over: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "m1",
    senderId: AINO.id,
    createdAt: "2026-06-15T17:00:00.000Z",
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

describe("isChatModerator", () => {
  it("admits admins and gedus, and nobody else", () => {
    expect(isChatModerator("admin")).toBe(true);
    expect(isChatModerator("gedu")).toBe(true);
    // The one that matters: a parent holding a seat is a participant, exactly
    // like a child. A negative test ("not a gamer") would hand them the lot.
    expect(isChatModerator("customer")).toBe(false);
    expect(isChatModerator("gamer")).toBe(false);
  });
});

describe("deriveChatComposerCapabilities", () => {
  it("offers the field and the images to anybody who is not locked", () => {
    expect(
      deriveChatComposerCapabilities({ viewer: AINO, locked: false }),
    ).toEqual({ canSend: true, canAttachImages: true, showsLockNotice: false });
  });

  it("gives every participant images — there is no moderator-only tier", () => {
    for (const viewer of [AINO, MARJA, SANNA, PETRA]) {
      expect(
        deriveChatComposerCapabilities({ viewer, locked: false })
          .canAttachImages,
        viewer.role,
      ).toBe(true);
    }
  });

  it("takes the whole keyboard away from a locked member, and says so", () => {
    expect(
      deriveChatComposerCapabilities({ viewer: AINO, locked: true }),
    ).toEqual({ canSend: false, canAttachImages: false, showsLockNotice: true });
  });
});

describe("deriveChatMessageCapabilities", () => {
  const unlocked = false;

  it("gives a sender edit and delete on their own standing message", () => {
    const caps = deriveChatMessageCapabilities(
      { viewer: AINO, locked: false },
      message(),
      AINO,
      unlocked,
    );
    expect(caps.canEdit).toBe(true);
    expect(caps.canDelete).toBe(true);
    // Their own message is deleted, never "removed for everyone": one control
    // per row, so the menu never offers two words for one outcome.
    expect(caps.canHide).toBe(false);
  });

  it("gives nobody else edit or delete", () => {
    const caps = deriveChatMessageCapabilities(
      { viewer: VAINO, locked: false },
      message(),
      AINO,
      unlocked,
    );
    expect(caps.canEdit).toBe(false);
    expect(caps.canDelete).toBe(false);
    expect(caps.canHide).toBe(false);
  });

  it("refuses an edit on an image-only message, which has no words to change", () => {
    const caps = deriveChatMessageCapabilities(
      { viewer: AINO, locked: false },
      message({
        body: null,
        image: { id: "i", src: "/preview-art/x.jpg", width: 4, height: 3 },
      }),
      AINO,
      unlocked,
    );
    expect(caps.canEdit).toBe(false);
    expect(caps.canDelete).toBe(true);
  });

  it("lets a moderator remove somebody else's message", () => {
    for (const moderator of [SANNA, PETRA]) {
      const caps = deriveChatMessageCapabilities(
        { viewer: moderator, locked: false },
        message(),
        AINO,
        unlocked,
      );
      expect(caps.canHide, moderator.role).toBe(true);
    }
  });

  it("gives a parent no moderation at all", () => {
    const caps = deriveChatMessageCapabilities(
      { viewer: MARJA, locked: false },
      message(),
      AINO,
      unlocked,
    );
    expect(caps.canHide).toBe(false);
    expect(caps.canSeeHiddenBody).toBe(false);
    expect(caps.lockControl).toBeNull();
  });

  it("takes reactions and replies from a locked member too", () => {
    // A reaction is a message with fewer characters. A member locked out of
    // chat who could still react would have been locked out of nothing.
    const caps = deriveChatMessageCapabilities(
      { viewer: VAINO, locked: true },
      message(),
      AINO,
      unlocked,
    );
    expect(caps.canReact).toBe(false);
    expect(caps.canReply).toBe(false);
    expect(caps.canEdit).toBe(false);
  });

  it("leaves a locked member able to delete what they already sent", () => {
    // A lock stops somebody writing; it does not take away their own words
    // retrospectively, and taking back something you regret is the one thing a
    // locked member most plausibly still wants.
    const caps = deriveChatMessageCapabilities(
      { viewer: VAINO, locked: true },
      message({ senderId: VAINO.id }),
      VAINO,
      true,
    );
    expect(caps.canDelete).toBe(true);
  });

  it("offers a removed message nothing but putting it back, and only to staff", () => {
    const hidden = message({
      hiddenAt: "2026-06-15T17:01:00.000Z",
      hiddenBy: SANNA.id,
    });

    const staff = deriveChatMessageCapabilities(
      { viewer: SANNA, locked: false },
      hidden,
      AINO,
      unlocked,
    );
    expect(staff.canRestore).toBe(true);
    expect(staff.canSeeHiddenBody).toBe(true);
    expect(staff.canReact).toBe(false);
    expect(staff.canReply).toBe(false);
    expect(staff.canHide).toBe(false);

    const child = deriveChatMessageCapabilities(
      { viewer: VAINO, locked: false },
      hidden,
      AINO,
      unlocked,
    );
    expect(child.canRestore).toBe(false);
    expect(child.canSeeHiddenBody).toBe(false);
  });

  it("offers nothing on a message the server has not seen yet", () => {
    for (const delivery of ["pending", "failed"] as const) {
      const caps = deriveChatMessageCapabilities(
        { viewer: SANNA, locked: false },
        message({ delivery }),
        AINO,
        unlocked,
      );
      expect(caps.canReact, delivery).toBe(false);
      expect(caps.canReply, delivery).toBe(false);
      expect(caps.canHide, delivery).toBe(false);
    }
  });

  it("lets a sender delete their own message that failed to send", () => {
    // The refusal leaves a bubble in the sender's own log with nothing but a
    // retry on it, and "it did not go and I want it gone" has to have an
    // answer. Nothing is asked of the server — there is no row yet.
    const caps = deriveChatMessageCapabilities(
      { viewer: AINO, locked: false },
      message({ delivery: "failed" }),
      AINO,
      unlocked,
    );
    expect(caps.canDelete).toBe(true);
    // And it is still nothing else: a failed message is not a thing anybody
    // can answer, quote or moderate.
    expect(caps.canEdit).toBe(false);
    expect(caps.canReply).toBe(false);
    expect(caps.canReact).toBe(false);
  });

  it("does not offer to delete a message still in flight", () => {
    // A pending send has an outcome coming; deleting it would race the
    // acknowledgement. Waiting the moment out loses nothing, because it can be
    // deleted either way it lands.
    const caps = deriveChatMessageCapabilities(
      { viewer: AINO, locked: false },
      message({ delivery: "pending" }),
      AINO,
      unlocked,
    );
    expect(caps.canDelete).toBe(false);
  });

  it("does not offer somebody else's failed message to a moderator", () => {
    // Deleting a failed message is a sender taking back their own echo, not a
    // moderation act — there is nothing for anybody else to remove.
    const caps = deriveChatMessageCapabilities(
      { viewer: SANNA, locked: false },
      message({ delivery: "failed" }),
      AINO,
      unlocked,
    );
    expect(caps.canDelete).toBe(false);
    expect(caps.canHide).toBe(false);
  });

  /**
   * ==========================================================================
   * The moderation symmetry principle (owner ruling, 2026-09-01)
   * ==========================================================================
   *
   * Per-person acts — removing a message, muting a mic — are symmetric: any
   * moderator may apply them to anyone, colleagues included. Lock-class acts
   * are not. Both halves are pinned here so neither reads as an accident of
   * how two functions happen to be written.
   */
  it("lets a gedu remove an admin's message — moderation is symmetric", () => {
    const caps = deriveChatMessageCapabilities(
      { viewer: SANNA, locked: false },
      message({ senderId: PETRA.id }),
      PETRA,
      unlocked,
    );
    expect(caps.canHide).toBe(true);
  });

  it("does not let a gedu lock an admin — a lock is not symmetric", () => {
    // A removal acts on one thing that was said and takes nothing away; a lock
    // silences a colleague in front of the children they are both responsible
    // for, which is a staff problem handled by people, not by this menu.
    const caps = deriveChatMessageCapabilities(
      { viewer: SANNA, locked: false },
      message({ senderId: PETRA.id }),
      PETRA,
      unlocked,
    );
    expect(caps.lockControl).toBeNull();
  });

  it("points the lock switch at whichever way the sender currently is", () => {
    const locked = deriveChatMessageCapabilities(
      { viewer: SANNA, locked: false },
      message(),
      AINO,
      true,
    );
    expect(locked.lockControl).toBe("unlock");

    const free = deriveChatMessageCapabilities(
      { viewer: SANNA, locked: false },
      message(),
      AINO,
      false,
    );
    expect(free.lockControl).toBe("lock");
  });

  it("offers no lock against a sender the roster cannot name", () => {
    // The rail's case, met through a message: a moderation act aimed at
    // somebody the control cannot even print the name of is aimed at a blank.
    const caps = deriveChatMessageCapabilities(
      { viewer: SANNA, locked: false },
      message({ senderId: "somebody-not-on-the-roster" }),
      null,
      false,
    );
    expect(caps.lockControl).toBeNull();
  });

  it("offers no lock against another moderator, or against yourself", () => {
    const againstStaff = deriveChatMessageCapabilities(
      { viewer: PETRA, locked: false },
      message({ senderId: SANNA.id }),
      SANNA,
      false,
    );
    expect(againstStaff.lockControl).toBeNull();

    const againstSelf = deriveChatMessageCapabilities(
      { viewer: SANNA, locked: false },
      message({ senderId: SANNA.id }),
      SANNA,
      false,
    );
    expect(againstSelf.lockControl).toBeNull();
  });
});

/**
 * ============================================================================
 * The lock, asked about a person rather than about a message
 * ============================================================================
 *
 * A lock is a judgement about somebody, so the question has no message in it —
 * and the voice room's participant rail asks it that way, beside a name, with
 * no message in hand. The cases below are the rail's, and they are the same
 * function the message menu goes through: a lock offered in one place and
 * refused in the other would be two answers to one question, and the RPC's
 * guard mirrors exactly one of them.
 */
describe("deriveChatLockControl", () => {
  it("offers a moderator the lock against a participant", () => {
    for (const moderator of [SANNA, PETRA]) {
      expect(deriveChatLockControl(moderator, AINO, false), moderator.role).toBe(
        "lock",
      );
    }
  });

  it("points at unlock for somebody already locked", () => {
    expect(deriveChatLockControl(SANNA, VAINO, true)).toBe("unlock");
  });

  it("offers a parent nothing — moderation is a positive allow-list", () => {
    expect(deriveChatLockControl(MARJA, AINO, false)).toBeNull();
    expect(deriveChatLockControl(AINO, VAINO, false)).toBeNull();
  });

  it("offers nothing against a colleague or against yourself", () => {
    expect(deriveChatLockControl(SANNA, PETRA, false)).toBeNull();
    expect(deriveChatLockControl(PETRA, SANNA, false)).toBeNull();
    expect(deriveChatLockControl(SANNA, SANNA, false)).toBeNull();
  });

  it("offers nothing against somebody who is not on the roster", () => {
    // The rail's own case: a room is not a channel. Anybody in the call whom
    // the chat roster does not carry — a voice-only guest, somebody whose
    // roster entry has not landed — is not a target, and the control must not
    // appear on their row for the write to be refused after the press.
    expect(deriveChatLockControl(SANNA, null, false)).toBeNull();
  });
});
