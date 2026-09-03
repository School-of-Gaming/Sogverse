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
 * **The add-gamer form asks one more question than it used to, and the default
 * answer has to cost nothing.**
 *
 * Three things are pinned here, and the first is the one a regression would be
 * quietest about: a parent who wants the switch-only account every gamer used to
 * get must still fill one page and press one button. A second page appearing for
 * everybody would be the feature taxing the case it was not built for.
 *
 * The other two are the credential page itself — reached only by choosing a
 * mode, carrying only that mode's fields, and sending only those — and the two
 * refusals the server alone can make, which have to land on the field the parent
 * can fix rather than in the generic banner.
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
    chooseMode(mode: string) {
      const radio = view.container.querySelector<HTMLInputElement>(
        `input[name="add-gamer-sign-in"][value="${mode}"]`,
      );
      if (!radio) throw new Error(`no ${mode} radio`);
      fireEvent.click(radio);
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
    submit: () =>
      act(async () => {
        fireEvent.submit(form);
      }),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  onCreate.mockResolvedValue({ gamerId: "1a8e1e2a-32f6-4c6f-9a6a-9d0f2a1b7c44" });
});

describe("the default mode is still one page and one click", () => {
  it("offers the create button, not a Next, before anything is chosen", () => {
    const view = renderCard();

    expect(view.affirmative().textContent).toContain(ADD_GAMER);
  });

  it("creates a switch-only child from page one with no credential fields", async () => {
    const view = renderCard();
    view.fillDetails();
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
});

describe("choosing a mode that needs a credential", () => {
  it("turns the create button into a Next", () => {
    const view = renderCard();
    view.chooseMode("username");

    expect(view.affirmative().textContent).toContain(NEXT);
  });

  it("still refuses page one's own rules before advancing", async () => {
    const view = renderCard();
    view.chooseMode("username");
    await view.submit();

    // No name, so the parent never reaches a page asking for a password on
    // behalf of a child the first page was going to refuse anyway.
    expect(
      screen.getByText(messages.family.addGamerForm.firstNameTooShort),
    ).toBeTruthy();
    expect(view.container.querySelector("#add-gamer-username")).toBeNull();
  });

  it("swaps to the username page, which asks for a name and a password only", async () => {
    const view = renderCard();
    view.fillDetails();
    view.chooseMode("username");
    await view.submit();

    expect(view.field("add-gamer-username")).toBeTruthy();
    expect(view.field("add-gamer-password")).toBeTruthy();
    expect(view.container.querySelector("#add-gamer-email")).toBeNull();
    expect(view.affirmative().textContent).toContain(ADD_GAMER);
    expect(view.negative(BACK)).toBeTruthy();
    expect(onCreate).not.toHaveBeenCalled();
  });

  it("swaps to the email page, which asks for an address and nothing else", async () => {
    const view = renderCard();
    view.fillDetails();
    view.chooseMode("email");
    await view.submit();

    expect(view.field("add-gamer-email")).toBeTruthy();
    expect(view.container.querySelector("#add-gamer-username")).toBeNull();
    expect(view.container.querySelector("#add-gamer-password")).toBeNull();
  });

  it("goes back to page one without creating anything", async () => {
    const view = renderCard();
    view.fillDetails();
    view.chooseMode("username");
    await view.submit();

    await act(async () => {
      view.negative(BACK).click();
    });

    expect(view.field("add-gamer-first-name")).toBeTruthy();
    expect(onCreate).not.toHaveBeenCalled();
  });

  // The password is chosen BY a parent FOR a child and read out loud, so
  // masking it hides it from the one person it is being written for.
  it("shows the password in clear, and asks for it only once", async () => {
    const view = renderCard();
    view.fillDetails();
    view.chooseMode("username");
    await view.submit();

    expect(view.field("add-gamer-password").getAttribute("type")).toBe("text");
    expect(view.container.querySelector("#add-gamer-confirm-password")).toBeNull();
  });
});

describe("what the credential page sends", () => {
  it("sends a normalised username and its password, and no address", async () => {
    const view = renderCard();
    view.fillDetails();
    view.chooseMode("username");
    await view.submit();

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
    view.chooseMode("email");
    await view.submit();

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
    view.chooseMode("username");
    await view.submit();

    view.fill("add-gamer-username", "ab");
    view.fill("add-gamer-password", "a-long-enough-password");
    await view.submit();

    expect(onCreate).not.toHaveBeenCalled();
    expect(screen.getByText(messages.gamerSignIn.usernameInvalid)).toBeTruthy();
  });

  it("refuses a password below the account floor", async () => {
    const view = renderCard();
    view.fillDetails();
    view.chooseMode("username");
    await view.submit();

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
    view.chooseMode("username");
    await view.submit();
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
    view.chooseMode("email");
    await view.submit();
    view.fill("add-gamer-email", "lily@example.test");
    await view.submit();

    expect(screen.getByText(messages.gamerSignIn.emailTaken)).toBeTruthy();
  });

  it("leaves every other failure with the one generic apology", async () => {
    onCreate.mockRejectedValue(new ApiError("boom", 500, undefined));

    const view = renderCard();
    view.fillDetails();
    view.chooseMode("email");
    await view.submit();
    view.fill("add-gamer-email", "lily@example.test");
    await view.submit();

    expect(
      screen.getByText(messages.family.addGamerForm.genericError),
    ).toBeTruthy();
  });
});

describe("the style guide's seam", () => {
  // `initial` is what lets three cards sit side by side in different states
  // rather than one card being driven through the flow.
  it("can open straight onto a credential page", () => {
    const view = render(
      <NextIntlClientProvider locale="en" messages={messages}>
        <AddGamerFormCard
          onOpenChange={vi.fn()}
          onCreate={onCreate}
          initial={{ firstName: "Lily", signIn: "email", step: "credentials" }}
        />
      </NextIntlClientProvider>,
    );

    expect(view.container.querySelector("#add-gamer-email")).toBeTruthy();
  });

  // Nothing in this file should depend on the domain string, but the username
  // page's own copy must not leak it at the parent: they type a name, not an
  // address.
  it("never shows the synthetic domain to the parent", async () => {
    const view = renderCard();
    view.fillDetails();
    view.chooseMode("username");
    await view.submit();

    expect(view.container.textContent).not.toContain(GAMER_EMAIL_DOMAIN);
  });
});
