import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { mockSupabaseClient } from "../../setup";

/**
 * **The Gedu register page's Google button asks for the Gedu finish page.** A
 * Google account arrives with none of the fields on the form, so the callback
 * sends a new one to the finish page — and only a `next` carrying `as=gedu`
 * gets the Gedu variant of it.
 *
 * The wrapped navigation mock builds paths with no locale prefix, so the
 * assertion is about the route and its query, not the language.
 */

vi.mock("next-intl", () => ({
  useTranslations: () => {
    const t = (key: string) => key;
    t.rich = (key: string) => key;
    return t;
  },
  useLocale: () => "fi",
}));

vi.mock("@/providers", () => ({
  useAuth: () => ({
    freezeUntilNavigation: vi.fn(),
    unfreezeAuthState: vi.fn(),
  }),
  useUtm: () => ({ source: null, medium: null, campaign: null }),
}));

vi.mock("@/hooks/use-auth-redirect", () => ({
  useAuthRedirect: () => ({
    redirect: null,
    safeRedirect: null,
    status: null,
    navigateAfterAuth: vi.fn(),
  }),
}));

// The fields this file is not about, and whose own dependencies (a phone
// library, the locations table, the game-account lookups) it has no use for.
vi.mock("@/components/gedu/coverage-areas-field", () => ({
  CoverageAreasField: () => <div />,
}));
vi.mock("@/components/ui/phone-input", () => ({
  InternationalPhoneInput: () => <div />,
}));
vi.mock("@/components/ui/spoken-language-checkboxes", () => ({
  SpokenLanguageCheckboxes: () => <div />,
}));
vi.mock("@/components/game-account", () => ({
  GAME_PLATFORMS: {
    minecraft: { name: "Minecraft" },
    roblox: { name: "Roblox" },
  },
  GameUsernameEditableRow: () => <div />,
}));

import { RegisterGeduForm } from "@/components/auth/register-gedu-form";

const signInWithOAuth = vi.mocked(mockSupabaseClient.auth.signInWithOAuth);

beforeEach(() => {
  vi.clearAllMocks();
  signInWithOAuth.mockResolvedValue({
    data: { provider: "google", url: "https://accounts.google.test" },
    error: null,
  });
});

describe("the Gedu register page's Google button", () => {
  it("sends the Gedu finish page as next", async () => {
    render(<RegisterGeduForm redirect={null} />);

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "continue" }));
    });

    expect(signInWithOAuth).toHaveBeenCalledTimes(1);
    const [args] = signInWithOAuth.mock.calls[0];
    expect(args.provider).toBe("google");
    const target = new URL(args.options.redirectTo);
    expect(target.origin).toBe(window.location.origin);
    expect(target.pathname).toBe("/api/auth/callback");

    const next = target.searchParams.get("next");
    if (!next) throw new Error("no next");
    const nextUrl = new URL(next, "https://internal.invalid");
    expect(nextUrl.pathname).toBe("/complete-registration");
    expect(nextUrl.searchParams.get("as")).toBe("gedu");
  });

  it("says the account is finished on the next page", () => {
    render(<RegisterGeduForm redirect={null} />);

    expect(screen.getByText("google.finishNote")).toBeTruthy();
  });
});
