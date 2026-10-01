import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "@/../messages/en.json";
import { Header } from "@/components/layout/header";

/**
 * Where the chrome says the reader is.
 *
 * Substitutions lives under the gedu dashboard's path, because that prefix is
 * what role-gates it — and two places mark themselves current on the dashboard
 * and everything beneath it: the header's logo and the account menu's My SOG
 * row. Left alone each lights a second place, so a page with a nav item of its
 * own is carved out of both claims, by one shared predicate. **Both consumers
 * are exercised here**, because a carve-out applied in one of them is exactly
 * the bug this file exists to catch. The shared setup pins the pathname to
 * "/", so this file brings its own.
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

// The real account menu, because it is the second consumer of the carve-out.
// A gedu never reads the family list (`/api/family/list` is gated to customers
// and gamers), so these two stubs are asked for nothing and answer nothing.
vi.mock("@/services/family/family.queries", () => ({
  useFamily: () => ({ data: undefined, isPending: false }),
  useSessionProvenance: () => ({ data: undefined, isPending: false }),
  familyKeys: { all: ["family"], list: () => ["family", "list"] },
}));

vi.mock("@/components/layout/locale-picker", async () => {
  const { createElement } = await import("react");
  return { LocalePicker: () => createElement("div") };
});

vi.mock("@vercel/analytics", () => ({ track: vi.fn() }));

const USER = { id: "0b5d8f7c-9b44-4a1a-8a3f-6f2c6a2d5f10", email: "x@sog.gg" };

function renderAt(pathname: string) {
  mockPathname.mockReturnValue(pathname);
  render(
    <NextIntlClientProvider locale="en" messages={en}>
      <Header />
    </NextIntlClientProvider>,
  );
}

/**
 * The links the header strip marks as the reader's current page, by accessible
 * name. The strip only: the tab bar the header also renders names the same
 * place on a phone, and has its own suite.
 */
function currentLinks(): (string | null)[] {
  return within(screen.getByRole("banner"))
    .getAllByRole("link")
    .filter((link) => link.getAttribute("aria-current") === "page")
    .map((link) => link.getAttribute("aria-label") ?? link.textContent);
}

beforeEach(() => {
  mockPathname.mockReset();
  mockAuth.mockReset();
  mockAuth.mockReturnValue({
    user: USER,
    profile: { id: USER.id, role: "gedu", first_name: "Mikko" },
    isLoading: false,
  });
});

describe("Header — where a gedu is told they are", () => {
  it("marks My SOG alone on the dashboard", () => {
    renderAt("/gedu");
    expect(currentLinks()).toEqual([en.dashboardSections.pageTitle]);
  });

  it("still marks My SOG on a page beneath the dashboard", () => {
    renderAt("/gedu/clubs/abc");
    expect(currentLinks()).toEqual([en.dashboardSections.pageTitle]);
  });

  it("marks Substitutions alone on its page, never My SOG beside it", () => {
    renderAt("/gedu/substitutions");
    expect(currentLinks()).toEqual([en.header.nav.substitutions]);
  });

  it("carves the same page out of a nested path beneath it", () => {
    renderAt("/gedu/substitutions/abc");
    expect(currentLinks()).toEqual([en.header.nav.substitutions]);
  });

  it("marks Invoicing alone on its page, never Substitutions or My SOG", () => {
    renderAt("/gedu/invoicing");
    expect(currentLinks()).toEqual([en.header.invoicing]);
  });

  it("marks My profile alone on the profile page", () => {
    renderAt("/settings/profile");
    expect(currentLinks()).toEqual([en.header.teamProfile]);
  });
});

/**
 * The account menu draws the same line from the same predicate, and it is the
 * consumer a carve-out written twice would be forgotten in.
 */
describe("the account menu's My SOG row", () => {
  function dashboardRow(): HTMLElement {
    fireEvent.click(
      screen.getByRole("button", { name: /Mikko/ }),
    );
    return screen.getByRole("menuitem", {
      name: en.dashboardSections.pageTitle,
    });
  }

  it("is current on the dashboard and the pages beneath it", () => {
    renderAt("/gedu/clubs/abc");
    expect(dashboardRow().getAttribute("aria-current")).toBe("page");
  });

  it("is not current on a page with a nav item of its own", () => {
    renderAt("/gedu/substitutions");
    expect(dashboardRow().getAttribute("aria-current")).toBeNull();
  });

  it("is not current on Invoicing, whose row is in the menu itself", () => {
    renderAt("/gedu/invoicing");
    expect(dashboardRow().getAttribute("aria-current")).toBeNull();
  });
});

/**
 * The profile page lives under settings, so the menu's Settings row would claim
 * it too. For a gedu the chrome has an item of its own for the page, and that
 * item is what marks it; an admin has no such item, so Settings still does.
 */
describe("the account menu on the profile page", () => {
  function openRows() {
    fireEvent.click(screen.getByRole("button", { name: /Mikko|Kyle/ }));
  }

  it("marks a gedu's My profile row current, and not Settings", () => {
    renderAt("/settings/profile");
    openRows();
    expect(
      screen
        .getByRole("menuitem", { name: en.header.teamProfile })
        .getAttribute("aria-current"),
    ).toBe("page");
    expect(
      screen
        .getByRole("menuitem", { name: en.common.settings })
        .getAttribute("aria-current"),
    ).toBeNull();
  });

  it("leaves an admin, who has no profile row, with Settings current", () => {
    mockAuth.mockReturnValue({
      user: USER,
      profile: { id: USER.id, role: "admin", first_name: "Kyle" },
      isLoading: false,
    });
    renderAt("/settings/profile");
    openRows();
    expect(
      screen.queryByRole("menuitem", { name: en.header.teamProfile }),
    ).toBeNull();
    expect(
      screen
        .getByRole("menuitem", { name: en.common.settings })
        .getAttribute("aria-current"),
    ).toBe("page");
  });
});
