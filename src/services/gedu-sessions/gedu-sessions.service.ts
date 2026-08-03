import { SESSION_RECORDING_EPOCH } from "@/lib/constants";
import type { AppSupabaseClient } from "@/types";
import {
  attendanceMarkResult,
  geduAssignmentSummaries,
  geduGroupFeed,
  groupNotesResult,
  groupSessionNotesResult,
  siteNotesResult,
  type AttendanceStatus,
  type GeduAssignmentSummary,
  type GeduGroupFeed,
} from "./gedu-sessions.contracts";

/**
 * Reads and writes for the gedu session feed.
 *
 * Every method here is an `.rpc()` call: the two new tables grant nothing to
 * `authenticated`, so the SECURITY DEFINER functions are the only way in and
 * the authorization lives in one place rather than being re-derived per call
 * site. That also means there are no API routes to write for these — the
 * Minecraft edit is the single exception, and it lives in the Minecraft service
 * because it needs a server-side Mojang lookup before it can write.
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
   * Record — or clear — ONE child's mark for one session.
   *
   * One call per mark, never a whole map: two gedus marking different children
   * in the same session must not be able to overwrite each other, and a
   * whole-map write makes that unavoidable. `status: null` reverts to unmarked,
   * which deletes the row so "unmarked" stays the absence of a record.
   */
  async recordAttendance(args: {
    groupId: string;
    sessionDate: string;
    gamerId: string;
    status: AttendanceStatus | null;
  }) {
    const { data, error } = await this.supabase.rpc("record_attendance", {
      p_group_id: args.groupId,
      p_session_date: args.sessionDate,
      p_gamer_id: args.gamerId,
      // The empty string is how "unmarked" travels: generated RPC argument
      // types make every text parameter a non-null `string`, so there is no
      // SQL NULL to send from here. The function normalizes '' back to NULL —
      // the same convention the gedu-registration RPC uses.
      p_status: args.status ?? "",
    });

    if (error) throw error;
    return attendanceMarkResult.parse(data);
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
   * Write the venue's shared notes.
   *
   * Site notes belong to the *location*, so every product running at that
   * building reads and writes the same paragraphs — the workspace says so out
   * loud, and this method is the write path behind it.
   */
  async setSiteNotes(args: {
    locationId: string;
    address: string;
    publicNote: string;
    geduNote: string;
  }) {
    const { data, error } = await this.supabase.rpc("set_site_notes", {
      p_location_id: args.locationId,
      p_address: args.address,
      p_public_note: args.publicNote,
      p_gedu_note: args.geduNote,
    });

    if (error) throw error;
    return siteNotesResult.parse(data);
  }
}
