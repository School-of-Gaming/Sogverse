import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { ChatComposer } from "@/components/chat";
import type { ChatSendDraft } from "@/components/chat";
import type { ChatAccount } from "@/components/chat/types";

/**
 * ============================================================================
 * The composer writes `@Name`; the send carries `@[Name](id)`.
 * ============================================================================
 *
 * `resolveChatMentions` is unit-tested on its own, exhaustively. What this
 * pins is the *seam* — three lines of wiring in the composer that decide which
 * form a writer ever sees, and which one leaves the box. Nothing else can catch
 * a regression there: putting the stored token back into the field would keep
 * every other test green while being exactly the thing the owner rejected
 * ("I am expecting @Name without any of the extra stuff"), and dropping the
 * resolve call at send would quietly ship a chat where nobody is ever
 * mentioned.
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
});
