import type { AppSupabaseClient, Json } from "@/types";
import {
  gamerGroupCreationsResult,
  gamerGroupNoteResult,
  groupStaffOverlay,
  setGamerGroupCreationsBody,
  traineeGroupOverlay,
  type GamerCreation,
  type GamerGroupCreationsResult,
  type GamerGroupNoteResult,
  type GroupStaffOverlay,
  type TraineeGroupOverlay,
} from "./member-flair.contracts";

/**
 * The per-member marks that have no other home — the group staff overlay, the
 * (group, member) note write, and the (group, member) creations write.
 *
 * This service owns only those. The note, badge and creations *reads* that ride
 * the existing roster documents stay with the services that already own those
 * documents (`assignments`, `gedu-sessions`, `groups`, `family-product-feed`):
 * they are extra fields on a document those services already fetch, and moving
 * them here would be a second system. What lives here is what none of them owns
 * — and what the voice room, which owns no roster document at all, needs a home
 * for that is not named after somebody else's surface.
 *
 * Every method is a plain `.rpc()` call on the injected client. **No `fetch`, no
 * API route**: no RPC here needs a server-side secret — each write is authorized
 * by `auth.uid()` inside a `SECURITY DEFINER` function, which is the reverse of
 * needing the service role — so the browser client is enough and the route
 * posture registry is untouched.
 *
 * All three RPCs raise `42501` for a caller who is neither an admin nor a gedu
 * on the group's product. The read surfaces that as `null` — a refused read is a
 * clean "not yours" state, and a family or gamer client never asks in the first
 * place. The writes let it throw, because a write that was refused is something
 * the editor has to tell the gedu about.
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
   * The trainee's redacted twin of {@link getGroupStaffOverlay}, for the group
   * they hold a trainee seat on: join stamps, and whether each member has a
   * note — never its text. A refusal is `null`, as on the staff read.
   */
  async getTraineeGroupOverlay(
    groupId: string,
  ): Promise<TraineeGroupOverlay | null> {
    const { data, error } = await this.supabase.rpc("get_trainee_group_overlay", {
      p_group_id: groupId,
    });

    if (error) {
      if (error.code === "42501") return null;
      throw error;
    }

    return traineeGroupOverlay.parse(data);
  }

  /**
   * Write, replace or clear the note about one member of one group.
   *
   * Upsert semantics, and a **trimmed-empty note deletes the row** — clearing a
   * note is how a gedu retires guidance that no longer applies, and the absence
   * of a row is what "no note" means on every surface. The trimming happens
   * server-side, so a caller may hand over whatever is in the box.
   *
   * A refusal is thrown as it came. Its message is raw database English (a
   * `42501` reads `Forbidden`, a CHECK reads a constraint name), so the dialog
   * every surface mounts logs it and shows its own sentence instead.
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

    if (error) throw error;

    return gamerGroupNoteResult.parse(data);
  }

  /**
   * Replace the whole list of creations for one member of one group.
   *
   * **Replace-the-list, not per-row edits.** Nothing reads or references a
   * single creation — the dialog holds the list and hands back what it now is —
   * and an **empty list deletes the row**, because absence of a row is what "no
   * creations" means on every surface. The RPC answers with the same keys
   * either way, so a caller merges one shape.
   *
   * The list is validated here before it goes out: the caps in the contracts
   * file are the table's CHECK, so a malformed list is refused without a round
   * trip and the constraint stays the loud backstop it is designed to be rather
   * than a routine error path.
   *
   * **Idempotent**, which is what makes the two-write dialog safe to retry: the
   * same list written twice is the same row, so a save that got one half in and
   * lost the other can simply be repeated.
   *
   * A refusal is thrown as it came, as the note write's is.
   */
  async setGamerGroupCreations({
    groupId,
    participantId,
    creations,
  }: {
    groupId: string;
    participantId: string;
    creations: readonly GamerCreation[];
  }): Promise<GamerGroupCreationsResult> {
    const body = setGamerGroupCreationsBody.parse({
      groupId,
      participantId,
      creations,
    });

    const { data, error } = await this.supabase.rpc(
      "set_gamer_group_creations",
      {
        p_group_id: body.groupId,
        p_participant_id: body.participantId,
        // The argument is `jsonb`, so the generated signature takes `Json`. The
        // parse above is what makes that widening honest — the value reaching
        // here has already been held to the table's own shape.
        p_creations: body.creations satisfies Json,
      },
    );

    if (error) throw error;

    return gamerGroupCreationsResult.parse(data);
  }
}
