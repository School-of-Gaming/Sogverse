import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { NowProvider } from "@/providers/now-provider";
import { TimezoneProvider } from "@/providers/timezone-provider";
import { FamilySessionFeed } from "@/components/family/product-page/FamilySessionFeed";
import type {
  FamilyPastSessionEntry,
  FamilySessionEntry,
} from "@/components/family/product-page/types";

/**
 * ============================================================================
 * What photos do to the shape of a family's session row.
 * ============================================================================
 *
 * The family feed has two row shapes, and photos moved the line between them:
 *
 *   - **A past session with nothing on it is a quiet dashed line.** No
 *     write-up, no photos, and no mark this reader is shown.
 *   - **Anything to show makes it a card** — and pictures of what the group
 *     built are something to show, so a photographed session with no prose is a
 *     card rather than an apologetic line saying nothing was written.
 *
 * The attribution chip did *not* move with it: it signs a write-up, so a
 * photos-only card is an unsigned one however plainly the row was stamped.
 *
 * The condition lives in two places by design — the card draws the row, the
 * feed sizes the rail marker beside it — so both are exercised here through the
 * feed, which is the only way a disagreement between them is visible.
 */

/** Monday 16 March 2026, a 90-minute Helsinki club, finished by `NOW`. */
const PAST_STARTS = new Date("2026-03-16T14:30:00.000Z");
const PAST_ENDS = new Date("2026-03-16T16:00:00.000Z");
const NOW = new Date("2026-03-17T09:00:00.000Z");

/** Demo art, so the URL helper needs no bucket env var to draw a thumbnail. */
const PHOTOS = [
  { id: "/preview-art/session-build.jpg", width: 1600, height: 900 },
  { id: "/preview-art/session-tower.jpg", width: 900, height: 1600 },
] as const;

/** A real generated UUID — the chip's id seeds an identicon. */
const SANNA = { id: "5c2a9c0e-7b1d-4f8a-9c3e-6a1f2b8d40c7", firstName: "Sanna" };

function pastEntry(
  fields: Partial<FamilyPastSessionEntry> = {},
): FamilyPastSessionEntry {
  return {
    kind: "past",
    id: "group-1:2026-03-16",
    startsAt: PAST_STARTS,
    endsAt: PAST_ENDS,
    report: null,
    images: [],
    attendance: null,
    lastEditedBy: null,
    ...fields,
  };
}

function renderFeed(
  entries: readonly FamilySessionEntry[],
  showAttendance = true,
) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <TimezoneProvider initialTimezone="Europe/Helsinki">
        <NowProvider initialNow={NOW}>
          <FamilySessionFeed
            entries={entries}
            sourceTimeZone="Europe/Helsinki"
            showAttendance={showAttendance}
            audience="customer"
          />
        </NowProvider>
      </TimezoneProvider>
    </NextIntlClientProvider>,
  );
}

const GALLERY = { name: messages.sessionFeed.photos.list };

afterEach(cleanup);

describe("photos on a family session card", () => {
  it("draws the shared gallery under the write-up", () => {
    const { getByRole } = renderFeed([
      pastEntry({
        report: "# Redstone week\n\nWe built item sorters.",
        images: PHOTOS,
        attendance: "present",
        lastEditedBy: SANNA,
      }),
    ]);
    // Both, uncropped and in stored order — the row is the shared gallery's,
    // not a second one built on this side of the privacy line.
    expect(getByRole("list", GALLERY).querySelectorAll("li")).toHaveLength(2);
  });

  it("makes a photographed session with no write-up a card, not a quiet line", () => {
    const { queryByText, getByRole } = renderFeed([
      pastEntry({ images: PHOTOS }),
    ]);
    // The dashed row's sentence is absent, which is what says this is a card.
    expect(queryByText(messages.familyProduct.noWriteUp)).toBeNull();
    expect(getByRole("list", GALLERY)).not.toBeNull();
  });

  it("still signs nothing on a photos-only card", () => {
    // The chip attributes a write-up. A stamped row with pictures and no prose
    // has nobody to name, however plainly it was touched.
    const { queryByText } = renderFeed([
      pastEntry({ images: PHOTOS, lastEditedBy: SANNA }),
    ]);
    expect(
      queryByText(messages.sessionFeed.lastEditedBy.replace("{name}", "Sanna")),
    ).toBeNull();
  });

  it("keeps the quiet line for a session with nothing on it at all", () => {
    const { queryByRole, queryByText } = renderFeed([pastEntry()]);
    expect(queryByText(messages.familyProduct.noWriteUp)).not.toBeNull();
    // No slot is held open for photos a session never had.
    expect(queryByRole("list", GALLERY)).toBeNull();
  });

  it("draws photos on the child's copy of the page too", () => {
    // Attendance is the parent-only signal; photos are content, so they are the
    // same on both copies — and on the gamer's copy a photographed session with
    // no write-up is still a card even though the mark beside it is withheld.
    const { getByRole, queryByText } = renderFeed(
      [pastEntry({ images: PHOTOS, attendance: "present" })],
      false,
    );
    expect(getByRole("list", GALLERY)).not.toBeNull();
    expect(queryByText(messages.familyProduct.noWriteUp)).toBeNull();
  });
});
