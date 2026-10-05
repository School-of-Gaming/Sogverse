import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "@/../messages/en.json";
import fr from "@/../messages/fr.json";
import { Header } from "@/components/layout/header";
import type { UserRole } from "@/lib/constants";

/**
 * The mobile tab bar, as the header renders it.
 *
 * Pinned here: the five tabs and their order, that only the first one depends
 * on who is looking (Home signed out, the role's dashboard under the header's
 * own name signed in), and where it says the reader is — the first tab on
 * exactly the pages the logo is current on, a public tab on its page and
 * every page beneath it — and that a tab may show a short word while its
 * accessible name stays the whole one.
 */

const mockPathname = vi.hoisted(() => vi.fn<() => string>());
const mockAuth = vi.hoisted(() => vi.fn());

vi.mock("@/i18n/navigation", async () => {
  const { createElement } = await import("react");
  return {
    Link: ({
      href,
      ...props
    }: { href: string | { pathname: string } } & Record<string, unknown>) =>
      createElement("a", {
        ...props,
        href: typeof href === "string" ? href : href.pathname,
      }),
    usePathname: () => mockPathname(),
  };
});

vi.mock("@/providers", () => ({ useAuth: () => mockAuth() }));

// Neither is part of the bar; both drag contexts along that it does not need.
vi.mock("@/components/layout/account-menu", async () => {
  const { createElement } = await import("react");
  return { AccountMenu: () => createElement("button", { type: "button" }) };
});
vi.mock("@/components/layout/locale-picker", async () => {
  const { createElement } = await import("react");
  return { LocalePicker: () => createElement("div") };
});

vi.mock("@vercel/analytics", () => ({ track: vi.fn() }));

const USER = { id: "0b5d8f7c-9b44-4a1a-8a3f-6f2c6a2d5f10", email: "x@sog.gg" };

function signedInAs(role: UserRole) {
  mockAuth.mockReturnValue({
    user: USER,
    profile: { id: USER.id, role, first_name: "Mikko" },
    isLoading: false,
  });
}

function signedOut(isLoading = false) {
  mockAuth.mockReturnValue({ user: null, profile: null, isLoading });
}

function renderAt(pathname: string, messages: typeof en | typeof fr = en) {
  mockPathname.mockReturnValue(pathname);
  return render(
    <NextIntlClientProvider
      locale={messages === fr ? "fr" : "en"}
      messages={messages}
    >
      <Header />
    </NextIntlClientProvider>,
  );
}

function bar(messages: typeof en | typeof fr = en): HTMLElement {
  return screen.getByRole("navigation", { name: messages.header.nav.tabBar });
}

function tabs(messages: typeof en | typeof fr = en): HTMLElement[] {
  return within(bar(messages)).getAllByRole("link");
}

function tabNames(): (string | null)[] {
  return tabs().map((tab) => tab.textContent);
}

function currentTabs(): (string | null)[] {
  return tabs()
    .filter((tab) => tab.getAttribute("aria-current") === "page")
    .map((tab) => tab.textContent);
}

const PUBLIC_TABS = [
  en.header.nav.shop,
  en.header.nav.library,
  en.header.nav.team,
  en.header.nav.about,
];

beforeEach(() => {
  mockPathname.mockReset();
  mockAuth.mockReset();
});

describe("Tab bar — the tab set", () => {
  it("leads with Home for a signed-out visitor", () => {
    signedOut();
    renderAt("/shop");

    expect(tabNames()).toEqual([en.header.nav.home, ...PUBLIC_TABS]);
    expect(tabs()[0].getAttribute("href")).toBe("/");
  });

  it("leads with Home while auth is still resolving", () => {
    // A loading render is one the server saw no session on, so the first tab
    // goes where the logo goes: home.
    signedOut(true);
    renderAt("/shop");

    expect(tabNames()).toEqual([en.header.nav.home, ...PUBLIC_TABS]);
  });

  it.each([
    ["customer", "/parent", en.dashboardSections.pageTitle],
    ["gamer", "/gamer", en.dashboardSections.pageTitle],
    ["gedu", "/gedu", en.dashboardSections.pageTitle],
    ["admin", "/admin", en.common.dashboard],
  ] as const)(
    "leads with the dashboard for a signed-in %s, named as the header names it",
    (role, href, label) => {
      signedInAs(role);
      renderAt("/shop");

      expect(tabNames()).toEqual([label, ...PUBLIC_TABS]);
      expect(tabs()[0].getAttribute("href")).toBe(href);
    },
  );

  it("changes only the first tab between the two auth states", () => {
    signedOut();
    const view = renderAt("/shop");
    const before = tabs().slice(1).map((tab) => tab.outerHTML);
    view.unmount();

    signedInAs("customer");
    renderAt("/shop");
    expect(tabs().slice(1).map((tab) => tab.outerHTML)).toEqual(before);
  });

  it("keeps the first tab's icon in both auth states — only its word changes", () => {
    signedOut();
    const view = renderAt("/shop");
    const before = tabs()[0].querySelector("svg")?.getAttribute("class");
    view.unmount();

    signedInAs("gedu");
    renderAt("/shop");
    expect(before).toContain("lucide-house");
    expect(tabs()[0].querySelector("svg")?.getAttribute("class")).toBe(before);
  });

  it("links Team to the bare path", () => {
    signedOut();
    renderAt("/");

    expect(tabs()[3].getAttribute("href")).toBe("/team");
  });

  it("is the mobile bar, below lg only, under the cookie strip", () => {
    signedOut();
    renderAt("/");

    expect(bar().className).toContain("lg:hidden");
    expect(bar().className).toContain("z-40");
  });

  it("spans the viewport, with its tabs a centred group of capped width", () => {
    // On a wide tablet five cells stretched to the bar's width would each be a
    // slab; the cap keeps them phone-sized while the surface stays full-width.
    signedOut();
    renderAt("/");

    expect(bar().className).toContain("inset-x-0");
    const list = bar().querySelector("ul");
    expect(list?.className).toContain("mx-auto");
    expect(list?.className).toContain("max-w-lg");
  });
});

describe("Tab bar — where it says the reader is", () => {
  it("marks Home on the home page for a signed-out visitor", () => {
    signedOut();
    renderAt("/");
    expect(currentTabs()).toEqual([en.header.nav.home]);
  });

  it("marks a public tab on its page and on the pages beneath it", () => {
    signedOut();
    const view = renderAt("/shop");
    expect(currentTabs()).toEqual([en.header.nav.shop]);
    view.unmount();

    renderAt("/shop/[id]");
    expect(currentTabs()).toEqual([en.header.nav.shop]);
  });

  it("marks My SOG on the dashboard and the pages beneath it", () => {
    signedInAs("gedu");
    const view = renderAt("/gedu");
    expect(currentTabs()).toEqual([en.dashboardSections.pageTitle]);
    view.unmount();

    renderAt("/gedu/clubs/abc");
    expect(currentTabs()).toEqual([en.dashboardSections.pageTitle]);
  });

  it("marks nothing on a dashboard page with a nav item of its own", () => {
    // Substitutions has its own nav item; the bar must not claim the page as My SOG.
    signedInAs("gedu");
    renderAt("/gedu/substitutions");
    expect(currentTabs()).toEqual([]);
  });

  it("marks nothing signed in on the home page, which is not where tab one goes", () => {
    signedInAs("customer");
    renderAt("/");
    expect(currentTabs()).toEqual([]);
  });
});

describe("Tab bar — short labels", () => {
  it("shows French Library as its short word, named by the whole word", () => {
    signedOut();
    renderAt("/", fr);

    const library = tabs(fr)[2];
    expect(fr.header.nav.libraryShort).not.toBe(fr.header.nav.library);
    expect(library.textContent).toBe(fr.header.nav.libraryShort);
    expect(library.getAttribute("aria-label")).toBe(fr.header.nav.library);
    expect(
      within(bar(fr)).getByRole("link", { name: fr.header.nav.library }),
    ).toBe(library);
  });

  it("keeps the whole word on the header strip", () => {
    signedOut();
    renderAt("/", fr);

    const stripLibrary = within(screen.getByRole("banner")).getByRole("link", {
      name: fr.header.nav.library,
    });
    expect(stripLibrary.textContent).toBe(fr.header.nav.library);
  });

  it("names every public tab by its whole word", () => {
    signedOut();
    renderAt("/");

    expect(tabs().slice(1).map((tab) => tab.getAttribute("aria-label"))).toEqual(
      PUBLIC_TABS,
    );
  });
});

describe("Tab bar — absent in a voice room", () => {
  it.each(["/voice/group/[id]", "/voice/[code]"])(
    "draws no bar at %s, and keeps the header",
    (pathname) => {
      signedInAs("gamer");
      renderAt(pathname);

      expect(
        screen.queryByRole("navigation", { name: en.header.nav.tabBar }),
      ).toBeNull();
      expect(screen.getByRole("banner")).toBeTruthy();
    },
  );

  it("still draws it on a page that merely starts with the same letters", () => {
    signedOut();
    renderAt("/voiceover");

    expect(bar()).toBeTruthy();
  });
});
