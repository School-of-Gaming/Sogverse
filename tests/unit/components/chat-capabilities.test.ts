import { describe, expect, it } from "vitest";
import {
  deriveChatComposerCapabilities,
  deriveChatLockControl,
  deriveChatMessageCapabilities,
  isChatStaffRole,
  type ChatViewerState,
} from "@/components/chat/capabilities";
import type {
  ChatAccount,
  ChatMessage,
  ChatModerationLocks,
  ChatStanding,
} from "@/components/chat/types";
import type { LockExplanation } from "@/components/ui/locked-control";

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
/** A Gedu on a trainee seat — `gedu` by role, a participant by standing. */
const TIIA: ChatAccount = { id: "tiia", name: "Tiia", role: "gedu" };

const lock = (title: string): LockExplanation => ({
  title,
  what: `${title} what`,
  why: `${title} why`,
  dismiss: "Got it",
  lockedHint: "(locked)",
});
const TRAINEE_LOCKS: ChatModerationLocks = {
  hide: lock("hide"),
  restore: lock("restore"),
  lock: lock("lock"),
};

/**
 * What the server would have told each fixture account — the staff accounts
 * moderate, Tiia holds a trainee seat, everyone else participates. Spelled out
 * per account rather than derived from the role, because a role test is
 * exactly what the standing exists to replace.
 */
function standingOf(viewer: ChatAccount): ChatStanding {
  if (viewer === TIIA) return { kind: "trainee", locks: TRAINEE_LOCKS };
  if (viewer === SANNA || viewer === PETRA) return { kind: "moderator" };
  return { kind: "participant" };
}

function viewerState(viewer: ChatAccount, locked: boolean): ChatViewerState {
  return { viewer, standing: standingOf(viewer), locked };
}

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

describe("isChatStaffRole", () => {
  it("names admins and gedus as staff, and nobody else", () => {
    expect(isChatStaffRole("admin")).toBe(true);
    expect(isChatStaffRole("gedu")).toBe(true);
    // The one that matters: a parent holding a seat is a participant, exactly
    // like a child, and lockable like one.
    expect(isChatStaffRole("customer")).toBe(false);
    expect(isChatStaffRole("gamer")).toBe(false);
  });
});

/**
 * ============================================================================
 * Moderation comes from the standing, never from the role
 * ============================================================================
 *
 * A trainee's role is `gedu`, so any derivation that read the viewer's role
 * would hand a trainee every moderator control. The standing is what the server
 * decided; these cases pin that the module reads nothing else.
 */
describe("a trainee viewer", () => {
  const hidden = message({
    hiddenAt: "2026-06-15T17:01:00.000Z",
    hiddenBy: SANNA.id,
  });

  it("is offered no working moderation, although their role is gedu", () => {
    const caps = deriveChatMessageCapabilities(
      viewerState(TIIA, false),
      message(),
      AINO,
      false,
    );
    expect(caps.canHide).toBe(false);
    expect(caps.lockControl).toBeNull();
    expect(
      deriveChatMessageCapabilities(viewerState(TIIA, false), hidden, AINO, false)
        .canRestore,
    ).toBe(false);
  });

  it("does not read a removed message's original — that is staff sight", () => {
    const caps = deriveChatMessageCapabilities(
      viewerState(TIIA, false),
      hidden,
      AINO,
      false,
    );
    expect(caps.canSeeHiddenBody).toBe(false);
  });

  it("is shown each moderator act locked, exactly where a moderator gets it", () => {
    const standing = deriveChatMessageCapabilities(
      viewerState(TIIA, false),
      message(),
      AINO,
      false,
    );
    expect(standing.lockedHide).toBe(TRAINEE_LOCKS.hide);
    expect(standing.lockedLock).toBe(TRAINEE_LOCKS.lock);
    expect(standing.lockedRestore).toBeNull();

    const removed = deriveChatMessageCapabilities(
      viewerState(TIIA, false),
      hidden,
      AINO,
      false,
    );
    expect(removed.lockedRestore).toBe(TRAINEE_LOCKS.restore);
    expect(removed.lockedHide).toBeNull();
  });

  it("is shown no lock against staff or themselves — the moderator gets none there either", () => {
    const againstStaff = deriveChatMessageCapabilities(
      viewerState(TIIA, false),
      message({ senderId: SANNA.id }),
      SANNA,
      false,
    );
    expect(againstStaff.lockedLock).toBeNull();
    // Removal is symmetric, so its locked twin is shown on a colleague's message.
    expect(againstStaff.lockedHide).toBe(TRAINEE_LOCKS.hide);

    const own = deriveChatMessageCapabilities(
      viewerState(TIIA, false),
      message({ senderId: TIIA.id }),
      TIIA,
      false,
    );
    expect(own.lockedLock).toBeNull();
    expect(own.lockedHide).toBeNull();
    expect(own.canDelete).toBe(true);
  });

  it("gets no rail lock control at all", () => {
    expect(
      deriveChatLockControl(TIIA, standingOf(TIIA), AINO, false),
    ).toBeNull();
  });

  it("writes like any participant", () => {
    expect(deriveChatComposerCapabilities(viewerState(TIIA, false))).toEqual({
      canSend: true,
      canAttachImages: true,
      showsLockNotice: false,
    });
  });

  it("shows nobody else any locked control", () => {
    for (const viewer of [AINO, MARJA, SANNA, PETRA]) {
      const caps = deriveChatMessageCapabilities(
        viewerState(viewer, false),
        message({ senderId: VAINO.id }),
        VAINO,
        false,
      );
      expect(caps.lockedHide, viewer.name).toBeNull();
      expect(caps.lockedLock, viewer.name).toBeNull();
      expect(caps.lockedRestore, viewer.name).toBeNull();
    }
  });

  it("offers a moderator no lock against a trainee — the RPC refuses any gedu", () => {
    expect(
      deriveChatLockControl(SANNA, standingOf(SANNA), TIIA, false),
    ).toBeNull();
  });
});

describe("deriveChatComposerCapabilities", () => {
  it("offers the field and the images to anybody who is not locked", () => {
    expect(
      deriveChatComposerCapabilities(viewerState(AINO, false)),
    ).toEqual({ canSend: true, canAttachImages: true, showsLockNotice: false });
  });

  it("gives every participant images — there is no moderator-only tier", () => {
    for (const viewer of [AINO, MARJA, SANNA, PETRA]) {
      expect(
        deriveChatComposerCapabilities(viewerState(viewer, false))
          .canAttachImages,
        viewer.role,
      ).toBe(true);
    }
  });

  it("takes the whole keyboard away from a locked member, and says so", () => {
    expect(
      deriveChatComposerCapabilities(viewerState(AINO, true)),
    ).toEqual({ canSend: false, canAttachImages: false, showsLockNotice: true });
  });
});

describe("deriveChatMessageCapabilities", () => {
  const unlocked = false;

  it("gives a sender edit and delete on their own standing message", () => {
    const caps = deriveChatMessageCapabilities(
      viewerState(AINO, false),
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
      viewerState(VAINO, false),
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
      viewerState(AINO, false),
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
        viewerState(moderator, false),
        message(),
        AINO,
        unlocked,
      );
      expect(caps.canHide, moderator.role).toBe(true);
    }
  });

  it("gives a parent no moderation at all", () => {
    const caps = deriveChatMessageCapabilities(
      viewerState(MARJA, false),
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
      viewerState(VAINO, true),
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
      viewerState(VAINO, true),
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
      viewerState(SANNA, false),
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
      viewerState(VAINO, false),
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
        viewerState(SANNA, false),
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
      viewerState(AINO, false),
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
      viewerState(AINO, false),
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
      viewerState(SANNA, false),
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
      viewerState(SANNA, false),
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
      viewerState(SANNA, false),
      message({ senderId: PETRA.id }),
      PETRA,
      unlocked,
    );
    expect(caps.lockControl).toBeNull();
  });

  it("points the lock switch at whichever way the sender currently is", () => {
    const locked = deriveChatMessageCapabilities(
      viewerState(SANNA, false),
      message(),
      AINO,
      true,
    );
    expect(locked.lockControl).toBe("unlock");

    const free = deriveChatMessageCapabilities(
      viewerState(SANNA, false),
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
      viewerState(SANNA, false),
      message({ senderId: "somebody-not-on-the-roster" }),
      null,
      false,
    );
    expect(caps.lockControl).toBeNull();
  });

  it("offers no lock against another moderator, or against yourself", () => {
    const againstStaff = deriveChatMessageCapabilities(
      viewerState(PETRA, false),
      message({ senderId: SANNA.id }),
      SANNA,
      false,
    );
    expect(againstStaff.lockControl).toBeNull();

    const againstSelf = deriveChatMessageCapabilities(
      viewerState(SANNA, false),
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
      expect(deriveChatLockControl(moderator, standingOf(moderator), AINO, false), moderator.role).toBe(
        "lock",
      );
    }
  });

  it("points at unlock for somebody already locked", () => {
    expect(deriveChatLockControl(SANNA, standingOf(SANNA), VAINO, true)).toBe("unlock");
  });

  it("offers a parent nothing — moderation is a positive allow-list", () => {
    expect(deriveChatLockControl(MARJA, standingOf(MARJA), AINO, false)).toBeNull();
    expect(deriveChatLockControl(AINO, standingOf(AINO), VAINO, false)).toBeNull();
  });

  it("offers nothing against a colleague or against yourself", () => {
    expect(deriveChatLockControl(SANNA, standingOf(SANNA), PETRA, false)).toBeNull();
    expect(deriveChatLockControl(PETRA, standingOf(PETRA), SANNA, false)).toBeNull();
    expect(deriveChatLockControl(SANNA, standingOf(SANNA), SANNA, false)).toBeNull();
  });

  it("offers nothing against somebody who is not on the roster", () => {
    // The rail's own case: a room is not a channel. Anybody in the call whom
    // the chat roster does not carry — a voice-only guest, somebody whose
    // roster entry has not landed — is not a target, and the control must not
    // appear on their row for the write to be refused after the press.
    expect(deriveChatLockControl(SANNA, standingOf(SANNA), null, false)).toBeNull();
  });
});
