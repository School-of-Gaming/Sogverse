import { describe, it, expect, beforeEach, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { LocaleProvider, useLocaleControl } from "@/providers/locale-provider";
import type { Profile } from "@/types";
import type {
  SupportedLocale,
  DetectedLocale,
} from "@/lib/constants/locales";
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

// LocaleProvider reads the locale from useLocale() — next-intl's context,
// which under URL routing carries the locale the `[locale]` segment named.
// Tests render the provider in isolation, so stub it; a test that cares which
// language the reader is on overrides mockIntlLocale.value.
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
    mockRouter.replace.mockClear();
    mockRouter.push.mockClear();
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

  it("reports the locale the URL put on screen", () => {
    // The picker shows what the reader is actually looking at, which under URL
    // routing is what the `[locale]` segment said — never a re-derivation from
    // navigator.language (which disagrees with the sent Accept-Language on iOS
    // Safari) and never the profile.
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

  it("shows the URL's locale even when the profile says another", () => {
    // The property URL routing exists for: a signed-in reader whose profile
    // says Finnish opens somebody's shared French link. The page is French, so
    // the picker says French — the profile does not outrank the address bar.
    mockIntlLocale.value = "fr";
    mockAuth.profile = createMockProfile({ locale: "fi" });
    mockAuth.user = { id: "user-1" };

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

    expect(capturedLocale).toBe("fr");
  });

  it("writes no cookie and forces no refresh just for being rendered", () => {
    // **Reading is not choosing.** Visiting a prefixed URL must never persist
    // that locale, and the reader's stored preference must survive a visit to a
    // page in another language. The provider used to reconcile the cookie to
    // `profiles.locale` on mount and refresh after it; both are gone, and this
    // is what keeps them gone.
    document.cookie = "locale=fi;path=/";
    mockIntlLocale.value = "fr";
    mockAuth.profile = createMockProfile({ locale: "fi" });
    mockAuth.user = { id: "user-1" };

    render(
      <LocaleProvider detectedLocale="en">
        <div>child</div>
      </LocaleProvider>,
    );

    expect(getCookieValue("locale")).toBe("fi");
    expect(mockRefresh).not.toHaveBeenCalled();
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
    // One row per change. `toHaveBeenCalledWith` alone is blind to a second,
    // identical call — precisely the failure that would silently double the
    // headline number these events exist to produce.
    expect(mockTrack).toHaveBeenCalledTimes(1);
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
  });

  it("persists without navigating or refreshing — the picker owns the URL", () => {
    // `setLocale` is persistence and nothing else. The re-issue of the current
    // route under the new prefix belongs to the picker, which is the only
    // caller holding the pathname, its params and the query string; a refresh
    // here would be a second render of the page the reader is leaving.
    const setLocale = renderWithControl("en");

    act(() => setLocale("sv"));

    expect(getCookieValue("locale")).toBe("sv");
    expect(mockRefresh).not.toHaveBeenCalled();
    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(mockRouter.push).not.toHaveBeenCalled();
  });

  it("reports the locale on screen as `from`, not the profile's", () => {
    // A signed-in reader whose profile says Finnish is *looking at* Swedish,
    // because that is what the URL said. Reporting the profile here would
    // describe a correction the reader never made.
    mockIntlLocale.value = "sv";
    mockAuth.profile = createMockProfile({ locale: "fi" });
    mockAuth.user = { id: "user-1" };
    // A signed-in setLocale also PATCHes /api/user/locale. jsdom's fetch can't
    // resolve a relative URL, and the provider only console.errors the
    // rejection — so without this the test passes while printing a stack that
    // has nothing to do with what it asserts.
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(null));

    // Restored in a `finally`: neither vitest.config.mts nor tests/setup.ts
    // sets `restoreMocks`, so an assertion throwing above would leak the spy
    // into every test after it and bury the real failure.
    try {
      const setLocale = renderWithControl("en");

      act(() => setLocale("fr"));

      expect(mockTrack).toHaveBeenCalledWith("locale_change", {
        detected: "en",
        from: "sv",
        to: "fr",
      });
      expect(mockTrack).toHaveBeenCalledTimes(1);
    } finally {
      fetchMock.mockRestore();
    }
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
    expect(mockTrack).toHaveBeenCalledTimes(1);
  });
});
