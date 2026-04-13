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

const mockRefresh = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: mockRefresh,
    push: vi.fn(),
    replace: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

// Simulate SSR having rendered the English messages bundle.
vi.mock("next-intl", () => ({
  useLocale: () => "en",
}));

function clearCookies() {
  for (const cookie of document.cookie.split(";")) {
    const name = cookie.split("=")[0].trim();
    if (name) document.cookie = `${name}=;path=/;max-age=0`;
  }
}

function getCookieValue(name: string): string | undefined {
  const match = document.cookie.match(
    // eslint-disable-next-line security/detect-non-literal-regexp
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

  it("calls router.refresh() when the rendered locale differs from the profile", async () => {
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

  it("is a no-op when cookie and profile already agree", async () => {
    // Steady state: returning user, cookie already matches profile. The
    // provider must not write the cookie again or trigger a refresh — that
    // would add a redundant render on every page load.
    document.cookie = "locale=fi;path=/";
    mockAuth.profile = { locale: "fi" } as Profile;
    mockAuth.user = { id: "user-1" };

    render(
      <LocaleProvider>
        <div>child</div>
      </LocaleProvider>,
    );

    // Let any pending effects flush.
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(mockRefresh).not.toHaveBeenCalled();
    expect(getCookieValue("locale")).toBe("fi");
  });
});
