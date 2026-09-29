import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { ChatMessageActions } from "@/components/chat/ChatMessageActions";
import {
  deriveChatMessageCapabilities,
  type ChatViewerState,
} from "@/components/chat/capabilities";
import type {
  ChatAccount,
  ChatMessage,
  ChatModerationLocks,
} from "@/components/chat/types";

/**
 * ============================================================================
 * A trainee's message menu is the moderator's, with padlocks on it.
 * ============================================================================
 *
 * The derivation is pinned next door; this is the other half — that a locked
 * act renders where the working one would, explains itself when pressed, and
 * never calls the handler behind it.
 */

const AINO: ChatAccount = { id: "aino", name: "Aino", role: "gamer" };
const TIIA: ChatAccount = { id: "tiia", name: "Tiia", role: "gedu" };

const locks: ChatModerationLocks = {
  hide: {
    title: "Removing a message",
    what: "Removes it for everyone.",
    why: "Assigned Gedus can do this.",
    dismiss: "Got it",
    lockedHint: "(locked)",
  },
  restore: {
    title: "Putting a message back",
    what: "Brings it back.",
    why: "Assigned Gedus can do this.",
    dismiss: "Got it",
    lockedHint: "(locked)",
  },
  lock: {
    title: "Locking someone out of the chat",
    what: "Stops them writing.",
    why: "Assigned Gedus can do this.",
    dismiss: "Got it",
    lockedHint: "(locked)",
  },
};

const message: ChatMessage = {
  id: "m1",
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
};

const onHide = vi.fn();
const onSetLock = vi.fn();

function renderMenu(state: ChatViewerState) {
  const noop = () => {};
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ChatMessageActions
        sender={AINO}
        capabilities={deriveChatMessageCapabilities(state, message, AINO, false)}
        revealed
        onReply={noop}
        onToggleReaction={noop}
        onStartEdit={noop}
        onDelete={noop}
        onHide={onHide}
        onRestore={noop}
        onSetLock={onSetLock}
      />
    </NextIntlClientProvider>,
  );
  fireEvent.click(
    screen.getByRole("button", { name: messages.chat.message.actions }),
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("the message menu for a trainee", () => {
  it("shows remove and lock locked, and explains rather than acts", () => {
    renderMenu({
      viewer: TIIA,
      standing: { kind: "trainee", locks },
      locked: false,
    });

    // A locked item's name is its label; the "(locked)" hint rides beside it.
    const remove = screen.getByRole("button", {
      name: (name) => name.startsWith(messages.chat.message.hide),
    });
    fireEvent.click(remove);
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(locks.hide.title)).toBeTruthy();
    expect(onHide).not.toHaveBeenCalled();
    fireEvent.click(within(dialog).getByRole("button", { name: "Got it" }));

    fireEvent.click(
      screen.getByRole("button", { name: messages.chat.message.actions }),
    );
    const lockName = messages.chat.moderation.lock.replace("{name}", AINO.name);
    fireEvent.click(
      screen.getByRole("button", { name: (name) => name.startsWith(lockName) }),
    );
    expect(
      within(screen.getByRole("dialog")).getByText(locks.lock.title),
    ).toBeTruthy();
    expect(onSetLock).not.toHaveBeenCalled();
  });

  it("gives a participant with no locks no moderator items at all", () => {
    render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <ChatMessageActions
          sender={AINO}
          capabilities={deriveChatMessageCapabilities(
            { viewer: TIIA, standing: { kind: "participant" }, locked: false },
            message,
            AINO,
            false,
          )}
          revealed
          onReply={() => {}}
          onToggleReaction={() => {}}
          onStartEdit={() => {}}
          onDelete={() => {}}
          onHide={onHide}
          onRestore={() => {}}
          onSetLock={onSetLock}
        />
      </NextIntlClientProvider>,
    );
    // No menu at all: nothing in it would be the viewer's.
    expect(
      screen.queryByRole("button", { name: messages.chat.message.actions }),
    ).toBeNull();
  });
});
