import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { ChatComposer, ChatMessageRow } from "@/components/chat";
import type { ChatSendDraft } from "@/components/chat";
import { deriveChatMessageCapabilities } from "@/components/chat/capabilities";
import type { ChatAccount, ChatMessage } from "@/components/chat/types";

/**
 * ============================================================================
 * A writer writes `@Name`; the wire carries `@[Name](id)`.
 * ============================================================================
 *
 * `resolveChatMentions` is unit-tested on its own, exhaustively. What this
 * pins is the *seam* — the handful of lines in each field a writer types into
 * that decide which form they ever see, and which one leaves the box. Nothing
 * else can catch a regression there: putting the stored token back into a field
 * would keep every other test green while being exactly the thing the owner
 * rejected ("I am expecting @Name without any of the extra stuff"), and dropping
 * a resolve call would quietly ship a chat where nobody is ever mentioned.
 *
 * There are **two** such fields — the composer and the in-place editor — and
 * they have to behave identically, because a body the composer wrote is what the
 * editor opens on. The editor is the half that was silently wrong: it showed the
 * raw token and stored the draft raw, so one edit turned every mention in a
 * message into literal text.
 */

const AINO: ChatAccount = {
  id: "b00b7a58-662f-4587-914a-2c100042de31",
  name: "Aino",
  role: "gamer",
};
const VAINO: ChatAccount = {
  id: "789a4f4e-9afb-4c75-8714-823c129bfbff",
  name: "Väinö",
  role: "gamer",
};

/** The mock the composer is handed, typed so its calls read without a cast. */
function sendSpy() {
  return vi.fn<(drafts: ChatSendDraft[]) => void>();
}

function renderComposer(onSend: (drafts: ChatSendDraft[]) => void) {
  const view = render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ChatComposer
        capabilities={{
          canSend: true,
          canAttachImages: true,
          showsLockNotice: false,
        }}
        accounts={[AINO, VAINO]}
        replyingTo={null}
        onSend={onSend}
      />
    </NextIntlClientProvider>,
  );

  // Queried off the DOM rather than by label, because the two things these
  // cases drive — the field's value and the form's submit — want the concrete
  // element types, and `querySelector` gives them without an assertion.
  const field = view.container.querySelector("textarea");
  const form = view.container.querySelector("form");
  if (field === null || form === null) {
    throw new Error("the composer rendered without its field or its form");
  }
  return { ...view, field, form };
}

afterEach(cleanup);

describe("composing a mention", () => {
  it("puts the display form in the field when a name is picked", () => {
    const onSend = sendSpy();
    const { field, getByRole } = renderComposer(onSend);

    fireEvent.change(field, { target: { value: "hey @Ai", selectionStart: 7 } });
    const list = getByRole("list", { name: messages.chat.composer.mentionList });
    fireEvent.click(list.querySelectorAll("button")[0]);

    // What the writer sees — and specifically not the brackets and the UUID.
    expect(field.value).toBe("hey @Aino ");
    expect(field.value).not.toContain("[");
  });

  it("substitutes the stored token on the way out", () => {
    const onSend = sendSpy();
    const { field, form } = renderComposer(onSend);

    fireEvent.change(field, {
      target: { value: "hey @Aino and @Väinö", selectionStart: 20 },
    });
    fireEvent.submit(form);

    expect(onSend).toHaveBeenCalledOnce();
    expect(onSend.mock.calls[0][0][0].body).toBe(
      `hey @[${AINO.name}](${AINO.id}) and @[${VAINO.name}](${VAINO.id})`,
    );
  });

  it("leaves a name nobody has alone", () => {
    const onSend = sendSpy();
    const { field, form } = renderComposer(onSend);

    fireEvent.change(field, {
      target: { value: "@nobody said that", selectionStart: 17 },
    });
    fireEvent.submit(form);

    expect(onSend.mock.calls[0][0][0].body).toBe("@nobody said that");
  });

  it("does not offer names for an `@` inside a word", () => {
    // An address is the case that made this a rule: `someone@ex` used to put a
    // list of the children in the room over the log while somebody was typing
    // an email into a chat.
    const { field, queryByRole } = renderComposer(sendSpy());

    fireEvent.change(field, {
      target: { value: "write to someone@Ai", selectionStart: 19 },
    });
    expect(
      queryByRole("list", { name: messages.chat.composer.mentionList }),
    ).toBeNull();
  });
});

/**
 * The in-place editor, which is the composer's mirror: it opens on a stored
 * body, so it has to flatten the tokens on the way in and put them back on the
 * way out — against the same roster, in the same order.
 */

const VAINO_TOKEN = `@[${VAINO.name}](${VAINO.id})`;

/** The row, opened straight into its editor, plus the spy on what it saves. */
function renderEditor(body: string) {
  const message: ChatMessage = {
    id: "m1",
    senderId: AINO.id,
    createdAt: "2026-06-15T17:00:00.000Z",
    body,
    image: null,
    replyToId: null,
    editedAt: null,
    hiddenAt: null,
    hiddenBy: null,
    reactions: [],
    delivery: "sent",
  };
  const onSubmitEdit = vi.fn<(body: string) => void>();
  const noop = () => undefined;

  const view = render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <ChatMessageRow
        message={message}
        context={{
          viewer: AINO,
          accounts: new Map([
            [AINO.id, AINO],
            [VAINO.id, VAINO],
          ]),
          // The roster `ChatView` hands both fields: everyone but the viewer.
          mentionable: [VAINO],
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
          onSubmitEdit,
          onDelete: noop,
          onHide: noop,
          onRestore: noop,
          onSetLock: noop,
          onRetry: noop,
        }}
      />
    </NextIntlClientProvider>,
  );

  // Through the menu the sender actually uses, not by poking the row's state:
  // the seeding happens in that handler and is exactly what is being pinned.
  fireEvent.click(view.getByRole("button", { name: messages.chat.message.actions }));
  fireEvent.click(view.getByText(messages.chat.message.edit));

  const field = view.container.querySelector("textarea");
  const form = view.container.querySelector("form");
  if (field === null || form === null) {
    throw new Error("the row rendered without its editor");
  }
  return { ...view, field, form, onSubmitEdit };
}

describe("editing a message that names somebody", () => {
  it("shows the sentence in the field and puts the token back on save", () => {
    const { field, form, onSubmitEdit } = renderEditor(`hey ${VAINO_TOKEN} look`);

    expect(field.value).toBe(`hey @${VAINO.name} look`);
    expect(field.value).not.toContain("[");

    fireEvent.submit(form);
    expect(onSubmitEdit).toHaveBeenCalledExactlyOnceWith(
      `hey ${VAINO_TOKEN} look`,
    );
  });

  it("turns a name typed during the edit into a mention", () => {
    const { field, form, onSubmitEdit } = renderEditor("hey look");

    fireEvent.change(field, { target: { value: `hey @${VAINO.name} look` } });
    fireEvent.submit(form);

    expect(onSubmitEdit).toHaveBeenCalledExactlyOnceWith(
      `hey ${VAINO_TOKEN} look`,
    );
  });
});
