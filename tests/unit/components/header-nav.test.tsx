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
 * What is pinned here is the one thing about it that is not obvious from the
 * markup: **it is the only piece of chrome that varies by role**, so a signed-in
 * gedu gets an item nobody else does, About gives way to it on a phone, and
 * every other role's strip has to come out byte for byte as it was. Plus the
 * two things a type-check cannot see — that the shortened French label never
 * reaches an accessible name, and that the scene-only `navRole` override
 * reaches the nav (and the menu's copy of the same decision) and nothing else.
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

/**
 * The run of nav links, found through a link that is always in it rather than
 * by walking the DOM: Shop is on the strip for every role at every width.
 */
function navGroup(messages: typeof en | typeof fr = en): HTMLElement {
  const shop = screen.getByRole("link", { name: messages.header.nav.shop });
  const group = shop.parentElement;
  if (!group) throw new Error("Shop link has no nav group around it");
  return group;
}

/** The nav links in DOM order, by their visible text. */
function navTexts(messages: typeof en | typeof fr = en): (string | null)[] {
  return Array.from(navGroup(messages).children).map((el) => el.textContent);
}

function substitutionsLink(messages: typeof en | typeof fr = en) {
  return screen.queryByRole("link", {
    name: messages.header.nav.substitutions,
  });
}

beforeEach(() => {
  mockAuth.mockReset();
  accountMenuProps.length = 0;
});

describe("Header nav — who gets the Substitutions item", () => {
  it("gives a signed-in gedu the item, first in the run and ahead of About", () => {
    signedInAs("gedu");
    renderHeader();

    const link = substitutionsLink();
    expect(link).not.toBeNull();
    expect(link?.getAttribute("href")).toBe("/gedu/substitutions");
    // Left of About, per the owner — and the position is load-bearing: the run
    // is anchored to the strip's right edge, so an item that ever arrives late
    // has to join at this end or it shoves the links after it sideways.
    expect(navTexts()).toEqual([
      // Both label spans are in the DOM; one is hidden by breakpoint.
      en.header.nav.substitutions + en.header.nav.substitutionsPhone,
      en.header.nav.about,
      en.header.nav.shop,
    ]);
  });

  it.each([["customer"], ["gamer"], ["admin"]] as const)(
    "gives a signed-in %s nothing new",
    (role) => {
      signedInAs(role);
      renderHeader();

      expect(substitutionsLink()).toBeNull();
      expect(navTexts()).toEqual([en.header.nav.about, en.header.nav.shop]);
    },
  );

  it("gives a signed-out visitor nothing new", () => {
    signedOut();
    renderHeader();

    expect(substitutionsLink()).toBeNull();
    expect(navTexts()).toEqual([en.header.nav.about, en.header.nav.shop]);
  });

  it("gives a session whose profile never landed nothing new", () => {
    // The role is what the item is decided from, and a profile read that failed
    // server-side is never repaired on the client — so this state is permanent
    // rather than transient, and it must not guess.
    mockAuth.mockReturnValue({ user: USER, profile: null, isLoading: false });
    renderHeader();

    expect(substitutionsLink()).toBeNull();
  });
});

describe("Header nav — every other role's strip is untouched", () => {
  /**
   * The claim this branch has to make good on: only a gedu's header changed.
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
    // Neither half of the gedu accommodation leaks into it: About keeps its
    // place on the phone strip, and the gap to the account cluster is the one
    // it always was.
    const [shape] = [...shapes];
    expect(shape).not.toContain("sm:inline-flex");
    expect(navGroup().parentElement?.className).toBe(
      "flex items-center gap-2 sm:gap-3",
    );
    view.unmount();
  });

  it("tightens that gap by one step only while the gedu item is on the strip", () => {
    signedInAs("gedu");
    renderHeader();

    // 4px back on a phone, which is what carries Finnish clear of the 360px
    // floor. Unchanged from `sm` up, where the strip has room either way.
    expect(navGroup().parentElement?.className).toBe(
      "flex items-center gap-1 sm:gap-3",
    );
  });
});

describe("Header nav — About gives way on a phone, for gedus only", () => {
  it("hides About below sm for a gedu", () => {
    signedInAs("gedu");
    renderHeader();

    const about = screen.getByRole("link", { name: en.header.nav.about });
    expect(about.className).toContain("hidden sm:inline-flex");
    // Shop stays on the strip at every width — it is the one a gedu might
    // actually be going to.
    const shop = screen.getByRole("link", { name: en.header.nav.shop });
    expect(shop.className).not.toContain("hidden");
  });

  it.each([["customer"], ["gamer"], ["admin"]] as const)(
    "leaves About on the strip at every width for a %s",
    (role) => {
      signedInAs(role);
      renderHeader();

      const about = screen.getByRole("link", { name: en.header.nav.about });
      expect(about.className).not.toContain("hidden");
    },
  );
});

describe("Header nav — the French phone label", () => {
  it("sets the short word on a phone, the whole one from sm, and announces the whole one", () => {
    signedInAs("gedu");
    renderHeader(fr);

    // "Remplacements" does not fit the 360px or 390px strip; "Rempl." does.
    // The accessible name is stated on the link, so the abbreviation is never
    // what a screen reader reads out.
    const link = screen.getByRole("link", {
      name: fr.header.nav.substitutions,
    });
    expect(link.getAttribute("aria-label")).toBe("Remplacements");
    expect(
      within(link).getByText("Rempl.").className,
    ).toContain("sm:hidden");
    expect(
      within(link).getByText("Remplacements").className,
    ).toContain("hidden sm:inline");
  });

  it("uses the same two-span shape in a locale whose words are equal", () => {
    // Four of the five locales set the same word in both keys. The pair is
    // rendered anyway, so the component carries one rule and no per-locale
    // branch — and a locale that later runs out of room is a copy change.
    signedInAs("gedu");
    renderHeader();

    const link = screen.getByRole("link", {
      name: en.header.nav.substitutions,
    });
    expect(link.querySelectorAll("span")).toHaveLength(2);
    expect(en.header.nav.substitutionsPhone).toBe(en.header.nav.substitutions);
  });
});

describe("Header nav — the scene-only navRole override", () => {
  it("draws the gedu nav for the admin who opened a gedu scene", () => {
    signedInAs("admin");
    renderHeader(en, { navRole: "gedu" });

    expect(substitutionsLink()).not.toBeNull();
    expect(
      screen.getByRole("link", { name: en.header.nav.about }).className,
    ).toContain("hidden sm:inline-flex");
  });

  it("hands the same override to the account menu and changes nothing else about it", () => {
    signedInAs("admin");
    renderHeader(en, { navRole: "gedu" });

    // The menu's copy governs its own rehoused About row. Everything else about
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
