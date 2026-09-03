import { z } from "zod";
import {
  INVITATION_METHOD_OPTIONS,
  INVITATION_METHODS,
  methodFor,
  type InvitationAction,
  type InvitationMethodOption,
} from "./options";

/**
 * What has already been said to a calendar about one seat.
 *
 * An iTIP conversation is stateful in a way a subscribed feed is not. A feed
 * has no memory: a client re-fetches it and takes whatever it says. An
 * invitation is a message about a *particular* event, and a second message only
 * lands on the first if it repeats its `UID` and raises its `SEQUENCE` — get
 * either wrong and the recipient's calendar grows a duplicate instead of
 * changing in place. So the pair has to be remembered between sends, and this
 * is the record of it.
 *
 * **It lives inside the admin's sandbox document**, keyed by participation id,
 * because that document is already the one row this exploration owns and a
 * table of its own would be a migration for a thing we are still deciding
 * whether to build. Sharing a row means the document has two writers, and each
 * preserves the other's half: the family editor's save carries the stored
 * `invitations` forward untouched and discards whatever its draft held of them,
 * and the invitation route merges its record onto a document it re-reads at the
 * moment it writes. So a family edit and a send are independent in either
 * order; the one write that clears the bookkeeping is Reset, which says start
 * over and means it.
 */

export const invitationRecordSchema = z.object({
  /**
   * The one calendar object's `UID`, used verbatim — a message carries a single
   * `VEVENT`, so there is nothing to suffix it with. It is regenerated only
   * when the conversation starts over: after a cancellation, or on a send to a
   * different address.
   */
  uid: z.string().min(1),
  /**
   * RFC 5546's revision counter. A client ignores a message whose sequence is
   * not higher than the one it holds, which is what makes an update an update.
   */
  sequence: z.number().int().min(0),
  /** What the last message stated, so a cancelled seat is recognisable. */
  lastMethod: z.enum(INVITATION_METHODS),
  /**
   * Which mail experience the conversation is running as.
   *
   * Remembered rather than re-asked, because a withdrawal has no experience of
   * its own to choose: RFC 5546 withdraws a published object by re-stating it
   * as a `PUBLISH` with `STATUS:CANCELLED`, so a cancellation has to know what
   * the thread has been rather than what the admin last touched. It is separate
   * from `lastMethod` because that field answers a different question — whether
   * this seat has an open conversation at all — and `CANCEL` is the value that
   * says no.
   *
   * Optional, so a record stored before this field existed still parses — a
   * document that fails to parse tells the admin to reset the whole family.
   * Absent means `request`, which is how such a conversation would already
   * have been withdrawn; read it through `experienceOf` rather than defaulting
   * it here, because a zod `.default()` gives the schema an input type that
   * differs from its output and the sandbox document is parsed and rebuilt
   * from that one type at both ends.
   */
  experience: z.enum(INVITATION_METHOD_OPTIONS).optional(),
  lastSentAt: z.string().datetime({ offset: true }),
  /**
   * Who it went to. A send to a different address is a different conversation
   * and starts one; an update or a cancellation re-addressed mid-thread is the
   * admin re-aiming this tool, and it keeps the thread it is revising.
   */
  recipient: z.string(),
});

export type InvitationRecord = z.infer<typeof invitationRecordSchema>;

/**
 * The experience a stored record's conversation is running as.
 *
 * The one place the absent answer is read, so no caller has to remember which
 * way a record written before the field existed should be withdrawn.
 */
export function experienceOf(record: InvitationRecord): InvitationMethodOption {
  return record.experience ?? "request";
}

/**
 * Every seat's record, keyed by participation id.
 *
 * A record rather than an array so a seat's entry is addressed by the same id
 * the card selects with, and so a document holding an entry for a seat that has
 * since been deleted costs nothing to carry and nothing to clean up.
 */
export const sandboxInvitationsSchema = z.record(
  z.string(),
  invitationRecordSchema,
);

export type SandboxInvitations = z.infer<typeof sandboxInvitationsSchema>;

export interface ApplyInvitationActionArgs {
  /** What is already known about this seat, or `undefined` for a first send. */
  existing: InvitationRecord | undefined;
  action: InvitationAction;
  /** Which mail experience a `send`/`update` is stating. Ignored by a cancel. */
  method: InvitationMethodOption;
  recipient: string;
  now: Date;
  /**
   * The `UID` to use if this action starts a fresh conversation.
   *
   * Passed in rather than generated here so the whole transition is pure and a
   * test can assert on the id it chose. The route generates one per request and
   * lets it go unused when the action turns out to continue an existing thread.
   */
  freshUid: string;
}

/**
 * The record this action leaves behind, or `null` when the action cannot be
 * taken at all.
 *
 * The three transitions, and why each is what it is:
 *
 * - **send** starts a conversation at sequence 0 — or, when one is already
 *   open *with the same recipient*, *repeats* it at the same sequence. A
 *   re-send is the case where a mail was lost or filed somewhere the reader
 *   could not find it, and raising the sequence for a message that says nothing
 *   new would train the client to expect a revision that never arrives. A
 *   different address is a different conversation, and continuing the old one
 *   into it would hand the new recipient a `SEQUENCE` that describes messages
 *   they never received — so a changed address starts over at sequence 0 under
 *   a new `UID`, which is also what leaves the first recipient's entry alone.
 *   After a cancellation the seat is over, so a send there is a new
 *   conversation with a new `UID` too: re-using the cancelled one asks a client
 *   to resurrect an event it has been told to delete, which some clients refuse
 *   outright.
 * - **update** raises the sequence and re-states the whole event. That is the
 *   entire mechanism being tested.
 * - **cancel** raises the sequence too, because a cancellation is just another
 *   revision of the same event and a client applies it under the same rule.
 *
 * `null` is returned rather than thrown: "there is nothing to update yet" is a
 * fact about the request, and the caller is the one that knows what status code
 * that deserves.
 */
export function applyInvitationAction(
  args: ApplyInvitationActionArgs,
): InvitationRecord | null {
  const { existing, action, method, recipient, now, freshUid } = args;
  const lastSentAt = now.toISOString();

  if (action === "send") {
    const continuing =
      existing !== undefined &&
      existing.lastMethod !== "CANCEL" &&
      existing.recipient === recipient;
    return {
      uid: continuing ? existing.uid : freshUid,
      sequence: continuing ? existing.sequence : 0,
      lastMethod: methodFor(method),
      experience: method,
      lastSentAt,
      recipient,
    };
  }

  // Both remaining actions revise a message that must already exist. A
  // cancelled seat has nothing left to revise either — the client has been told
  // the event is gone, and telling it again says nothing.
  if (existing === undefined || existing.lastMethod === "CANCEL") return null;

  return {
    uid: existing.uid,
    sequence: existing.sequence + 1,
    lastMethod: action === "cancel" ? "CANCEL" : methodFor(method),
    // A cancellation states no experience of its own — it withdraws whatever
    // the conversation has been, so the stored answer is carried forward rather
    // than overwritten by whichever option the card happened to be showing.
    experience: action === "cancel" ? experienceOf(existing) : method,
    lastSentAt,
    recipient,
  };
}

/** A fresh base `UID`. Globally unique and stable once stored. */
export function newInvitationUid(): string {
  return `${crypto.randomUUID()}@sogverse`;
}
