import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { ConsentProvider, GoogleTagManager } from "@/components/consent";
import {
  GtmProductView,
  useGtmCheckoutStart,
} from "@/components/consent/google-tag-manager";
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
vi.mock("@/providers/utm-provider", () => {
  const none = {
    utm: { source: null, medium: null, campaign: null, content: null, term: null },
    utmLandedAt: null,
    clickIds: {},
  };
  return { useUtm: () => none };
});

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
const mockProductReport = vi.hoisted(() =>
  vi.fn((..._args: unknown[]) => Promise.resolve()),
);
const mockPushNow = vi.hoisted(() => vi.fn((..._args: unknown[]) => true));
vi.mock("@/lib/gtm", () => ({
  reportGtmPageView: (...args: unknown[]) => mockReport(...args),
  reportGtmProductEvent: (...args: unknown[]) => mockProductReport(...args),
  pushGtmProductEventNow: (...args: unknown[]) => mockPushNow(...args),
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

/**
 * A product page's two events: the view, once per product page reached, and
 * the click into the sign-up flow, once per page however often it is pressed.
 * Both stand behind the same visitor-level gates as the page view, and both
 * are pushed for every product with the advertising decision beside them.
 */
const PRODUCT_ID = "8f0c1c55-6b0e-4a43-9d1a-2f4b8c7e9a10";

interface Product {
  id: string;
  product_type: "consumer_club" | "municipality_club";
  billing_mode: "paid";
  topic: "roblox_studio";
  product_translations: { locale: string; name: string }[];
  product_prices: { currency: string; price_cents: number }[];
}

const ROBLOX_CLUB: Product = {
  id: PRODUCT_ID,
  product_type: "consumer_club",
  billing_mode: "paid",
  topic: "roblox_studio",
  product_translations: [{ locale: "en", name: "Roblox Studio Club" }],
  product_prices: [{ currency: "eur", price_cents: 4900 }],
};

const ECOMMERCE = {
  items: [
    {
      item_id: PRODUCT_ID,
      item_name: "Roblox Studio Club",
      item_category: "roblox_studio",
      price: 49,
      quantity: 1,
    },
  ],
  value: 49,
  currency: "EUR",
};

function renderProductView(
  product: Product | null,
  consent: ConsentState = GRANTED_BOTH,
) {
  const tree = (p: Product | null) => (
    <ConsentProvider initial={consent}>
      <GtmProductView product={p} />
    </ConsentProvider>
  );
  const view = render(tree(product));
  return { ...view, rerenderWith: (p: Product | null) => view.rerender(tree(p)) };
}

describe("GtmProductView", () => {
  beforeEach(() => {
    mockPathname.value = `/fi/kauppa/${PRODUCT_ID}`;
  });

  it("reports nothing until the product has been read, then reports it once", () => {
    const { rerenderWith } = renderProductView(null);
    expect(mockProductReport).not.toHaveBeenCalled();

    rerenderWith(ROBLOX_CLUB);
    rerenderWith({ ...ROBLOX_CLUB });

    expect(mockProductReport).toHaveBeenCalledTimes(1);
    expect(mockProductReport).toHaveBeenCalledWith(
      { containerId: CONTAINER_ID, consent: GRANTED_BOTH },
      `/fi/kauppa/${PRODUCT_ID}`,
      { event: "view_item", ecommerce: ECOMMERCE, advertised: true },
    );
  });

  // Analytics counts every product; an advertising tag reads the flag.
  it("reports a product we do not advertise, saying so", () => {
    renderProductView({ ...ROBLOX_CLUB, product_type: "municipality_club" });

    expect(mockProductReport.mock.calls[0][2]).toMatchObject({
      event: "view_item",
      advertised: false,
    });
  });

  it("reports nothing for a signed-in gamer", () => {
    mockAuth.user = { id: "gamer-1" };
    mockAuth.profile = { role: "gamer" };

    renderProductView(ROBLOX_CLUB);

    expect(mockProductReport).not.toHaveBeenCalled();
  });

  it("reports nothing without marketing consent", () => {
    renderProductView(ROBLOX_CLUB, ANALYTICS_ONLY);

    expect(mockProductReport).not.toHaveBeenCalled();
  });
});

function CheckoutButton({ product }: { product: Product | null }) {
  const report = useGtmCheckoutStart(product);
  return <button onClick={report}>start</button>;
}

function renderCheckoutButton(product: Product | null = ROBLOX_CLUB) {
  const view = render(
    <ConsentProvider initial={GRANTED_BOTH}>
      <CheckoutButton product={product} />
    </ConsentProvider>,
  );
  const click = () => fireEvent.click(view.getByRole("button"));
  return { ...view, click };
}

describe("useGtmCheckoutStart", () => {
  beforeEach(() => {
    mockPathname.value = `/shop/${PRODUCT_ID}`;
  });

  it("pushes add_to_cart from the click, once per page however often it is pressed", () => {
    const { click } = renderCheckoutButton();

    click();
    click();

    expect(mockPushNow).toHaveBeenCalledTimes(1);
    expect(mockPushNow).toHaveBeenCalledWith(`/shop/${PRODUCT_ID}`, {
      event: "add_to_cart",
      ecommerce: ECOMMERCE,
      advertised: true,
    });
  });

  // A click that could not go out leaves the page's one report unspent.
  it("tries again on the next click when the push did not go out", () => {
    mockPushNow.mockReturnValueOnce(false);
    const { click } = renderCheckoutButton();

    click();
    click();

    expect(mockPushNow).toHaveBeenCalledTimes(2);
  });

  it("pushes nothing for a signed-in gamer", () => {
    mockAuth.user = { id: "gamer-1" };
    mockAuth.profile = { role: "gamer" };
    const { click } = renderCheckoutButton();

    click();

    expect(mockPushNow).not.toHaveBeenCalled();
  });
});
