import { z } from "zod";
import { ApiError } from "@/lib/api/api-error";
import {
  parseJsonResponse,
  readApiError,
  readErrorMessage,
} from "@/lib/api/json-response";
import { SESSION_RECORDING_EPOCH } from "@/lib/constants";
import type { AppSupabaseClient } from "@/types";
import {
  addSessionImageResponse,
  attendanceMarkResult,
  emailSessionReportResponse,
  geduAssignmentSummaries,
  geduGroupFeed,
  groupNotesResult,
  groupSessionNotesResult,
  siteNotesResult,
  type AddSessionImageResponse,
  type AttendanceStatus,
  type EmailSessionReportBody,
  type EmailSessionReportResponse,
  type GeduAssignmentSummary,
  type GeduGroupFeed,
} from "./gedu-sessions.contracts";

/**
 * Reads and writes for the gedu session feed.
 *
 * Almost every method here is an `.rpc()` call: the two new tables grant nothing
 * to `authenticated`, so the SECURITY DEFINER functions are the only way in and
 * the authorization lives in one place rather than being re-derived per call
 * site.
 *
 * **Two methods stand outside that**, and both for the same reason — a write
 * that needs a server-side secret before it can happen. Correcting a game
 * username needs the platform's own lookup and lives in the Minecraft service;
 * emailing a session report needs the mail provider, the families' addresses
 * and the admin list, none of which a browser may hold, so it posts to a route.
 * The route's own first act is still an RPC — the claim that stamps the row is
 * both the at-most-once guard and the authorization — so the rule above is bent
 * rather than broken.
 *
 * Every RPC raises `42501` when the caller is not a gedu assigned to the group
 * in question. The reads surface that as `null` so a route can render a clean
 * "not your group" state; the writes let it throw, because a write that was
 * refused is something the editor has to tell the gedu about.
 */
export class GeduSessionsService {
  constructor(private supabase: AppSupabaseClient) {}

  /**
   * Everything one group's workspace renders, in a single round trip: the
   * product shell, the group and its notes, the site notes on in-person
   * products, the current roster, and every stored session row with its sparse
   * attendance map.
   *
   * The whole history comes back at once and that is deliberate — a weekly club
   * running five years is a few hundred rows, and the feed already reveals its
   * past in chunks on the client, so server pagination would buy nothing and
   * cost a cursor.
   */
  async getGroupFeed(groupId: string): Promise<GeduGroupFeed | null> {
    const { data, error } = await this.supabase.rpc("get_gedu_group_feed", {
      p_group_id: groupId,
    });

    if (error) {
      if (error.code === "42501") return null;
      throw error;
    }

    return geduGroupFeed.parse(data);
  }

  /**
   * One row per assignment for the dashboard cards.
   *
   * The epoch travels in from the code constant rather than living in the
   * database, so "when did we start asking" is decided in exactly one place.
   */
  async getMyAssignmentSummaries(): Promise<GeduAssignmentSummary[]> {
    const { data, error } = await this.supabase.rpc(
      "get_my_gedu_assignment_summaries",
      { p_epoch_date: SESSION_RECORDING_EPOCH },
    );

    if (error) throw error;
    return geduAssignmentSummaries.parse(data);
  }

  /**
   * Write a session's family-facing report and gedu note, materializing the row
   * if this is the first thing ever recorded against that date.
   *
   * Empty strings collapse to `null` server-side, so clearing a note stops its
   * block rendering rather than storing a blank one.
   */
  async setSessionNotes(args: {
    groupId: string;
    sessionDate: string;
    report: string;
    geduNote: string;
  }) {
    const { data, error } = await this.supabase.rpc(
      "set_group_session_notes",
      {
        p_group_id: args.groupId,
        p_session_date: args.sessionDate,
        p_report: args.report,
        p_gedu_note: args.geduNote,
      },
    );

    if (error) throw error;
    return groupSessionNotesResult.parse(data);
  }

  /**
   * Record — or clear — ONE participant's mark for one session.
   *
   * The target is whoever holds the seat: session_attendance is participant-keyed
   * and the RPC's roster check has no branch for a role, so a gedu marks an
   * adult present exactly as they mark a child.
   *
   * One call per mark, never a whole map: two gedus marking different people
   * in the same session must not be able to overwrite each other, and a
   * whole-map write makes that unavoidable. `status: null` reverts to unmarked,
   * which deletes the row so "unmarked" stays the absence of a record.
   */
  async recordAttendance(args: {
    groupId: string;
    sessionDate: string;
    participantId: string;
    status: AttendanceStatus | null;
  }) {
    const { data, error } = await this.supabase.rpc("record_attendance", {
      p_group_id: args.groupId,
      p_session_date: args.sessionDate,
      p_participant_id: args.participantId,
      // The empty string is how "unmarked" travels: generated RPC argument
      // types make every text parameter a non-null `string`, so there is no
      // SQL NULL to send from here. The function normalizes '' back to NULL —
      // the same convention the gedu-registration RPC uses.
      p_status: args.status ?? "",
    });

    if (error) throw error;
    return attendanceMarkResult.parse(data);
  }

  /**
   * Email one session's report to every family in the group, once.
   *
   * **The route is the whole operation, not a wrapper around one.** It claims
   * the send first — a single stamping UPDATE that two tabs cannot both win —
   * and only then resolves the recipients and fans the mail out, which is why
   * there is nothing to send from here but the session's identity. The session
   * is named by (group, date) like every other write on this surface, because
   * rows are lazily materialized and the pair is the row's real identity.
   *
   * **A refusal is the answer, never a swallowed failure.** This is a send the
   * gedu explicitly asked for, so the refusal travels out on an `ApiError`
   * carrying both the status and — on the two the gedu can act on — the
   * SQLSTATE the claim refused with. The surface above branches on that
   * **code**, never on the message: the route's message is raw English written
   * for a log, and a reworded `RAISE` must not be able to reclassify a refusal
   * or silently change what a gedu is told.
   */
  async emailSessionReport(args: {
    groupId: string;
    sessionDate: string;
  }): Promise<EmailSessionReportResponse> {
    const response = await fetch("/api/gedu/sessions/email-report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // `satisfies` rather than a bare literal: the route parses this body
      // through the same schema, so the compiler is what keeps the two ends in
      // step instead of a second parse on the way out.
      body: JSON.stringify({
        groupId: args.groupId,
        sessionDate: args.sessionDate,
      } satisfies EmailSessionReportBody),
    });

    if (!response.ok) {
      // One body, two things wanted out of it, and a stream that may only be
      // read once — so the message helper is handed the clone and the code is
      // read from the original.
      const code = await readErrorCode(response.clone());
      throw new ApiError(
        await readErrorMessage(response, "Failed to email the session report"),
        response.status,
        code,
      );
    }

    return parseJsonResponse(response, emailSessionReportResponse);
  }

  /**
   * Attach one already-normalized JPEG to a session's report.
   *
   * **The blob is the browser's output, not the gedu's file.** The pick has been
   * decoded, downscaled under the edge cap and re-encoded as JPEG before it gets
   * here — that pass keeps the body small and makes every stored image one
   * format. It also strips EXIF/GPS, but only on the honest path: the route
   * re-encodes again server-side, which is what makes the strip a mechanism and
   * what measures the dimensions the row stores. The pair travelling beside the
   * blob is therefore a plausibility claim the route refuses early on, not the
   * numbers anything is drawn from.
   *
   * A route rather than an RPC, because the object needs the service-role client
   * the browser must never hold. The route's own first act is still the guarded
   * insert on the caller's session, so the authorization has not moved.
   *
   * **A refusal is the answer.** Every way this can fail — in the browser or at
   * the route — carries one of the feature's stable codes, and the surface above
   * branches on that **code**, never on the message: the route's English is
   * written for a log, and a reworded refusal must not be able to change what a
   * gedu is told.
   */
  async addSessionImage(args: {
    groupId: string;
    sessionDate: string;
    width: number;
    height: number;
    /** The normalized JPEG. */
    file: Blob;
  }): Promise<AddSessionImageResponse> {
    const form = new FormData();
    form.append("groupId", args.groupId);
    form.append("sessionDate", args.sessionDate);
    form.append("width", String(args.width));
    form.append("height", String(args.height));
    // A filename is required for the part to arrive as a `File` rather than a
    // string field. It is never stored — the object is named by the row's id —
    // so it says what the bytes are and nothing more.
    form.append("file", args.file, "session-photo.jpg");

    const response = await fetch("/api/gedu/sessions/images", {
      method: "POST",
      // No Content-Type header: the browser has to set the multipart boundary.
      body: form,
    });

    if (!response.ok) {
      throw await readApiError(response, "Failed to add the photo");
    }

    return parseJsonResponse(response, addSessionImageResponse);
  }

  /**
   * Remove one photo from a session's report — the row, then the object.
   *
   * The id is the whole request: the RPC behind the route resolves the group
   * from the image's own session row, and that resolution is the authorization.
   * Any gedu assigned to the group may remove any photo on it, exactly as any of
   * them may edit the report.
   *
   * Answers nothing on success (the route is a 204): the id that was sent is the
   * id that is gone, and the feed refetch is what redraws the strip.
   */
  async deleteSessionImage(imageId: string): Promise<void> {
    const response = await fetch(
      `/api/gedu/sessions/images/${encodeURIComponent(imageId)}`,
      { method: "DELETE" },
    );

    if (!response.ok) {
      throw await readApiError(response, "Failed to remove the photo");
    }
  }

  /** Write the group's standing family-facing and gedu notes. */
  async setGroupNotes(args: {
    groupId: string;
    publicNote: string;
    geduNote: string;
  }) {
    const { data, error } = await this.supabase.rpc("set_group_notes", {
      p_group_id: args.groupId,
      p_public_note: args.publicNote,
      p_gedu_note: args.geduNote,
    });

    if (error) throw error;
    return groupNotesResult.parse(data);
  }

  /**
   * Write the site's shared notes — the two notes, and nothing else.
   *
   * Site notes belong to the *location*, so every product running at that
   * building reads and writes the same paragraphs — the workspace says so out
   * loud, and this method is the write path behind it.
   *
   * **The address is not one of them.** It is family-facing site detail owned
   * by the location record and edited by admins; a note-taking path that carried
   * it let a gedu save over an admin's correction with a stale cached copy
   * without either of them noticing, and let any assigned gedu rewrite it
   * outright. The RPC no longer accepts one, so there is nothing here to send.
   * The current address comes back in the result for display.
   */
  async setSiteNotes(args: {
    locationId: string;
    publicNote: string;
    geduNote: string;
  }) {
    const { data, error } = await this.supabase.rpc("set_site_notes", {
      p_location_id: args.locationId,
      p_public_note: args.publicNote,
      p_gedu_note: args.geduNote,
    });

    if (error) throw error;
    return siteNotesResult.parse(data);
  }
}

/**
 * The machine-readable code an error body may carry beside its message.
 *
 * A route attaches one where the caller has to *branch* rather than merely
 * report — here, the two refusals the claim raises share a `409` and mean
 * different things to the gedu. Absent on everything else, which is why this
 * answers `undefined` rather than throwing: a body with no code, a body that is
 * not JSON, and a route that never had one are the same answer.
 */
const errorCodeBody = z.object({ code: z.string() });

async function readErrorCode(response: Response): Promise<string | undefined> {
  const parsed = errorCodeBody.safeParse(
    await response.json().catch(() => null),
  );
  return parsed.success ? parsed.data.code : undefined;
}
