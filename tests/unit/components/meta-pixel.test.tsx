import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { ConsentProvider, MetaPixel } from "@/components/consent";
import type { ConsentState } from "@/lib/consent";

/**
 * ============================================================================
 * The pixel's gates: five of them, and every one is a page nobody may report.
 * ============================================================================
 *
 * Meta's library sends the page's own URL and the document's referrer with every
 * event. Several of our URLs are secrets — a password reset, a PIN reset, an
 * email verification, a seat offer — and others name a child by id, so "where
 * the pixel may run" is the whole of this component and the whole of this file.
 *
 * What is asserted is the *decision*, not the loading: the loader has its own
 * suite, and standing it in for here would make every case an assertion about
 * Meta's stub rather than about who is allowed to reach it.
 *
 * The counting rule is worth stating outright, because two of the three cases
 * look alike from the outside. One page view per marketing page **reached**: a
 * re-render is not a view, and a return to a page after another one is.
 */

const PIXEL_ID = "1234567890";

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

const mockLoad = vi.hoisted(() => vi.fn());
const mockTrack = vi.hoisted(() => vi.fn());
vi.mock("@/lib/meta-pixel", () => ({
  loadMetaPixel: (...args: unknown[]) => mockLoad(...args),
  trackMetaEvent: (...args: unknown[]) => mockTrack(...args),
}));

const GRANTED_BOTH: ConsentState = {
  analytics: true,
  marketing: true,
  decidedAt: "2026-09-01T08:00:00.000Z",
};

function renderPixel(consent: ConsentState | null = GRANTED_BOTH) {
  return render(
    <ConsentProvider initial={consent}>
      <MetaPixel />
    </ConsentProvider>,
  );
}

/** Move the visitor to another page in the same document. */
function navigate(
  rerender: ReturnType<typeof renderPixel>["rerender"],
  pathname: string,
  consent: ConsentState | null = GRANTED_BOTH,
) {
  mockPathname.value = pathname;
  rerender(
    <ConsentProvider initial={consent}>
      <MetaPixel />
    </ConsentProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ID", PIXEL_ID);
  mockPathname.value = "/";
  mockAuth.user = null;
  mockAuth.profile = null;
  mockAuth.isLoading = false;
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("MetaPixel — what stops it", () => {
  it.each([
    ["no answer at all", null],
    ["a refusal", { ...GRANTED_BOTH, analytics: false, marketing: false }],
    ["analytics only", { ...GRANTED_BOTH, marketing: false }],
  ])("loads nothing on %s", (_label, consent) => {
    renderPixel(consent);

    expect(mockLoad).not.toHaveBeenCalled();
    expect(mockTrack).not.toHaveBeenCalled();
  });

  it("loads nothing for a signed-in gamer", () => {
    mockAuth.user = { id: "gamer-1" };
    mockAuth.profile = { role: "gamer" };

    renderPixel();

    expect(mockLoad).not.toHaveBeenCalled();
  });

  // The doubt resolved in the safe direction: somebody is signed in and we
  // could not read their profile, so they may be a child.
  it("loads nothing for a signed-in visitor whose profile is unknown", () => {
    mockAuth.user = { id: "someone" };
    mockAuth.profile = null;

    renderPixel();

    expect(mockLoad).not.toHaveBeenCalled();
  });

  it("loads nothing while the session is still loading", () => {
    mockAuth.isLoading = true;

    renderPixel();

    expect(mockLoad).not.toHaveBeenCalled();
  });

  it.each([
    ["a page that carries a token", "/reset-password"],
    ["a page that names a child", "/parent/gamers/abc"],
    ["a dashboard", "/parent"],
    ["a URL that matches no route", "/not-a-page-we-have"],
  ])("loads nothing on %s", (_label, pathname) => {
    mockPathname.value = pathname;

    renderPixel();

    expect(mockLoad).not.toHaveBeenCalled();
    expect(mockTrack).not.toHaveBeenCalled();
  });

  it.each([
    ["an unset id", undefined],
    ["a placeholder that is not digits", "your-meta-pixel-id"],
  ])("loads nothing with %s", (_label, id) => {
    vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ID", id);

    renderPixel();

    expect(mockLoad).not.toHaveBeenCalled();
  });
});

describe("MetaPixel — what it reports", () => {
  it("loads the pixel and reports one page view on a marketing page", () => {
    mockPathname.value = "/shop";

    renderPixel();

    expect(mockLoad).toHaveBeenCalledTimes(1);
    expect(mockLoad).toHaveBeenCalledWith(PIXEL_ID);
    expect(mockTrack).toHaveBeenCalledTimes(1);
    expect(mockTrack).toHaveBeenCalledWith("PageView");
  });

  // The visitor's own URL, in their own language, with a real product id in it
  // — the shape the normalizer exists for.
  it("reports a translated, locale-prefixed product page", () => {
    mockPathname.value = "/fi/kauppa/abc-123";

    renderPixel();

    expect(mockTrack).toHaveBeenCalledTimes(1);
  });

  it("reports nothing more when the component merely re-renders", () => {
    mockPathname.value = "/shop";
    const { rerender } = renderPixel();

    navigate(rerender, "/shop");

    expect(mockTrack).toHaveBeenCalledTimes(1);
  });

  it("sends nothing when the visitor navigates into a private page", () => {
    mockPathname.value = "/shop";
    const { rerender } = renderPixel();

    navigate(rerender, "/parent/gamers/abc");

    expect(mockTrack).toHaveBeenCalledTimes(1);
    expect(mockLoad).toHaveBeenCalledTimes(1);
  });

  // Coming back is a second view of the page, and the one case a naive
  // "have we reported this pathname" guard gets wrong.
  it("reports again when the visitor returns to a marketing page", () => {
    mockPathname.value = "/shop";
    const { rerender } = renderPixel();

    navigate(rerender, "/parent/gamers/abc");
    navigate(rerender, "/shop");

    expect(mockTrack).toHaveBeenCalledTimes(2);
    // The component asks to load on every page it reports from, and does not
    // track whether it has loaded already — the loader's own guard makes the
    // second ask a no-op, which is its suite's subject rather than this one's.
    // What matters here is that nothing was asked for on the private page in
    // between.
    expect(mockLoad).toHaveBeenCalledTimes(2);
  });

  it("reports each marketing page a visitor walks through", () => {
    mockPathname.value = "/";
    const { rerender } = renderPixel();

    navigate(rerender, "/shop");
    navigate(rerender, "/shop/abc-123");

    expect(mockTrack).toHaveBeenCalledTimes(3);
  });
});
