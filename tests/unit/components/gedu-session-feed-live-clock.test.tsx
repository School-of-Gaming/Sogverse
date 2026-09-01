import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { NowProvider } from "@/providers/now-provider";
import { TimezoneProvider } from "@/providers/timezone-provider";
import { SessionFeed } from "@/components/gedu/session-feed/SessionFeed";
import type {
  AttendanceMarks,
  SessionFeedEntry,
  SessionFeedGamer,
} from "@/components/gedu/session-feed/types";

/**
 * ============================================================================
 * The feed reads ONE clock, and it is the caller's — not the ticking provider.
 * ============================================================================
 *
 * The workspace freezes the instant its entries are built from whenever an
 * editor is open, so that nothing can be reclassified under a gedu who is
 * typing into it. That freeze is only worth anything if *everything* the feed
 * derives from the clock reads the frozen value too.
 *
 * It did not, and this is the failure that followed. `SessionFeed` called
 * `useNow()` itself, so the entries were frozen while liveness went on ticking.
 * Which editor a card opens is decided by liveness — a live session takes the
 * record editor, because the register is open from its start — so the moment
 * the 30-second tick carried the clock past the session's `endsAt`:
 *
 *   - the entry stayed `future` (frozen, correctly),
 *   - `live` flipped to false (ticking, around the freeze),
 *   - the record editor unmounted and the notes-only editor took its place,
 *   - and the register the gedu had been marking went with it. No error, no
 *     warning, nothing to retry.
 *
 * On the 8:00–23:00 camp day that motivated the end-based kind rule, that lands
 * at 23:00 on a gedu writing up the day they have just run.
 *
 * The fix is structural: `SessionFeed` takes `now` as a required prop and the
 * page hands it the same frozen instant the entries came from. These tests fail
 * if anyone puts a `useNow()` back inside the feed or the item, because the
 * provider's clock is deliberately moved past the session's end while the props
 * stay put — the two are only distinguishable when they disagree.
 */

/** Real generated UUIDs: ids reaching an identicon must never be readable stubs. */
const GAMERS: readonly SessionFeedGamer[] = [
  { id: "26586f95-d91e-4cf3-ae9d-edf3e51d9e64", firstName: "Aino" },
  { id: "c6f10c3a-972d-41bc-9413-c7f674afea3d", firstName: "Elias" },
  { id: "cec00f11-094d-4b75-a5a4-828ca620d7cd", firstName: "Venla" },
];

/** A camp day running 08:00–23:00 Helsinki on Monday 16 March 2026. */
const STARTS_AT = new Date("2026-03-16T06:00:00.000Z");
const ENDS_AT = new Date("2026-03-16T21:00:00.000Z");
/** 14:00 Helsinki — six hours in, nine to go. The session is live. */
const MID_SESSION = new Date("2026-03-16T12:00:00.000Z");
/** Half a minute after the camp day ended — one provider tick past the end. */
const AFTER_END = new Date("2026-03-16T21:00:30.000Z");

const ENTRY_ID = "group-1:2026-03-16";

function liveEntry(attendance: AttendanceMarks = {}): SessionFeedEntry {
  return {
    kind: "future",
    id: ENTRY_ID,
    startsAt: STARTS_AT,
    endsAt: ENDS_AT,
    report: null,
    staffNote: null,
    attendance,
    // Unphotographed: this suite is about the clock, and the photo block has
    // nothing to say about which editor a live session opens.
    images: [],
    // Unsigned: this suite is about the clock, and the attribution chip needs a
    // written report before it renders anything at all.
    lastEditedBy: null,
  };
}

/**
 * Render the feed with the clock split in two, exactly as the live page has it:
 * `providerNow` seeds the ticking `NowProvider`, `feedNow` is the frozen instant
 * the entries were built from and is what the feed is told to read.
 */
function renderFeed({
  entries,
  feedNow,
  providerNow = feedNow,
  editingEntryId = null,
}: {
  entries: readonly SessionFeedEntry[];
  feedNow: Date;
  providerNow?: Date;
  editingEntryId?: string | null;
}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <TimezoneProvider initialTimezone="Europe/Helsinki">
        <NowProvider initialNow={providerNow}>
          <SessionFeed
            entries={entries}
            now={feedNow}
            roster={GAMERS}
            sourceTimeZone="Europe/Helsinki"
            editingEntryId={editingEntryId}
            onEditEntry={() => {}}
            onSaveEntry={() => {}}
            // Never reached: this suite is about which editor a live session
            // opens, and only a past session with a written report offers a
            // send at all.
            onSendReport={() =>
              Promise.resolve({ sent: 0, failed: 0, skipped: 0 })
            }
            // Never reached either: no photo is picked or removed anywhere in
            // this suite.
            onAddPhoto={() => Promise.resolve("")}
            onRemovePhoto={() => Promise.resolve()}
          />
        </NowProvider>
      </TimezoneProvider>
    </NextIntlClientProvider>,
  );
}

/** Push the provider's clock past the session's end, one 30s tick. */
function tickProviderPastEnd() {
  vi.setSystemTime(AFTER_END);
  act(() => {
    vi.advanceTimersByTime(30_000);
  });
}

beforeEach(() => {
  // The shell reveals older history through an IntersectionObserver sentinel.
  // jsdom has none, and the feeds here are one entry long, so a stub that never
  // fires is the whole of what these tests need from it.
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    },
  );
  vi.useFakeTimers();
  vi.setSystemTime(MID_SESSION);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("SessionFeed — the frozen clock survives the provider's tick", () => {
  it("keeps the record editor and its unsaved marks when the session ends mid-edit", () => {
    const { getByText, queryByText, getByRole } = renderFeed({
      entries: [liveEntry()],
      feedNow: MID_SESSION,
      editingEntryId: ENTRY_ID,
    });

    // The record editor is what a live session opens: the register is open from
    // the session's start, which is the whole roll-call case.
    getByText(messages.gedu.sessionFeed.attendanceLegend);

    // The gedu marks one child and has not saved. This is the draft that used
    // to be destroyed — a register half-taken, held only in the editor.
    const ainoRow = getByRole("group", { name: /Aino/ });
    const present = within(ainoRow).getAllByRole("button")[0];
    fireEvent.click(present);
    expect(present.getAttribute("aria-pressed")).toBe("true");

    // The camp day ends while the editor is open. The provider ticks past it;
    // the props do not move, because the page froze them when the editor opened.
    tickProviderPastEnd();

    // Still the record editor, not the notes-only one...
    getByText(messages.gedu.sessionFeed.attendanceLegend);
    // ...and the mark the gedu made is still there, unsaved and intact.
    const ainoAfter = getByRole("group", { name: /Aino/ });
    expect(
      within(ainoAfter).getAllByRole("button")[0].getAttribute("aria-pressed"),
    ).toBe("true");
    // The card never quietly became a finished session under them either.
    expect(queryByText(messages.gedu.sessionFeed.needsAttentionLabel)).toBeNull();
  });

  it("keeps the live tag on the frozen instant rather than the ticking one", () => {
    const { getByText } = renderFeed({
      entries: [liveEntry()],
      feedNow: MID_SESSION,
    });

    getByText(messages.sessionBadge.live);
    tickProviderPastEnd();
    // The badge follows the entries it is rendered beside. Both are frozen, so
    // both still say the session is running — a feed that disagreed with its own
    // entries about the present would be the same bug wearing a different face.
    getByText(messages.sessionBadge.live);
  });
});

/**
 * ============================================================================
 * A live session's saved register is visible on its own card.
 * ============================================================================
 *
 * A live entry stays `future` after a save — deliberately, so taking the
 * register mid-session does not drop the card below the divider and reorder the
 * feed under the gedu working in it. That left the marks with nowhere to show:
 * the future branch of the card body rendered no attendance line at all, on the
 * old reasoning that "nobody has been anywhere yet". True of a session that has
 * not started; false of the one being taught right now.
 *
 * So a gedu could mark six of eight, save, and look at a card showing no trace
 * of it.
 */
describe("SessionFeedItem — the live card shows its register", () => {
  /*
   * Queried by ROLE AND NAME, not by text. The record editor is
   * mounted-but-collapsed behind every card (that is how it animates open),
   * and its legend renders the visible word "Attendance" — so a bare text
   * query matches the shut editor and proves nothing about the card. The
   * card's chips are the one *list* carrying that accessible name. (They used
   * to sit behind an "n of m marked" disclosure button; the owner removed the
   * summary line and the collapse, so the chips render directly.)
   */
  it("renders the attendance chips on a live session that has marks", () => {
    const { getByRole } = renderFeed({
      entries: [liveEntry({ [GAMERS[0].id]: "present" })],
      feedNow: MID_SESSION,
    });

    // The same chip list a past entry shows, on the card the gedu is looking
    // at for the whole session — with the marked child in it.
    const chips = getByRole("list", {
      name: messages.gedu.sessionFeed.attendanceLegend,
    });
    within(chips).getByText(GAMERS[0].firstName);
  });

  it("renders no attendance chips on a live session nobody has marked yet", () => {
    const { queryByRole } = renderFeed({
      entries: [liveEntry()],
      feedNow: MID_SESSION,
    });

    // Gated on having marks, not on being live: a chip row that appeared the
    // instant the session opened would be scolding a gedu for a register they
    // have not had a chance to touch.
    expect(
      queryByRole("list", {
        name: messages.gedu.sessionFeed.attendanceLegend,
      }),
    ).toBeNull();
  });

  it("renders no attendance line on a session that has not started", () => {
    const notYet: SessionFeedEntry = {
      kind: "future",
      id: "group-1:2026-03-23",
      startsAt: new Date("2026-03-23T06:00:00.000Z"),
      endsAt: new Date("2026-03-23T21:00:00.000Z"),
      report: null,
      staffNote: null,
      attendance: {},
      images: [],
      lastEditedBy: null,
    };

    const { queryByRole, getByText } = renderFeed({
      entries: [notYet],
      feedNow: MID_SESSION,
    });

    expect(
      queryByRole("list", {
        name: messages.gedu.sessionFeed.attendanceLegend,
      }),
    ).toBeNull();
    // It is a plain upcoming session, and says so.
    getByText(messages.gedu.sessionFeed.noNotesYet);
  });
});
