import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { AccountMenu } from "@/components/layout/account-menu";
import type { UserRole } from "@/lib/constants";

/**
 * The header avatar is the only account affordance on every page: it is where
 * settings live, where sign-out lives, and — for a household — where switching
 * between family members happens. What these tests pin is the part of that a
 * type-check cannot see: which rows each role gets, that the viewer's own row
 * is present but not activatable, that the sign-out really is the canonical
 * form POST rather than a client fetch, and that a switch holds every row
 * disabled through the full-page navigation it causes.
 */

// Real, generated UUIDs: the identicon derives its grid from the id's hex
// bytes, so a readable stand-in renders a degenerate avatar and makes every
// fixture here a false picture of the real thing.
const IDS = {
  parent: "1e868664-5834-495e-b3ad-64aa1b69fb43",
  gamerZoe: "5c48ee6c-46de-4248-ae15-0d13ff34a1b0",
  gamerAino: "e610b279-7a20-4238-942a-766f34355077",
  gedu: "9d824902-bad1-4fcb-a94b-7839517cb06a",
} as const;

const FAMILY = [
  // Deliberately unordered on the wire: the menu sorts parents first, then
  // gamers, each by first name in the viewer's locale.
  { id: IDS.gamerZoe, role: "gamer" as const, first_name: "Zoe" },
  { id: IDS.parent, role: "customer" as const, first_name: "Riikka" },
  { id: IDS.gamerAino, role: "gamer" as const, first_name: "Aino" },
];

const mockUseFamily = vi.hoisted(() => vi.fn());
const mockSwitchAccount = vi.hoisted(() => vi.fn());

vi.mock("@/services/family", () => ({
  useFamily: (options?: { enabled?: boolean }) => mockUseFamily(options),
  FamilyService: class {
    switchAccount = mockSwitchAccount;
  },
}));

const mockTrack = vi.hoisted(() => vi.fn());
vi.mock("@vercel/analytics", () => ({ track: mockTrack }));

// A switch ends in `window.location.href = …`, which jsdom refuses to
// navigate. Swap in a plain object so the assignment is observable — the
// full-page nav is the whole point of the switch (the browser Supabase
// singleton is only rebuilt by a document reload), so it is worth asserting.
const realLocation = window.location;
Object.defineProperty(window, "location", {
  configurable: true,
  writable: true,
  value: { href: "http://localhost/" },
});
afterAll(() => {
  Object.defineProperty(window, "location", {
    configurable: true,
    writable: true,
    value: realLocation,
  });
});

const MENU_LABEL = messages.header.accountMenu;
const MY_SOG = messages.dashboardSections.pageTitle;
const SETTINGS = messages.common.settings;
const SIGN_OUT = messages.common.signOut;
const PARENT_ROLE = messages.common.roleParent;

function renderMenu(props: {
  userId: string;
  role: UserRole;
  firstName: string;
}) {
  return render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <AccountMenu {...props} />
    </NextIntlClientProvider>,
  );
}

function trigger() {
  return screen.getByRole("button", { name: MENU_LABEL });
}

function openMenu() {
  fireEvent.click(trigger());
}

function menuIsOpen() {
  return screen.queryByRole("menu") !== null;
}

/**
 * The rows, read by their text rather than their accessible name — a row can
 * be a link, a button or a plain div, and the role word trailing a parent's
 * name would otherwise have to be spelt differently per query.
 */
function rowTexts() {
  return screen.getAllByRole("menuitem").map((el) => el.textContent);
}

function row(text: string) {
  const found = screen
    .getAllByRole("menuitem")
    .find((el) => el.textContent === text);
  if (!found) {
    throw new Error(
      `No menu row reading "${text}". Rows: ${JSON.stringify(rowTexts())}`,
    );
  }
  return found;
}

function isBlocked(el: Element) {
  return el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true";
}

beforeEach(() => {
  mockSwitchAccount.mockReset();
  mockSwitchAccount.mockResolvedValue(undefined);
  mockTrack.mockClear();
  mockUseFamily.mockReset();
  mockUseFamily.mockReturnValue({ data: FAMILY, isError: false });
  window.location.href = "http://localhost/";
});

describe("AccountMenu — opening and closing", () => {
  it("shows nothing until the avatar is clicked, and closes again on a second click", () => {
    renderMenu({ userId: IDS.parent, role: "customer", firstName: "Riikka" });

    expect(menuIsOpen()).toBe(false);
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    expect(trigger().getAttribute("aria-haspopup")).toBe("menu");

    openMenu();
    expect(menuIsOpen()).toBe(true);
    expect(trigger().getAttribute("aria-expanded")).toBe("true");

    openMenu();
    expect(menuIsOpen()).toBe(false);
  });

  it("closes on Escape", () => {
    renderMenu({ userId: IDS.parent, role: "customer", firstName: "Riikka" });
    openMenu();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(menuIsOpen()).toBe(false);
  });

  it("closes on a click outside it", () => {
    renderMenu({ userId: IDS.parent, role: "customer", firstName: "Riikka" });
    openMenu();

    fireEvent.mouseDown(document.body);

    expect(menuIsOpen()).toBe(false);
  });

  it("closes when a navigating row is clicked", () => {
    renderMenu({ userId: IDS.parent, role: "customer", firstName: "Riikka" });
    openMenu();

    fireEvent.click(row(SETTINGS));

    expect(menuIsOpen()).toBe(false);
  });
});

describe("AccountMenu — what each role is offered", () => {
  it("gives a parent the household, parents before gamers, around the fixed rows", () => {
    renderMenu({ userId: IDS.parent, role: "customer", firstName: "Riikka" });
    openMenu();

    expect(rowTexts()).toEqual([
      MY_SOG,
      "Riikka" + PARENT_ROLE,
      "Aino",
      "Zoe",
      SETTINGS,
      SIGN_OUT,
    ]);
    // The household read is the one this role is allowed to make.
    expect(mockUseFamily).toHaveBeenCalledWith({ enabled: true });
  });

  it("gives a gamer the same household, with the parent row marked as the adult", () => {
    renderMenu({ userId: IDS.gamerAino, role: "gamer", firstName: "Aino" });
    openMenu();

    expect(rowTexts()).toEqual([
      MY_SOG,
      "Riikka" + PARENT_ROLE,
      "Aino",
      "Zoe",
      SETTINGS,
      SIGN_OUT,
    ]);
  });

  it("gives a gedu one row — themselves — and never asks for a household", () => {
    renderMenu({ userId: IDS.gedu, role: "gedu", firstName: "Mikko" });
    openMenu();

    expect(rowTexts()).toEqual([MY_SOG, "Mikko", SETTINGS, SIGN_OUT]);
    // /api/family/list is gated to customers and gamers; asking would 403 on
    // every navigation.
    expect(mockUseFamily).toHaveBeenCalledWith({ enabled: false });
  });

  it("calls the admin's dashboard a Dashboard, because that is what it is", () => {
    renderMenu({ userId: IDS.gedu, role: "admin", firstName: "Kyle" });
    openMenu();

    expect(rowTexts()).toEqual([
      messages.common.dashboard,
      "Kyle",
      SETTINGS,
      SIGN_OUT,
    ]);
  });

  it("falls back to a menu without family rows when the household read fails", () => {
    mockUseFamily.mockReturnValue({ data: undefined, isError: true });
    renderMenu({ userId: IDS.parent, role: "customer", firstName: "Riikka" });
    openMenu();

    // A broken menu would be worse than a short one: settings and the way out
    // still have to be reachable.
    expect(rowTexts()).toEqual([MY_SOG, SETTINGS, SIGN_OUT]);
  });

  it("paints nothing at all while the household read is still unresolved", () => {
    // The alternative is family rows dropping in above Settings and Sign out
    // after the panel is already on screen, shoving them down under a cursor
    // already reaching for one.
    mockUseFamily.mockReturnValue({ data: undefined, isError: false });
    renderMenu({ userId: IDS.parent, role: "customer", firstName: "Riikka" });
    openMenu();

    expect(menuIsOpen()).toBe(false);
  });
});

describe("AccountMenu — the viewer's own row", () => {
  it("is present, marked current, and not activatable", () => {
    renderMenu({ userId: IDS.parent, role: "customer", firstName: "Riikka" });
    openMenu();

    const self = row("Riikka" + PARENT_ROLE);

    expect(self.getAttribute("aria-current")).toBe("true");
    expect(self.getAttribute("aria-disabled")).toBe("true");
    // Not a button — there is nothing to press, and it must not read as one.
    expect(self.tagName).toBe("DIV");
  });

  it("leaves every other member's row a real button", () => {
    renderMenu({ userId: IDS.parent, role: "customer", firstName: "Riikka" });
    openMenu();

    for (const name of ["Aino", "Zoe"]) {
      const other = row(name);
      expect(other.tagName).toBe("BUTTON");
      expect(other.hasAttribute("aria-current")).toBe(false);
      expect(isBlocked(other)).toBe(false);
    }
  });

  it("is the gedu's only row too", () => {
    renderMenu({ userId: IDS.gedu, role: "gedu", firstName: "Mikko" });
    openMenu();

    const self = row("Mikko");
    expect(self.getAttribute("aria-current")).toBe("true");
    expect(self.tagName).toBe("DIV");
  });
});

describe("AccountMenu — switching to another member", () => {
  it("switches the session and takes the browser to the target's dashboard", async () => {
    renderMenu({ userId: IDS.parent, role: "customer", firstName: "Riikka" });
    openMenu();

    fireEvent.click(row("Aino"));

    expect(mockSwitchAccount).toHaveBeenCalledWith(IDS.gamerAino);
    // A full-page navigation, never a router.push: the browser Supabase client
    // is seeded from cookies at construction and only a document reload
    // rebuilds it.
    await waitFor(() => expect(window.location.href).toBe("/gamer"));
  });

  it("sends a gamer switching into their parent to the parent dashboard", async () => {
    renderMenu({ userId: IDS.gamerAino, role: "gamer", firstName: "Aino" });
    openMenu();

    fireEvent.click(row("Riikka" + PARENT_ROLE));

    expect(mockSwitchAccount).toHaveBeenCalledWith(IDS.parent);
    await waitFor(() => expect(window.location.href).toBe("/parent"));
  });

  it("holds every actionable row disabled from the click onward, and never re-enables", async () => {
    // The success path ends in a document unload, so a row that re-enables in
    // the gap lets a fast user fire a second switch.
    let settle: () => void = () => {};
    mockSwitchAccount.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          settle = resolve;
        }),
    );

    renderMenu({ userId: IDS.parent, role: "customer", firstName: "Riikka" });
    openMenu();

    fireEvent.click(row("Aino"));

    const allBlocked = () => screen.getAllByRole("menuitem").every(isBlocked);

    // Every row bar none: the two switch targets, the two links, sign-out, and
    // the viewer's own inert row.
    await waitFor(() => expect(allBlocked()).toBe(true));

    settle();
    await waitFor(() => expect(window.location.href).toBe("/gamer"));
    expect(allBlocked()).toBe(true);
  });

  it("re-enables the rows and says what went wrong when the switch fails", async () => {
    mockSwitchAccount.mockRejectedValue(new Error("Failed to switch accounts"));

    renderMenu({ userId: IDS.parent, role: "customer", firstName: "Riikka" });
    openMenu();

    fireEvent.click(row("Aino"));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("Failed to switch accounts");
    expect(isBlocked(row("Aino"))).toBe(false);
    // Nowhere was navigated to.
    expect(window.location.href).toBe("http://localhost/");
  });
});

describe("AccountMenu — sign out", () => {
  it("is the canonical form POST, not a client fetch", () => {
    const { container } = renderMenu({
      userId: IDS.parent,
      role: "customer",
      firstName: "Riikka",
    });
    openMenu();

    const submit = row(SIGN_OUT);
    expect(submit.getAttribute("type")).toBe("submit");

    const form = container.querySelector("form");
    expect(form?.getAttribute("method")).toBe("post");
    expect(form?.getAttribute("action")).toBe("/api/auth/signout");
    expect(form?.contains(submit)).toBe(true);
  });
});

describe("AccountMenu — analytics", () => {
  it("keeps the gedu avatar's dashboard event on the row that inherited the trip", () => {
    renderMenu({ userId: IDS.gedu, role: "gedu", firstName: "Mikko" });
    openMenu();

    fireEvent.click(row(MY_SOG));

    expect(mockTrack).toHaveBeenCalledWith("dashboard_nav", {
      role: "gedu",
      method: "avatar",
      from: "/",
    });
  });

  it("does not invent the event for a role that never had it", () => {
    renderMenu({ userId: IDS.parent, role: "customer", firstName: "Riikka" });
    openMenu();

    fireEvent.click(row(MY_SOG));

    expect(mockTrack).not.toHaveBeenCalled();
  });
});
