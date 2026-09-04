import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render } from "@testing-library/react";

/**
 * **One field, two kinds of value, and the rule that tells them apart.**
 *
 * A child in `username` mode signs in with a name their parent chose; every
 * adult signs in with an address. Both end up as an email + password call
 * against GoTrue, because a username-mode account's address *is* the username
 * with our synthetic domain glued on — so the whole of the decision is which of
 * the two the person typed, and it is made by the presence of an `@`.
 *
 * The direction matters and is pinned both ways. Guessing username-first would
 * rewrite a short lowercase real address into a handle nobody holds and tell its
 * owner their password was wrong, which is the failure that would be hardest to
 * report and hardest to reproduce.
 *
 * Translations echo their keys, so the assertions here are about which key the
 * form reaches for rather than about wording in `messages/`.
 */

/**
 * A local Supabase stub rather than the shared one from `tests/setup.ts`.
 *
 * The shared client's `from()` chain is typed by its own factory and its
 * `single()` resolves undefined, which this form destructures — so shaping it
 * for the role lookup that follows a successful sign-in means fighting its type.
 * The form touches exactly two things, so declaring both here is smaller than
 * bending the shared one, and it keeps the sign-in call the only mock this file
 * reads.
 */
const signInWithPassword = vi.fn<
  (credentials: { email: string; password: string }) => Promise<unknown>
>();
const profileRole = { data: { role: "customer" } as { role: string } | null };

vi.mock("@/lib/supabase/client", () => ({
  getClient: () => ({
    auth: { signInWithPassword },
    from: () => ({
      select: () => ({
        eq: () => ({ single: () => Promise.resolve(profileRole) }),
      }),
    }),
  }),
}));

vi.mock("next-intl", () => ({
  useTranslations: () => {
    const t = (key: string) => key;
    t.rich = (key: string) => key;
    return t;
  },
  useLocale: () => "en",
}));

vi.mock("@/providers", () => ({
  useAuth: () => ({
    freezeUntilNavigation: vi.fn(),
    unfreezeAuthState: vi.fn(),
  }),
}));

const mockNavigateAfterAuth = vi.fn();
vi.mock("@/hooks/use-auth-redirect", () => ({
  useAuthRedirect: () => ({
    redirect: null,
    status: null,
    navigateAfterAuth: (...args: unknown[]) => mockNavigateAfterAuth(...args),
  }),
}));

import { LoginForm } from "@/components/auth/login-form";
import { GAMER_EMAIL_DOMAIN } from "@/lib/gamer-sign-in";

function renderForm() {
  const view = render(<LoginForm redirect={null} />);
  const form = view.container.querySelector("form");
  if (!form) throw new Error("no form");

  return {
    ...view,
    fill(id: string, value: string) {
      const input = view.container.querySelector<HTMLInputElement>(`#${id}`);
      if (!input) throw new Error(`no field #${id}`);
      fireEvent.change(input, { target: { value } });
    },
    submit: () =>
      act(async () => {
        fireEvent.submit(form);
      }),
  };
}

/** The address the form actually handed Supabase. */
function signedInWith(): string {
  expect(signInWithPassword).toHaveBeenCalledTimes(1);
  return signInWithPassword.mock.calls[0][0].email;
}

beforeEach(() => {
  vi.clearAllMocks();
  signInWithPassword.mockResolvedValue({
    data: { user: { id: "3f2b1c90-6a4e-4d21-9f77-0c8b5a1e2d34" } },
    error: null,
  });
});

describe("what the login form signs in with", () => {
  it("passes an address through untouched", async () => {
    const view = renderForm();
    view.fill("identifier", "parent@example.test");
    view.fill("password", "a-long-enough-password");
    await view.submit();

    expect(signedInWith()).toBe("parent@example.test");
  });

  it("resolves a bare username to the synthetic address behind it", async () => {
    const view = renderForm();
    view.fill("identifier", "lily2015");
    view.fill("password", "a-long-enough-password");
    await view.submit();

    expect(signedInWith()).toBe(`lily2015${GAMER_EMAIL_DOMAIN}`);
  });

  it("folds and trims a username on the way, so one typed name is one account", async () => {
    const view = renderForm();
    view.fill("identifier", "  Lily2015 ");
    view.fill("password", "a-long-enough-password");
    await view.submit();

    expect(signedInWith()).toBe(`lily2015${GAMER_EMAIL_DOMAIN}`);
  });

  // The regression a username-first guess would have caused.
  it("does not mistake a short lowercase address for a username", async () => {
    const view = renderForm();
    view.fill("identifier", "aino@sog.gg");
    view.fill("password", "a-long-enough-password");
    await view.submit();

    expect(signedInWith()).toBe("aino@sog.gg");
  });

  it("refuses an empty identifier before any network call", async () => {
    const view = renderForm();
    view.fill("password", "a-long-enough-password");
    await view.submit();

    expect(signInWithPassword).not.toHaveBeenCalled();
    expect(view.container.textContent).toContain(
      "login.errors.identifierRequired",
    );
  });

  // GoTrue answers `invalid_credentials` to a username nobody holds, an address
  // nobody holds and a right identifier with a wrong password alike. Telling
  // them apart on screen would be an oracle for which handles exist, so all
  // three get one sentence — pinned from both ends, since a form that only ever
  // printed one message would pass either case alone.
  it("answers a username nobody holds with the one failure sentence", async () => {
    signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { code: "invalid_credentials", message: "Invalid login credentials" },
    });

    const view = renderForm();
    view.fill("identifier", "nobody");
    view.fill("password", "a-long-enough-password");
    await view.submit();

    expect(view.container.textContent).toContain(
      "login.errors.invalidCredentials",
    );
  });

  it("answers a wrong password with that same sentence", async () => {
    signInWithPassword.mockResolvedValue({
      data: { user: null },
      error: { code: "invalid_credentials", message: "Invalid login credentials" },
    });

    const view = renderForm();
    view.fill("identifier", "parent@example.test");
    view.fill("password", "the-wrong-password");
    await view.submit();

    expect(view.container.textContent).toContain(
      "login.errors.invalidCredentials",
    );
  });

  // A username has no `@`, so `type="email"` would have the browser refuse the
  // form before the handler ever ran.
  it("does not let the browser's own email validation refuse a username", () => {
    const view = renderForm();
    const input = view.container.querySelector<HTMLInputElement>("#identifier");
    expect(input?.getAttribute("type")).toBe("text");
    expect(input?.getAttribute("inputmode")).toBe("email");
    expect(input?.getAttribute("autocomplete")).toBe("username");
  });
});
