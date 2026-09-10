import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { LocalePicker } from "@/components/layout/locale-picker";
import { LocaleProvider } from "@/providers/locale-provider";
import {
  SUPPORTED_LOCALES,
  type DetectedLocale,
} from "@/lib/constants/locales";
import type { Profile } from "@/types";

/**
 * **`locale_picker_open` is a wire contract, and nothing else in the suite
 * spells it.** The event name and its two property keys are read by a Vercel
 * Analytics dashboard that this repo cannot type-check against: a typo in
 * `"locale_picker_open"`, or a rename of `current`, compiles, ships, and
 * surfaces months later as a chart that was always empty. So the strings are
 * written out here rather than imported from the component.
 *
 * The other half of what these tests pin is the *once*: this event is what
 * separates "never noticed the selector" from "noticed it and stayed" for a
 * visitor who never changes locale, so a second row per look would inflate
 * exactly the number it exists to produce.
 */

// The picker renders inside LocaleProvider, which reads useAuth(). Signed out
// is the shape these tests want — no profile locale to outrank the seed.
const mockAuth = vi.hoisted(() => ({
  profile: null as Profile | null,
  user: null as { id: string } | null,
  refreshProfile: vi.fn(),
}));

vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => mockAuth,
}));

// Mock the wire call, not the `trackLocalePickerOpen` wrapper: the wrapper is
// where a rename would happen, so mocking it would hide the very thing under
// test. Same reasoning as tests/unit/providers/locale-provider.test.tsx.
const mockTrack = vi.hoisted(() => vi.fn());
vi.mock("@vercel/analytics", () => ({
  track: mockTrack,
}));

/**
 * Where the reader currently is, as the two navigation modules report it: the
 * wrapped `usePathname` hands back the internal *template*, `useParams()` the
 * concrete values that filled it, and `useSearchParams()` the query. A test
 * that moves the reader sets these; the default is a dynamic route with a
 * query, because that is the case the three pieces exist for.
 */
const mockLocation = vi.hoisted(() => ({
  pathname: "/shop/[id]",
  params: {} as Record<string, string | string[]>,
  search: "",
}));

const mockRouter = vi.hoisted(() => ({
  replace: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  prefetch: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => mockRouter,
  useParams: () => mockLocation.params,
  useSearchParams: () => new URLSearchParams(mockLocation.search),
  usePathname: () => "/",
}));

// `getPathname` is next-intl's own compiler from the pathnames map, and this
// mock stands in for it so the assertions can read *what the picker asked for*
// — the route, its params, its query and the target locale. The map's own
// translation is next-intl's job and is covered where the map is.
const mockGetPathname = vi.hoisted(() =>
  vi.fn(() => "/fi/kauppa/abc?category=camps"),
);

vi.mock("@/i18n/navigation", () => ({
  usePathname: () => mockLocation.pathname,
  getPathname: mockGetPathname,
}));

const TOGGLE_LABEL = messages.common.selectLanguage;
// Closed, the picker is its toggle alone; open, it is the toggle plus one row
// per locale. Counting buttons keeps "is the dropdown showing?" independent of
// how any single row is labelled — the flag components contribute their own
// titles to a row's accessible name, so matching on one language's name is a
// fight with the flag registry rather than a check on the dropdown.
const CLOSED_BUTTONS = 1;
const OPEN_BUTTONS = CLOSED_BUTTONS + SUPPORTED_LOCALES.length;

function renderPicker(detectedLocale: DetectedLocale) {
  return render(
    // The real next-intl provider, so useLocale() seeds the provider with "en"
    // and the picker's aria-label comes from the shipped messages.
    <NextIntlClientProvider locale="en" messages={messages}>
      <LocaleProvider detectedLocale={detectedLocale}>
        <LocalePicker />
      </LocaleProvider>
    </NextIntlClientProvider>,
  );
}

function toggle() {
  return screen.getByRole("button", { name: TOGGLE_LABEL });
}

describe("LocalePicker open event", () => {
  beforeEach(() => {
    mockTrack.mockClear();
  });

  it("reports what the browser guessed and what is on screen when the dropdown opens", () => {
    // Detected Finnish, showing English: the two properties carry different
    // values, so a swap of the keys cannot pass.
    renderPicker("fi");

    expect(mockTrack).not.toHaveBeenCalled();

    fireEvent.click(toggle());

    // The dropdown really opened — otherwise the assertion below would be
    // pinning an event fired by nothing the user can see.
    expect(screen.getAllByRole("button")).toHaveLength(OPEN_BUTTONS);
    expect(mockTrack).toHaveBeenCalledWith("locale_picker_open", {
      detected: "fi",
      current: "en",
    });
    expect(mockTrack).toHaveBeenCalledTimes(1);
  });

  it("does not fire a second time when the dropdown is closed again", () => {
    // Closing is not a second look. The toggle sits inside the ref that
    // useClickOutside watches, so the outside-click handler cannot close the
    // dropdown first and let this click re-open it — one look, one row.
    renderPicker("fi");

    fireEvent.click(toggle());
    fireEvent.click(toggle());

    expect(screen.getAllByRole("button")).toHaveLength(CLOSED_BUTTONS);
    expect(mockTrack).toHaveBeenCalledTimes(1);
  });

  it('reports detected as "none" when the browser asked for nothing we ship', () => {
    // A German-only browser is looking at English because English is the
    // fallback, not because English was detected. Reporting "en" here would
    // count this look as a happy one against a guess we never made.
    renderPicker("none");

    fireEvent.click(toggle());

    expect(mockTrack).toHaveBeenCalledWith("locale_picker_open", {
      detected: "none",
      current: "en",
    });
    expect(mockTrack).toHaveBeenCalledTimes(1);
  });
});

/**
 * **The picker is the only thing in the app that changes language**, and it
 * does two things in one gesture: it persists the choice (cookie + profile),
 * and it re-issues the page the reader is on under the new prefix. These pin
 * the second half — that the destination is rebuilt from the route, its params
 * and its query rather than from the address bar's string — plus the standing
 * negative the whole locale system rests on: reading a prefixed URL writes
 * nothing.
 */
describe("LocalePicker navigation", () => {
  function localeRow(locale: (typeof SUPPORTED_LOCALES)[number]) {
    // Row order is `SUPPORTED_LOCALES` order, behind the toggle. Picking by
    // index rather than by label keeps this independent of the flag registry,
    // which contributes its own titles to a row's accessible name.
    return screen.getAllByRole("button")[
      CLOSED_BUTTONS + SUPPORTED_LOCALES.indexOf(locale)
    ];
  }

  function localeCookie(): string | undefined {
    const match = document.cookie.match(/(?:^|; )locale=([^;]*)/);
    return match ? decodeURIComponent(match[1]) : undefined;
  }

  beforeEach(() => {
    document.cookie = "locale=;path=/;max-age=0";
    window.location.hash = "";
    mockLocation.pathname = "/shop/[id]";
    mockLocation.params = { id: "abc" };
    mockLocation.search = "category=camps";
    mockRouter.replace.mockClear();
    mockRouter.push.mockClear();
    mockGetPathname.mockClear();
    mockTrack.mockClear();
  });

  it("re-issues the current route in the chosen locale, params and query intact", () => {
    // The three pieces together. The pathname alone would navigate to a
    // literal `/shop/[id]`; dropping the query would strand the switch on an
    // unfiltered shop or a confirmation page with no `session_id`.
    renderPicker("en");
    fireEvent.click(toggle());

    fireEvent.click(localeRow("fi"));

    expect(mockGetPathname).toHaveBeenCalledWith({
      href: {
        pathname: "/shop/[id]",
        params: { id: "abc" },
        query: { category: "camps" },
      },
      locale: "fi",
    });
    expect(mockRouter.replace).toHaveBeenCalledWith(
      "/fi/kauppa/abc?category=camps",
    );
  });

  it("replaces rather than pushes, so Back returns to the previous page", () => {
    // A pushed entry would make Back mean "the previous language", and a
    // reader who switched by accident would have to press it twice to leave.
    renderPicker("en");
    fireEvent.click(toggle());

    fireEvent.click(localeRow("sv"));

    expect(mockRouter.push).not.toHaveBeenCalled();
    expect(mockRouter.replace).toHaveBeenCalledTimes(1);
  });

  it("carries the fragment the reader was anchored on", () => {
    // No typed href has a `hash` field, so the fragment survives only because
    // the call site appends it — a reader switching language halfway down an
    // anchored section should stay where they were.
    window.location.hash = "#yty";
    renderPicker("en");
    fireEvent.click(toggle());

    fireEvent.click(localeRow("fi"));

    expect(mockRouter.replace).toHaveBeenCalledWith(
      "/fi/kauppa/abc?category=camps#yty",
    );
  });

  it("persists the choice to the cookie the bare-path ladder reads", () => {
    // The picker is a choice, so it writes — this is the one direction
    // persistence flows.
    renderPicker("en");
    fireEvent.click(toggle());

    fireEvent.click(localeRow("fr"));

    expect(localeCookie()).toBe("fr");
  });

  it("writes no cookie just for being on the page", () => {
    // **Reading is not choosing.** A reader who opens somebody's shared French
    // link — and even opens the picker to look at the languages — must leave
    // with the preference they arrived with.
    renderPicker("en");
    fireEvent.click(toggle());

    expect(localeCookie()).toBeUndefined();
    expect(mockRouter.replace).not.toHaveBeenCalled();
  });
});
