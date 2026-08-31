import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { NowProvider } from "@/providers/now-provider";
import { TimezoneProvider } from "@/providers/timezone-provider";
import { SessionFeed } from "@/components/gedu/session-feed/SessionFeed";
import type {
  SessionFeedEntry,
  SessionFeedGamer,
} from "@/components/gedu/session-feed/types";

/**
 * ============================================================================
 * Which cards carry photos, and which editors carry the block that manages
 * them.
 * ============================================================================
 *
 * Two rules, and both are about *where* rather than about how:
 *
 *   - **Photos are content**, so the shared gallery is drawn on the card's own
 *     body beside the report — the same component a family reads them through.
 *   - **The manage block belongs to the record editor alone.** A session that
 *     has not started has nothing to document, and a pre-epoch gap is a quiet
 *     dashed line with no stored row to hang a photo off; hanging an attachment
 *     strip on either would be offering a control that cannot mean anything
 *     yet.
 */

/** Real generated UUIDs: ids reaching an identicon must never be readable stubs. */
const ROSTER: readonly SessionFeedGamer[] = [
  { id: "0d5f9c2b-0a1c-4a2e-9d5c-1f0a5a7e2b31", firstName: "Aino" },
  { id: "9a2b1c4d-3e5f-4a6b-8c7d-2e1f0a3b4c5d", firstName: "Elias" },
];

/** Monday 16 March 2026, a 90-minute Helsinki club. */
const PAST_STARTS = new Date("2026-03-16T14:30:00.000Z");
const PAST_ENDS = new Date("2026-03-16T16:00:00.000Z");
/** The next Monday, untouched — the plan editor's case. */
const FUTURE_STARTS = new Date("2026-03-23T14:30:00.000Z");
const FUTURE_ENDS = new Date("2026-03-23T16:00:00.000Z");
/** The morning after the past session, and days before the future one. */
const NOW = new Date("2026-03-17T09:00:00.000Z");

const PAST_ID = "group-1:2026-03-16";
const FUTURE_ID = "group-1:2026-03-23";
const GAP_ID = "group-1:2025-09-01";

/** Demo art, so the URL helper needs no bucket env var to draw a thumbnail. */
const PHOTOS = [
  { id: "/preview-art/session-build.jpg", width: 1600, height: 900 },
  { id: "/preview-art/session-tower.jpg", width: 900, height: 1600 },
] as const;

function pastEntry(
  images: readonly { id: string; width: number; height: number }[],
): SessionFeedEntry {
  return {
    kind: "past",
    id: PAST_ID,
    startsAt: PAST_STARTS,
    endsAt: PAST_ENDS,
    report: "# Redstone week\n\nWe built item sorters.",
    staffNote: null,
    attendance: {},
    images,
    owed: true,
    reportEmailedAt: null,
    lastEditedBy: null,
  };
}

const futureEntry: SessionFeedEntry = {
  kind: "future",
  id: FUTURE_ID,
  startsAt: FUTURE_STARTS,
  endsAt: FUTURE_ENDS,
  report: null,
  staffNote: null,
  attendance: {},
  images: [],
  lastEditedBy: null,
};

/** A pre-epoch occurrence nobody recorded anything on — the dashed line. */
const gapEntry: SessionFeedEntry = {
  kind: "no_record",
  id: GAP_ID,
  startsAt: new Date("2025-09-01T13:30:00.000Z"),
  endsAt: new Date("2025-09-01T15:00:00.000Z"),
};

function renderFeed(
  entries: readonly SessionFeedEntry[],
  editingEntryId: string | null = null,
) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <TimezoneProvider initialTimezone="Europe/Helsinki">
        <NowProvider initialNow={NOW}>
          <SessionFeed
            entries={entries}
            now={NOW}
            roster={ROSTER}
            sourceTimeZone="Europe/Helsinki"
            editingEntryId={editingEntryId}
            onEditEntry={() => {}}
            onSaveEntry={() => {}}
            onSendReport={() =>
              Promise.resolve({ sent: 0, failed: 0, skipped: 0 })
            }
            onAddPhoto={() => Promise.resolve("")}
            onRemovePhoto={() => Promise.resolve()}
          />
        </NowProvider>
      </TimezoneProvider>
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("photos on a gedu session card", () => {
  it("draws the shared gallery on a past card, and nothing at all without photos", () => {
    const withPhotos = renderFeed([pastEntry(PHOTOS)]);
    const gallery = withPhotos.getByRole("list", {
      name: messages.sessionFeed.photos.list,
    });
    // Both, uncropped and in stored order — the row is the gallery's, not a
    // second one built here.
    expect(gallery.querySelectorAll("li")).toHaveLength(2);
    cleanup();

    // No slot is held open for photos a session may never have.
    const without = renderFeed([pastEntry([])]);
    expect(
      without.queryByRole("list", { name: messages.sessionFeed.photos.list }),
    ).toBeNull();
  });

  it("puts the manage block on the record editor", () => {
    const { queryByText } = renderFeed([pastEntry(PHOTOS)], PAST_ID);
    expect(queryByText(messages.gedu.sessionFeed.photosTitle)).not.toBeNull();
  });

  it("keeps the manage block off the plan editor and off a pre-epoch gap", () => {
    // A session that has not started documents nothing yet.
    const plan = renderFeed([futureEntry], FUTURE_ID);
    expect(
      plan.queryByText(messages.gedu.sessionFeed.photosTitle),
    ).toBeNull();
    cleanup();

    // And a gap is a quiet dashed row with no stored session behind it — it
    // opens the record editor like any past occurrence, but with nothing to
    // attach a photo to.
    const gap = renderFeed([gapEntry], GAP_ID);
    expect(gap.queryByText(messages.gedu.sessionFeed.photosTitle)).toBeNull();
  });
});
