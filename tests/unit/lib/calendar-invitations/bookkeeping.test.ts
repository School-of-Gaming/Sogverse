import { describe, expect, it } from "vitest";
import {
  applyInvitationAction,
  experienceOf,
  invitationRecordSchema,
  sandboxInvitationsSchema,
  type InvitationRecord,
} from "@/lib/calendar-invitations/bookkeeping";

/**
 * The transitions are the whole of what makes an update land on an existing
 * calendar entry rather than beside it: a repeated `UID` says which event, and a
 * raised `SEQUENCE` says that this message is newer than the one the client
 * holds. Getting either wrong produces a duplicate, which is the exact failure
 * this design exists to avoid — so each rule gets its own case.
 */

const NOW = new Date("2026-09-03T10:00:00Z");
const LATER = new Date("2026-09-04T11:30:00Z");
const FRESH = "fresh-uid@sogverse";
const SECOND_FRESH = "second-uid@sogverse";

function send(existing: InvitationRecord | undefined, freshUid = FRESH) {
  return applyInvitationAction({
    existing,
    action: "send",
    method: "request",
    recipient: "admin@example.test",
    now: NOW,
    freshUid,
  });
}

describe("applyInvitationAction", () => {
  it("opens a conversation at sequence 0", () => {
    const record = send(undefined);
    expect(record).toEqual({
      uid: FRESH,
      sequence: 0,
      lastMethod: "REQUEST",
      experience: "request",
      lastSentAt: NOW.toISOString(),
      recipient: "admin@example.test",
    });
  });

  /**
   * A re-send says nothing new. Raising the sequence for it would teach the
   * client to expect a revision that never arrives, and the mail exists because
   * the first one was lost — not because the schedule moved.
   */
  it("repeats an open invitation at the same uid and sequence", () => {
    const first = send(undefined);
    const again = send(first ?? undefined, SECOND_FRESH);

    expect(again?.uid).toBe(FRESH);
    expect(again?.sequence).toBe(0);
  });

  /**
   * A second address has never been told anything, so continuing the first
   * conversation into it would hand the new recipient a `SEQUENCE` describing
   * messages they never received — and would leave the first recipient holding
   * an entry nothing will ever revise.
   */
  it("starts over when the same seat is sent to a different address", () => {
    const first = send(undefined);
    const elsewhere = applyInvitationAction({
      existing: first ?? undefined,
      action: "send",
      method: "request",
      recipient: "someone-else@example.test",
      now: LATER,
      freshUid: SECOND_FRESH,
    });

    expect(elsewhere?.uid).toBe(SECOND_FRESH);
    expect(elsewhere?.sequence).toBe(0);
    expect(elsewhere?.recipient).toBe("someone-else@example.test");
  });

  it("raises the sequence for an update and keeps the uid", () => {
    const first = send(undefined);
    const updated = applyInvitationAction({
      existing: first ?? undefined,
      action: "update",
      method: "request",
      recipient: "admin@example.test",
      now: LATER,
      freshUid: SECOND_FRESH,
    });

    expect(updated?.uid).toBe(FRESH);
    expect(updated?.sequence).toBe(1);
    expect(updated?.lastMethod).toBe("REQUEST");
    expect(updated?.lastSentAt).toBe(LATER.toISOString());
  });

  it("raises the sequence for a cancellation too, and records it", () => {
    const first = send(undefined);
    const cancelled = applyInvitationAction({
      existing: first ?? undefined,
      action: "cancel",
      method: "request",
      recipient: "admin@example.test",
      now: LATER,
      freshUid: SECOND_FRESH,
    });

    expect(cancelled?.uid).toBe(FRESH);
    expect(cancelled?.sequence).toBe(1);
    expect(cancelled?.lastMethod).toBe("CANCEL");
  });

  /**
   * Re-using a cancelled `UID` asks a client to resurrect an event it has been
   * told to delete, which several refuse outright — so the seat starts over.
   */
  it("starts a fresh uid after a cancellation", () => {
    const first = send(undefined);
    const cancelled = applyInvitationAction({
      existing: first ?? undefined,
      action: "cancel",
      method: "request",
      recipient: "admin@example.test",
      now: LATER,
      freshUid: SECOND_FRESH,
    });
    const revived = send(cancelled ?? undefined, SECOND_FRESH);

    expect(revived?.uid).toBe(SECOND_FRESH);
    expect(revived?.sequence).toBe(0);
  });

  it("refuses an update or a cancellation with nothing to revise", () => {
    for (const action of ["update", "cancel"] as const) {
      expect(
        applyInvitationAction({
          existing: undefined,
          action,
          method: "request",
          recipient: "admin@example.test",
          now: NOW,
          freshUid: FRESH,
        }),
      ).toBeNull();
    }
  });

  it("refuses to revise a seat that is already cancelled", () => {
    const first = send(undefined);
    const cancelled = applyInvitationAction({
      existing: first ?? undefined,
      action: "cancel",
      method: "request",
      recipient: "admin@example.test",
      now: LATER,
      freshUid: SECOND_FRESH,
    });

    expect(
      applyInvitationAction({
        existing: cancelled ?? undefined,
        action: "update",
        method: "request",
        recipient: "admin@example.test",
        now: LATER,
        freshUid: SECOND_FRESH,
      }),
    ).toBeNull();
  });

  it("records the publish experience as the method it states", () => {
    const record = applyInvitationAction({
      existing: undefined,
      action: "send",
      method: "publish",
      recipient: "admin@example.test",
      now: NOW,
      freshUid: FRESH,
    });
    expect(record?.lastMethod).toBe("PUBLISH");
    expect(record?.experience).toBe("publish");
  });

  /**
   * The experience is a property of the conversation, not of one message. A
   * cancellation has none of its own to state — RFC 5546 withdraws a published
   * object by re-stating it as a `PUBLISH` with `STATUS:CANCELLED` — so it
   * carries the stored answer forward rather than taking whichever option the
   * card happened to be showing. `lastMethod` keeps saying `CANCEL`, because
   * that is the field the "is there an open conversation" question reads.
   */
  it("carries the publish experience through an update and a cancellation", () => {
    const opened = applyInvitationAction({
      existing: undefined,
      action: "send",
      method: "publish",
      recipient: "admin@example.test",
      now: NOW,
      freshUid: FRESH,
    });
    const updated = applyInvitationAction({
      existing: opened ?? undefined,
      action: "update",
      method: "publish",
      recipient: "admin@example.test",
      now: LATER,
      freshUid: SECOND_FRESH,
    });
    const cancelled = applyInvitationAction({
      existing: updated ?? undefined,
      action: "cancel",
      // The card's own selection at cancel time, deliberately the other one:
      // a withdrawal states the conversation's experience, not this.
      method: "request",
      recipient: "admin@example.test",
      now: LATER,
      freshUid: SECOND_FRESH,
    });

    expect(updated?.experience).toBe("publish");
    expect(updated?.lastMethod).toBe("PUBLISH");
    expect(cancelled?.experience).toBe("publish");
    expect(cancelled?.lastMethod).toBe("CANCEL");
  });
});

describe("the stored shape", () => {
  it("parses a record the transitions produce", () => {
    expect(invitationRecordSchema.safeParse(send(undefined)).success).toBe(true);
  });

  it("keys records by participation id", () => {
    const parsed = sandboxInvitationsSchema.safeParse({
      "36d5b0c9-7e14-4af2-8b60-95c3e270d18f": send(undefined),
    });
    expect(parsed.success).toBe(true);
  });

  /**
   * Records are stored inside a sandbox document that predates the experience
   * field, and a document that fails to parse tells the admin to reset the
   * whole family. A missing answer reads as `request`, which is how such a
   * thread would have been withdrawn anyway.
   */
  it("reads a record stored without an experience as a request", () => {
    const parsed = invitationRecordSchema.safeParse({
      uid: FRESH,
      sequence: 0,
      lastMethod: "REQUEST",
      lastSentAt: NOW.toISOString(),
      recipient: "admin@example.test",
    });

    expect(parsed.success).toBe(true);
    if (parsed.success) expect(experienceOf(parsed.data)).toBe("request");
  });

  it("refuses a record with a negative sequence", () => {
    expect(
      invitationRecordSchema.safeParse({ ...send(undefined), sequence: -1 })
        .success,
    ).toBe(false);
  });
});
