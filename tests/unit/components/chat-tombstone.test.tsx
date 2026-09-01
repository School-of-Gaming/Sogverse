import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { ChatMessageRow } from "@/components/chat";
import { deriveChatMessageCapabilities } from "@/components/chat/capabilities";
import type { ChatAccount, ChatMessage } from "@/components/chat/types";

/**
 * ============================================================================
 * A removed message takes its reactions with it (owner ruling).
 * ============================================================================
 *
 * The tally is a record of what people thought of words that are no longer on
 * screen: six laughing faces standing under a tombstone tell a reader what kind
 * of message it was, which is exactly what removing it took away. So the row is
 * not rendered for anybody — including the moderator who still reads the dimmed
 * original above it, since they are the only ones the tally could have told
 * anything new.
 *
 * It is worth a test rather than a comment because the leak is silent and the
 * fix is a single conditional somebody tidying the row could dissolve without
 * noticing what it was for. The reactions themselves are untouched in the
 * data; this is only about what is drawn.
 */

const AINO: ChatAccount = {
  id: "b00b7a58-662f-4587-914a-2c100042de31",
  name: "Aino",
  role: "gamer",
};
const SANNA: ChatAccount = {
  id: "25b93099-e6dc-41f6-9dd3-f10f2d6dea40",
  name: "Sanna",
  role: "gedu",
};

/** The glyph the one seeded reaction draws — what must not survive a removal. */
const LAUGH = "😄";

function renderRow(hidden: boolean, viewer: ChatAccount) {
  const message: ChatMessage = {
    id: "m1",
    senderId: AINO.id,
    createdAt: "2026-06-15T17:00:00.000Z",
    body: "hello",
    image: null,
    replyToId: null,
    editedAt: null,
    hiddenAt: hidden ? "2026-06-15T17:01:00.000Z" : null,
    hiddenBy: hidden ? SANNA.id : null,
    reactions: [{ code: "laugh", senderId: SANNA.id }],
    delivery: "sent",
  };
  const accounts = new Map([
    [AINO.id, AINO],
    [SANNA.id, SANNA],
  ]);
  const noop = () => undefined;

  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ChatMessageRow
        message={message}
        context={{
          viewer,
          accounts,
          repliedTo: null,
          flashing: false,
          capabilities: deriveChatMessageCapabilities(
            { viewer, locked: false },
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

describe("a tombstone's reactions", () => {
  it("draws the tally while the message is standing", () => {
    const { container } = renderRow(false, AINO);
    expect(container.textContent).toContain(LAUGH);
  });

  it("draws none once the message is removed", () => {
    const { container } = renderRow(true, AINO);
    expect(container.textContent).toContain(messages.chat.tombstone.text);
    expect(container.textContent).not.toContain(LAUGH);
  });

  it("draws none for the moderator still reading the original either", () => {
    const { container } = renderRow(true, SANNA);
    // The soft delete is doing its job — the body is there, dimmed.
    expect(container.textContent).toContain("hello");
    expect(container.textContent).not.toContain(LAUGH);
  });
});
