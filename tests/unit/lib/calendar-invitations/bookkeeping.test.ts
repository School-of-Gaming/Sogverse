import { describe, expect, it } from "vitest";
import {
  applyInvitationAction,
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

  it("refuses a record with a negative sequence", () => {
    expect(
      invitationRecordSchema.safeParse({ ...send(undefined), sequence: -1 })
        .success,
    ).toBe(false);
  });
});
