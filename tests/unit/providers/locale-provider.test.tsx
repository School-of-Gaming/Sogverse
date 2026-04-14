import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";
import { LocaleProvider } from "@/providers/locale-provider";
import type { Profile } from "@/types";

// Shared mock state for useAuth — updated per test via mockAuth.*
const mockAuth = vi.hoisted(() => ({
  profile: null as Profile | null,
  user: null as { id: string } | null,
  refreshProfile: vi.fn(),
}));

vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => mockAuth,
}));

// The real next/navigation useRouter returns a stable object across renders.
// Returning a fresh literal each call would make it look like a changed
// dependency to every effect that closes over `router`, which doesn't match
// production behavior.
const mockRouter = vi.hoisted(() => ({
  refresh: vi.fn(),
  push: vi.fn(),
  replace: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  prefetch: vi.fn(),
}));
const mockRefresh = mockRouter.refresh;

vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));


function clearCookies() {
  for (const cookie of document.cookie.split(";")) {
    const name = cookie.split("=")[0].trim();
    if (name) document.cookie = `${name}=;path=/;max-age=0`;
  }
}

function getCookieValue(name: string): string | undefined {
  const match = document.cookie.match(
    // eslint-disable-next-line security/detect-non-literal-regexp -- test helper; `name` is always a hardcoded cookie name in the test, never user input
    new RegExp(`(?:^|; )${name}=([^;]*)`),
  );
  return match ? decodeURIComponent(match[1]) : undefined;
}

describe("LocaleProvider", () => {
  beforeEach(() => {
    clearCookies();
    mockAuth.profile = null;
    mockAuth.user = null;
    mockRefresh.mockClear();
  });

  it("syncs the cookie to profile.locale when they disagree on mount", async () => {
    // Simulates a user signing in on a fresh device. The profile says "fi"
    // (set previously on another device) but the current browser has an "en"
    // cookie (from Accept-Language fallback during SSR). On mount, the
    // provider should reconcile the cookie to match the profile so the next
    // SSR render loads the right messages bundle.
    document.cookie = "locale=en;path=/";
    mockAuth.profile = { locale: "fi" } as Profile;
    mockAuth.user = { id: "user-1" };

    render(
      <LocaleProvider>
        <div>child</div>
      </LocaleProvider>,
    );

    await waitFor(() => {
      expect(getCookieValue("locale")).toBe("fi");
    });
  });

  it("calls router.refresh() after writing the cookie so SSR picks up the new bundle", async () => {
    // Same scenario as above — the SSR-rendered messages bundle is English
    // but the profile is Finnish. Writing the cookie alone isn't enough; the
    // currently-loaded messages bundle won't flip until next-intl re-runs.
    // The provider must explicitly trigger a re-render.
    document.cookie = "locale=en;path=/";
    mockAuth.profile = { locale: "fi" } as Profile;
    mockAuth.user = { id: "user-1" };

    render(
      <LocaleProvider>
        <div>child</div>
      </LocaleProvider>,
    );

    await waitFor(() => {
      expect(mockRefresh).toHaveBeenCalled();
    });
  });

  it("is a no-op when cookie and profile already agree", () => {
    // Steady state: returning user, cookie already matches profile. The
    // provider must not write the cookie again or trigger a refresh — that
    // would add a redundant render on every page load.
    document.cookie = "locale=fi;path=/";
    mockAuth.profile = { locale: "fi" } as Profile;
    mockAuth.user = { id: "user-1" };

    // render() is wrapped in act(), so mount effects are flushed before it
    // returns. No timers needed.
    render(
      <LocaleProvider>
        <div>child</div>
      </LocaleProvider>,
    );

    expect(mockRefresh).not.toHaveBeenCalled();
    expect(getCookieValue("locale")).toBe("fi");
  });

  it("does not roll the cookie back mid-flight when setLocale is in progress", () => {
    // Regression: when the user picks a new locale in the picker,
    // setLocale() writes the cookie and calls router.refresh(). The cookie
    // flips synchronously, but refreshProfile() is async — so for a moment
    // the cookie says "sv" while profile.locale still says "en". The
    // reconcile effect must not interpret this as drift and roll the
    // cookie back to the stale profile value on the next re-render.
    document.cookie = "locale=en;path=/";
    mockAuth.profile = { locale: "en" } as Profile;
    mockAuth.user = { id: "user-1" };

    const { rerender } = render(
      <LocaleProvider>
        <div>child</div>
      </LocaleProvider>,
    );

    // Mount reconcile already ran inside render()'s act() — everything
    // agrees, nothing written.
    expect(getCookieValue("locale")).toBe("en");

    // Simulate setLocale("sv"): the cookie is written, but profile hasn't
    // been refreshed yet so profileLocale stays "en". rerender() is wrapped
    // in act(), so any effect commits before rerender() returns.
    document.cookie = "locale=sv;path=/";

    rerender(
      <LocaleProvider>
        <div>child</div>
      </LocaleProvider>,
    );

    // The cookie must still be "sv" — not rolled back to "en".
    expect(getCookieValue("locale")).toBe("sv");
  });
});
