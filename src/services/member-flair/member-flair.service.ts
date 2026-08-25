import type { AppSupabaseClient } from "@/types";
import {
  gamerGroupNoteResult,
  groupStaffOverlay,
  type GamerGroupNoteResult,
  type GroupStaffOverlay,
} from "./member-flair.contracts";

/**
 * The SQLSTATEs a note write can come back with whose `message` is a raw
 * database string, written for a log and never for a Gedu.
 *
 * `42501` is the RPC's own refusal and reads as the literal word `Forbidden`;
 * `23514` is the length CHECK and reads as a constraint name. Both are real
 * paths — an admin can move a member out of a group while a Gedu has a stale
 * roster open, and the Gedu's next save is refused — and both would otherwise
 * be printed, untranslated, into a dialog in a Finnish or French session.
 */
const OPAQUE_NOTE_WRITE_SQLSTATES = new Set(["42501", "23514"]);

/**
 * A write refusal the surface has nothing true to say about.
 *
 * It carries **no message on purpose**. The only alternatives were showing the
 * database's own English words or inventing a locale string per SQLSTATE for a
 * distinction a Gedu cannot act on differently — the roster moved under them,
 * and reopening the page is the answer either way. So the failure arrives with
 * nothing to print, and the dialog falls back to the localized copy it already
 * has; an error that *does* carry a message still shows what it said, because
 * the mapping is a named list rather than a blanket. The original rides on
 * `cause`, so a console and any future logging keep the SQLSTATE.
 *
 * **This is deliberate rather than accidental, which is the point.** Without
 * `.throwOnError()` the client hands back the parsed error *body* — a plain
 * object that is not an `Error` instance, however `PostgrestError` types it —
 * so today a raw SQL message happens to miss the dialog's `err.message` branch
 * anyway. One `.throwOnError()`, or one library release that always constructs
 * the class, and `Forbidden` would be on a Gedu's screen in a Finnish session.
 */
class UnexplainedNoteWriteError extends Error {
  constructor(cause: unknown) {
    super("", { cause });
    this.name = "UnexplainedNoteWriteError";
  }
}

/**
 * The two staff-only marks that are genuinely **new** — the group staff overlay
 * and the (group, member) note write.
 *
 * This service owns only those two. The badge and note *reads* that ride the
 * three existing roster documents stay with the services that already own those
 * documents (`assignments`, `gedu-sessions`, `groups`): they are extra fields on
 * a document those services already fetch, and moving them here would be a
 * second system. What lives here is what none of them owns — and what the voice
 * room, which owns no roster document at all, needs a home for that is not named
 * after somebody else's surface.
 *
 * Both methods are plain `.rpc()` calls on the injected client. **No `fetch`, no
 * API route**: neither RPC needs a server-side secret — the note write is
 * authorized by `auth.uid()` inside a `SECURITY DEFINER` function, which is the
 * reverse of needing the service role — so the browser client is enough and the
 * route posture registry is untouched.
 *
 * Both RPCs raise `42501` for a caller who is neither an admin nor a gedu on the
 * group's product. The read surfaces that as `null` — a refused read is a clean
 * "not yours" state, and a family or gamer client never asks in the first place.
 * The write lets it throw, because a write that was refused is something the
 * editor has to tell the gedu about.
 */
export class MemberFlairService {
  constructor(private supabase: AppSupabaseClient) {}

  /**
   * One group's staff-only marks: the product type, and one entry per active
   * member carrying their join stamp, their note and its last editor.
   *
   * The voice room's whole route to both marks. Staff-only data must never ride
   * the Daily token or `user_name` — that channel is broadcast to every peer in
   * the room, children included — so the room asks for this separately, with the
   * staff member's own session, once per room and never once per row.
   */
  async getGroupStaffOverlay(
    groupId: string,
  ): Promise<GroupStaffOverlay | null> {
    const { data, error } = await this.supabase.rpc("get_group_staff_overlay", {
      p_group_id: groupId,
    });

    if (error) {
      if (error.code === "42501") return null;
      throw error;
    }

    return groupStaffOverlay.parse(data);
  }

  /**
   * Write, replace or clear the note about one member of one group.
   *
   * Upsert semantics, and a **trimmed-empty note deletes the row** — clearing a
   * note is how a gedu retires guidance that no longer applies, and the absence
   * of a row is what "no note" means on every surface. The trimming happens
   * server-side, so a caller may hand over whatever is in the box.
   *
   * **A refusal is mapped here, once, for all three surfaces.** The gedu page,
   * the voice room and the admin sessions panel all hand the rejection straight
   * to the same dialog, so this is the single point where a raw SQL message is
   * stopped from reaching a reader — see {@link UnexplainedNoteWriteError}.
   */
  async setGamerGroupNote({
    groupId,
    participantId,
    note,
  }: {
    groupId: string;
    participantId: string;
    note: string;
  }): Promise<GamerGroupNoteResult> {
    const { data, error } = await this.supabase.rpc("set_gamer_group_note", {
      p_group_id: groupId,
      p_participant_id: participantId,
      p_note: note,
    });

    if (error) {
      if (OPAQUE_NOTE_WRITE_SQLSTATES.has(error.code)) {
        throw new UnexplainedNoteWriteError(error);
      }
      throw error;
    }

    return gamerGroupNoteResult.parse(data);
  }
}
