"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { GamerNoteDialog } from "@/components/member-flair";
import { ParticipantRosterRow } from "@/components/gedu/session-details/ParticipantRosterRow";
import type { ParticipantSessionRow } from "@/components/gedu/session-details/types";
import { useSetGamerGroupNote } from "@/services/member-flair";
import type { GroupParticipationDetail } from "@/types";

/**
 * Who is in the selected group, and what has been written about each of them —
 * the admin's home for a member note.
 *
 * **It belongs in the sessions panel rather than in the groups panel above it**,
 * for three reasons that all point the same way: this panel is already
 * group-scoped (a note is keyed to `(group, member)`, which is exactly the scope
 * its selector establishes), it already renders the gedu's own components rather
 * than an admin-styled copy of them, and a note about a person in a group belongs
 * beside the notes about the group. The groups panel is a drag board: a badge has
 * no bearing on a move, and a note is a *control*, which is the one kind of thing
 * that cannot sit inside a drag handle without competing with the gesture the
 * board exists for.
 *
 * **It is not attached to the register, either.** The register is per *session*
 * and a note is per (group, member); hanging one off an attendance row would
 * quietly assert that a note is about the session it was written during, which is
 * the opposite of what it is for — the note is the thing that survives from one
 * session to the next.
 *
 * **No newcomer badge**, by product decision: the badge is drawn on no admin
 * surface at all. `group_joined_at` still rides the snapshot that feeds this
 * card, for shape parity across the three roster readers rather than for
 * anything here to draw.
 *
 * **Rows are read-only apart from the note button.** The shared roster row is
 * handed no platform and no save handler, so it renders neither a game-username
 * editor nor the identity cell around it: this is not a second place to correct a
 * handle — the groups panel on the same page already shows every child's, and one
 * more editor for the same column is one more way for two surfaces to disagree
 * about who last wrote it.
 */
export function GroupMembersCard({
  groupId,
  members,
}: {
  groupId: string;
  /** The selected group's arm of the admin snapshot, in the order it arrived. */
  members: readonly GroupParticipationDetail[];
}) {
  const t = useTranslations("gedu.sessionDetails");

  const setGamerNote = useSetGamerGroupNote(groupId);
  /**
   * Whose note is open — an id, not the note itself, so the dialog always shows
   * what the snapshot currently holds rather than a copy taken when it opened.
   */
  const [noteFor, setNoteFor] = useState<string | null>(null);

  const rows = useMemo(() => members.map(rosterRowOf), [members]);
  const noteMember =
    noteFor === null
      ? null
      : (rows.find((row) => row.participant_id === noteFor) ?? null);

  return (
    <Card>
      <CardContent className="space-y-2 p-4 sm:p-5">
        <p className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          {t("participantsLabel")}
        </p>

        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("emptyRoster")}</p>
        ) : (
          <ul className="grid gap-1.5 sm:grid-cols-2 xl:grid-cols-3">
            {rows.map((row) => (
              <ParticipantRosterRow
                key={row.participant_id}
                participant={row}
                platform={null}
                hasNote={row.note !== null}
                onOpenNote={() => setNoteFor(row.participant_id)}
                // No `flairNow`: the newcomer badge is drawn on no admin
                // surface, and the row draws it only when it is handed a clock.
              />
            ))}
          </ul>
        )}

        {/* One dialog for the whole card. It stays mounted with the member it
            was opened for until the close lands, so nothing in it changes under
            the reader on the way out. */}
        <GamerNoteDialog
          open={noteFor !== null}
          onOpenChange={(open) => {
            if (!open) setNoteFor(null);
          }}
          name={noteMember?.first_name ?? ""}
          note={noteMember?.note ?? ""}
          lastEditedBy={noteMember?.note_updated_by_first_name ?? null}
          // The mutation's promise, straight through — the same RPC and the same
          // invalidations the gedu page and the voice room write through, which
          // is what makes an edit here show up there without a reload. The
          // dialog owns the committing flag that keeps Save disabled from the
          // click until the close.
          onSave={async (text) => {
            if (noteFor === null) return;
            await setGamerNote.mutateAsync({
              participantId: noteFor,
              note: text,
            });
          }}
        />
      </CardContent>
    </Card>
  );
}

/**
 * The admin snapshot's participation as the shared roster row wants it.
 *
 * The two shapes describe the same seat with different field names — the
 * snapshot prefixes the participant's own facts, the gedu roster does not — so
 * this is a rename and nothing more. Two fields are deliberately not carried:
 *
 * - **`parent_email` is null, because the snapshot has no such field.** It
 *   carries the parent's *name* instead, which the shared row has no slot for, so
 *   a child row here shows no contact line. That is honest — this card is about
 *   who is in the group and what is written about them, and the admin who wants
 *   an address has the participant record itself.
 * - **`participant_email` is carried**, and it is what makes an adult seat read
 *   as one: the shared row treats a non-null value as "this seat is held by an
 *   adult" and swaps their age and gender for the Parent badge. Both readers emit
 *   it on exactly the same rule, so the discriminator survives the rename.
 */
function rosterRowOf(
  participation: GroupParticipationDetail,
): ParticipantSessionRow {
  return {
    participant_id: participation.participant_id,
    first_name: participation.participant_first_name,
    date_of_birth: participation.participant_date_of_birth,
    minecraft_username: participation.participant_minecraft_username,
    minecraft_uuid: participation.participant_minecraft_uuid,
    roblox_username: participation.participant_roblox_username,
    roblox_user_id: participation.participant_roblox_user_id,
    gender: participation.participant_gender,
    parent_email: null,
    participant_email: participation.participant_email,
    group_joined_at: participation.group_joined_at,
    note: participation.note,
    note_updated_by_first_name: participation.note_updated_by_first_name,
  };
}
