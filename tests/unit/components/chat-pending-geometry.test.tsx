import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { ChatMessageRow } from "@/components/chat";
import { deriveChatMessageCapabilities } from "@/components/chat/capabilities";
import type {
  ChatAccount,
  ChatDelivery,
  ChatMessage,
} from "@/components/chat/types";

/**
 * ============================================================================
 * A pending row and the settled row it becomes are the same height.
 * ============================================================================
 *
 * The sender's own message is on screen as `pending` before anything has
 * acknowledged it, and it turns into `sent` on the *server's* schedule rather
 * than the reader's. The body survives that change — it is the same message in
 * the same place — so the root layout rule binds: nothing on screen may move.
 * It did move, live: a "Sending" line in flow under the bubble, gone the instant
 * the acknowledgement landed, took a whole line out of the log under whatever
 * the reader was looking at.
 *
 * jsdom has no layout engine, so this is a *class* assertion rather than a
 * measurement, and it is written as a structural comparison rather than a check
 * for one string: the geometry is identical when the two renders agree on every
 * element that takes part in flow. Out-of-flow elements are excluded by the two
 * things that take an element out of flow here — `sr-only` and `absolute` — and
 * `opacity-60` is stripped, because visual state is exactly what a pending row
 * *is* allowed to change.
 *
 * `failed` is deliberately not held to this. A refusal is not the ordinary path,
 * the retry has to be readable and reachable, and a reader being told something
 * they have to answer is the one moment a row has earned its extra line.
 */

const AINO: ChatAccount = {
  id: "f8b6c1d0-2a35-4d6e-9c71-3ab5d7e14f92",
  name: "Aino",
  role: "gamer",
};

/** What takes an element out of flow on this surface, and nothing else does. */
const OUT_OF_FLOW = /(?:^|\s)(?:sr-only|absolute)(?:\s|$)/;

function outOfFlow(element: Element): boolean {
  for (
    let node: Element | null = element;
    node !== null;
    node = node.parentElement
  ) {
    if (OUT_OF_FLOW.test(node.getAttribute("class") ?? "")) return true;
  }
  return false;
}

/**
 * Every element that occupies space, by tag and classes — the whole of what
 * decides this row's height, minus the states a row may legitimately change.
 */
function flowShape(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("*"))
    .filter((element) => !outOfFlow(element))
    .map((element) => {
      const classes = (element.getAttribute("class") ?? "")
        .replace(/(?:^|\s)opacity-60(?=\s|$)/, "")
        .replace(/\s+/g, " ")
        .trim();
      return `${element.tagName} ${classes}`;
    });
}

function renderRow(delivery: ChatDelivery) {
  const message: ChatMessage = {
    id: "0f5e9b34-7c21-4a58-8d10-6e2f4b9a3c77",
    senderId: AINO.id,
    createdAt: "2026-06-15T17:00:00.000Z",
    body: "the door works!!! it opens both ways now",
    image: null,
    replyToId: null,
    editedAt: null,
    hiddenAt: null,
    hiddenBy: null,
    reactions: [],
    delivery,
  };
  const noop = () => undefined;

  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ChatMessageRow
        message={message}
        context={{
          viewer: AINO,
          accounts: new Map([[AINO.id, AINO]]),
          mentionable: [AINO],
          repliedTo: null,
          flashing: false,
          capabilities: deriveChatMessageCapabilities(
            { viewer: AINO, locked: false },
            message,
            AINO,
            false,
          ),
        }}
        handlers={{
          onReply: noop,
          onJumpTo: noop,
          onToggleReaction: noop,
          onSubmitEdit: noop,
          onDelete: noop,
          onHide: noop,
          onRestore: noop,
          onSetLock: noop,
          onRetry: noop,
        }}
      />
    </NextIntlClientProvider>,
  );
}

afterEach(cleanup);

describe("a message reconciling from pending to sent", () => {
  it("occupies identical geometry in both states", () => {
    const pending = flowShape(renderRow("pending").container);
    cleanup();
    const sent = flowShape(renderRow("sent").container);

    // Not a comparison of two empty lists: the bubble itself is in flow, and if
    // this filter ever swallowed the row the equality below would pass while
    // proving nothing.
    expect(pending.length).toBeGreaterThan(0);
    expect(pending).toEqual(sent);
  });

  it("still says it is sending, out of flow, for whoever cannot see the dimming", () => {
    const { container } = renderRow("pending");
    const note = container.querySelector(".sr-only");
    expect(note?.textContent).toBe(messages.chat.message.sending);
  });

  it("dims the bubble, which is the visible half and costs no height", () => {
    const { container } = renderRow("pending");
    expect(container.querySelector(".opacity-60")).not.toBeNull();
  });

  it("gives a failed message its line, because that one has to be answered", () => {
    const { container } = renderRow("failed");
    expect(container.textContent).toContain(messages.chat.message.failed);
    expect(container.textContent).toContain(messages.chat.message.retry);
    // And the note it draws is in flow — the whole point of the exception.
    expect(flowShape(container).join("\n")).toContain("text-destructive");
  });
});
