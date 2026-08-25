import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render, waitFor } from "@testing-library/react";
import { LocaleProvider, useLocaleControl } from "@/providers/locale-provider";
import type { Profile } from "@/types";
import type { SupportedLocale } from "@/lib/constants/locales";
import type { DetectedLocale } from "@/lib/analytics";
import { createMockProfile } from "../../mocks/supabase";

// Shared mock state for useAuth — updated per test via mockAuth.*
const mockAuth = vi.hoisted(() => ({
  profile: null as Profile | null,
  user: null as { id: string } | null,
  refreshProfile: vi.fn(),
}));

vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => mockAuth,
}));

// LocaleProvider seeds its initial state from useLocale() (the server-
// resolved locale exposed by NextIntlClientProvider). Tests render the
// provider in isolation, so stub useLocale to return the default; tests
// that care about a specific seed value can override mockIntlLocale.value.
const mockIntlLocale = vi.hoisted(() => ({ value: "en" }));
vi.mock("next-intl", () => ({
  useLocale: () => mockIntlLocale.value,
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

// The provider reports locale changes through @/lib/analytics, which is a thin
// wrapper over Vercel's `track`. Mocking the wire call rather than the wrapper
// keeps the event name and property shape under test — those are the contract
// the analytics dashboard reads, and a mocked wrapper would hide a rename.
const mockTrack = vi.hoisted(() => vi.fn());
vi.mock("@vercel/analytics", () => ({
  track: mockTrack,
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
    mockIntlLocale.value = "en";
    mockRefresh.mockClear();
    mockTrack.mockClear();
  });

  /**
   * Render the provider and hand back its `setLocale`, so a test can drive a
   * locale change the way the picker does.
   */
  function renderWithControl(detectedLocale: DetectedLocale) {
    let setLocale: ((next: SupportedLocale) => void) | undefined;
    function Capture() {
      setLocale = useLocaleControl().setLocale;
      return null;
    }

    render(
      <LocaleProvider detectedLocale={detectedLocale}>
        <Capture />
      </LocaleProvider>,
    );

    if (!setLocale) throw new Error("LocaleProvider did not expose setLocale");
    return setLocale;
  }

  it("seeds the locale from the server-resolved useLocale() value", () => {
    // Regression: on iOS Safari, navigator.language can disagree with the
    // Accept-Language the browser actually sent (e.g. system Finnish but
    // navigator.language reports "en-US"). The server resolves correctly
    // from Accept-Language, so the client must trust useLocale() rather
    // than re-deriving from navigator. Without this, the page rendered in
    // Finnish but the LocalePicker showed the EN flag on first paint.
    mockIntlLocale.value = "fi";

    let capturedLocale: string | undefined;
    function Capture() {
      capturedLocale = useLocaleControl().locale;
      return null;
    }

    render(
      <LocaleProvider detectedLocale="en">
        <Capture />
      </LocaleProvider>,
    );

    expect(capturedLocale).toBe("fi");
  });

  it("syncs the cookie to profile.locale when they disagree on mount", async () => {
    // Simulates a user signing in on a fresh device. The profile says "fi"
    // (set previously on another device) but the current browser has an "en"
    // cookie (from Accept-Language fallback during SSR). On mount, the
    // provider should reconcile the cookie to match the profile so the next
    // SSR render loads the right messages bundle.
    document.cookie = "locale=en;path=/";
    mockAuth.profile = createMockProfile({ locale: "fi" });
    mockAuth.user = { id: "user-1" };

    render(
      <LocaleProvider detectedLocale="en">
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
    mockAuth.profile = createMockProfile({ locale: "fi" });
    mockAuth.user = { id: "user-1" };

    render(
      <LocaleProvider detectedLocale="en">
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
    mockAuth.profile = createMockProfile({ locale: "fi" });
    mockAuth.user = { id: "user-1" };

    // render() is wrapped in act(), so mount effects are flushed before it
    // returns. No timers needed.
    render(
      <LocaleProvider detectedLocale="en">
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
    mockAuth.profile = createMockProfile({ locale: "en" });
    mockAuth.user = { id: "user-1" };

    const { rerender } = render(
      <LocaleProvider detectedLocale="en">
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
      <LocaleProvider detectedLocale="en">
        <div>child</div>
      </LocaleProvider>,
    );

    // The cookie must still be "sv" — not rolled back to "en".
    expect(getCookieValue("locale")).toBe("sv");
  });

  it("reports a locale change with what the browser guessed, what was showing, and what was picked", () => {
    // What the three properties are for: this row says the browser negotiated
    // English, English is what the user was looking at, and they chose Finnish
    // — a first correction of a guess that was wrong for them.
    const setLocale = renderWithControl("en");

    act(() => setLocale("fi"));

    expect(mockTrack).toHaveBeenCalledWith("locale_change", {
      detected: "en",
      from: "en",
      to: "fi",
    });
  });

  it("does not report a change when the picked locale is already showing", () => {
    // The picker lets you click the entry that is already active. That is not
    // a change, and a from === to row would dilute the matrix — but the rest of
    // setLocale still has to run, because this feature adds an event and must
    // not alter what the picker does.
    const setLocale = renderWithControl("en");

    act(() => setLocale("en"));

    expect(mockTrack).not.toHaveBeenCalled();
    expect(getCookieValue("locale")).toBe("en");
    expect(mockRefresh).toHaveBeenCalled();
  });

  it("reports the profile-derived locale as `from`, not the local state", () => {
    // A signed-in user whose profile says Swedish is *looking at* Swedish even
    // though local state was seeded with English (profile outranks state).
    // Reporting the state here would invent a from === detected row, making a
    // second, later change look like a first correction of the browser guess.
    mockAuth.profile = createMockProfile({ locale: "sv" });
    mockAuth.user = { id: "user-1" };
    // A signed-in setLocale also PATCHes /api/user/locale. jsdom's fetch can't
    // resolve a relative URL, and the provider only console.errors the
    // rejection — so without this the test passes while printing a stack that
    // has nothing to do with what it asserts.
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null));

    const setLocale = renderWithControl("en");

    act(() => setLocale("fr"));

    expect(mockTrack).toHaveBeenCalledWith("locale_change", {
      detected: "en",
      from: "sv",
      to: "fr",
    });

    fetchMock.mockRestore();
  });

  it('reports detected as "none" when the browser asked for nothing we ship', () => {
    // A German-only browser. The page still renders in English, but the event
    // must not claim English was *detected* — this visitor picking French is a
    // locale we do not ship, which is a different finding from a bad guess.
    const setLocale = renderWithControl("none");

    act(() => setLocale("fr"));

    expect(mockTrack).toHaveBeenCalledWith("locale_change", {
      detected: "none",
      from: "en",
      to: "fr",
    });
  });
});
