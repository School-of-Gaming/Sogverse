import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { GamerSignInCard } from "@/components/family";
import { ApiError } from "@/lib/api/api-error";
import type { GamerSignIn } from "@/types";

/**
 * **The card a parent uses to change how one of their children signs in — and,
 * without changing anything about the mode, to replace the one value that mode
 * is addressed by.**
 *
 * Three standing affordances exist alongside the mode form, and each is its own
 * submit because each is its own decision: a new password for a username-mode
 * child, a new username, a new address. The last two are the gap this file was
 * written for — before them, a parent who mistyped their child's address could
 * only fix it by switching the account to another mode and back, which destroys
 * and re-mints a credential to correct a typo.
 *
 * What is pinned:
 *
 *  - each standing write sends exactly one key. The route reads the account's
 *    stored mode and refuses the key that does not belong to it, so sending both
 *    would be sending one it is going to reject;
 *  - the value is normalised the same way the account will store it, so what a
 *    parent reads back to their child is what the child will type;
 *  - the two 409s land on the field the parent can fix, never in the generic
 *    apology;
 *  - the address block states the verification answer in words either way, and
 *    the per-gamer send allowance gets its own sentence rather than "try again".
 */

const mutateAsync = vi.fn<(args: unknown) => Promise<unknown>>();
const sendVerification = vi.fn<
  (
    gamerId: string,
    handlers: { onSuccess: () => void; onError: (error: Error) => void },
  ) => void
>();

vi.mock("@/services/gamers", () => ({
  // The codes are constants the card compares an ApiError against, so the mock
  // has to carry them rather than only the hooks.
  GAMER_USERNAME_TAKEN: "USERNAME_TAKEN",
  GAMER_EMAIL_TAKEN: "EMAIL_TAKEN",
  useUpdateGamer: () => ({ mutateAsync }),
  useSendGamerVerificationEmail: () => ({ mutate: sendVerification }),
}));

const GAMER_ID = "8c4f1e57-2d3a-4b19-95e6-7a0d1c2b3f48";
const COPY = messages.parent.gamerDetail.signIn;

function renderCard(props: {
  signIn: GamerSignIn;
  email?: string | null;
  emailVerifiedAt?: string | null;
}) {
  const view = render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <GamerSignInCard
        gamerId={GAMER_ID}
        firstName="Lily"
        signIn={props.signIn}
        email={props.email ?? null}
        emailVerifiedAt={props.emailVerifiedAt ?? null}
      />
    </NextIntlClientProvider>,
  );

  function field(id: string) {
    const input = view.container.querySelector<HTMLInputElement>(`#${id}`);
    if (!input) throw new Error(`no field #${id}`);
    return input;
  }

  return {
    ...view,
    field,
    fill(id: string, value: string) {
      fireEvent.change(field(id), { target: { value } });
    },
    /** Submit the form the given field belongs to. */
    submitAround: (id: string) =>
      act(async () => {
        const form = field(id).closest("form");
        if (!form) throw new Error(`#${id} is not inside a form`);
        fireEvent.submit(form);
      }),
    button: (label: string) => screen.getByRole("button", { name: label }),
  };
}

/** The single `updates` object the card sent. */
function sentUpdates(): unknown {
  expect(mutateAsync).toHaveBeenCalledTimes(1);
  const [args] = mutateAsync.mock.calls[0];
  if (typeof args !== "object" || args === null) {
    throw new Error("the mutation was not called with an object");
  }
  return Reflect.get(args, "updates");
}

beforeEach(() => {
  vi.clearAllMocks();
  mutateAsync.mockResolvedValue({});
});

describe("changing a username-mode child's username", () => {
  it("sends the username alone, normalised", async () => {
    const view = renderCard({
      signIn: "username",
      email: "lily2015@gamer.sogverse.internal",
    });

    view.fill("gamer-change-username", "Lily2016");
    await view.submitAround("gamer-change-username");

    expect(sentUpdates()).toEqual({ username: "lily2016" });
    expect(screen.getByText(COPY.change.username.saved)).toBeTruthy();
  });

  it("shows what the account holds today without prefilling it", () => {
    const view = renderCard({
      signIn: "username",
      email: "lily2015@gamer.sogverse.internal",
    });

    const input = view.field("gamer-change-username");
    expect(input.value).toBe("");
    expect(input.getAttribute("placeholder")).toBe("lily2015");
  });

  it("refuses a username the pattern would not accept, before any request", async () => {
    const view = renderCard({
      signIn: "username",
      email: "lily2015@gamer.sogverse.internal",
    });

    view.fill("gamer-change-username", "ab");
    await view.submitAround("gamer-change-username");

    expect(mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByText(messages.gamerSignIn.usernameInvalid)).toBeTruthy();
  });

  it("puts a taken username on the field rather than in the apology", async () => {
    mutateAsync.mockRejectedValue(
      new ApiError("taken", 409, "USERNAME_TAKEN"),
    );
    const view = renderCard({
      signIn: "username",
      email: "lily2015@gamer.sogverse.internal",
    });

    view.fill("gamer-change-username", "otso");
    await view.submitAround("gamer-change-username");

    expect(screen.getByText(messages.gamerSignIn.usernameTaken)).toBeTruthy();
    expect(screen.queryByText(COPY.saveFailed)).toBeNull();
  });

  it("is not offered to a child who signs in some other way", () => {
    const view = renderCard({ signIn: "email", email: "lily@example.test" });

    expect(view.container.querySelector("#gamer-change-username")).toBeNull();
  });
});

describe("changing an email-mode child's address", () => {
  it("sends the address alone, trimmed", async () => {
    const view = renderCard({ signIn: "email", email: "old@example.test" });

    view.fill("gamer-change-email", "  lily@example.test ");
    await view.submitAround("gamer-change-email");

    expect(sentUpdates()).toEqual({ email: "lily@example.test" });
    expect(screen.getByText(COPY.change.email.saved)).toBeTruthy();
  });

  // The parent has to know that saving a new address costs the child their
  // password: the route scrambles it, and the emailed link is how a new one is
  // set. A mechanism, checkable against what the write does.
  it("says the address is unverified and the old password stops working", () => {
    renderCard({ signIn: "email", email: "old@example.test" });

    expect(
      screen.getByText(
        COPY.change.email.description.replace("{name}", "Lily"),
      ),
    ).toBeTruthy();
  });

  it("refuses something that is not an address, before any request", async () => {
    const view = renderCard({ signIn: "email", email: "old@example.test" });

    view.fill("gamer-change-email", "lily");
    await view.submitAround("gamer-change-email");

    expect(mutateAsync).not.toHaveBeenCalled();
    expect(screen.getByText(messages.gamerSignIn.emailInvalid)).toBeTruthy();
  });

  it("puts a taken address on the field rather than in the apology", async () => {
    mutateAsync.mockRejectedValue(new ApiError("taken", 409, "EMAIL_TAKEN"));
    const view = renderCard({ signIn: "email", email: "old@example.test" });

    view.fill("gamer-change-email", "taken@example.test");
    await view.submitAround("gamer-change-email");

    expect(screen.getByText(messages.gamerSignIn.emailTaken)).toBeTruthy();
    expect(screen.queryByText(COPY.saveFailed)).toBeNull();
  });

  it("keeps the generic apology for every other failure", async () => {
    mutateAsync.mockRejectedValue(new ApiError("boom", 500, undefined));
    const view = renderCard({ signIn: "email", email: "old@example.test" });

    view.fill("gamer-change-email", "lily@example.test");
    await view.submitAround("gamer-change-email");

    expect(screen.getByText(COPY.saveFailed)).toBeTruthy();
  });

  it("is not offered to a child who signs in some other way", () => {
    const view = renderCard({ signIn: "parent" });

    expect(view.container.querySelector("#gamer-change-email")).toBeNull();
  });
});

describe("a switch-only child", () => {
  it("gets neither standing change form — there is no address or username to correct", () => {
    const view = renderCard({ signIn: "parent" });

    expect(view.container.querySelector("#gamer-change-username")).toBeNull();
    expect(view.container.querySelector("#gamer-change-email")).toBeNull();
  });
});

/**
 * The state the card lands in after an address change — the write clears the
 * verification stamp, so the next render is the unverified one with the resend
 * button. Rendered directly rather than driven through the write, because the
 * clearing happens in the database and arrives here as a refetched prop.
 */
describe("the address block after a change", () => {
  it("states the address is not yet verified and offers to send the link again", () => {
    renderCard({
      signIn: "email",
      email: "lily@example.test",
      emailVerifiedAt: null,
    });

    expect(
      screen.getByText(COPY.notVerified.replace("{name}", "Lily")),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: COPY.resend })).toBeTruthy();
  });

  it("states the answer the other way once the child has opened the link", () => {
    renderCard({
      signIn: "email",
      email: "lily@example.test",
      emailVerifiedAt: "2026-02-19T17:40:00.000Z",
    });

    expect(screen.getByText(COPY.verified)).toBeTruthy();
  });

  it("gives the spent send allowance its own sentence, not a retry", async () => {
    sendVerification.mockImplementation((_gamerId, handlers) => {
      handlers.onError(new ApiError("too many", 429, undefined));
    });
    const view = renderCard({ signIn: "email", email: "lily@example.test" });

    await act(async () => {
      view.button(COPY.resend).click();
    });

    expect(screen.getByText(COPY.resendRateLimited)).toBeTruthy();
    expect(screen.queryByText(COPY.resendFailed)).toBeNull();
  });
});

describe("the mode form itself", () => {
  it("has nothing to save until a different mode is chosen", () => {
    const view = renderCard({ signIn: "parent" });

    expect(view.button(messages.common.saveChanges).hasAttribute("disabled")).toBe(
      true,
    );
  });

  it("asks for a username and a password on the way into username mode", async () => {
    const view = renderCard({ signIn: "parent" });

    fireEvent.click(
      view.container.querySelector<HTMLInputElement>(
        'input[name="gamer-sign-in-mode"][value="username"]',
      )!,
    );

    view.fill("gamer-mode-username", "lily2015");
    view.fill("gamer-mode-password", "a-long-enough-password");
    await view.submitAround("gamer-mode-username");

    expect(sentUpdates()).toEqual({
      signIn: "username",
      username: "lily2015",
      password: "a-long-enough-password",
      email: undefined,
    });
  });
});
