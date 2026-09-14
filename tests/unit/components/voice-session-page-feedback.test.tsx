import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";

/**
 * ============================================================================
 * Who gets asked how the session went, and on which way out.
 * ============================================================================
 *
 * The screen itself is covered next door; what this file is about is the one
 * branch on the page that decides whether a child ever sees it. Three things
 * are pinned, because each of them fails silently:
 *
 *  1. **A viewer the page does not ask leaves exactly as they did before.** The
 *     ended state still renders the "session ended" card with its way back, and
 *     no feedback screen. A regression here does not throw and does not look
 *     wrong in a preview scene — it just starts asking a parent, a gedu or an
 *     admin a child's questions.
 *  2. **The Leave path holds the reader here instead of navigating**, and the
 *     screen it renders says nothing above the heading: the reader pressed
 *     Leave, so telling them the session is over would be telling them what
 *     they just did.
 *  3. **The ended path renders the same screen *with* the lead line**, which is
 *     the one place the session's own end is announced — nothing else on that
 *     page would say it.
 *
 * The room, the chat, the flair dialog and every service behind them are
 * stubbed: this is a test of one branch, and mounting the real room would drag
 * in Daily, dnd-kit and a Web Audio analyser to assert nothing about any of
 * them. The provider module is stubbed rather than the inner component being
 * exported — it is the seam the page already has (the provider wraps the inner
 * component, `useVoiceRoom` is the only thing the inner component reads from
 * it), so a pass-through provider plus a driveable hook mounts the real
 * `VoiceSessionPage` with nothing added to `src/` for the test's convenience.
 */

/** The call state the stubbed `useVoiceRoom` reports, driven per test. */
const room = {
  joined: false,
  joining: false,
  isModerator: false,
  /** Whether `join()` should leave the call joined — false is the ejected path. */
  joinSticks: true,
  join: vi.fn(async () => {
    if (room.joinSticks) room.joined = true;
  }),
  leave: vi.fn(async () => {
    room.joined = false;
  }),
};

vi.mock("@/components/voice/VoiceRoomProvider", () => ({
  VoiceRoomProvider: ({ children }: { children: React.ReactNode }) => children,
  useVoiceRoom: () => room,
}));

// The room is a button that leaves, which is all this file asks of it.
vi.mock("@/components/voice/VoiceRoom", () => ({
  VoiceRoom: ({
    onLeave,
    leaveLabel,
  }: {
    onLeave: () => void;
    leaveLabel: string;
  }) => (
    <button type="button" onClick={onLeave}>
      {leaveLabel}
    </button>
  ),
}));

vi.mock("@/components/voice/GroupSessionChat", () => ({
  GroupSessionChat: () => null,
}));

vi.mock("@/components/voice/VoiceMemberFlairProvider", () => ({
  VoiceMemberFlairProvider: ({ children }: { children: React.ReactNode }) =>
    children,
}));

vi.mock("@/components/member-flair", () => ({
  GamerFlairDialog: () => null,
}));

vi.mock("@/services/voice", () => ({
  useVoiceToken: () => ({
    mutateAsync: vi.fn(async () => ({
      token: "t",
      roomUrl: "https://example.invalid/room",
      sessionOpensAt: "2026-09-14T10:00:00Z",
    })),
  }),
}));

vi.mock("@/services/member-flair", () => ({
  useGroupStaffOverlay: () => ({ data: undefined }),
  useSetGamerGroupNote: () => ({ mutateAsync: vi.fn() }),
  useSetGamerGroupCreations: () => ({ mutateAsync: vi.fn() }),
}));

const { VoiceSessionPage } =
  await import("@/components/voice/VoiceSessionPage");

const BACK = "/en/gamer";
const HEADING = messages.voice.feedback.heading;
const ENDED = messages.voice.sessionEnded;

function renderPage(askForFeedback: boolean) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <VoiceSessionPage
        groupId="00000000-0000-4000-8000-000000000001"
        backHref={BACK}
        askForFeedback={askForFeedback}
      />
    </NextIntlClientProvider>,
  );
}

/** The feedback screen's heading, or `null` when the screen is not mounted. */
function feedbackHeading(): HTMLElement | null {
  return screen.queryByRole("heading", { level: 1, name: HEADING });
}

describe("who the voice session page asks for feedback", () => {
  beforeEach(() => {
    room.joined = false;
    room.joining = false;
    room.isModerator = false;
    room.joinSticks = true;
    room.join.mockClear();
    room.leave.mockClear();
    // The feedback screen scrolls the document to the top as it arrives; jsdom
    // has no layout to scroll and reports its own `scrollTo` unimplemented.
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("shows the old session-ended card, and no question, to a viewer it does not ask", async () => {
    // Joined, then ejected: the join resolves without leaving the call joined,
    // which is the shape Daily's token `exp` produces at the window's close.
    room.joinSticks = false;
    renderPage(false);

    const back = await screen.findByRole("link", {
      name: messages.common.back,
    });

    expect(screen.getByText(ENDED)).toBeDefined();
    expect(back.getAttribute("href")).toBe(BACK);
    expect(feedbackHeading()).toBeNull();
  });

  it("asks a gamer who pressed Leave, with nothing said above the heading", async () => {
    renderPage(true);

    const leave = await screen.findByRole("button", {
      name: messages.voice.leave,
    });
    fireEvent.click(leave);

    await waitFor(() => {
      expect(feedbackHeading()).not.toBeNull();
    });
    expect(room.leave).toHaveBeenCalledTimes(1);
    // The reader knows they left; saying the session ended would be telling
    // them what they just did.
    expect(screen.queryByText(ENDED)).toBeNull();
  });

  it("asks a gamer the room closed under, and says so above the heading", async () => {
    room.joinSticks = false;
    renderPage(true);

    await waitFor(() => {
      expect(feedbackHeading()).not.toBeNull();
    });
    expect(screen.getByText(ENDED)).toBeDefined();
    // The old card is gone entirely — the question replaces it, rather than
    // being stacked under it.
    expect(
      screen.queryByRole("link", { name: messages.common.back }),
    ).toBeNull();
  });
});
