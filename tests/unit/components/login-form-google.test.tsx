import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { mockSupabaseClient } from "../../setup";

/**
 * **The login form's Google button.** It hands the document to Google through
 * `signInWithOAuth`, with a `redirectTo` on the origin the page is on — the
 * PKCE verifier cookie lives there, so the callback has to come back to it —
 * and it stays disabled from the press until the page unloads.
 *
 * Translations echo their keys, so the assertions are about which key the form
 * reaches for rather than about wording in `messages/`.
 */

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

let safeRedirect: string | null = null;
vi.mock("@/hooks/use-auth-redirect", () => ({
  useAuthRedirect: () => ({
    redirect: safeRedirect,
    safeRedirect,
    status: null,
    navigateAfterAuth: vi.fn(),
  }),
}));

import { LoginForm } from "@/components/auth/login-form";

const signInWithOAuth = vi.mocked(mockSupabaseClient.auth.signInWithOAuth);

function googleButton(): HTMLButtonElement {
  return screen.getByRole("button", { name: "continue" });
}

/** The `redirectTo` the form handed Supabase, parsed. */
function redirectTo(): URL {
  expect(signInWithOAuth).toHaveBeenCalledTimes(1);
  const [args] = signInWithOAuth.mock.calls[0];
  expect(args.provider).toBe("google");
  const target = args.options?.redirectTo;
  if (!target) throw new Error("no redirectTo");
  return new URL(target);
}

beforeEach(() => {
  vi.clearAllMocks();
  safeRedirect = null;
  // Supabase navigates away on success, so the promise's value is never
  // read; a pending redirect is what the page sees.
  signInWithOAuth.mockResolvedValue({
    data: { provider: "google", url: "https://accounts.google.test" },
    error: null,
  });
});

describe("the login form's Google button", () => {
  it("sends the browser to Google, back to the callback on this origin", async () => {
    render(<LoginForm redirect={null} />);

    await act(async () => {
      fireEvent.click(googleButton());
    });

    const target = redirectTo();
    expect(target.origin).toBe(window.location.origin);
    expect(target.pathname).toBe("/api/auth/callback");
    // No safe `?redirect=`, so the callback routes by role.
    expect(target.searchParams.has("next")).toBe(false);
  });

  it("stays disabled after the press, and holds the password submit too", async () => {
    render(<LoginForm redirect={null} />);

    await act(async () => {
      fireEvent.click(googleButton());
    });

    expect(googleButton().disabled).toBe(true);
    expect(screen.getByRole("button", { name: "signIn" }).hasAttribute("disabled")).toBe(true);
  });

  it("carries the page's safe redirect as next", async () => {
    safeRedirect = "/fi/kauppa/abc-123";
    render(<LoginForm redirect={safeRedirect} />);

    await act(async () => {
      fireEvent.click(googleButton());
    });

    expect(redirectTo().searchParams.get("next")).toBe("/fi/kauppa/abc-123");
  });

  it("re-enables and shows an error when Supabase refuses before redirecting", async () => {
    signInWithOAuth.mockResolvedValue({
      data: { provider: "google", url: null },
      error: new Error("provider disabled"),
    });
    render(<LoginForm redirect={null} />);

    await act(async () => {
      fireEvent.click(googleButton());
    });

    expect(screen.getByText("failed")).toBeTruthy();
    expect(googleButton().disabled).toBe(false);
  });
});

describe("a failed Google sign-in bounced back to /login", () => {
  it("shows the callback's refusal from the first paint", () => {
    render(<LoginForm redirect={null} oauthError="google_gamer" />);

    expect(screen.getByText("login.errors.googleGamer")).toBeTruthy();
  });

  it("shows nothing without a code", () => {
    render(<LoginForm redirect={null} />);

    expect(screen.queryByRole("alert")).toBeNull();
  });
});
