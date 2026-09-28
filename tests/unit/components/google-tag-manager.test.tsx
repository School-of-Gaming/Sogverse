import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { ConsentProvider, GoogleTagManager } from "@/components/consent";
import type { ConsentState } from "@/lib/consent";

/**
 * ============================================================================
 * The container's gates: six of them, the pixel's six.
 * ============================================================================
 *
 * The container is loaded behind the same gates as the pixel, for the same
 * reason — a tag reports the page it fires on, several of our URLs are secrets,
 * and a child's browsing never reaches an advertising platform on any surface.
 * What this file is about is which visitor, on which page, gets a container at
 * all.
 *
 * **The consent gate is marketing, the same word as the pixel's.** A container
 * mints a persistent client id and carries advertising tags, so it is an
 * advertising recipient; `analytics` covers Vercel's cookieless counting alone,
 * which is what the strip and the privacy policy say it is. A visitor who took
 * analytics and refused marketing gets no script and no request to Google, and
 * so does one who refused everything or has not answered. All three are
 * asserted below.
 *
 * What is asserted is the *decision*, not the loading: the loader has its own
 * suite, and standing it in for here would make every case an assertion about
 * Google's queue rather than about who is allowed to reach it.
 *
 * The counting rule is worth stating outright, because two of the cases look
 * alike from the outside. One page view per marketing page **reached**: a
 * re-render is not a view, and a return to a page after another one is.
 */

const CONTAINER_ID = "GTM-5WS8TXL4";

const mockPathname = vi.hoisted(() => ({ value: "/" }));
vi.mock("next/navigation", () => ({
  // The RAW pathname the component reads, overriding the suite-wide stub so
  // each case can put the visitor on a different page.
  usePathname: () => mockPathname.value,
}));

const mockAuth = vi.hoisted(() => ({
  user: null as { id: string } | null,
  profile: null as { role: string } | null,
  isLoading: false,
}));
vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => mockAuth,
}));

// The one call the component makes: "report a page view of this pathname, with
// this answer". The loader's own suite covers what happens after — waiting for
// the container, re-reading the address bar — so here the call itself is the
// whole assertion.
const mockReport = vi.hoisted(() =>
  vi.fn((..._args: unknown[]) => Promise.resolve()),
);
vi.mock("@/lib/gtm", () => ({
  reportGtmPageView: (...args: unknown[]) => mockReport(...args),
}));

const GRANTED_BOTH: ConsentState = {
  analytics: true,
  marketing: true,
  decidedAt: "2026-09-01T08:00:00.000Z",
};

const ANALYTICS_ONLY: ConsentState = { ...GRANTED_BOTH, marketing: false };

function renderContainer(consent: ConsentState | null = GRANTED_BOTH) {
  return render(
    <ConsentProvider initial={consent}>
      <GoogleTagManager />
    </ConsentProvider>,
  );
}

/** Move the visitor to another page in the same document. */
function navigate(
  rerender: ReturnType<typeof renderContainer>["rerender"],
  pathname: string,
  consent: ConsentState | null = GRANTED_BOTH,
) {
  mockPathname.value = pathname;
  rerender(
    <ConsentProvider initial={consent}>
      <GoogleTagManager />
    </ConsentProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_GTM_CONTAINER_ID", CONTAINER_ID);
  mockPathname.value = "/";
  mockAuth.user = null;
  mockAuth.profile = null;
  mockAuth.isLoading = false;
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("GoogleTagManager — what stops it", () => {
  it.each([
    ["no answer at all", null],
    ["a refusal", { ...GRANTED_BOTH, analytics: false, marketing: false }],
    // The gate that moved: a container is an advertising recipient, so the
    // visitor who took Vercel's cookieless counting and nothing else gets none
    // of it. Their page is still on the marketing-page allowlist and the
    // container id is still set — the answer is the whole of what stops it.
    ["an analytics-only answer", ANALYTICS_ONLY],
  ])("loads nothing on %s", (_label, consent) => {
    mockPathname.value = "/shop";

    renderContainer(consent);

    expect(mockReport).not.toHaveBeenCalled();
  });

  it("loads nothing for a signed-in gamer", () => {
    mockAuth.user = { id: "gamer-1" };
    mockAuth.profile = { role: "gamer" };

    renderContainer();

    expect(mockReport).not.toHaveBeenCalled();
  });

  // The doubt resolved in the safe direction: somebody is signed in and we
  // could not read their profile, so they may be a child.
  it("loads nothing for a signed-in visitor whose profile is unknown", () => {
    mockAuth.user = { id: "someone" };
    mockAuth.profile = null;

    renderContainer();

    expect(mockReport).not.toHaveBeenCalled();
  });

  it("loads nothing while the session is still loading", () => {
    mockAuth.isLoading = true;

    renderContainer();

    expect(mockReport).not.toHaveBeenCalled();
  });

  it.each([
    ["a page that carries a token", "/reset-password"],
    ["a page that names a child", "/parent/gamers/abc"],
    ["a dashboard", "/parent"],
    ["a URL that matches no route", "/not-a-page-we-have"],
  ])("loads nothing on %s", (_label, pathname) => {
    mockPathname.value = pathname;

    renderContainer();

    expect(mockReport).not.toHaveBeenCalled();
  });

  it.each([
    ["an unset id", undefined],
    ["a placeholder that is not a container id", "your-gtm-container-id"],
  ])("loads nothing with %s", (_label, id) => {
    vi.stubEnv("NEXT_PUBLIC_GTM_CONTAINER_ID", id);

    renderContainer();

    expect(mockReport).not.toHaveBeenCalled();
  });
});

describe("GoogleTagManager — what it loads", () => {
  it("loads the container and reports one page view on a marketing page", () => {
    mockPathname.value = "/shop";

    renderContainer();

    expect(mockReport).toHaveBeenCalledTimes(1);
    expect(mockReport).toHaveBeenCalledWith(
      CONTAINER_ID,
      "/shop",
      GRANTED_BOTH,
    );
  });

  // The visitor's own URL, in their own language, with a real product id in it
  // — the shape the normalizer exists for.
  it("reports a translated, locale-prefixed product page", () => {
    mockPathname.value = "/fi/kauppa/abc-123";

    renderContainer();

    expect(mockReport).toHaveBeenCalledTimes(1);
  });

  it("reports nothing more when the component merely re-renders", () => {
    mockPathname.value = "/shop";
    const { rerender } = renderContainer();

    navigate(rerender, "/shop");

    expect(mockReport).toHaveBeenCalledTimes(1);
  });

  it("sends nothing when the visitor navigates into a private page", () => {
    mockPathname.value = "/shop";
    const { rerender } = renderContainer();

    navigate(rerender, "/parent/gamers/abc");

    expect(mockReport).toHaveBeenCalledTimes(1);
  });

  // Coming back is a second view of the page, and the one case a naive
  // "have we reported this pathname" guard gets wrong.
  it("reports again when the visitor returns to a marketing page", () => {
    mockPathname.value = "/shop";
    const { rerender } = renderContainer();

    navigate(rerender, "/parent/gamers/abc");
    navigate(rerender, "/shop");

    expect(mockReport).toHaveBeenCalledTimes(2);
    // And nothing was asked for on the private page in between.
    expect(mockReport).not.toHaveBeenCalledWith(
      CONTAINER_ID,
      "/parent/gamers/abc",
      GRANTED_BOTH,
    );
  });

  it("reports each marketing page a visitor walks through", () => {
    mockPathname.value = "/";
    const { rerender } = renderContainer();

    navigate(rerender, "/shop");
    navigate(rerender, "/shop/abc-123");

    expect(mockReport).toHaveBeenCalledTimes(3);
  });
});
