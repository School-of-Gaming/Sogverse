import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "@/../messages/en.json";
import fr from "@/../messages/fr.json";
import { Header } from "@/components/layout/header";
import type { UserRole } from "@/lib/constants";

/**
 * The header strip's nav.
 *
 * What is pinned here is what is not obvious from the markup: **the strip is
 * the only piece of chrome that varies by role**, so a signed-in gedu gets
 * items nobody else does and every other role's strip has to come out byte for
 * byte the same; the public links are on the strip only from `md` up (the tab
 * bar has them below it); and the breakpoints the measured table in
 * `header.tsx` settled. Plus the two things a type-check cannot see — that the
 * shortened French label never reaches an accessible name, and that the
 * scene-only `navRole` override reaches the nav (and the menu's copy of the
 * same decision) and nothing else.
 */

const mockAuth = vi.hoisted(() => vi.fn());
vi.mock("@/providers", () => ({ useAuth: () => mockAuth() }));

/**
 * The menu has its own suite; here it is a stub that records what the header
 * hands it, because the `navRole` pass-through is part of this contract.
 */
const accountMenuProps = vi.hoisted(() => [] as Record<string, unknown>[]);
vi.mock("@/components/layout/account-menu", async () => {
  const { createElement } = await import("react");
  return {
    AccountMenu: (props: Record<string, unknown>) => {
      accountMenuProps.push(props);
      return createElement("button", {
        type: "button",
        "data-testid": "account-menu",
      });
    },
  };
});

// Stubbed for the same reason: it is a sibling of the nav, not part of it, and
// it drags the locale-control context and every flag in the set along with it.
vi.mock("@/components/layout/locale-picker", async () => {
  const { createElement } = await import("react");
  return {
    LocalePicker: () => createElement("div", { "data-testid": "locale-picker" }),
  };
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

function signedOut() {
  mockAuth.mockReturnValue({ user: null, profile: null, isLoading: false });
}

function renderHeader(
  messages: typeof en | typeof fr = en,
  props: { navRole?: UserRole } = {},
) {
  return render(
    <NextIntlClientProvider
      locale={messages === fr ? "fr" : "en"}
      messages={messages}
    >
      <Header {...props} />
    </NextIntlClientProvider>,
  );
}

/** The site header itself, apart from the tab bar the header also renders. */
function banner(): HTMLElement {
  return screen.getByRole("banner");
}

/**
 * The run of nav links, found through a link that is always in it rather than
 * by walking the DOM: Shop is in the run for every role (shown from `md` up).
 */
function navGroup(messages: typeof en | typeof fr = en): HTMLElement {
  const shop = within(banner()).getByRole("link", {
    name: messages.header.nav.shop,
  });
  const group = shop.parentElement;
  if (!group) throw new Error("Shop link has no nav group around it");
  return group;
}

/** The nav links in DOM order, by their visible text. */
function navTexts(messages: typeof en | typeof fr = en): (string | null)[] {
  return Array.from(navGroup(messages).children).map((el) => el.textContent);
}

function stripLink(name: string) {
  return within(banner()).queryByRole("link", { name });
}

function teamProfileLink() {
  return stripLink(en.header.teamProfile);
}

function substitutionsLink(messages: typeof en | typeof fr = en) {
  return stripLink(messages.header.nav.substitutions);
}

const PUBLIC_LINKS = [
  en.header.nav.shop,
  en.header.nav.library,
  en.header.nav.team,
  en.header.nav.about,
];

beforeEach(() => {
  mockAuth.mockReset();
  accountMenuProps.length = 0;
});

describe("Header nav — who gets the gedu items", () => {
  it("gives a signed-in gedu its items, first in the run and ahead of the public links", () => {
    signedInAs("gedu");
    renderHeader();

    const link = substitutionsLink();
    expect(link).not.toBeNull();
    expect(link?.getAttribute("href")).toBe("/gedu/substitutions");
    // The position is load-bearing: the run is anchored to the strip's right
    // edge, so an item that ever arrives late has to join at this end or it
    // shoves the links after it sideways.
    expect(navTexts()).toEqual([
      en.header.invoicing,
      // Both label spans are in the DOM; one is hidden by breakpoint.
      en.header.nav.substitutionsShort + en.header.nav.substitutions,
      en.header.teamProfile,
      ...PUBLIC_LINKS,
    ]);
  });

  it.each([["customer"], ["gamer"], ["admin"]] as const)(
    "gives a signed-in %s nothing new",
    (role) => {
      signedInAs(role);
      renderHeader();

      expect(substitutionsLink()).toBeNull();
      expect(teamProfileLink()).toBeNull();
      expect(navTexts()).toEqual(PUBLIC_LINKS);
    },
  );

  it("gives a signed-out visitor nothing new", () => {
    signedOut();
    renderHeader();

    expect(substitutionsLink()).toBeNull();
    expect(navTexts()).toEqual(PUBLIC_LINKS);
  });

  it("gives a session whose profile never landed nothing new", () => {
    // The role is what the items are decided from, and a profile read that
    // failed server-side is never repaired on the client — so this state is
    // permanent rather than transient, and it must not guess.
    mockAuth.mockReturnValue({ user: USER, profile: null, isLoading: false });
    renderHeader();

    expect(substitutionsLink()).toBeNull();
  });
});

describe("Header nav — every other role's strip is identical", () => {
  /**
   * Asserted as DOM equality between the roles rather than against a frozen
   * string, so it stays true through an unrelated edit to the shared markup
   * and fails the moment one role's strip diverges from another's.
   */
  it("renders one identical nav for admin, parent, gamer and signed-out", () => {
    const shapes = new Set<string>();
    for (const role of ["admin", "customer", "gamer"] as const) {
      signedInAs(role);
      const view = renderHeader();
      shapes.add(navGroup().outerHTML);
      view.unmount();
    }
    signedOut();
    const view = renderHeader();
    shapes.add(navGroup().outerHTML);

    expect(shapes.size).toBe(1);
    view.unmount();
  });

  it("holds the run off the account cluster by the same gap for a gedu", () => {
    for (const role of ["gedu", "customer"] as const) {
      signedInAs(role);
      const view = renderHeader();
      expect(navGroup().parentElement?.className).toBe(
        "flex items-center gap-2 sm:gap-3",
      );
      view.unmount();
    }
  });
});

describe("Header nav — the public links are the strip's from md up", () => {
  it.each([["gedu"], ["customer"], ["gamer"], ["admin"]] as const)(
    "hides every public link below md for a %s, where the tab bar has them",
    (role) => {
      signedInAs(role);
      renderHeader();

      for (const name of PUBLIC_LINKS) {
        expect(stripLink(name)?.className).toContain("hidden md:inline-flex");
      }
    },
  );

  it("links Team to the bare path, and the rest through the route map", () => {
    signedOut();
    renderHeader();

    expect(stripLink(en.header.nav.team)?.getAttribute("href")).toBe("/team");
    expect(stripLink(en.header.nav.library)?.getAttribute("href")).toBe(
      "/library",
    );
  });
});

/**
 * Invoicing and My profile join the strip together at `lg`: below it they are
 * rows in the avatar menu (its suite pins the matching `lg:hidden`). An admin
 * has a profile too but reaches it from settings, never from the strip.
 */
describe("Header nav — the gedu's Invoicing and My profile items", () => {
  it("are on the strip from lg up for a gedu", () => {
    signedInAs("gedu");
    renderHeader();

    const profile = teamProfileLink();
    expect(profile?.getAttribute("href")).toBe("/settings/profile");
    expect(profile?.className).toContain("hidden lg:inline-flex");
    expect(stripLink(en.header.invoicing)?.className).toContain(
      "hidden lg:inline-flex",
    );
  });

  it("leaves Substitutions on the strip at every width", () => {
    signedInAs("gedu");
    renderHeader();

    expect(substitutionsLink()?.className).not.toContain("hidden");
  });
});

describe("Header nav — the French short label", () => {
  it("sets the short word below lg, the whole one from lg, and announces the whole one", () => {
    signedInAs("gedu");
    renderHeader(fr);

    // "Remplacements" does not fit the French `md` strip beside the four
    // public links; "Rempl." does. The accessible name is stated on the link,
    // so the abbreviation is never what a screen reader reads out.
    const link = within(banner()).getByRole("link", {
      name: fr.header.nav.substitutions,
    });
    expect(link.getAttribute("aria-label")).toBe("Remplacements");
    expect(within(link).getByText("Rempl.").className).toContain("lg:hidden");
    expect(within(link).getByText("Remplacements").className).toContain(
      "hidden lg:inline",
    );
  });

  it("uses the same two-span shape in a locale whose words are equal", () => {
    // Four of the five locales set the same word in both keys. The pair is
    // rendered anyway, so the component carries one rule and no per-locale
    // branch — and a locale that later runs out of room is a copy change.
    signedInAs("gedu");
    renderHeader();

    const link = within(banner()).getByRole("link", {
      name: en.header.nav.substitutions,
    });
    expect(link.querySelectorAll("span")).toHaveLength(2);
    expect(en.header.nav.substitutionsShort).toBe(en.header.nav.substitutions);
  });
});

describe("Header — the lockup beside the badge", () => {
  it("sets the wordmark at every width when signed out", () => {
    signedOut();
    renderHeader();

    const logo = within(banner()).getByRole("link", {
      name: "School of Gaming",
    });
    const mark = logo.querySelector("svg");
    expect(mark).not.toBeNull();
    expect(mark?.getAttribute("class") ?? "").not.toContain("hidden");
  });

  it.each([["customer"], ["gamer"], ["admin"]] as const)(
    "sets the dashboard's word at every width for a %s",
    (role) => {
      signedInAs(role);
      renderHeader();

      const word =
        role === "admin" ? en.common.dashboard : en.dashboardSections.pageTitle;
      expect(within(banner()).getByText(word).className).not.toContain(
        "hidden",
      );
    },
  );

  it("lets a gedu's badge stand alone below sm, where Substitutions needs the room", () => {
    signedInAs("gedu");
    renderHeader();

    expect(
      within(banner()).getByText(en.dashboardSections.pageTitle).className,
    ).toContain("hidden sm:inline");
  });
});

describe("Header nav — the scene-only navRole override", () => {
  it("draws the gedu nav for the admin who opened a gedu scene", () => {
    signedInAs("admin");
    renderHeader(en, { navRole: "gedu" });

    expect(substitutionsLink()).not.toBeNull();
    expect(teamProfileLink()).not.toBeNull();
  });

  it("hands the same override to the account menu and changes nothing else about it", () => {
    signedInAs("admin");
    renderHeader(en, { navRole: "gedu" });

    // The menu's copy governs its own rehoused nav rows. Everything else about
    // the account is still the admin's, because it really is the admin looking.
    expect(accountMenuProps.at(-1)).toMatchObject({
      role: "admin",
      navRole: "gedu",
      userId: USER.id,
    });
  });

  it("passes no override when a scene has not asked for one", () => {
    signedInAs("gedu");
    renderHeader();

    expect(accountMenuProps.at(-1)?.navRole).toBeUndefined();
  });
});

describe("Header — an account that still owes its registration", () => {
  it("tells the menu so, from the profile's own completion stamp", () => {
    mockAuth.mockReturnValue({
      user: USER,
      profile: {
        id: USER.id,
        role: "customer",
        first_name: "New User",
        registration_completed_at: null,
      },
      isLoading: false,
    });
    renderHeader();

    // The menu holds its household read back on this: every gated route
    // refuses the account until the finish page is done.
    expect(accountMenuProps.at(-1)).toMatchObject({
      role: "customer",
      registrationOwed: true,
    });
  });

  it("and not otherwise", () => {
    mockAuth.mockReturnValue({
      user: USER,
      profile: {
        id: USER.id,
        role: "customer",
        first_name: "Riikka",
        registration_completed_at: "2026-01-01T00:00:00.000Z",
      },
      isLoading: false,
    });
    renderHeader();

    expect(accountMenuProps.at(-1)?.registrationOwed).toBe(false);
  });
});
