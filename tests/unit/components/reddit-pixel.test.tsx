import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  AdvertisingProductView,
  ConsentProvider,
  RedditPixel,
  RedditProductView,
  useAdvertisingCheckoutStart,
  useRedditCheckoutStart,
} from "@/components/consent";
import type { ConsentState } from "@/lib/consent";

/**
 * ============================================================================
 * The Reddit Pixel's gates: the Meta Pixel's, every one of them.
 * ============================================================================
 *
 * Reddit's library attaches the page's URL to every event exactly as Meta's
 * does, so the pixel has to be refused on exactly the pages Meta's is. The two
 * share their gate hooks, which the Meta suite walks in full; what is pinned
 * here is that each gate holds for Reddit too — so a future split of the hooks
 * cannot quietly leave one pixel ungated — and that Reddit is told its own
 * names for the same moments.
 *
 * The last block is the product page's fan-out: one view and one click told to
 * both pixels, each deciding for itself.
 */

const PIXEL_ID = "a2_abc123def456";
const META_PIXEL_ID = "1234567890";

const mockPathname = vi.hoisted(() => ({ value: "/" }));
vi.mock("next/navigation", () => ({
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

const mockReport = vi.hoisted(() =>
  vi.fn((..._args: unknown[]) => Promise.resolve()),
);
const mockReportNow = vi.hoisted(() => vi.fn((..._args: unknown[]) => true));
vi.mock("@/lib/reddit-pixel", () => ({
  reportRedditEvent: (...args: unknown[]) => mockReport(...args),
  reportRedditEventNow: (...args: unknown[]) => mockReportNow(...args),
}));

const mockMetaReport = vi.hoisted(() =>
  vi.fn((..._args: unknown[]) => Promise.resolve()),
);
const mockMetaReportNow = vi.hoisted(() =>
  vi.fn((..._args: unknown[]) => true),
);
vi.mock("@/lib/meta-pixel", () => ({
  reportMetaEvent: (...args: unknown[]) => mockMetaReport(...args),
  reportMetaEventNow: (...args: unknown[]) => mockMetaReportNow(...args),
}));

const GRANTED_BOTH: ConsentState = {
  analytics: true,
  marketing: true,
  decidedAt: "2026-09-01T08:00:00.000Z",
};

const PRODUCT_ID = "8f0c1c55-6b0e-4a43-9d1a-2f4b8c7e9a10";

type ReportedProduct = NonNullable<
  Parameters<typeof RedditProductView>[0]["product"]
>;

const ROBLOX_CLUB: ReportedProduct = {
  id: PRODUCT_ID,
  product_type: "consumer_club",
  billing_mode: "paid",
  topic: "roblox_studio",
  product_translations: [
    { locale: "fi", name: "Roblox Studio -kerho" },
    { locale: "en", name: "Roblox Studio Club" },
  ],
  product_prices: [{ currency: "eur", price_cents: 4900 }],
};

const ROBLOX_CLUB_DETAILS = {
  products: [
    { id: PRODUCT_ID, name: "Roblox Studio Club", category: "roblox_studio" },
  ],
  itemCount: 1,
  value: 49,
  currency: "EUR",
};

function renderPixel(consent: ConsentState | null = GRANTED_BOTH) {
  return render(
    <ConsentProvider initial={consent}>
      <RedditPixel />
    </ConsentProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_REDDIT_PIXEL_ID", PIXEL_ID);
  vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ID", META_PIXEL_ID);
  mockPathname.value = "/";
  mockAuth.user = null;
  mockAuth.profile = null;
  mockAuth.isLoading = false;
  mockReportNow.mockReturnValue(true);
  mockMetaReportNow.mockReturnValue(true);
});

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});

describe("RedditPixel — what stops it", () => {
  it.each([
    ["no answer at all", null],
    ["a refusal", { ...GRANTED_BOTH, analytics: false, marketing: false }],
    ["analytics only", { ...GRANTED_BOTH, marketing: false }],
  ])("loads nothing on %s", (_label, consent) => {
    renderPixel(consent);

    expect(mockReport).not.toHaveBeenCalled();
  });

  it.each([
    ["a signed-in gamer", { id: "gamer-1" }, { role: "gamer" }, false],
    ["a signed-in visitor whose profile is unknown", { id: "someone" }, null, false],
    ["a session still loading", null, null, true],
  ])("loads nothing for %s", (_label, user, profile, isLoading) => {
    mockAuth.user = user;
    mockAuth.profile = profile;
    mockAuth.isLoading = isLoading;

    renderPixel();

    expect(mockReport).not.toHaveBeenCalled();
  });

  it.each([
    ["a page that carries a token", "/reset-password"],
    ["a page that names a child", "/parent/gamers/abc"],
    ["a dashboard", "/parent"],
    ["a URL that matches no route", "/not-a-page-we-have"],
  ])("loads nothing on %s", (_label, pathname) => {
    mockPathname.value = pathname;

    renderPixel();

    expect(mockReport).not.toHaveBeenCalled();
  });

  it.each([
    ["an unset id", undefined],
    ["a placeholder", "your-reddit-pixel-id"],
    // Meta's id is digits; configuring it here by mistake must read as off.
    ["Meta's id in Reddit's variable", META_PIXEL_ID],
  ])("loads nothing with %s", (_label, id) => {
    vi.stubEnv("NEXT_PUBLIC_REDDIT_PIXEL_ID", id);

    renderPixel();

    expect(mockReport).not.toHaveBeenCalled();
  });
});

describe("RedditPixel — what it reports", () => {
  it("reports one page visit, under Reddit's name, on a marketing page", () => {
    mockPathname.value = "/shop";

    renderPixel();

    expect(mockReport).toHaveBeenCalledTimes(1);
    expect(mockReport).toHaveBeenCalledWith(PIXEL_ID, "/shop", {
      event: "PageVisit",
    });
  });

  it("reports once per marketing page reached, and again on a return", () => {
    mockPathname.value = "/shop";
    const { rerender } = renderPixel();
    const go = (pathname: string) => {
      mockPathname.value = pathname;
      rerender(
        <ConsentProvider initial={GRANTED_BOTH}>
          <RedditPixel />
        </ConsentProvider>,
      );
    };

    go("/shop");
    go("/parent/gamers/abc");
    go("/shop");

    expect(mockReport).toHaveBeenCalledTimes(2);
    expect(mockReport).not.toHaveBeenCalledWith(
      PIXEL_ID,
      "/parent/gamers/abc",
      expect.anything(),
    );
  });
});

describe("RedditProductView", () => {
  function renderProductView(
    product: ReportedProduct | null,
    consent: ConsentState | null = GRANTED_BOTH,
  ) {
    return render(
      <ConsentProvider initial={consent}>
        <RedditProductView product={product} />
      </ConsentProvider>,
    );
  }

  beforeEach(() => {
    mockPathname.value = `/fi/kauppa/${PRODUCT_ID}`;
  });

  it("reports one product view, in Reddit's product fields, on its page", () => {
    const { rerender } = renderProductView(ROBLOX_CLUB);
    rerender(
      <ConsentProvider initial={GRANTED_BOTH}>
        <RedditProductView product={{ ...ROBLOX_CLUB }} />
      </ConsentProvider>,
    );

    expect(mockReport).toHaveBeenCalledTimes(1);
    expect(mockReport).toHaveBeenCalledWith(
      PIXEL_ID,
      `/fi/kauppa/${PRODUCT_ID}`,
      { event: "ViewContent", product: ROBLOX_CLUB_DETAILS },
    );
  });

  it("waits for the product to be read", () => {
    const { rerender } = renderProductView(null);
    expect(mockReport).not.toHaveBeenCalled();

    rerender(
      <ConsentProvider initial={GRANTED_BOTH}>
        <RedditProductView product={ROBLOX_CLUB} />
      </ConsentProvider>,
    );
    expect(mockReport).toHaveBeenCalledTimes(1);
  });

  it("reports nothing without marketing consent", () => {
    renderProductView(ROBLOX_CLUB, { ...GRANTED_BOTH, marketing: false });

    expect(mockReport).not.toHaveBeenCalled();
  });

  it("reports nothing for a product we do not advertise", () => {
    renderProductView({
      ...ROBLOX_CLUB,
      product_type: "municipality_club",
      billing_mode: "external_contract",
    });

    expect(mockReport).not.toHaveBeenCalled();
  });

  it("reports nothing for a signed-in gamer", () => {
    mockAuth.user = { id: "gamer-1" };
    mockAuth.profile = { role: "gamer" };

    renderProductView(ROBLOX_CLUB);

    expect(mockReport).not.toHaveBeenCalled();
  });
});

describe("useRedditCheckoutStart", () => {
  function StartButton({ product }: { product: ReportedProduct | null }) {
    const start = useRedditCheckoutStart(product);
    return (
      <button type="button" onClick={start}>
        Sign up
      </button>
    );
  }

  function renderStart(
    product: ReportedProduct | null = ROBLOX_CLUB,
    consent: ConsentState | null = GRANTED_BOTH,
  ) {
    return render(
      <ConsentProvider initial={consent}>
        <StartButton product={product} />
      </ConsentProvider>,
    );
  }

  const click = () => fireEvent.click(screen.getByRole("button"));

  beforeEach(() => {
    mockPathname.value = `/fi/kauppa/${PRODUCT_ID}`;
  });

  it("reports nothing until the parent clicks", () => {
    renderStart();

    expect(mockReportNow).not.toHaveBeenCalled();
    expect(mockReport).not.toHaveBeenCalled();
  });

  it("reports the click once, as Reddit's AddToCart, with the product's fields", () => {
    renderStart();

    click();
    click();

    expect(mockReportNow).toHaveBeenCalledTimes(1);
    expect(mockReportNow).toHaveBeenCalledWith(`/fi/kauppa/${PRODUCT_ID}`, {
      event: "AddToCart",
      product: ROBLOX_CLUB_DETAILS,
    });
  });

  it("reports nothing without marketing consent", () => {
    renderStart(ROBLOX_CLUB, { ...GRANTED_BOTH, marketing: false });

    click();

    expect(mockReportNow).not.toHaveBeenCalled();
  });

  it("reports nothing off the marketing-page allowlist", () => {
    mockPathname.value = "/parent";
    renderStart();

    click();

    expect(mockReportNow).not.toHaveBeenCalled();
  });

  it("drops a click before the library has arrived without spending the page's report", () => {
    mockReportNow.mockReturnValueOnce(false);
    renderStart();

    click();
    click();
    click();

    expect(mockReport).not.toHaveBeenCalled();
    expect(mockReportNow.mock.results.map((result) => result.value)).toEqual([
      false,
      true,
    ]);
  });
});

/**
 * The product page names one view and one click, and both pixels hear each.
 * Neither pixel's state reaches the other: Meta's library still downloading
 * drops Meta's click and leaves Reddit's alone.
 */
describe("the product page's fan-out", () => {
  beforeEach(() => {
    mockPathname.value = `/fi/kauppa/${PRODUCT_ID}`;
  });

  it("tells both pixels about a product view", () => {
    render(
      <ConsentProvider initial={GRANTED_BOTH}>
        <AdvertisingProductView product={ROBLOX_CLUB} />
      </ConsentProvider>,
    );

    expect(mockReport).toHaveBeenCalledTimes(1);
    expect(mockReport.mock.calls[0][2]).toMatchObject({ event: "ViewContent" });
    expect(mockMetaReport).toHaveBeenCalledTimes(1);
    expect(mockMetaReport.mock.calls[0][2]).toMatchObject({
      event: "ViewContent",
    });
  });

  it("tells both pixels about one click, each deciding for itself", () => {
    function StartButton() {
      const start = useAdvertisingCheckoutStart(ROBLOX_CLUB);
      return (
        <button type="button" onClick={start}>
          Sign up
        </button>
      );
    }
    mockMetaReportNow.mockReturnValueOnce(false);
    render(
      <ConsentProvider initial={GRANTED_BOTH}>
        <StartButton />
      </ConsentProvider>,
    );

    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByRole("button"));

    // Reddit's went out on the first click and is spent; Meta's was dropped on
    // the first and went out on the second.
    expect(mockReportNow).toHaveBeenCalledTimes(1);
    expect(mockReportNow.mock.calls[0][1]).toMatchObject({
      event: "AddToCart",
    });
    expect(mockMetaReportNow).toHaveBeenCalledTimes(2);
    expect(mockMetaReportNow.mock.calls[1][1]).toMatchObject({
      event: "InitiateCheckout",
    });
  });
});
