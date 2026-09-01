import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, createEvent, fireEvent, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { ChatMessageList, type ChatLogHandlers } from "@/components/chat";
import type { ChatAccount, ChatMessage } from "@/components/chat/types";

/**
 * ============================================================================
 * A finger can reach the message actions.
 * ============================================================================
 *
 * The action bar was revealed by `group-hover` and by nothing else, so on a
 * phone — which is where families meet this product — replying, reacting,
 * editing and every moderation act were unreachable. A tap now reveals the same
 * absolutely-positioned bar a cursor reveals: same geometry, one row's bar at a
 * time, and nothing in the log moves either way.
 *
 * The two halves have to keep out of each other's way, and that is most of what
 * is pinned here: a mouse must never pay the touch path's price (its click
 * still opens a picture on the first press, because hover has already shown it
 * the bar), and a tap that presses something must be that control's tap and not
 * also the row's.
 */

const AINO: ChatAccount = {
  id: "f2a21dae-683e-40ab-9a48-a481039f4171",
  name: "Aino",
  role: "gamer",
};

const IDS = {
  first: "c5bf6494-a5bb-44bd-8856-4ffeef5e0644",
  second: "38cd8784-cf1e-4641-b27b-9aff1cada3ca",
  picture: "f1d41a0b-8f95-4848-bf8c-6ea0ed1a62e8",
} as const;

function chatMessage(
  id: string,
  overrides: Partial<ChatMessage> = {},
): ChatMessage {
  return {
    id,
    senderId: AINO.id,
    createdAt: "2026-06-15T17:00:00.000Z",
    body: "hello",
    image: null,
    replyToId: null,
    editedAt: null,
    hiddenAt: null,
    hiddenBy: null,
    reactions: [],
    delivery: "sent",
    ...overrides,
  };
}

const noop = () => undefined;
const handlers: ChatLogHandlers = {
  onReply: noop,
  onToggleReaction: noop,
  onEdit: noop,
  onDelete: noop,
  onHide: noop,
  onRestore: noop,
  onSetLock: noop,
  onRetry: noop,
};

function renderLog(log: readonly ChatMessage[], overrides: Partial<ChatLogHandlers> = {}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ChatMessageList
        messages={log}
        accounts={new Map([[AINO.id, AINO]])}
        mentionable={[]}
        viewer={AINO}
        viewerLocked={false}
        lockedAccountIds={new Set()}
        timeZone="Europe/Helsinki"
        heightClassName="h-80"
        handlers={{ ...handlers, ...overrides }}
      />
    </NextIntlClientProvider>,
  );
}

/**
 * A tap: the mouse events a touchscreen synthesises after it, with the one
 * property that says a finger made them. jsdom has no `PointerEvent`, so the
 * property is defined on the event rather than constructed with it — the
 * component reads it off the native event either way.
 */
function tap(element: Element) {
  fireEvent.mouseDown(element);
  const click = createEvent.click(element);
  Object.defineProperty(click, "pointerType", { value: "touch" });
  fireEvent(element, click);
}

/** The same gesture from a mouse — what every click carried before this. */
function press(element: Element) {
  fireEvent.mouseDown(element);
  fireEvent.click(element);
}

/** The bars, in log order, as the state each is in. */
function barStates(container: HTMLElement): (string | null)[] {
  return Array.from(container.querySelectorAll("[data-chat-actions]")).map(
    (bar) => bar.getAttribute("data-chat-actions"),
  );
}

afterEach(cleanup);

describe("a tap on a message", () => {
  it("reveals that row's action bar and no other", () => {
    const { container, getByText } = renderLog([
      chatMessage(IDS.first, { body: "first" }),
      chatMessage(IDS.second, { body: "second" }),
    ]);
    expect(barStates(container)).toEqual(["closed", "closed"]);

    tap(getByText("first"));
    expect(barStates(container)).toEqual(["open", "closed"]);
  });

  it("puts it away again when the same row is tapped twice", () => {
    const { container, getByText } = renderLog([
      chatMessage(IDS.first, { body: "first" }),
    ]);
    tap(getByText("first"));
    tap(getByText("first"));
    expect(barStates(container)).toEqual(["closed"]);
  });

  it("moves the bar rather than opening a second one", () => {
    const { container, getByText } = renderLog([
      chatMessage(IDS.first, { body: "first" }),
      chatMessage(IDS.second, { body: "second" }),
    ]);
    tap(getByText("first"));
    tap(getByText("second"));
    expect(barStates(container)).toEqual(["closed", "open"]);
  });

  it("closes when something outside the row is pressed", () => {
    const { container, getByText } = renderLog([
      chatMessage(IDS.first, { body: "first" }),
    ]);
    tap(getByText("first"));
    fireEvent.mouseDown(document.body);
    expect(barStates(container)).toEqual(["closed"]);
  });

  it("is not what a mouse click means — hover already answers that", () => {
    const { container, getByText } = renderLog([
      chatMessage(IDS.first, { body: "first" }),
    ]);
    press(getByText("first"));
    expect(barStates(container)).toEqual(["closed"]);
  });
});

describe("a tap on something inside the row", () => {
  it("presses the control rather than closing the bar", () => {
    const onReply = vi.fn<(messageId: string) => void>();
    const { container, getByText, getByRole } = renderLog(
      [chatMessage(IDS.first, { body: "first" })],
      { onReply },
    );

    tap(getByText("first"));
    tap(getByRole("button", { name: messages.chat.reply.action }));

    expect(onReply).toHaveBeenCalledWith(IDS.first);
    // And the act put the bar away, so nothing has to be dismissed by hand.
    expect(barStates(container)).toEqual(["closed"]);
  });

  it("leaves the bar standing while one of its own overlays is up", () => {
    const { container, getByRole, getByText } = renderLog([
      chatMessage(IDS.first, { body: "first" }),
    ]);
    tap(getByText("first"));
    tap(getByRole("button", { name: messages.chat.reactions.add }));

    // The picker is up, and the bar that opened it did not go with the tap.
    expect(
      getByRole("button", { name: messages.chat.reactions.heart }),
    ).not.toBeNull();
    expect(barStates(container)).toEqual(["open"]);
  });
});

describe("a picture", () => {
  const picture = chatMessage(IDS.picture, {
    body: null,
    image: { id: IDS.picture, src: "/fixture.jpg", width: 800, height: 600 },
  });
  const openLabel = "Open image 1 of 1";
  const viewerLabel = "Image 1 of 1";

  it("opens on a mouse's first click, as it always has", () => {
    const { container, getByRole, queryByLabelText } = renderLog([picture]);
    press(getByRole("button", { name: openLabel }));

    expect(queryByLabelText(viewerLabel)).not.toBeNull();
    expect(barStates(container)).toEqual(["closed"]);
  });

  it("reveals its bar on a finger's first tap instead of opening", () => {
    const { container, getByRole, queryByLabelText } = renderLog([picture]);
    tap(getByRole("button", { name: openLabel }));

    expect(queryByLabelText(viewerLabel)).toBeNull();
    expect(barStates(container)).toEqual(["open"]);
  });

  it("opens on the second tap, with the bar already showing", () => {
    const { getByRole, queryByLabelText } = renderLog([picture]);
    tap(getByRole("button", { name: openLabel }));
    tap(getByRole("button", { name: openLabel }));

    expect(queryByLabelText(viewerLabel)).not.toBeNull();
  });
});

describe("the bar a keyboard reaches", () => {
  it("is in the tab order whether or not anything revealed it", () => {
    const { getByRole } = renderLog([chatMessage(IDS.first, { body: "first" })]);
    const react = getByRole("button", { name: messages.chat.reactions.add });

    // Hidden by opacity, never by `display` or `hidden` — so focus lands, and
    // `focus-within` is what shows it. This is the half that must not regress
    // when the tap path adds `pointer-events` to what hiding means.
    react.focus();
    expect(document.activeElement).toBe(react);
  });
});

describe("an open editor", () => {
  it("takes no row gesture — a field being typed into is not a message", () => {
    const { container, getByRole, getByText } = renderLog([
      chatMessage(IDS.first, { body: "first" }),
    ]);
    tap(getByText("first"));
    tap(getByRole("button", { name: messages.chat.message.actions }));
    tap(getByText(messages.chat.message.edit));

    const field = container.querySelector("textarea");
    expect(field).not.toBeNull();

    // The row is still a div with a tap handler on it; tapping it while the
    // editor is up must do nothing at all.
    const row = container.querySelector(".group");
    if (row === null) throw new Error("the row went missing");
    tap(row);

    expect(container.querySelector("textarea")).not.toBeNull();
    expect(barStates(container)).toEqual([]);
  });
});
