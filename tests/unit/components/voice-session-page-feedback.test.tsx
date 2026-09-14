import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
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

/**
 * Everything the save half of this page is driven by and observed through.
 *
 * Hoisted because the module factories below close over it, and they run before
 * the file's own top-level statements do.
 */
const feedback = vi.hoisted(() => ({
  /** The window instant the token response carries, and the row's third key. */
  sessionOpensAt: "2026-09-14T10:00:00Z",
  /** Whether the token ever resolves — false leaves the page with no instant. */
  tokenResolves: true,
  /** What the prefill read reports: a row, or none. */
  row: null as { answers: Record<string, number>; note: string } | null,
  /** Whether that read succeeded at all. A failure reports no row either way. */
  readSucceeded: true,
  /** The instants the page actually asked about — a read it never issues is absent. */
  reads: [] as string[],
  /** Every save the page issued, in order. */
  saves: [] as {
    groupId: string;
    sessionOpensAt: string;
    exitReason: string;
    result: { answers: Record<string, number | undefined>; note: string };
  }[],
  /** Whether the save refuses. */
  saveFails: false,
}));

vi.mock("@/services/voice", () => ({
  useVoiceToken: () => ({
    mutateAsync: vi.fn(async () => {
      if (!feedback.tokenResolves) {
        // A token still in flight: the page has no instant yet, which is the
        // state the prefill read has to hold itself back through.
        return new Promise<never>(() => {});
      }
      return {
        token: "t",
        roomUrl: "https://example.invalid/room",
        sessionOpensAt: feedback.sessionOpensAt,
      };
    }),
  }),
}));

/**
 * The feedback service, stubbed at the hooks the page calls.
 *
 * The read hook's own `enabled` gate is repeated here rather than assumed: what
 * this file is about is the two arguments the page supplies, and the only way to
 * assert them as behaviour — a read issued, or not — is to apply the same
 * condition the hook applies to them. The emptiness rule is the real one, since
 * it is the thing the write-or-skip branch is built out of.
 */
vi.mock("@/services/session-feedback", async () => {
  const { isEmptySessionFeedback } = await import(
    "@/services/session-feedback/session-feedback.contracts"
  );
  return {
    isEmptySessionFeedback,
    useOwnSessionFeedback: (
      _groupId: string,
      sessionOpensAt: string | null,
      enabled: boolean,
    ) => {
      if (enabled && sessionOpensAt !== null) feedback.reads.push(sessionOpensAt);
      return {
        data: feedback.readSucceeded ? feedback.row : undefined,
        isSuccess: feedback.readSucceeded,
      };
    },
    useSaveSessionFeedback: () => ({
      mutate: (
        input: (typeof feedback.saves)[number],
        callbacks?: { onSuccess?: () => void; onError?: (error: Error) => void },
      ) => {
        feedback.saves.push(input);
        if (feedback.saveFails) callbacks?.onError?.(new Error("refused"));
        else callbacks?.onSuccess?.();
      },
    }),
  };
});

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
const DONE = messages.voice.feedback.done;
const SAVE_FAILED = messages.voice.feedback.saveFailed;
const GROUP_ID = "00000000-0000-4000-8000-000000000001";

// Done ends in `window.location.href = …`, which jsdom refuses to navigate.
// Swapped for a plain object so the assignment is observable: whether the
// reader is sent on or kept on the form is the whole of what a failed save
// changes.
const realLocation = window.location;
Object.defineProperty(window, "location", {
  configurable: true,
  writable: true,
  value: { href: "http://localhost/" },
});
afterAll(() => {
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: realLocation,
  });
});

beforeEach(() => {
  feedback.tokenResolves = true;
  feedback.row = null;
  feedback.readSucceeded = true;
  feedback.reads.length = 0;
  feedback.saves.length = 0;
  feedback.saveFails = false;
  window.location.href = "http://localhost/";
});

function renderPage(askForFeedback: boolean) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <VoiceSessionPage
        groupId={GROUP_ID}
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

/**
 * ============================================================================
 * What a press of Done does with the answers.
 * ============================================================================
 *
 * The screen has never known whether anything is stored — it is handed a state
 * and reports a result — so every decision about the row is this page's, and
 * each one fails silently if it is wrong:
 *
 *  1. **The read is issued once, and only where it is wanted.** It is what
 *     lets leaving cost no round trip, and a viewer the page does not ask must
 *     not be reading a child's row at all. It cannot go out before the token
 *     resolves either: the instant is the row's third key.
 *  2. **Write-or-skip is one condition.** A first-time Done with an empty form
 *     saves nothing, because the response rate counts sessions rather than
 *     rows — but an empty form over a row that exists, or over a read that
 *     never answered, writes, or a child who cleared their answers would be
 *     left with the old ones standing.
 *  3. **The exit reason is only knowable here**, and no later reader could
 *     reconstruct which of the two ways out a row came from.
 *  4. **A failed save keeps the child on the form, with a working Done.** The
 *     opposite — navigating anyway — throws the answers away silently, which is
 *     the exact outcome the screen exists to stop.
 */
describe("what the voice session page does with a gamer's answers", () => {
  beforeEach(() => {
    room.joined = false;
    room.joining = false;
    room.isModerator = false;
    room.joinSticks = true;
    room.join.mockClear();
    room.leave.mockClear();
    vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  /** Leave, and wait for the question that replaces the navigation. */
  async function leaveAndWait() {
    const leave = await screen.findByRole("button", {
      name: messages.voice.leave,
    });
    fireEvent.click(leave);
    await waitFor(() => {
      expect(feedbackHeading()).not.toBeNull();
    });
  }

  /** Charge the first statement's bar to one level, as a reader taps it. */
  function answerFirstStatement(word: string) {
    const bar = screen.getAllByRole("radiogroup")[0];
    const radio = within(bar).getByRole("radio", { name: word });
    const segment = radio.closest("label");
    if (segment === null) throw new Error(`"${word}" has no visible segment`);
    fireEvent.click(segment);
  }

  function pressDone() {
    fireEvent.click(screen.getByRole("button", { name: DONE }));
  }

  function doneButton(): HTMLButtonElement {
    const button = screen.getByRole("button", { name: DONE });
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error("Done is not a button");
    }
    return button;
  }

  it("reads the viewer's own row once the token has handed over the instant", async () => {
    renderPage(true);
    await screen.findByRole("button", { name: messages.voice.leave });

    expect(feedback.reads).toContain(feedback.sessionOpensAt);
  });

  it("reads nothing for a viewer it does not ask", async () => {
    renderPage(false);
    await screen.findByRole("button", { name: messages.voice.leave });

    expect(feedback.reads).toEqual([]);
  });

  it("reads nothing before the token resolves", async () => {
    // No instant, so no key — and the row is keyed by one.
    feedback.tokenResolves = false;
    renderPage(true);

    await waitFor(() => {
      expect(screen.getByText(messages.voice.connecting)).toBeDefined();
    });
    expect(feedback.reads).toEqual([]);
  });

  it("opens the form on what was read back", async () => {
    feedback.row = { answers: { learned: 5 }, note: "we built a castle" };
    renderPage(true);
    await leaveAndWait();

    const bar = screen.getAllByRole("radiogroup")[0];
    const top = within(bar).getByRole("radio", {
      name: messages.voice.feedback.scale.definitely,
    });
    // `checked` is what a seeded bar is charged through, and it lives on the
    // native radio the segment labels — asserted as a property so the test
    // reads the element it was handed rather than re-typing it.
    expect(top).toHaveProperty("checked", true);
    expect(screen.getByRole("textbox")).toHaveProperty(
      "value",
      "we built a castle",
    );
  });

  it("writes nothing when an empty form meets a read that found no row", async () => {
    renderPage(true);
    await leaveAndWait();
    pressDone();

    expect(feedback.saves).toEqual([]);
    expect(window.location.href).toBe(BACK);
  });

  it("writes an emptied form over a row that already exists", async () => {
    // The child answered earlier in this window and has now cleared it. The
    // record is whatever they last pressed Done on, so the row is emptied
    // rather than left standing.
    feedback.row = { answers: { learned: 4 }, note: "" };
    renderPage(true);
    await leaveAndWait();
    answerFirstStatement(messages.voice.feedback.scale.yes);
    pressDone();

    expect(feedback.saves).toHaveLength(1);
    expect(feedback.saves[0].result.answers.learned).toBeUndefined();
    expect(window.location.href).toBe(BACK);
  });

  it("writes an empty form when the read never answered", async () => {
    // An unknown prefill state must not leave a stale row behind a child who
    // cleared it, so the write goes ahead on nothing at all.
    feedback.readSucceeded = false;
    renderPage(true);
    await leaveAndWait();
    pressDone();

    expect(feedback.saves).toHaveLength(1);
    expect(feedback.saves[0].result).toStrictEqual({
      answers: {
        learned: undefined,
        fun: undefined,
        geduKnowledgeable: undefined,
        geduKind: undefined,
        groupListens: undefined,
      },
      note: "",
    });
  });

  it("writes what a child answered, keyed to the group and the window", async () => {
    renderPage(true);
    await leaveAndWait();
    answerFirstStatement(messages.voice.feedback.scale.definitely);
    pressDone();

    expect(feedback.saves).toHaveLength(1);
    expect(feedback.saves[0].groupId).toBe(GROUP_ID);
    expect(feedback.saves[0].sessionOpensAt).toBe(feedback.sessionOpensAt);
    expect(feedback.saves[0].result.answers.learned).toBe(5);
  });

  it("records the Leave button as the way out", async () => {
    renderPage(true);
    await leaveAndWait();
    answerFirstStatement(messages.voice.feedback.scale.yes);
    pressDone();

    expect(feedback.saves[0].exitReason).toBe("left");
  });

  it("records the room closing as the way out", async () => {
    room.joinSticks = false;
    renderPage(true);
    await waitFor(() => {
      expect(feedbackHeading()).not.toBeNull();
    });
    answerFirstStatement(messages.voice.feedback.scale.yes);
    pressDone();

    expect(feedback.saves[0].exitReason).toBe("ended");
  });

  it("keeps the child on the form, and Done working, when the save is refused", async () => {
    feedback.saveFails = true;
    renderPage(true);
    await leaveAndWait();
    answerFirstStatement(messages.voice.feedback.scale.yes);
    pressDone();

    expect(window.location.href).not.toBe(BACK);
    expect(feedbackHeading()).not.toBeNull();
    expect(screen.getByText(SAVE_FAILED)).toBeDefined();
    expect(doneButton().disabled).toBe(false);

    // The same Done retries the same write, and a second refusal leaves the
    // screen saying so exactly once.
    feedback.saveFails = false;
    pressDone();
    expect(feedback.saves).toHaveLength(2);
    expect(window.location.href).toBe(BACK);
  });
});
