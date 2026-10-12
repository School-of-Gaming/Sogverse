import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { TimezoneProvider } from "@/providers/timezone-provider";
import { SessionFeedShell } from "@/components/session-feed";

/**
 * ============================================================================
 * A later run of nothing but holiday lines has no divider to hide behind.
 * ============================================================================
 *
 * Everything beyond the next session collapses behind the now-divider, and the
 * divider's count is the number of sessions that collapse hides. A holiday
 * break collapses with them but is not a session, so it is not counted. When
 * the run beyond the next session holds only breaks, the count would be zero —
 * a toggle promising "0 more upcoming sessions" that hides only breaks — so the
 * shell draws those lines in place and renders no divider at all.
 *
 * The shell is rendered directly with the smallest entries it places: an id, a
 * kind, a start and which side of the present a break sits on. Each entry draws
 * its own id as text, so presence on screen is a text query.
 */

interface ShellEntry {
  id: string;
  kind: "future" | "past" | "holiday";
  startsAt: Date;
  upcoming?: boolean;
}

function future(id: string, startsAt: string): ShellEntry {
  return { id, kind: "future", startsAt: new Date(startsAt) };
}

function holiday(id: string, startsAt: string): ShellEntry {
  return { id, kind: "holiday", startsAt: new Date(startsAt), upcoming: true };
}

function past(id: string, startsAt: string): ShellEntry {
  return { id, kind: "past", startsAt: new Date(startsAt) };
}

function renderShell(entries: readonly ShellEntry[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <TimezoneProvider initialTimezone="Europe/Helsinki">
        <SessionFeedShell
          entries={entries}
          markerClass={() => ""}
          renderItem={(entry) => <p>{entry.id}</p>}
        />
      </TimezoneProvider>
    </NextIntlClientProvider>,
  );
}

/** The divider's own label, for a given number of hidden sessions. */
function dividerLabel(count: number): string {
  return count === 1 ? "1 more upcoming session" : `${count} more upcoming sessions`;
}

beforeEach(() => {
  // The shell reveals older history through an IntersectionObserver sentinel.
  // jsdom has none, and these feeds have one past entry, so a stub that never
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
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("SessionFeedShell — holiday lines beyond the next session", () => {
  it("draws a holiday-only later run in place, with no divider", () => {
    const { getByText, queryByRole } = renderShell([
      holiday("winter-break", "2026-12-21T00:00:00.000Z"),
      holiday("autumn-break", "2026-10-19T00:00:00.000Z"),
      future("next-session", "2026-10-14T13:00:00.000Z"),
      past("last-session", "2026-10-07T13:00:00.000Z"),
    ]);

    // Both breaks are on screen without anything being opened...
    getByText("winter-break");
    getByText("autumn-break");
    getByText("next-session");
    getByText("last-session");
    // ...and there is no toggle at all, zero-count or otherwise.
    expect(queryByRole("button")).toBeNull();
  });

  it("collapses a later run holding a session, counting the sessions only", () => {
    const { getByRole, getByText, queryByText } = renderShell([
      future("far-session", "2027-01-13T13:00:00.000Z"),
      holiday("winter-break", "2026-12-21T00:00:00.000Z"),
      future("later-session", "2026-11-04T13:00:00.000Z"),
      future("next-session", "2026-10-14T13:00:00.000Z"),
      past("last-session", "2026-10-07T13:00:00.000Z"),
    ]);

    // Two sessions are hidden; the break between them is not counted.
    const toggle = getByRole("button", { name: dividerLabel(2) });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");

    // Everything beyond the next session is behind the divider, the break too.
    expect(queryByText("far-session")).toBeNull();
    expect(queryByText("winter-break")).toBeNull();
    expect(queryByText("later-session")).toBeNull();
    getByText("next-session");
    getByText("last-session");

    fireEvent.click(toggle);

    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    getByText("far-session");
    getByText("winter-break");
    getByText("later-session");
  });
});
