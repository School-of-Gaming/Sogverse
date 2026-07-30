"use client";

import { useState } from "react";
import {
  applyDraftToEntry,
  isEditableEntry,
  type SessionFeedEntry,
  type SessionRecordDraft,
} from "@/components/gedu/session-feed";
import { GeduProductPageBodyDraft } from "@/components/gedu/session-details/GeduProductPageBodyDraft";
import {
  buildGeduProductPageFixture,
  type GeduProductScenario,
} from "@/components/gedu/session-details/mock-product-page-fixtures";
import { useNow } from "@/providers";

/**
 * The gedu's product page redesigned around the session feed.
 *
 * The inline editor is fully live against local state: ticking attendance,
 * typing both notes, marking a session as not run and saving all work, and a
 * gap turning into a written-up entry is the single most important thing to
 * feel before this gets wired to a database. Nothing persists past a reload.
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

  const handleSave = (entryId: string, draft: SessionRecordDraft) => {
    setEntries((prev) =>
      prev.map((entry) =>
        entry.id === entryId && isEditableEntry(entry)
          ? applyDraftToEntry(entry, draft)
          : entry,
      ),
    );
    setEditingEntryId(null);
  };

  return (
    <GeduProductPageBodyDraft
      data={fixture.data}
      entries={entries}
      feedRoster={fixture.feedRoster}
      sourceTimeZone={fixture.sourceTimeZone}
      editingEntryId={editingEntryId}
      onEditEntry={setEditingEntryId}
      onSaveEntry={handleSave}
    />
  );
}
