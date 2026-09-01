import { showsNewcomerBadge } from "@/components/member-flair";
import type { GamerCreation, GroupStaffOverlay } from "@/types";
import type { VoiceMemberFlair } from "./VoiceMemberFlairProvider";

/**
 * The staff overlay document turned into the voice room's flair context value.
 *
 * **The two shapes are deliberately different, and this is where one becomes the
 * other.** `get_group_staff_overlay` answers with a product type and one record
 * per active member; the context wants one clock, the seat-holder set, and four
 * sparse maps. Neither shape moves to meet the other, and nothing is put into
 * the context that the document does not already imply.
 *
 * It is a plain function rather than logic inside the page because it is the one
 * piece of the voice room's flair path with rules of its own — the clubs-only
 * gate, the absence convention, the seat-holder set — and every one of them is
 * silently wrong in a way no rendering test would catch. A pure function is
 * testable without a Daily call, a token or a React tree.
 *
 * Three rules live here and nowhere else:
 *
 * - **The seat-holder set is the document's own keys.** The RPC emits an entry
 *   for every active participation — note or no note, stamp or no stamp — so
 *   those keys already name exactly the people a note may be written about. A
 *   second ids array beside the map would be a second list of the same people to
 *   keep true.
 * - **The clubs-only gate is applied here and can live nowhere else.** The
 *   participant list and its rows know nothing about a product, which is the
 *   whole reason `product_type` travels on this document. On a camp or an event
 *   the newcomers map goes over empty; the notes are ungated and go over whole.
 *   A null product type (an unknown group answered to an admin) is "no badge"
 *   for the same reason.
 * - **Absence is how "none" is spelled.** A NULL from the RPC is *left out* of
 *   its map, never written in as a null — every consumer downstream reads a
 *   missing key as the answer. The creations list extends the convention rather
 *   than bending it: the RPC emits `[]` where a note is null, so an empty list
 *   is left out for the same reason, and the map's keys are "who has one".
 *
 * The room draws **no owed marker**, and cannot: whether creations are owed is a
 * fact about the product's flag and the run's final session, and this document
 * carries neither. That signal belongs to the workspace, where the schedule is;
 * what the room offers is the same dialog, so a Gedu can supply a creation
 * mid-session.
 *
 * A `null` or absent overlay yields `null`: no provider value, and the room
 * renders exactly as it did before any of this existed. That is what a family's
 * room gets, and what a staff room gets while the read is still in flight.
 */
export function deriveVoiceMemberFlair(
  overlay: GroupStaffOverlay | null | undefined,
  now: Date,
  onOpenFlair: (userId: string, name: string) => void,
): VoiceMemberFlair | null {
  if (overlay == null) return null;

  const drawsNewcomerBadge =
    overlay.product_type !== null && showsNewcomerBadge(overlay.product_type);
  const newcomers: Record<string, string> = {};
  const notes: Record<string, string> = {};
  const noteEditors: Record<string, string> = {};
  const creations: Record<string, readonly GamerCreation[]> = {};

  for (const [userId, member] of Object.entries(overlay.members)) {
    if (drawsNewcomerBadge && member.group_joined_at !== null) {
      newcomers[userId] = member.group_joined_at;
    }
    if (member.note !== null) notes[userId] = member.note;
    if (member.note_updated_by_first_name !== null) {
      noteEditors[userId] = member.note_updated_by_first_name;
    }
    if (member.creations.length > 0) creations[userId] = member.creations;
  }

  return {
    now,
    members: new Set(Object.keys(overlay.members)),
    newcomers,
    notes,
    noteEditors,
    creations,
    onOpenFlair,
  };
}
