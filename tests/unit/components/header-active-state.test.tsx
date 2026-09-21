import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "@/../messages/en.json";
import { Header } from "@/components/layout/header";

/**
 * Where the header says the reader is.
 *
 * Substitutions lives under the gedu dashboard's path, because that prefix is
 * what role-gates it — and the logo marks itself current on its dashboard and
 * everything beneath it. Left alone the two rules light two places at once, so
 * a page with a nav item of its own is carved out of the logo's claim. The
 * shared setup pins the pathname to "/", so this file brings its own.
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
});
