import { useState } from "react";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { NowProvider } from "@/providers/now-provider";
import { TimezoneProvider } from "@/providers/timezone-provider";
import { buttonVariants } from "@/components/ui/button";
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
 * The affordance is **one button in three states** — send, sending, sent — and
 * what is pinned here is everything that happens *between* renders, which is
 * the part the pure derivations next door cannot see:
 *
 *   - one press sends; there is no dialog in the way, because the route's claim
 *     is what makes a double send impossible and a headcount was all the dialog
 *     had left to say;
 *   - the button is disabled from that press onward and **stays** disabled
 *     while the send is in the air and after it resolves, because what ends
 *     that state is the refetched row — a button that blinked back to life in
 *     between is the double press the committing pattern exists to prevent;
 *   - the sent state is the same button, disabled, quieter, carrying the time
 *     the mail went, and it is rendered from the stored instant alone;
 *   - a refusal that leaves the session unsent hands the button back with a
 *     line naming it, and the one refusal that says the report has *already*
 *     gone says nothing at all.
 *
 * The harness below stands in for the page: it holds the entry, and on a send
 * that lands it stamps the row exactly as the invalidated query would a moment
 * later. That is what makes the button's flip into its sent state observable
 * without a query client.
 */

/** Real generated UUIDs: ids that reach an identicon are never readable stubs. */
const ROSTER: readonly SessionFeedGamer[] = [
  { id: "d9d0f5a8-6f97-4b0a-9a51-01d5a25a0f1e", firstName: "Aino" },
  { id: "b1a3c6e4-7c1a-4a4e-9f2b-6c9d5f0f8a21", firstName: "Elias" },
  { id: "5f7b2c19-3f24-4e63-8d6a-2b0c7a9e4d55", firstName: "Venla" },
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

/** The button in its offer state — the one that says "Send to parents". */
function sendButton(): HTMLButtonElement {
  return screen.getByRole<HTMLButtonElement>("button", {
    name: copy.sendReportToParents,
  });
}

/** The same button while the mail is going out — "Sending to parents…". */
function sendingButton(): HTMLButtonElement {
  return screen.getByRole<HTMLButtonElement>("button", {
    name: copy.sendingReportToParents,
  });
}

/** The same button once the row is stamped: same control, folded-in time. */
function sentButton(): HTMLButtonElement {
  return screen.getByRole<HTMLButtonElement>("button", {
    name: /Sent to parents/,
  });
}

/**
 * Assert which variant a button is wearing, **derived from the variant
 * definition rather than typed out**: the classes unique to the one it should
 * have are all present, and the ones unique to the other are all absent. No
 * colour name is written down here, so a palette change cannot break this and a
 * variant rename fails at the compiler instead.
 */
function expectVariant(
  button: HTMLButtonElement,
  variant: "secondary" | "outline",
) {
  const other = variant === "secondary" ? "outline" : "secondary";
  const classesOf = (v: "secondary" | "outline") =>
    buttonVariants({ variant: v, size: "sm" }).split(" ").filter(Boolean);
  const mine = new Set(classesOf(variant));
  const theirs = new Set(classesOf(other));
  const distinctive = [...mine].filter((cls) => !theirs.has(cls));
  const foreign = [...theirs].filter((cls) => !mine.has(cls));
  // A guard on the assertion itself: two variants that had grown identical
  // would make every check below vacuously pass.
  expect(distinctive.length).toBeGreaterThan(0);

  const worn = new Set(button.className.split(" ").filter(Boolean));
  expect(distinctive.filter((cls) => !worn.has(cls))).toEqual([]);
  expect(foreign.filter((cls) => worn.has(cls))).toEqual([]);
}

/** Whether the button is showing its spinner. */
function spinning(button: HTMLButtonElement): boolean {
  return button.querySelector(".animate-spin") !== null;
}

/** Let the send's promise and everything chained to it settle. */
async function settle() {
  await act(async () => {});
}

/**
 * The sent time is rendered in the viewer's zone, and the `TimezoneProvider`
 * seed below is only the first render's answer: after mount the provider asks
 * the runtime what zone it is really in and overrides the seed with that. On a
 * Helsinki machine the two agree and the assertions on "20:30" pass for the
 * wrong reason; on CI, which runs in UTC, the override wins and they fail. So
 * the runtime zone is pinned for this file, the same way the other
 * zone-sensitive unit tests do it — Node resets its default zone when
 * `process.env.TZ` is assigned — and restored afterwards.
 */
let originalTZ: string | undefined;
beforeAll(() => {
  originalTZ = process.env.TZ;
  process.env.TZ = "Europe/Helsinki";
});
afterAll(() => {
  if (originalTZ === undefined) delete process.env.TZ;
  else process.env.TZ = originalTZ;
});

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
  it("sends on the press itself, with nothing to confirm", async () => {
    const send = vi.fn(() =>
      Promise.resolve({ sent: 2, failed: 0, skipped: 1 }),
    );
    renderFeed({ send });

    const button = sendButton();
    expect(button.disabled).toBe(false);
    expectVariant(button, "secondary");

    fireEvent.click(button);
    // No dialog stood between the click and the send, and none was rendered.
    expect(send).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("dialog")).toBeNull();
    await settle();
  });

  it("shows no send at all on a session nobody has written up", () => {
    renderFeed({ entry: pastEntry({ report: null }) });
    expect(
      screen.queryByRole("button", { name: copy.sendReportToParents }),
    ).toBeNull();
  });

  it("holds the button disabled and spinning across the send, and past its resolution", async () => {
    let landed: (result: SessionReportSendResult) => void = () => {};
    renderFeed({
      send: () =>
        new Promise((resolve) => {
          landed = resolve;
        }),
    });

    fireEvent.click(sendButton());
    // Disabled before any render after the click could carry a second one, the
    // label says what is happening, and the spinner is in the button's own
    // slot rather than beside it.
    expect(sendingButton().disabled).toBe(true);
    expect(spinning(sendingButton())).toBe(true);
    expectVariant(sendingButton(), "secondary");
    expect(
      screen.queryByRole("button", { name: copy.sendReportToParents }),
    ).toBeNull();

    // Still disabled once the promise settles: nothing here re-enables it, and
    // on the live page the refetch is what moves it on.
    landed({ sent: 2, failed: 0, skipped: 1 });
    await settle();
    expect(sendingButton().disabled).toBe(true);
  });

  it("turns the same button into the sent state once the row comes back stamped", async () => {
    renderFeed({ stampOnSuccess: true });
    fireEvent.click(sendButton());
    await settle();

    const button = sentButton();
    expect(button.disabled).toBe(true);
    expect(button.textContent).toMatch(/20:30/);
    expect(spinning(button)).toBe(false);
    // Quieter now that there is nothing left to do here.
    expectVariant(button, "outline");
    expect(
      screen.queryByRole("button", { name: copy.sendReportToParents }),
    ).toBeNull();
  });

  it("renders the sent state from the stored instant alone", () => {
    // No send happened here: a reload, another tab and another assigned gedu
    // all see this, which is the whole reason the instant is on the row.
    renderFeed({ entry: pastEntry({ reportEmailedAt: SENT_AT }) });

    const button = sentButton();
    expect(button.disabled).toBe(true);
    expect(button.textContent).toMatch(/20:30/);
    expectVariant(button, "outline");
  });

  it("reports partial delivery once, beside the sent button", async () => {
    renderFeed({
      send: () => Promise.resolve({ sent: 1, failed: 1, skipped: 1 }),
      stampOnSuccess: true,
    });
    fireEvent.click(sendButton());
    await settle();

    sentButton();
    screen.getByText("1 sent, 1 failed");
  });

  it("says nothing about the counts when every mail landed", async () => {
    renderFeed({ stampOnSuccess: true });
    fireEvent.click(sendButton());
    await settle();

    expect(screen.queryByText(/failed/)).toBeNull();
  });

  it("hands the button back with the failure's own message", async () => {
    renderFeed({ send: () => Promise.reject(new SessionReportSendError("failed")) });
    fireEvent.click(sendButton());
    await settle();

    expect(sendButton().disabled).toBe(false);
    expect(spinning(sendButton())).toBe(false);
    screen.getByText(copy.sendReportFailed);
  });

  it("names a report that is no longer there to send", async () => {
    renderFeed({
      send: () => Promise.reject(new SessionReportSendError("no_report")),
    });
    fireEvent.click(sendButton());
    await settle();

    expect(sendButton().disabled).toBe(false);
    screen.getByText(copy.sendReportNoReport);
  });

  it("says nothing when the refusal is that the report has already gone", async () => {
    // The row was stamped by whoever got there first, so the refetch behind
    // this refusal is what tells the gedu — an error line would be arguing with
    // the button it sits under. Until that row arrives the button stays
    // disabled, because the send it was refused for did happen.
    renderFeed({
      send: () => Promise.reject(new SessionReportSendError("already_sent")),
    });
    fireEvent.click(sendButton());
    await settle();

    expect(screen.queryByRole("alert")).toBeNull();
    expect(sendingButton().disabled).toBe(true);
  });
});
