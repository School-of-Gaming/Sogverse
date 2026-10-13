import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "@/../messages/en.json";
import { AdminHub } from "@/components/admin/hubs/admin-hub";
import {
  ADMIN_HUBS,
  ADMIN_HUB_IDS,
  adminHubForPathname,
} from "@/components/admin/hubs/admin-hubs";
import { Sidebar } from "@/components/layout/sidebar";

/**
 * **The admin hubs: which hub a page is in, which tab is current, and that the
 * rail agrees.**
 *
 * One table declares each hub, and two consumers read it — the tab strip and
 * the rail's highlight. What this file pins is that they agree: every tab of a
 * hub, and every page beneath a product, lights that hub's rail entry; a tab
 * is current on its own page and nowhere beneath it. The shared setup pins the
 * pathname to "/", so this file brings its own.
 */

const mockPathname = vi.hoisted(() => vi.fn<() => string>());

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

vi.mock("@/providers", () => ({
  useAuth: () => ({ profile: { role: "admin", first_name: "Ada" } }),
}));

function renderAt(pathname: string, ui: React.ReactNode) {
  mockPathname.mockReturnValue(pathname);
  return render(
    <NextIntlClientProvider locale="en" messages={en}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("which hub a page belongs to", () => {
  it.each([
    ["/admin/products", "products"],
    ["/admin/sites", "products"],
    ["/admin/sites/[id]", "products"],
    ["/admin/holiday-calendars/new", "products"],
    ["/admin/consumer-clubs/[id]", "products"],
    ["/admin/municipality-clubs/[id]/edit", "products"],
    ["/admin/camps/new", "products"],
    ["/admin/events/[id]/groups/[groupId]", "products"],
    ["/admin/municipality-invoicing", "invoicing"],
    ["/admin/invoice-customers/[id]", "invoicing"],
    ["/admin/gedu-invoicing", "invoicing"],
  ])("puts %s in the %s hub", (pathname, hub) => {
    expect(adminHubForPathname(pathname)).toBe(hub);
  });

  it.each(["/admin", "/admin/users", "/admin/library", "/admin/sitesmap"])(
    "puts %s in no hub",
    (pathname) => {
      expect(adminHubForPathname(pathname)).toBeNull();
    },
  );
});

describe("the hub's tab strip", () => {
  it("marks the tab whose page this is as current, and no other", () => {
    renderAt(
      "/admin/sites",
      <AdminHub hub="products">
        <p>body</p>
      </AdminHub>,
    );

    const strip = screen.getByRole("navigation", {
      name: en.adminHubs.titles.products,
    });
    const links = within(strip).getAllByRole("link");
    expect(links.map((link) => link.getAttribute("href"))).toEqual(
      ADMIN_HUBS.products.tabs.map((tab) => tab.href),
    );
    expect(
      links
        .filter((link) => link.getAttribute("aria-current") === "page")
        .map((link) => link.textContent),
    ).toEqual([en.adminHubs.tabs.sites]);
    expect(
      screen.getByRole("heading", { level: 1 }).textContent,
    ).toBe(en.adminHubs.titles.products);
  });

  it("marks no tab current on a page beneath one", () => {
    renderAt(
      "/admin/invoice-customers/[id]",
      <AdminHub hub="invoicing">
        <p>body</p>
      </AdminHub>,
    );

    const strip = screen.getByRole("navigation", {
      name: en.adminHubs.titles.invoicing,
    });
    for (const link of within(strip).getAllByRole("link")) {
      expect(link.getAttribute("aria-current")).toBeNull();
    }
  });
});

describe("the rail entry of a hub", () => {
  const railEntry = (hub: "products" | "invoicing") =>
    screen.getByTitle(en.sidebar[hub]);

  it.each(
    ADMIN_HUB_IDS.flatMap((hub) =>
      ADMIN_HUBS[hub].tabs.map((tab) => [hub, tab.href] as const),
    ),
  )("lights the %s entry on %s", (hub, pathname) => {
    renderAt(pathname, <Sidebar />);
    expect(railEntry(hub).className).toContain("bg-act");
  });

  it("lights the products entry on a product's own page", () => {
    renderAt("/admin/camps/[id]", <Sidebar />);
    expect(railEntry("products").className).toContain("bg-act");
    expect(railEntry("invoicing").className).not.toContain("bg-act");
  });
});
