import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { NowProvider } from "@/providers/now-provider";
import { TimezoneProvider } from "@/providers/timezone-provider";
import { SessionFeed } from "@/components/gedu/session-feed/SessionFeed";
import type {
  SessionEntryDraft,
  SessionFeedEntry,
  SessionFeedGamer,
  SessionRecordDraft,
} from "@/components/gedu/session-feed/types";

/**
 * ============================================================================
 * Who a past session's register is FOR, and — the part with teeth — what a save
 * of that session does to the marks it does not draw.
 * ============================================================================
 *
 * **The invariant this file exists to protect.** A member who joined the group
 * after a session ended is not drawn on it: no row in the editor, no chip on
 * the card, and no place in "3 of 5 marked". A mark that already exists for
 * such a member is nonetheless KEPT — the omission is a rendering decision and
 * reaches nothing that writes. `rosterScopedMarks` is what holds that line, and
 * it takes the FULL roster on the way into storage precisely so it can.
 *
 * **The breakage it is here to catch is a "simplification" one layer up.** The
 * unit test beside this one calls `rosterScopedMarks`, `editorStateFromEntry`
 * and `draftFromEditorState` directly, and it would go on passing if somebody
 * changed the CALL SITES instead — `SessionFeedItem` handing the editor a
 * pre-filtered roster, or `SessionRecordEditor` narrowing what it passes to
 * `draftFromEditorState`. Those two places are where the full roster and the
 * filtered one are visibly adjacent, which is exactly what makes collapsing
 * them into one look like tidying rather than like deleting data.
 *
 * And the data it deletes is the worst kind to lose silently: the false
 * absences gedus were forced to record before this rule existed, plus any
 * genuine mark made for a trial visit. There is no error and nothing on screen
 * — the mark simply stops being in the draft the next time somebody opens an
 * old session and presses Save. So this test mounts the real card, opens the
 * real editor, presses the real Save, and reads the draft that came out.
 *
 * **Do not delete this as redundant with the unit-level test.** The two cover
 * different failures: that one covers the function, this one covers everything
 * between the props and the function.
 */

const copy = messages.gedu.sessionFeed;

/** Real generated UUIDs: ids reaching an identicon must never be readable stubs. */
const FOUNDER_ID = "3f1c6d84-7b25-4e19-9a03-c5d7e2b81f46";
const LATE_ID = "b8e0a7d3-52c4-4f6a-8117-9d4e3c0b6a25";

/** Monday 16 March 2026, a 90-minute Helsinki club, long finished. */
const PAST_STARTS = new Date("2026-03-16T14:30:00.000Z");
const PAST_ENDS = new Date("2026-03-16T16:00:00.000Z");
/** The morning after it. */
const NOW = new Date("2026-03-17T09:00:00.000Z");

const PAST_ID = "group-1:2026-03-16";

/** In the group since long before the session — the one member it expected. */
const FOUNDER: SessionFeedGamer = {
  id: FOUNDER_ID,
  firstName: "Aino",
  inGroupSince: new Date("2020-01-01T00:00:00.000Z"),
};

/** Placed into the group the day AFTER the session ended. */
const LATE: SessionFeedGamer = {
  id: LATE_ID,
  firstName: "Linnea",
  inGroupSince: new Date("2026-03-17T08:00:00.000Z"),
};

/**
 * Both members carry a stored mark, and the late joiner's is an ABSENCE on
 * purpose: that is the shape of the marks this rule was introduced to stop
 * demanding, so it is the one a regression would delete most of.
 */
const STORED_MARKS = {
  [FOUNDER_ID]: "present",
  [LATE_ID]: "absent",
} as const;

function pastEntry(): SessionFeedEntry {
  return {
    kind: "past",
    id: PAST_ID,
    startsAt: PAST_STARTS,
    endsAt: PAST_ENDS,
    report: "# Redstone week\n\nWe built item sorters.",
    staffNote: null,
    attendance: { ...STORED_MARKS },
    images: [],
    owed: true,
    reportEmailedAt: null,
    lastEditedBy: null,
  };
}

interface FeedProps {
  roster: readonly SessionFeedGamer[];
  onSaveEntry?: (entryId: string, draft: SessionEntryDraft) => void;
}

/**
 * A save spy that keeps the drafts themselves rather than only the call count.
 *
 * The drafts come back typed, which is the point: reading them off a bare
 * `vi.fn()`'s `mock.calls` hands back `any`, and an unchecked assertion sitting
 * between the test and the object it is about is the last thing a test whose
 * whole subject is one field of that object should be carrying.
 */
function saveSpy() {
  const drafts: SessionEntryDraft[] = [];
  const onSaveEntry = vi.fn((_entryId: string, draft: SessionEntryDraft) => {
    drafts.push(draft);
  });
  return { drafts, onSaveEntry };
}

/**
 * The saved draft, narrowed to the write-up kind.
 *
 * A past card's Save can only produce one, but the callback's parameter is the
 * union both editors share, and a plan draft has no register at all — so the
 * narrowing is a real check rather than a formality, and it throws with the kind
 * it actually got so a wrong one fails by name instead of by `undefined`.
 */
function recordDraft(draft: SessionEntryDraft): SessionRecordDraft {
  if (draft.kind !== "past") {
    throw new Error(`expected a record draft, got a ${draft.kind} one`);
  }
  return draft;
}

/** The feed with the one piece of state its caller owns — which entry is open. */
function Feed({ roster, onSaveEntry = () => {} }: FeedProps) {
  const [editingEntryId, setEditingEntryId] = useState<string | null>(PAST_ID);
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      <TimezoneProvider initialTimezone="Europe/Helsinki">
        <NowProvider initialNow={NOW}>
          <SessionFeed
            entries={[pastEntry()]}
            now={NOW}
            roster={roster}
            sourceTimeZone="Europe/Helsinki"
            editingEntryId={editingEntryId}
            onEditEntry={setEditingEntryId}
            onSaveEntry={onSaveEntry}
            onSendReport={() =>
              Promise.resolve({ sent: 0, failed: 0, skipped: 0 })
            }
            onAddPhoto={() => Promise.resolve("")}
            onRemovePhoto={() => Promise.resolve()}
          />
        </NowProvider>
      </TimezoneProvider>
    </NextIntlClientProvider>
  );
}

function renderFeed(props: FeedProps) {
  return render(<Feed {...props} />);
}

/** The editor's per-child pill group, or null when the register drew no row. */
function rowFor(
  query: ReturnType<typeof renderFeed>,
  gamer: SessionFeedGamer,
): HTMLElement | null {
  return query.queryByRole("group", {
    name: copy.attendanceForGamer.replace("{name}", gamer.firstName),
  });
}

/** "{marked} of {total} marked", with the numbers filled in. */
function markedCount(marked: number, total: number): string {
  return copy.attendanceMarkedCount
    .replace("{marked}", String(marked))
    .replace("{total}", String(total));
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("a past session's register draws only the members it expected", () => {
  it("omits the late joiner's row and counts the session over the rest", () => {
    const view = renderFeed({ roster: [FOUNDER, LATE] });

    // One row, for the one member who was in the group that afternoon.
    expect(rowFor(view, FOUNDER)).not.toBeNull();
    expect(rowFor(view, LATE)).toBeNull();
    // And the headline is a statement about that same one person, from both
    // ends: the late joiner's stored absence is not in the numerator either, or
    // this would read "2 of 1".
    expect(view.queryByText(markedCount(1, 1))).not.toBeNull();
  });

  it("keeps the undrawn member's stored mark through a save", async () => {
    // THE ONE THAT MATTERS. If the omission ever leaks into the roster handed
    // to the editor's seed or its draft — at either call site, or inside
    // `rosterScopedMarks` itself — this absence is dropped from the record by
    // the mere act of opening the session and pressing Save, with nothing said
    // and nothing shown.
    const { drafts, onSaveEntry } = saveSpy();
    const view = renderFeed({ roster: [FOUNDER, LATE], onSaveEntry });

    // Nothing is touched first, deliberately: the loss must not need an edit to
    // provoke it, and a gedu fixing a typo in the report is the likeliest way
    // it would actually happen.
    fireEvent.click(view.getByRole("button", { name: copy.save }));

    await waitFor(() => expect(drafts).toHaveLength(1));
    expect(recordDraft(drafts[0]).attendance).toEqual(STORED_MARKS);
  });

  it("still drops a mark for somebody who has left the group", async () => {
    // The other half of the rule, and the reason it cannot simply be "keep
    // every stored mark". Being outside what a session was FOR is not the same
    // as being outside the group, and only the second is grounds for dropping a
    // mark — so the roster handed into storage has to be the CURRENT one, not
    // the whole of history and not the expected subset.
    const { drafts, onSaveEntry } = saveSpy();
    const view = renderFeed({ roster: [FOUNDER], onSaveEntry });

    fireEvent.click(view.getByRole("button", { name: copy.save }));

    await waitFor(() => expect(drafts).toHaveLength(1));
    expect(recordDraft(drafts[0]).attendance).toEqual({
      [FOUNDER_ID]: "present",
    });
  });
});

describe("a past session that expected nobody", () => {
  /**
   * Reachable on a group formed mid-term: every seat's join stamp postdates
   * occurrences the schedule still projects, so the register has nobody to ask
   * about and the editor has to say so rather than draw a heading over a hole.
   */
  it("replaces the register with one line, and keeps neither count nor hint", () => {
    const view = renderFeed({ roster: [LATE] });

    // The section is still named, so the editor's parts stay in the order and
    // under the words a gedu has learned everywhere else.
    expect(view.queryByText(copy.attendanceLegend)).not.toBeNull();
    // But the three things that promise a list are gone: the count, the
    // marking hint, and the rows themselves.
    expect(view.queryByText(markedCount(0, 0))).toBeNull();
    expect(view.queryByText(copy.attendanceRevertHint)).toBeNull();
    expect(rowFor(view, LATE)).toBeNull();
    // In their place, the reason there is nothing to mark.
    expect(view.queryByText(copy.attendanceNobodyExpected)).not.toBeNull();
  });

  it("saves that session's marks untouched all the same", async () => {
    // The empty register is a rendering state and nothing more: the stored map
    // still belongs to the group's current members and still comes back out of
    // the draft intact.
    const { drafts, onSaveEntry } = saveSpy();
    const view = renderFeed({ roster: [LATE], onSaveEntry });

    fireEvent.click(view.getByRole("button", { name: copy.save }));

    await waitFor(() => expect(drafts).toHaveLength(1));
    expect(recordDraft(drafts[0]).attendance).toEqual({
      [LATE_ID]: "absent",
    });
  });
});
