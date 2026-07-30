"use client";

import { useState } from "react";
import {
  applyDraftToEntry,
  applyPlanDraftToEntry,
  isEditableEntry,
  isPlannableEntry,
  type SessionEntryDraft,
  type SessionFeedEntry,
} from "@/components/gedu/session-feed";
import { GeduProductPageBodyDraft } from "@/components/gedu/session-details/GeduProductPageBodyDraft";
import type { GroupNotesDraft } from "@/components/gedu/session-details/GroupNotesPanel";
import {
  buildGeduProductPageFixture,
  type GeduProductScenario,
} from "@/components/gedu/session-details/mock-product-page-fixtures";
import { useNow } from "@/providers";

/**
 * The gedu's product page redesigned around the session feed.
 *
 * Every editor is fully live against local state: marking each child present or
 * absent, typing both session notes, marking a session as not run, planning a
 * future session, and writing the group's standing notes. A flagged session
 * turning into a recorded one — and a bare future date turning into a plan — is
 * the single most important thing to feel before this gets wired to a database.
 * Nothing persists past a reload.
 *
 * The fixture is built once from the first `useNow()` value and then held in
 * state — rebuilding it on the 30-second tick would throw away whatever the
 * reviewer had just typed.
 */
export function GeduProductPageScene({
  scenario,
}: {
  scenario: GeduProductScenario;
}) {
  const now = useNow();
  const [fixture] = useState(() => buildGeduProductPageFixture(now, scenario));
  const [entries, setEntries] = useState<SessionFeedEntry[]>(fixture.entries);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [groupNotes, setGroupNotes] = useState(fixture.groupNotes);
  const [groupNotesEditing, setGroupNotesEditing] = useState(false);

  // Which editor produced the draft is settled by the entry's own kind, not by
  // the caller: a plan can only land on a future session and a write-up only on
  // a past one, so a mismatch leaves the entry exactly as it was rather than
  // corrupting it into a state the feed can't render.
  const handleSave = (entryId: string, draft: SessionEntryDraft) => {
    setEntries((prev) =>
      prev.map((entry) => {
        if (entry.id !== entryId) return entry;
        if (draft.kind === "plan") {
          return isPlannableEntry(entry)
            ? applyPlanDraftToEntry(entry, draft)
            : entry;
        }
        return isEditableEntry(entry) ? applyDraftToEntry(entry, draft) : entry;
      }),
    );
    setEditingEntryId(null);
  };

  const handleSaveGroupNotes = (draft: GroupNotesDraft) => {
    setGroupNotes({
      publicNote: draft.publicNote.length > 0 ? draft.publicNote : null,
      staffNote: draft.staffNote.length > 0 ? draft.staffNote : null,
    });
    setGroupNotesEditing(false);
  };

  return (
    <GeduProductPageBodyDraft
      data={fixture.data}
      entries={entries}
      feedRoster={fixture.feedRoster}
      sourceTimeZone={fixture.sourceTimeZone}
      materialUrl={fixture.materialUrl}
      groupPublicNote={groupNotes.publicNote}
      groupStaffNote={groupNotes.staffNote}
      groupNotesEditing={groupNotesEditing}
      onGroupNotesEditingChange={setGroupNotesEditing}
      onSaveGroupNotes={handleSaveGroupNotes}
      editingEntryId={editingEntryId}
      onEditEntry={setEditingEntryId}
      onSaveEntry={handleSave}
    />
  );
}
