import {
  PartialSessionSaveError,
  SessionReportSendError,
  type SessionEntryDraft,
  type SessionFeedEntry,
  type SessionFeedGamer,
  type SessionReportSendFailure,
  type SessionReportSendResult,
} from "@/components/gedu/session-feed";
import type { AttendanceMark } from "@/components/session-feed";
import { ApiError } from "@/lib/api/api-error";
import { sessionEntryId } from "@/lib/session-occurrence";
import {
  SESSION_REPORT_ALREADY_SENT_SQLSTATE,
  SESSION_REPORT_NO_REPORT_SQLSTATE,
} from "@/services/gedu-sessions";

/**
 * What a session card's writes actually do — the Save's ordering and diffing,
 * the Send's failure classification, and the photo block's attach and remove —
 * held **once**, for every surface that mounts the gedu session feed.
 *
 * Two shells hand these entries to a feed: the gedu's own group workspace, and
 * the admin group details page that renders the same body. They bind different
 * mutation hooks — one keyed by group and invalidating the gedu feed, one keyed
 * by product and invalidating the product document — but what happens *between*
 * a draft and those mutations is not a per-surface decision. It is the rules
 * below, and a second copy of them is a second place for the diff semantics or
 * the partial-failure classification to drift, silently, until an admin and a
 * gedu saving the same sheet get different answers out of it.
 *
 * So the mutations enter as plain objects with a `mutateAsync`, which is what
 * both hooks already return, and nothing in here knows which surface it is
 * running on.
 */

/**
 * The five writes a session card can make. Structurally what the React Query
 * hooks on either surface hand back, deliberately: no adapter at either call
 * site, and no dependency here on which service is behind them.
 */
export interface SessionEntrySaveMutations {
  setSessionNotes: {
    mutateAsync: (vars: {
      sessionDate: string;
      report: string;
      geduNote: string;
    }) => Promise<unknown>;
  };
  recordAttendance: {
    mutateAsync: (vars: {
      sessionDate: string;
      participantId: string;
      status: AttendanceMark | null;
    }) => Promise<unknown>;
  };
  emailSessionReport: {
    mutateAsync: (vars: {
      sessionDate: string;
    }) => Promise<SessionReportSendResult>;
  };
  /**
   * Attach one already-normalized JPEG, answering with the stored row's id.
   *
   * The gedu shell's hook refreshes the group feed and the admin shell's the
   * product document — the same split every other write on this page has, and
   * the only thing about a photo that differs between the two surfaces.
   */
  addSessionImage: {
    mutateAsync: (vars: {
      sessionDate: string;
      width: number;
      height: number;
      file: Blob;
    }) => Promise<{ id: string }>;
  };
  /** Remove one photo by id — the RPC resolves its group from the row. */
  deleteSessionImage: {
    mutateAsync: (vars: { imageId: string }) => Promise<unknown>;
  };
}

export interface SessionEntrySaveArgs extends SessionEntrySaveMutations {
  /** The group every entry below belongs to — how an entry id is read back. */
  groupId: string;
  /** The very entries the feed is rendering, so the diff reads what is on screen. */
  entries: readonly SessionFeedEntry[];
  /** The roster the register was drawn from; only these ids are ever marked. */
  roster: readonly SessionFeedGamer[];
}

export interface SessionEntrySaves {
  saveEntry: (entryId: string, draft: SessionEntryDraft) => Promise<void>;
  sendReport: (entryId: string) => Promise<SessionReportSendResult>;
  addPhoto: (
    entryId: string,
    photo: { file: Blob; width: number; height: number },
  ) => Promise<string>;
  removePhoto: (imageId: string) => Promise<void>;
}

/**
 * Bind the two feed callbacks to one group's entries and one surface's
 * mutations.
 *
 * Called during render on both surfaces, exactly where the inline handlers used
 * to be written: the returned functions close over the entries and roster of
 * *that* render, which is what makes the diff below read the state the editor
 * was opened against.
 */
export function createSessionEntrySaves({
  groupId,
  entries,
  roster,
  setSessionNotes,
  recordAttendance,
  emailSessionReport,
  addSessionImage,
  deleteSessionImage,
}: SessionEntrySaveArgs): SessionEntrySaves {
  /**
   * Persist one session's edit.
   *
   * The two written fields go in one call, because they are one row. Attendance
   * goes one call per changed mark, because that is what stops two people
   * marking different children in the same session from overwriting each other
   * — and only the marks that actually *changed* are sent, so reopening a
   * finished sheet and saving it untouched is free.
   *
   * **The order is what makes the failure reporting honest, so it is fixed.**
   * Notes first, alone: if they are refused, no mark has been attempted yet and
   * the save really did do nothing, which is what the plain error says. Then the
   * marks, all of them, under `allSettled` rather than `all` — because `all`
   * rejects on the first refusal while the rest of the calls are still in the
   * air, so it reports total failure over a session that is now partly written.
   * A distinct error carries that case out, and the feed has different copy for
   * it.
   *
   * Anything that throws propagates: the feed keeps the editor open on it, with
   * the sheet and both notes exactly as they were, and a retry re-sends the lot.
   * Re-sending is safe by construction — each mark is a per-child upsert, so the
   * ones that already landed are rewritten to the values they already hold.
   */
  const saveEntry = async (entryId: string, draft: SessionEntryDraft) => {
    const entry = entries.find((candidate) => candidate.id === entryId);
    if (entry === undefined) return;
    const sessionDate = sessionDateOf(entryId, groupId);

    const currentReport = entry.kind === "no_record" ? null : entry.report;
    const currentNote = entry.kind === "no_record" ? null : entry.staffNote;

    const notesChanged =
      draft.report !== (currentReport ?? "") ||
      draft.staffNote !== (currentNote ?? "");

    if (notesChanged) {
      // Deliberately not settled: a refusal here happens before a single mark
      // has been attempted, so it is a total failure and throwing plainly is the
      // truth. Everything below is what can half-succeed.
      await setSessionNotes.mutateAsync({
        sessionDate,
        report: draft.report,
        geduNote: draft.staffNote,
      });
    }

    if (draft.kind !== "past") return;

    // A live entry carries marks too — it is a `future` entry whose register is
    // already open — so the diff has to read them. Treating them as `{}` would
    // resend every mark on each save, and worse, silently swallow an *unmark*
    // (undefined vs undefined reads as "no change"), losing the one correction
    // somebody is most likely to make mid-session.
    const current =
      entry.kind === "past" || entry.kind === "future" ? entry.attendance : {};
    const changed = roster.filter(
      (gamer) => draft.attendance[gamer.id] !== current[gamer.id],
    );

    const settled = await Promise.allSettled(
      changed.map((gamer) =>
        recordAttendance.mutateAsync({
          sessionDate,
          participantId: gamer.id,
          status: draft.attendance[gamer.id] ?? null,
        }),
      ),
    );

    const firstRejection = settled.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    if (firstRejection === undefined) return;

    const failed = changed.filter(
      (_, index) => settled[index].status === "rejected",
    );

    // "Partial" has to mean something actually landed, or the copy is its own
    // small lie. Every mark refused with no note written is a save that changed
    // nothing, and the plain total-failure message is the right one for it.
    const somethingLanded =
      notesChanged || settled.some((result) => result.status === "fulfilled");
    if (!somethingLanded) throw firstRejection.reason;

    // `cause` keeps the underlying rejection reachable for a console or a future
    // error report; the person saving is told which shape of failure it was,
    // never the Postgres code behind it.
    throw new PartialSessionSaveError(
      failed.map((gamer) => gamer.id),
      { cause: firstRejection.reason },
    );
  };

  /**
   * Email one session's report to the group's families.
   *
   * **Nothing is decided here.** Who gets the mail, what it says and whether
   * the send is allowed at all are the route's, because the claim it makes
   * first is both the at-most-once guard and the authorization — so this hands
   * over the session's identity and passes the tally back.
   *
   * The one translation it does make is of the refusal. The service throws with
   * the status and, on the two refusals the claim raises, the SQLSTATE behind
   * it; the feed picks a line and must not know what either of those is.
   */
  const sendReport = async (
    entryId: string,
  ): Promise<SessionReportSendResult> => {
    try {
      return await emailSessionReport.mutateAsync({
        sessionDate: sessionDateOf(entryId, groupId),
      });
    } catch (error) {
      throw new SessionReportSendError(sendFailureOf(error), {
        cause: error,
      });
    }
  };

  /**
   * Attach one photo to a session, answering with the stored id.
   *
   * **Called by the card's Save, once per staged picture.** A photo is held in
   * the browser with the rest of the draft, so this runs inside the same
   * committing window as the notes and the register — the feed sequences the
   * three, because dropping each photo operation from the staged set as it
   * lands is what makes a retry after a half-landed save do only what is left.
   *
   * **The bytes arrive already normalized.** Decoding, downscaling and
   * re-encoding happen in the strip, at pick time, because a file the browser
   * cannot open has to be refused while the gedu is still choosing it — and
   * because the encoded dimensions are what the tile's box is arithmetic from.
   * What is left for this layer is what every other write here does: turn an
   * entry id back into the (group, date) pair Postgres keys the row by, and call
   * the surface's own mutation.
   *
   * Nothing is caught. A refusal — from the browser's encoder or from the route
   * — travels out untouched, because the one vocabulary of stable codes is what
   * the strip translates, and a wrapper here could only blur it.
   */
  const addPhoto = async (
    entryId: string,
    photo: { file: Blob; width: number; height: number },
  ): Promise<string> => {
    const { id } = await addSessionImage.mutateAsync({
      sessionDate: sessionDateOf(entryId, groupId),
      width: photo.width,
      height: photo.height,
      file: photo.file,
    });
    return id;
  };

  /**
   * Remove one photo — called by the card's Save, once per crossed-out tile.
   *
   * The id is the whole request, and the group is nowhere in it: the RPC
   * resolves the photo's session — and so its group — from the row itself, and
   * that resolution is the authorization. So this takes no entry id and does no
   * date arithmetic.
   */
  const removePhoto = async (imageId: string): Promise<void> => {
    await deleteSessionImage.mutateAsync({ imageId });
  };

  return { saveEntry, sendReport, addPhoto, removePhoto };
}

/**
 * The product-local date an entry id names.
 *
 * Read back off the id rather than re-derived from the entry's instant, because
 * the id is what the row is keyed by in Postgres: the two agree by construction
 * this way, and cannot drift if a snapshot's instant ever disagrees with the
 * date it was filed under.
 */
function sessionDateOf(entryId: string, groupId: string): string {
  return entryId.slice(sessionEntryId(groupId, "").length);
}

/**
 * Which of the card's three send messages a caught failure calls for.
 *
 * Keyed on the code the route attaches to the two refusals somebody can act on,
 * never on the status or the message: the two share a `409`, and the message is
 * English written for a log. Everything else — a `403`, a `500`, the `502` that
 * says every mail was refused, a dropped connection — is the retryable failure.
 */
function sendFailureOf(error: unknown): SessionReportSendFailure {
  if (!(error instanceof ApiError)) return "failed";
  if (error.code === SESSION_REPORT_ALREADY_SENT_SQLSTATE) return "already_sent";
  if (error.code === SESSION_REPORT_NO_REPORT_SQLSTATE) return "no_report";
  return "failed";
}
