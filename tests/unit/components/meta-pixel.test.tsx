import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  ConsentProvider,
  MetaPixel,
  MetaProductView,
  useMetaCheckoutStart,
} from "@/components/consent";
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

// The one call the component makes: "report a page view of this pathname".
// The loader's own suite covers what happens after — waiting for the library,
// re-reading the address bar — so here the call itself is the whole assertion.
const mockReport = vi.hoisted(() =>
  vi.fn((..._args: unknown[]) => Promise.resolve()),
);
// The click's report, which answers whether it went out — false standing for
// "the library has not arrived", the one case it drops the event. Its own
// suite covers that decision; here the answer is set per case.
const mockReportNow = vi.hoisted(() =>
  vi.fn((..._args: unknown[]) => true),
);
vi.mock("@/lib/meta-pixel", () => ({
  reportMetaEvent: (...args: unknown[]) => mockReport(...args),
  reportMetaEventNow: (...args: unknown[]) => mockReportNow(...args),
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

    expect(mockReport).not.toHaveBeenCalled();
    expect(mockReport).not.toHaveBeenCalled();
  });

  it("loads nothing for a signed-in gamer", () => {
    mockAuth.user = { id: "gamer-1" };
    mockAuth.profile = { role: "gamer" };

    renderPixel();

    expect(mockReport).not.toHaveBeenCalled();
  });

  // The doubt resolved in the safe direction: somebody is signed in and we
  // could not read their profile, so they may be a child.
  it("loads nothing for a signed-in visitor whose profile is unknown", () => {
    mockAuth.user = { id: "someone" };
    mockAuth.profile = null;

    renderPixel();

    expect(mockReport).not.toHaveBeenCalled();
  });

  it("loads nothing while the session is still loading", () => {
    mockAuth.isLoading = true;

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
    expect(mockReport).not.toHaveBeenCalled();
  });

  it.each([
    ["an unset id", undefined],
    ["a placeholder that is not digits", "your-meta-pixel-id"],
  ])("loads nothing with %s", (_label, id) => {
    vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ID", id);

    renderPixel();

    expect(mockReport).not.toHaveBeenCalled();
  });
});

describe("MetaPixel — what it reports", () => {
  it("loads the pixel and reports one page view on a marketing page", () => {
    mockPathname.value = "/shop";

    renderPixel();

    expect(mockReport).toHaveBeenCalledTimes(1);
    expect(mockReport).toHaveBeenCalledWith(PIXEL_ID, "/shop", {
      event: "PageView",
    });
  });

  // The visitor's own URL, in their own language, with a real product id in it
  // — the shape the normalizer exists for.
  it("reports a translated, locale-prefixed product page", () => {
    mockPathname.value = "/fi/kauppa/abc-123";

    renderPixel();

    expect(mockReport).toHaveBeenCalledTimes(1);
  });

  it("reports nothing more when the component merely re-renders", () => {
    mockPathname.value = "/shop";
    const { rerender } = renderPixel();

    navigate(rerender, "/shop");

    expect(mockReport).toHaveBeenCalledTimes(1);
  });

  it("sends nothing when the visitor navigates into a private page", () => {
    mockPathname.value = "/shop";
    const { rerender } = renderPixel();

    navigate(rerender, "/parent/gamers/abc");

    expect(mockReport).toHaveBeenCalledTimes(1);
  });

  // Coming back is a second view of the page, and the one case a naive
  // "have we reported this pathname" guard gets wrong.
  it("reports again when the visitor returns to a marketing page", () => {
    mockPathname.value = "/shop";
    const { rerender } = renderPixel();

    navigate(rerender, "/parent/gamers/abc");
    navigate(rerender, "/shop");

    expect(mockReport).toHaveBeenCalledTimes(2);
    // And nothing was asked for on the private page in between.
    expect(mockReport).not.toHaveBeenCalledWith(
      PIXEL_ID,
      "/parent/gamers/abc",
      expect.anything(),
    );
  });

  it("reports each marketing page a visitor walks through", () => {
    mockPathname.value = "/";
    const { rerender } = renderPixel();

    navigate(rerender, "/shop");
    navigate(rerender, "/shop/abc-123");

    expect(mockReport).toHaveBeenCalledTimes(3);
  });
});

/**
 * The product view rides the page view's machinery, so the cases below do not
 * re-walk every gate: they pin that it reports once, with the product's fields,
 * for a product we advertise — and that two of the gates it shares (consent,
 * and the advertising rule it adds) hold for it too.
 */
describe("MetaProductView", () => {
  const PRODUCT_ID = "8f0c1c55-6b0e-4a43-9d1a-2f4b8c7e9a10";

  type ViewedProduct = NonNullable<
    Parameters<typeof MetaProductView>[0]["product"]
  >;

  const ROBLOX_CLUB: ViewedProduct = {
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

  function renderProductView(
    product: ViewedProduct | null,
    consent: ConsentState | null = GRANTED_BOTH,
  ) {
    return render(
      <ConsentProvider initial={consent}>
        <MetaProductView product={product} />
      </ConsentProvider>,
    );
  }

  beforeEach(() => {
    mockPathname.value = `/fi/kauppa/${PRODUCT_ID}`;
  });

  it("reports one product view, with the product's fields, on its page", () => {
    const { rerender } = renderProductView(ROBLOX_CLUB);
    // A re-render — the seat count ticking, a query settling — is not a view.
    rerender(
      <ConsentProvider initial={GRANTED_BOTH}>
        <MetaProductView product={{ ...ROBLOX_CLUB }} />
      </ConsentProvider>,
    );

    expect(mockReport).toHaveBeenCalledTimes(1);
    expect(mockReport).toHaveBeenCalledWith(
      PIXEL_ID,
      `/fi/kauppa/${PRODUCT_ID}`,
      {
        event: "ViewContent",
        product: {
          content_ids: [PRODUCT_ID],
          content_type: "product",
          content_name: "Roblox Studio Club",
          content_category: "roblox_studio",
          value: 49,
          currency: "EUR",
        },
      },
    );
  });

  it("waits for the product to be read, then reports it exactly once", () => {
    const { rerender } = renderProductView(null);
    expect(mockReport).not.toHaveBeenCalled();

    const renderWith = (product: ViewedProduct | null) =>
      rerender(
        <ConsentProvider initial={GRANTED_BOTH}>
          <MetaProductView product={product} />
        </ConsentProvider>,
      );

    renderWith(ROBLOX_CLUB);
    expect(mockReport).toHaveBeenCalledTimes(1);

    // Back to unread and loaded again on the same page — a refetch, the page
    // dropping to its skeleton — is still the one page reached.
    renderWith(null);
    renderWith({ ...ROBLOX_CLUB });
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

/**
 * The checkout start rides the same gate hook, so the cases below pin what is
 * its own: it is sent from the click and not on mount, once per product page
 * however often the parent clicks, only for a product we advertise, and — when
 * the library has not arrived — not counted, so nothing is queued and a later
 * click on the same page may still report.
 */
describe("useMetaCheckoutStart", () => {
  const PRODUCT_ID = "8f0c1c55-6b0e-4a43-9d1a-2f4b8c7e9a10";

  type StartedProduct = NonNullable<Parameters<typeof useMetaCheckoutStart>[0]>;

  const FREE_EVENT: StartedProduct = {
    id: PRODUCT_ID,
    product_type: "event",
    billing_mode: "free",
    topic: "roblox_studio",
    product_translations: [{ locale: "en", name: "Roblox Studio Day" }],
    product_prices: [],
  };

  function StartButton({ product }: { product: StartedProduct | null }) {
    const start = useMetaCheckoutStart(product);
    return (
      <button type="button" onClick={start}>
        Sign up
      </button>
    );
  }

  function renderStart(
    product: StartedProduct | null = FREE_EVENT,
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
    mockReportNow.mockReturnValue(true);
  });

  it("reports nothing until the parent clicks", () => {
    renderStart();

    expect(mockReportNow).not.toHaveBeenCalled();
    expect(mockReport).not.toHaveBeenCalled();
  });

  it("reports the click once, with the product's fields, for an advertised product", () => {
    renderStart();

    click();

    expect(mockReportNow).toHaveBeenCalledTimes(1);
    expect(mockReportNow).toHaveBeenCalledWith(`/fi/kauppa/${PRODUCT_ID}`, {
      event: "InitiateCheckout",
      product: {
        content_ids: [PRODUCT_ID],
        content_type: "product",
        content_name: "Roblox Studio Day",
        content_category: "roblox_studio",
        value: 0,
        currency: "EUR",
      },
    });
  });

  // A second click, or a failed enrolment tried again, is the same parent on
  // the same page.
  it("reports nothing more on a second click on the same page", () => {
    renderStart();

    click();
    click();

    expect(mockReportNow).toHaveBeenCalledTimes(1);
  });

  it("reports nothing for a product we do not advertise", () => {
    renderStart({
      ...FREE_EVENT,
      product_type: "municipality_club",
      billing_mode: "external_contract",
    });

    click();

    expect(mockReportNow).not.toHaveBeenCalled();
  });

  it("reports nothing without marketing consent", () => {
    renderStart(FREE_EVENT, { ...GRANTED_BOTH, marketing: false });

    click();

    expect(mockReportNow).not.toHaveBeenCalled();
  });

  it("reports nothing for a signed-in gamer", () => {
    mockAuth.user = { id: "gamer-1" };
    mockAuth.profile = { role: "gamer" };
    renderStart();

    click();

    expect(mockReportNow).not.toHaveBeenCalled();
  });

  it("reports nothing off the marketing-page allowlist", () => {
    mockPathname.value = "/parent";
    renderStart();

    click();

    expect(mockReportNow).not.toHaveBeenCalled();
  });

  // The library had not arrived: the event is dropped, never queued, and the
  // page is not counted — so a click once it has arrived still reports, once.
  it("drops a click before the library has arrived without spending the page's report", () => {
    mockReportNow.mockReturnValueOnce(false);
    renderStart();

    click();
    click();
    click();

    // Never through the awaiting reporter, which would load and wait.
    expect(mockReport).not.toHaveBeenCalled();
    expect(mockReportNow).toHaveBeenCalledTimes(2);
    expect(mockReportNow.mock.results.map((result) => result.value)).toEqual([
      false,
      true,
    ]);
  });
});
