import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { NowProvider } from "@/providers/now-provider";
import { TimezoneProvider } from "@/providers/timezone-provider";
import { SessionFeed } from "@/components/gedu/session-feed/SessionFeed";
import { SessionReportSendError } from "@/components/gedu/session-feed/send-report";
import type { SessionReportSendResult } from "@/components/gedu/session-feed/send-report";
import type {
  PastSessionFeedEntry,
  SessionFeedGamer,
} from "@/components/gedu/session-feed/types";

/**
 * ============================================================================
 * Emailing a report to the families, from the card that offers it.
 * ============================================================================
 *
 * What is pinned here is everything that happens *between* renders, which is
 * the part the pure derivations next door cannot see:
 *
 *   - the button is disabled from the confirmation onward and **stays**
 *     disabled while the send is in the air, so a fast second click cannot mail
 *     every family twice;
 *   - it is still disabled after the send resolves, because what ends that
 *     state is the refetched row swapping the button for the sent line — a
 *     button that blinked back to life in between is the double-send the
 *     committing pattern exists to prevent;
 *   - a refusal hands it back, with the line naming which refusal it was.
 *
 * The harness below stands in for the page: it holds the entry, and on a send
 * that lands it stamps the row exactly as the invalidated query would a moment
 * later. That is what makes the button → sent line transition observable
 * without a query client.
 */

/** Real generated UUIDs: ids that reach an identicon are never readable stubs. */
const ROSTER: readonly SessionFeedGamer[] = [
  { id: "d9d0f5a8-6f97-4b0a-9a51-01d5a25a0f1e", firstName: "Aino", hasContact: true },
  { id: "b1a3c6e4-7c1a-4a4e-9f2b-6c9d5f0f8a21", firstName: "Elias", hasContact: true },
  // Neither a linked parent nor their own customer: a seat nobody can be
  // mailed, so the dialog promises two mails on a roster of three.
  { id: "5f7b2c19-3f24-4e63-8d6a-2b0c7a9e4d55", firstName: "Venla", hasContact: false },
];

const STARTS_AT = new Date("2026-03-16T14:30:00.000Z");
const ENDS_AT = new Date("2026-03-16T16:00:00.000Z");
/** The morning after, so the entry is past and owed. */
const NOW = new Date("2026-03-17T09:00:00.000Z");
/** 18:30 UTC — 20:30 in Helsinki, which is the zone this viewer is in. */
const SENT_AT = new Date("2026-03-16T18:30:00.000Z");
const ENTRY_ID = "group-1:2026-03-16";

function pastEntry(
  fields: Partial<PastSessionFeedEntry> = {},
): PastSessionFeedEntry {
  return {
    kind: "past",
    id: ENTRY_ID,
    startsAt: STARTS_AT,
    endsAt: ENDS_AT,
    report: "# Redstone week\n\nWe built item sorters.",
    staffNote: null,
    attendance: {},
    owed: true,
    reportEmailedAt: null,
    lastEditedBy: null,
    ...fields,
  };
}

function Harness({
  initial,
  send,
  stampOnSuccess,
}: {
  initial: PastSessionFeedEntry;
  send: () => Promise<SessionReportSendResult>;
  /** Whether a landed send writes the instant back, as a refetch would. */
  stampOnSuccess: boolean;
}) {
  const [entry, setEntry] = useState(initial);

  const handleSend = async () => {
    const result = await send();
    if (stampOnSuccess) setEntry((e) => ({ ...e, reportEmailedAt: SENT_AT }));
    return result;
  };

  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      <TimezoneProvider initialTimezone="Europe/Helsinki">
        <NowProvider initialNow={NOW}>
          <SessionFeed
            entries={[entry]}
            now={NOW}
            roster={ROSTER}
            sourceTimeZone="Europe/Helsinki"
            editingEntryId={null}
            onEditEntry={() => {}}
            onSaveEntry={() => {}}
            onSendReport={handleSend}
          />
        </NowProvider>
      </TimezoneProvider>
    </NextIntlClientProvider>
  );
}

function renderFeed({
  entry = pastEntry(),
  send = () => Promise.resolve({ sent: 2, failed: 0, skipped: 1 }),
  stampOnSuccess = false,
}: {
  entry?: PastSessionFeedEntry;
  send?: () => Promise<SessionReportSendResult>;
  stampOnSuccess?: boolean;
} = {}) {
  return render(
    <Harness initial={entry} send={send} stampOnSuccess={stampOnSuccess} />,
  );
}

const copy = messages.gedu.sessionFeed;

function sendButton(): HTMLButtonElement {
  return screen.getByRole<HTMLButtonElement>("button", {
    name: copy.sendReportToParents,
  });
}

/** Open the confirm dialog and press its Send. */
function confirmSend() {
  fireEvent.click(sendButton());
  fireEvent.click(
    screen.getByRole("button", { name: copy.sendReportConfirmCta }),
  );
}

/** Let the send's promise and everything chained to it settle. */
async function settle() {
  await act(async () => {});
}

beforeEach(() => {
  // The feed's shell reveals older history through an IntersectionObserver
  // sentinel; jsdom has none, and a one-entry feed needs it to do nothing.
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

describe("SessionFeed — sending a report to the families", () => {
  it("offers the send under a written-up past session, and counts the mailable seats", () => {
    renderFeed();
    fireEvent.click(sendButton());
    // Two of the three seats have somebody to write to, and the dialog promises
    // exactly that number — the same unit the route answers in.
    screen.getByText(/families of 2 participants/);
  });

  it("shows no send at all on a session nobody has written up", () => {
    renderFeed({ entry: pastEntry({ report: null }) });
    expect(
      screen.queryByRole("button", { name: copy.sendReportToParents }),
    ).toBeNull();
  });

  it("holds the button disabled across the send and past its resolution", async () => {
    let landed: (result: SessionReportSendResult) => void = () => {};
    renderFeed({
      send: () =>
        new Promise((resolve) => {
          landed = resolve;
        }),
    });

    confirmSend();
    // Disabled before any render after the confirmation could carry a second
    // click.
    expect(sendButton().disabled).toBe(true);

    // Still disabled once the promise settles: nothing here re-enables it, and
    // on the live page the refetch is what takes it off the screen entirely.
    landed({ sent: 2, failed: 0, skipped: 1 });
    await settle();
    expect(sendButton().disabled).toBe(true);
  });

  it("replaces the button with the sent line once the row comes back stamped", async () => {
    renderFeed({ stampOnSuccess: true });
    confirmSend();
    await settle();

    screen.getByText(/Sent to parents on .*20:30/);
    expect(
      screen.queryByRole("button", { name: copy.sendReportToParents }),
    ).toBeNull();
  });

  it("renders the sent line from the stored instant alone", () => {
    // No send happened here: a reload, another tab and another assigned gedu
    // all see this, which is the whole reason the instant is on the row.
    renderFeed({ entry: pastEntry({ reportEmailedAt: SENT_AT }) });
    screen.getByText(/Sent to parents on .*20:30/);
  });

  it("reports partial delivery once, beside the sent line", async () => {
    renderFeed({
      send: () => Promise.resolve({ sent: 1, failed: 1, skipped: 1 }),
      stampOnSuccess: true,
    });
    confirmSend();
    await settle();

    screen.getByText("1 sent, 1 failed");
  });

  it("says nothing about the counts when every mail landed", async () => {
    renderFeed({ stampOnSuccess: true });
    confirmSend();
    await settle();

    expect(screen.queryByText(/failed/)).toBeNull();
  });

  it("hands the button back with the failure's own message", async () => {
    renderFeed({ send: () => Promise.reject(new SessionReportSendError("failed")) });
    confirmSend();
    await settle();

    expect(sendButton().disabled).toBe(false);
    screen.getByText(copy.sendReportFailed);
  });

  it("names the refusal a retry cannot fix", async () => {
    renderFeed({
      send: () => Promise.reject(new SessionReportSendError("already_sent")),
    });
    confirmSend();
    await settle();

    screen.getByText(copy.sendReportAlreadySent);
  });
});
