import { describe, it, expect, beforeEach, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
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

/** The links the header marks as the reader's current page, by accessible name. */
function currentLinks(): (string | null)[] {
  return screen
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
});
