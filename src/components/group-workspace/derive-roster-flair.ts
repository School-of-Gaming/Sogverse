/**
 * A group feed's roster rows turned into the three sparse maps the workspace's
 * flair prop carries.
 *
 * **Both shells make this turn and must make it identically.** The gedu's
 * workspace and the admin's group details page read the same feed document and
 * hand the same body the same overlay; a second copy of the rules below is a
 * second place for a badge to appear on a camp, or for a null to be written into
 * a map where every consumer reads a missing key as the answer. So it lives here
 * beside `session-entry-saves.ts`, for the same reason that does: what happens
 * between a document and the body is not a per-surface decision.
 *
 * Two rules live here and nowhere below:
 *
 * - **The clubs-only gate is applied here.** On a camp or an event the newcomers
 *   map comes back **empty** while the notes go through untouched — a note is
 *   just as useful on a camp, and only the badge is gated. The roster rows know
 *   nothing about a product, so the answer has to be handed in.
 * - **Absence is how "none" is spelled.** A NULL from the RPC is *left out* of
 *   its map rather than written in as a null, because every consumer downstream
 *   — the row's `hasNote`, the dialog's seed, the badge's own window check —
 *   reads a missing key as the answer rather than as a gap.
 *
 * A plain function rather than logic inside either shell: both rules fail
 * *silently* when they fail, and neither needs a React tree to test.
 */

/**
 * The four fields this reads off a roster row. Structurally what the group
 * feed's rows already are, so neither shell adapts anything on the way in — and
 * nothing here depends on the rest of a seat (dates of birth, game identities,
 * contact addresses), which is the whole of what makes it testable.
 */
export interface RosterFlairSource {
  participant_id: string;
  /** When this seat entered THIS group, or `null` if that is not recorded. */
  group_joined_at: string | null;
  note: string | null;
  note_updated_by_first_name: string | null;
}

/** The three maps, keyed by `participant_id`, that the flair prop spreads. */
export interface RosterFlairMaps {
  newcomers: Record<string, string>;
  notes: Record<string, string>;
  noteEditors: Record<string, string>;
}

export function deriveRosterFlairMaps(
  roster: readonly RosterFlairSource[],
  drawsNewcomerBadge: boolean,
): RosterFlairMaps {
  const newcomers: Record<string, string> = {};
  const notes: Record<string, string> = {};
  const noteEditors: Record<string, string> = {};

  for (const member of roster) {
    if (drawsNewcomerBadge && member.group_joined_at !== null) {
      newcomers[member.participant_id] = member.group_joined_at;
    }
    if (member.note !== null) {
      notes[member.participant_id] = member.note;
    }
    if (member.note_updated_by_first_name !== null) {
      noteEditors[member.participant_id] = member.note_updated_by_first_name;
    }
  }

  return { newcomers, notes, noteEditors };
}
