import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { AddGamerFormCard } from "@/components/family";
import { ApiError } from "@/lib/api/api-error";
import { GAMER_EMAIL_TAKEN, GAMER_USERNAME_TAKEN } from "@/services/gamers";
import { GAMER_EMAIL_DOMAIN } from "@/lib/gamer-sign-in";
import type { CreateGamerInput } from "@/types";

/**
 * **The add-gamer form is two pages for every parent, and the second one is the
 * sign-in question.**
 *
 * Four things are pinned here. That the flow is fixed — page one always
 * advances, page two always creates, and no radio changes either — which is the
 * whole of what replaced a footer that used to re-decide itself as a mode was
 * picked. That page two holds one box whose declared height does not move as the
 * radio does, because the footer sits directly under it and a parent's thumb is
 * on the radio they just pressed. That each mode sends exactly its own fields.
 * And that the two refusals only the server can make land on the field the
 * parent can fix rather than in the generic banner.
 *
 * The real catalogue rather than echoed keys, because the footer's label is the
 * assertion in half these cases and "which key" would not distinguish Next from
 * Add gamer.
 */

// The game rows do real platform lookups on commit and contribute nothing to
// any question here; the dialog renders two of them.
vi.mock("@/components/game-account", () => ({
  GAME_PLATFORMS: {
    minecraft: { name: "Minecraft" },
    roblox: { name: "Roblox" },
  },
  GameUsernameEditableRow: () => <div data-testid="game-row" />,
}));

const ADD_GAMER = messages.family.addGamerForm.submit;
const NEXT = messages.common.next;
const BACK = messages.common.back;

const onCreate = vi.fn<(input: CreateGamerInput) => Promise<{ gamerId: string }>>();

function renderCard() {
  const view = render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <AddGamerFormCard onOpenChange={vi.fn()} onCreate={onCreate} />
    </NextIntlClientProvider>,
  );

  const form = view.container.querySelector("form");
  if (!form) throw new Error("no form");

  function field(id: string) {
    const input = view.container.querySelector<HTMLInputElement | HTMLSelectElement>(
      `#${id}`,
    );
    if (!input) throw new Error(`no field #${id}`);
    return input;
  }

  const submit = () =>
    act(async () => {
      fireEvent.submit(form);
    });

  return {
    ...view,
    field,
    fill(id: string, value: string) {
      fireEvent.change(field(id), { target: { value } });
    },
    /** Fill page one's three required answers. */
    fillDetails() {
      fireEvent.change(field("add-gamer-first-name"), {
        target: { value: "Lily" },
      });
      fireEvent.change(field("add-gamer-month"), { target: { value: "3" } });
      fireEvent.change(field("add-gamer-year"), { target: { value: "2015" } });
    },
    radio(mode: string) {
      const input = view.container.querySelector<HTMLInputElement>(
        `input[name="add-gamer-sign-in"][value="${mode}"]`,
      );
      if (!input) throw new Error(`no ${mode} radio`);
      return input;
    },
    chooseMode(mode: string) {
      const input = view.container.querySelector<HTMLInputElement>(
        `input[name="add-gamer-sign-in"][value="${mode}"]`,
      );
      if (!input) throw new Error(`no ${mode} radio`);
      fireEvent.click(input);
    },
    /**
     * The box under the radios, found by the shape of its own declaration: the
     * one element on the page that names a minimum height. Finding it that way
     * is the assertion — a wrapper that stopped declaring one would fail here
     * rather than quietly let the footer start moving.
     */
    fieldsBox() {
      const match = Array.from(
        view.container.querySelectorAll<HTMLElement>("div"),
      ).find((el) =>
        el.className.split(" ").some((name) => name.startsWith("min-h-[")),
      );
      if (!match) throw new Error("no fields box declaring a minimum height");
      return match;
    },
    affirmative: () =>
      view.container.querySelector<HTMLButtonElement>('button[type="submit"]')!,
    /**
     * The footer's left-hand button. Found by its label rather than by
     * `button[type="button"]`, because the password field's own show/hide toggle
     * is one of those too and comes first in the DOM.
     */
    negative: (label: string) => {
      const match = Array.from(
        view.container.querySelectorAll<HTMLButtonElement>("button"),
      ).find((button) => button.textContent.includes(label));
      if (!match) throw new Error(`no button labelled ${label}`);
      return match;
    },
    submit,
    /** Page one → page two, which is the only way production reaches it. */
    async goToSignIn() {
      await submit();
    },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  onCreate.mockResolvedValue({ gamerId: "1a8e1e2a-32f6-4c6f-9a6a-9d0f2a1b7c44" });
});

describe("the flow is the same two pages for everyone", () => {
  it("opens on page one, whose affirmative is always a Next", () => {
    const view = renderCard();

    expect(view.field("add-gamer-first-name")).toBeTruthy();
    expect(view.affirmative().textContent).toContain(NEXT);
    // The question is page two's, and nothing about it is asked here.
    expect(
      view.container.querySelector('input[name="add-gamer-sign-in"]'),
    ).toBeNull();
  });

  it("refuses page one's own rules rather than advancing", async () => {
    const view = renderCard();
    await view.goToSignIn();

    // No name, so the parent never reaches a page asking how a child the first
    // page was going to refuse will sign in.
    expect(
      screen.getByText(messages.family.addGamerForm.firstNameTooShort),
    ).toBeTruthy();
    expect(
      view.container.querySelector('input[name="add-gamer-sign-in"]'),
    ).toBeNull();
  });

  it("lands on the question with the switch-only answer already chosen", async () => {
    const view = renderCard();
    view.fillDetails();
    await view.goToSignIn();

    expect(view.radio("parent").checked).toBe(true);
    expect(view.radio("username").checked).toBe(false);
    expect(view.radio("email").checked).toBe(false);
    expect(
      screen.getByText(
        messages.gamerSignIn.question.replace("{name}", "Lily"),
      ),
    ).toBeTruthy();
    expect(view.affirmative().textContent).toContain(ADD_GAMER);
    expect(view.negative(BACK)).toBeTruthy();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("creates a switch-only child from page two with no credential fields", async () => {
    const view = renderCard();
    view.fillDetails();
    await view.goToSignIn();

    expect(
      screen.getByText(
        messages.gamerSignIn.parentModeNote.replace("{name}", "Lily"),
      ),
    ).toBeTruthy();
    expect(view.container.querySelector("#add-gamer-username")).toBeNull();
    expect(view.container.querySelector("#add-gamer-email")).toBeNull();

    await view.submit();

    expect(onCreate).toHaveBeenCalledTimes(1);
    expect(onCreate.mock.calls[0][0]).toMatchObject({
      firstName: "Lily",
      signIn: "parent",
      username: undefined,
      email: undefined,
      password: undefined,
    });
  });

  it("goes back to page one with what was typed there still in place", async () => {
    const view = renderCard();
    view.fillDetails();
    await view.goToSignIn();

    await act(async () => {
      view.negative(BACK).click();
    });

    expect(view.field("add-gamer-first-name").value).toBe("Lily");
    expect(view.field("add-gamer-month").value).toBe("3");
    expect(view.field("add-gamer-year").value).toBe("2015");
    expect(view.affirmative().textContent).toContain(NEXT);
    expect(onCreate).not.toHaveBeenCalled();
  });
});

describe("the box under the radios", () => {
  it("holds one declared height across all three answers", async () => {
    const view = renderCard();
    view.fillDetails();
    await view.goToSignIn();

    const declared = view.fieldsBox().className;

    view.chooseMode("username");
    expect(view.field("add-gamer-username")).toBeTruthy();
    expect(view.fieldsBox().className).toBe(declared);

    view.chooseMode("email");
    expect(view.field("add-gamer-email")).toBeTruthy();
    expect(view.fieldsBox().className).toBe(declared);

    view.chooseMode("parent");
    expect(view.container.querySelector("#add-gamer-email")).toBeNull();
    expect(view.fieldsBox().className).toBe(declared);
  });

  it("asks for a username and a password, and nothing else, in username mode", async () => {
    const view = renderCard();
    view.fillDetails();
    await view.goToSignIn();
    view.chooseMode("username");

    expect(view.field("add-gamer-username")).toBeTruthy();
    expect(view.field("add-gamer-password")).toBeTruthy();
    expect(view.container.querySelector("#add-gamer-email")).toBeNull();
  });

  it("asks for an address, and nothing else, in email mode", async () => {
    const view = renderCard();
    view.fillDetails();
    await view.goToSignIn();
    view.chooseMode("email");

    expect(view.field("add-gamer-email")).toBeTruthy();
    expect(view.container.querySelector("#add-gamer-username")).toBeNull();
    expect(view.container.querySelector("#add-gamer-password")).toBeNull();
  });

  // The password is chosen BY a parent FOR a child and read out loud, so
  // masking it hides it from the one person it is being written for.
  it("shows the password in clear, and asks for it only once", async () => {
    const view = renderCard();
    view.fillDetails();
    await view.goToSignIn();
    view.chooseMode("username");

    expect(view.field("add-gamer-password").getAttribute("type")).toBe("text");
    expect(view.container.querySelector("#add-gamer-confirm-password")).toBeNull();
  });
});

describe("what page two sends", () => {
  it("sends a normalised username and its password, and no address", async () => {
    const view = renderCard();
    view.fillDetails();
    await view.goToSignIn();
    view.chooseMode("username");

    view.fill("add-gamer-username", "Lily2015");
    view.fill("add-gamer-password", "a-long-enough-password");
    await view.submit();

    expect(onCreate.mock.calls[0][0]).toMatchObject({
      signIn: "username",
      username: "lily2015",
      password: "a-long-enough-password",
      email: undefined,
    });
  });

  it("sends an address alone, with no password for a child who has none yet", async () => {
    const view = renderCard();
    view.fillDetails();
    await view.goToSignIn();
    view.chooseMode("email");

    view.fill("add-gamer-email", " lily@example.test ");
    await view.submit();

    expect(onCreate.mock.calls[0][0]).toMatchObject({
      signIn: "email",
      email: "lily@example.test",
      username: undefined,
      password: undefined,
    });
  });

  it("refuses a username the pattern would not accept, before any request", async () => {
    const view = renderCard();
    view.fillDetails();
    await view.goToSignIn();
    view.chooseMode("username");

    view.fill("add-gamer-username", "ab");
    view.fill("add-gamer-password", "a-long-enough-password");
    await view.submit();

    expect(onCreate).not.toHaveBeenCalled();
    expect(screen.getByText(messages.gamerSignIn.usernameInvalid)).toBeTruthy();
  });

  it("refuses a password below the account floor", async () => {
    const view = renderCard();
    view.fillDetails();
    await view.goToSignIn();
    view.chooseMode("username");

    view.fill("add-gamer-username", "lily2015");
    view.fill("add-gamer-password", "short");
    await view.submit();

    expect(onCreate).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        messages.gamerSignIn.passwordTooShort.replace("{count}", "8"),
      ),
    ).toBeTruthy();
  });
});

describe("the two refusals only the server can make", () => {
  it("puts a taken username on the username field", async () => {
    onCreate.mockRejectedValue(
      new ApiError("username taken", 409, GAMER_USERNAME_TAKEN),
    );

    const view = renderCard();
    view.fillDetails();
    await view.goToSignIn();
    view.chooseMode("username");
    view.fill("add-gamer-username", "lily2015");
    view.fill("add-gamer-password", "a-long-enough-password");
    await view.submit();

    expect(screen.getByText(messages.gamerSignIn.usernameTaken)).toBeTruthy();
    // Not the banner: a parent who can see which field is wrong can fix it.
    expect(
      screen.queryByText(messages.family.addGamerForm.genericError),
    ).toBeNull();
  });

  it("puts a taken address on the email field", async () => {
    onCreate.mockRejectedValue(
      new ApiError("email taken", 409, GAMER_EMAIL_TAKEN),
    );

    const view = renderCard();
    view.fillDetails();
    await view.goToSignIn();
    view.chooseMode("email");
    view.fill("add-gamer-email", "lily@example.test");
    await view.submit();

    expect(screen.getByText(messages.gamerSignIn.emailTaken)).toBeTruthy();
    expect(
      screen.queryByText(messages.family.addGamerForm.genericError),
    ).toBeNull();
  });

  it("leaves every other failure with the one generic apology", async () => {
    onCreate.mockRejectedValue(new ApiError("boom", 500, undefined));

    const view = renderCard();
    view.fillDetails();
    await view.goToSignIn();
    view.chooseMode("email");
    view.fill("add-gamer-email", "lily@example.test");
    await view.submit();

    expect(
      screen.getByText(messages.family.addGamerForm.genericError),
    ).toBeTruthy();
  });
});

describe("the style guide's seam", () => {
  // `initial` is what lets four cards sit side by side in different states
  // rather than one card being driven through the flow.
  it("can open straight onto page two", () => {
    const view = render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <AddGamerFormCard
          onOpenChange={vi.fn()}
          onCreate={onCreate}
          initial={{ firstName: "Lily", signIn: "email", step: "signIn" }}
        />
      </NextIntlClientProvider>,
    );

    expect(view.container.querySelector("#add-gamer-email")).toBeTruthy();
    expect(
      screen.getByText(
        messages.gamerSignIn.question.replace("{name}", "Lily"),
      ),
    ).toBeTruthy();
  });

  // Nothing in this file should depend on the domain string, but the username
  // page's own copy must not leak it at the parent: they type a name, not an
  // address.
  it("never shows the synthetic domain to the parent", async () => {
    const view = renderCard();
    view.fillDetails();
    await view.goToSignIn();
    view.chooseMode("username");

    expect(view.container.textContent).not.toContain(GAMER_EMAIL_DOMAIN);
  });
});
