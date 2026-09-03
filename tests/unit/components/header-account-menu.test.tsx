import { describe, it, expect, beforeEach, afterEach, afterAll, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { AccountMenu } from "@/components/layout/account-menu";
import type { UserRole } from "@/lib/constants";

/**
 * The header avatar is the only account affordance on every page: it is where
 * settings live, where sign-out lives, and — for a household — where switching
 * between family members happens.
 *
 * The grammar these tests pin: **the trigger is the identity and the list is
 * destinations only**, so the signed-in person is never a row, their name is on
 * the trigger's accessible label instead, and the rows that remain are headed
 * "Switch to". On top of that, the things a type-check cannot see: that opening
 * always paints a whole menu whatever the family read is doing, that an open
 * panel never restructures under the cursor, that the sign-out really is the
 * canonical form POST rather than a client fetch, and that a switch holds every
 * row disabled — with a spinner on the row that was clicked — through the
 * full-page navigation it causes.
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

/**
 * The two leaves of the family service are mocked, not the barrel — which
 * leaves the real `commitAccountSwitch` under test, so the destination it
 * picks per role is asserted rather than restated by a stub.
 */
vi.mock("@/services/family/family.service", () => ({
  FamilyService: class {
    switchAccount = mockSwitchAccount;
  },
}));
vi.mock("@/services/family/family.queries", () => ({
  useFamily: (options?: { enabled?: boolean }) => mockUseFamily(options),
  familyKeys: { all: ["family"], list: () => ["family", "list"] },
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

/**
 * jsdom has no layout, so it implements no `scrollIntoView` at all — the
 * failure line's "scroll me into the panel's view" effect would throw rather
 * than be skipped. Stubbed here so the call is observable instead.
 */
const scrollIntoView = vi.fn();
Object.defineProperty(Element.prototype, "scrollIntoView", {
  configurable: true,
  writable: true,
  value: scrollIntoView,
});

/**
 * Three rows here are real `<a href>`s, and jsdom answers a click on one by
 * trying to navigate the document — which it cannot do, and reports on stderr
 * through its virtual console (a `jsdomError`, so no `console.error` spy sees
 * it either). React's listeners live on the render root, so by the time this
 * one runs on `document` every handler under test has already had the event;
 * cancelling here suppresses jsdom's navigation attempt and nothing else.
 */
document.addEventListener("click", (event) => {
  if (event.target instanceof Element && event.target.closest("a[href]")) {
    event.preventDefault();
  }
});

const MY_SOG = messages.dashboardSections.pageTitle;
const SETTINGS = messages.common.settings;
const SIGN_OUT = messages.common.signOut;
const PARENT_ROLE = messages.common.roleParent;
const SWITCH_TO = messages.header.switchTo;
const SWITCH_FAILED = messages.family.switchFailed;

/** The trigger's accessible name now carries the viewer's own first name. */
function menuLabel(firstName: string) {
  return messages.header.accountMenu.replace("{name}", firstName);
}

interface MenuProps {
  userId: string;
  role: UserRole;
  firstName: string;
}

const PARENT: MenuProps = {
  userId: IDS.parent,
  role: "customer",
  firstName: "Riikka",
};

const GAMER: MenuProps = {
  userId: IDS.gamerAino,
  role: "gamer",
  firstName: "Aino",
};

const GEDU: MenuProps = {
  userId: IDS.gedu,
  role: "gedu",
  firstName: "Mikko",
};

function ui(props: MenuProps) {
  return (
    <NextIntlClientProvider locale="en" messages={messages}>
      <AccountMenu {...props} />
    </NextIntlClientProvider>
  );
}

function renderMenu(props: MenuProps) {
  return render(ui(props));
}

/**
 * Found by the attribute rather than by name: the accessible name varies with
 * the viewer, and one dedicated test below is where that name is asserted.
 */
function trigger() {
  const el = document.querySelector<HTMLElement>('[aria-haspopup="menu"]');
  if (!el) throw new Error("No account menu trigger rendered");
  return el;
}

function openMenu() {
  fireEvent.click(trigger());
}

function menuIsOpen() {
  return screen.queryByRole("menu") !== null;
}

/**
 * Arrow keys are handled on the wrapper and read `document.activeElement`, so
 * where the keydown is dispatched only has to be inside the component — the
 * trigger always is, open or closed.
 */
function press(key: string) {
  fireEvent.keyDown(trigger(), { key });
}

/**
 * The rows, read by their text rather than their accessible name — a row can
 * be a link or a button, and the role word trailing a parent's name would
 * otherwise have to be spelt differently per query.
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

/**
 * The component defers its close-on-focus-leave decision to a microtask (the
 * synchronous `focusout` a disabling row emits arrives before React's own
 * bookkeeping has caught up, so nothing decided during it can be trusted).
 * `act` drains that microtask and flushes whatever state it set, which is also
 * what keeps a "stays open" assertion honest rather than merely early.
 */
async function focusOut(el: Element, relatedTarget: Element | null) {
  await act(async () => {
    fireEvent.focusOut(el, { relatedTarget });
  });
}

/**
 * Submits the sign-out form and reports whether anything cancelled it on the
 * way. The listener sits on `document`, past React's own root listener, so it
 * reads the flag *after* the component's `onSubmit` has had its chance — and
 * it only reads: a dispatched `submit` event has no navigating default action
 * in jsdom, so there is nothing here to suppress and nothing to distort.
 */
function submitAndReadDefaultPrevented(form: HTMLFormElement) {
  let prevented: boolean | null = null;
  function observe(event: Event) {
    prevented = event.defaultPrevented;
  }
  document.addEventListener("submit", observe);
  try {
    fireEvent.submit(form);
  } finally {
    document.removeEventListener("submit", observe);
  }
  return prevented;
}

/** Puts a switch in flight and hands back the resolver for it. */
function pendingSwitch() {
  let settle: () => void = () => {};
  mockSwitchAccount.mockImplementation(
    () =>
      new Promise<void>((resolve) => {
        settle = resolve;
      }),
  );
  return () => settle();
}

function isBlocked(el: Element) {
  return el.hasAttribute("disabled") || el.getAttribute("aria-disabled") === "true";
}

function hasSpinner(el: Element) {
  return el.querySelector(".animate-spin") !== null;
}

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  mockSwitchAccount.mockReset();
  mockSwitchAccount.mockResolvedValue(undefined);
  mockTrack.mockClear();
  mockUseFamily.mockReset();
  mockUseFamily.mockReturnValue({ data: FAMILY, isError: false });
  scrollIntoView.mockClear();
  window.location.href = "http://localhost/";
  // A failed switch logs the server's own words; keep them out of the run.
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
});

describe("AccountMenu — opening and closing", () => {
  it("shows nothing until the avatar is clicked, and closes again on a second click", () => {
    renderMenu(PARENT);

    expect(menuIsOpen()).toBe(false);
    expect(trigger().getAttribute("aria-expanded")).toBe("false");
    expect(trigger().getAttribute("aria-haspopup")).toBe("menu");

    openMenu();
    expect(menuIsOpen()).toBe(true);
    expect(trigger().getAttribute("aria-expanded")).toBe("true");

    openMenu();
    expect(menuIsOpen()).toBe(false);
  });

  it("closes on Escape and hands focus back to the trigger", () => {
    renderMenu(PARENT);
    openMenu();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(menuIsOpen()).toBe(false);
    // Without this the caret lands on <body> and the next Tab restarts at the
    // top of the page.
    expect(document.activeElement).toBe(trigger());
  });

  it("closes on a click outside it", () => {
    renderMenu(PARENT);
    openMenu();

    fireEvent.mouseDown(document.body);

    expect(menuIsOpen()).toBe(false);
  });

  it("closes when focus leaves the component altogether", async () => {
    renderMenu(PARENT);
    openMenu();

    // Tabbing past the last row: without this the panel stays painted over the
    // page with the keyboard already somewhere else.
    const elsewhere = document.createElement("button");
    document.body.appendChild(elsewhere);
    await focusOut(row(SIGN_OUT), elsewhere);

    expect(menuIsOpen()).toBe(false);
    elsewhere.remove();
  });

  it("stays open while focus moves between its own rows", async () => {
    renderMenu(PARENT);
    openMenu();

    await focusOut(row(MY_SOG), row(SETTINGS));

    expect(menuIsOpen()).toBe(true);
  });

  it("stays open when a committing row blurs itself with nowhere to hand focus", async () => {
    // The defect this pins: React commits `disabled` onto the row that has
    // focus, the browser answers *inside that commit* with a `focusout`
    // carrying no `relatedTarget`, and a guard reading the pre-commit render's
    // `busy` closes the panel at the exact moment of the commit — taking the
    // failure line, or the sign-out spinner, down with it.
    //
    // jsdom does not blur an element it disables, so it cannot stage that
    // ordering; what this test pins is the resulting contract, which the
    // component now honours from refs read a microtask later: a relatedTarget-
    // less blur while a commit is in flight leaves the panel open.
    pendingSwitch();
    renderMenu(PARENT);
    openMenu();

    fireEvent.click(row("Aino"));
    await focusOut(row("Aino"), null);

    expect(menuIsOpen()).toBe(true);
  });

  it("closes when a navigating row is clicked", () => {
    renderMenu(PARENT);
    openMenu();

    fireEvent.click(row(SETTINGS));

    expect(menuIsOpen()).toBe(false);
  });
});

describe("AccountMenu — identity lives on the trigger, not in the list", () => {
  it("names the signed-in person in the trigger's accessible label", () => {
    renderMenu(PARENT);

    // The identicon says nothing to a screen reader, and no row says it any
    // more, so this label is the only place the viewer's own name is stated.
    expect(trigger().getAttribute("aria-label")).toBe(menuLabel("Riikka"));
    expect(
      screen.getByRole("button", { name: menuLabel("Riikka") }),
    ).toBe(trigger());
  });

  it("leaves the signed-in parent out of their own switch list", () => {
    renderMenu(PARENT);
    openMenu();

    expect(rowTexts()).toEqual([MY_SOG, "Aino", "Zoe", SETTINGS, SIGN_OUT]);
    // The household read is the one this role is allowed to make.
    expect(mockUseFamily).toHaveBeenCalledWith({ enabled: true });
  });

  it("leaves the signed-in gamer out too, and marks the parent as the adult", () => {
    renderMenu(GAMER);
    openMenu();

    expect(rowTexts()).toEqual([
      MY_SOG,
      "Riikka" + PARENT_ROLE,
      "Zoe",
      SETTINGS,
      SIGN_OUT,
    ]);
    expect(trigger().getAttribute("aria-label")).toBe(menuLabel("Aino"));
  });

  it("gives a gedu no member rows at all, and never asks for a household", () => {
    renderMenu(GEDU);
    openMenu();

    expect(rowTexts()).toEqual([MY_SOG, SETTINGS, SIGN_OUT]);
    // /api/family/list is gated to customers and gamers; asking would 403 on
    // every navigation.
    expect(mockUseFamily).toHaveBeenCalledWith({ enabled: false });
  });

  it("calls the admin's dashboard a Dashboard, and gives them no member rows either", () => {
    renderMenu({ userId: IDS.gedu, role: "admin", firstName: "Kyle" });
    openMenu();

    expect(rowTexts()).toEqual([messages.common.dashboard, SETTINGS, SIGN_OUT]);
  });
});

describe("AccountMenu — the Switch to heading", () => {
  it("heads the member rows for a household", () => {
    renderMenu(PARENT);
    openMenu();

    const group = screen.getByRole("group");
    // A one-child household shows one name, which without this heading reads
    // as "who I am" rather than "where I can go". The visible label is not a
    // menu item, so the group takes its name from it by reference instead.
    const labelledBy = group.getAttribute("aria-labelledby");
    expect(labelledBy).toBeTruthy();
    const heading = document.getElementById(labelledBy ?? "");
    expect(heading?.textContent).toBe(SWITCH_TO);
    expect(group.contains(heading)).toBe(true);
  });

  it("is absent for a role with nobody to switch to", () => {
    renderMenu(GEDU);
    openMenu();

    expect(screen.queryByRole("group")).toBe(null);
    expect(screen.queryByText(SWITCH_TO)).toBe(null);
  });

  it("is absent when the household read has not landed — never an orphan heading", () => {
    mockUseFamily.mockReturnValue({ data: undefined, isError: false });
    renderMenu(PARENT);
    openMenu();

    expect(screen.queryByText(SWITCH_TO)).toBe(null);
  });

  it("is not reachable by the arrow-key traversal", () => {
    renderMenu(PARENT);
    openMenu();

    // Straight from the dashboard row to the first name: the heading is a
    // label, not a stop.
    press("ArrowDown");
    expect(document.activeElement).toBe(row(MY_SOG));
    press("ArrowDown");
    expect(document.activeElement).toBe(row("Aino"));
  });
});

describe("AccountMenu — when the household is not in hand", () => {
  /**
   * The menu keys on *no data*, and deliberately never consults the query's
   * error flag: a read still backing off and a read that gave up produce the
   * same panel, because there is nothing different to say about them here.
   * Both flag values are exercised so that "regardless of the error flag" is
   * pinned rather than assumed — a single case with a hardcoded `isError`
   * would be decoration.
   */
  it.each([
    ["still in flight", false],
    ["failed outright", true],
  ])("opens at once with the fixed rows alone — read %s", (_label, isError) => {
    mockUseFamily.mockReturnValue({ data: undefined, isError });
    renderMenu(PARENT);
    openMenu();

    // Never a trigger claiming to be expanded over nothing: the retry backoff
    // behind a cold read is seconds long, and Settings and the way out live
    // nowhere else on the page.
    expect(menuIsOpen()).toBe(true);
    expect(trigger().getAttribute("aria-expanded")).toBe("true");
    expect(rowTexts()).toEqual([MY_SOG, SETTINGS, SIGN_OUT]);
  });

  it("does not restructure an open panel when the household lands, and picks it up on the next open", () => {
    mockUseFamily.mockReturnValue({ data: undefined, isError: false });
    const { rerender } = render(ui(PARENT));
    openMenu();
    expect(rowTexts()).toEqual([MY_SOG, SETTINGS, SIGN_OUT]);

    mockUseFamily.mockReturnValue({ data: FAMILY, isError: false });
    rerender(ui(PARENT));

    // Rows inserted into an open panel would shove Settings and Sign out down
    // the list on the data's own schedule, under a cursor already reaching for
    // one of them. The heading travels with the block, so it cannot appear on
    // its own either.
    expect(rowTexts()).toEqual([MY_SOG, SETTINGS, SIGN_OUT]);
    expect(screen.queryByText(SWITCH_TO)).toBe(null);

    openMenu();
    openMenu();

    expect(rowTexts()).toEqual([MY_SOG, "Aino", "Zoe", SETTINGS, SIGN_OUT]);
    expect(screen.queryByText(SWITCH_TO)).not.toBe(null);
  });
});

describe("AccountMenu — member rows", () => {
  it("are real buttons, and each carries the destination chevron", () => {
    renderMenu(PARENT);
    openMenu();

    for (const name of ["Aino", "Zoe"]) {
      const member = row(name);
      expect(member.tagName).toBe("BUTTON");
      expect(isBlocked(member)).toBe(false);
      // The chevron says "this row goes somewhere"; the fixed rows keep their
      // leading-icon shape instead.
      expect(member.querySelector(".lucide-chevron-right")).not.toBe(null);
    }
    expect(row(SETTINGS).querySelector(".lucide-chevron-right")).toBe(null);
  });
});

describe("AccountMenu — keyboard navigation", () => {
  it("opens on ArrowDown from the closed trigger and lands on the first row", () => {
    renderMenu(PARENT);

    press("ArrowDown");

    expect(menuIsOpen()).toBe(true);
    expect(document.activeElement).toBe(row(MY_SOG));
  });

  it("opens on ArrowUp from the closed trigger and lands on the last row", () => {
    renderMenu(PARENT);

    press("ArrowUp");

    expect(menuIsOpen()).toBe(true);
    expect(document.activeElement).toBe(row(SIGN_OUT));
  });

  it("walks every row in order and wraps at both ends", () => {
    renderMenu(PARENT);
    openMenu();

    const order = [MY_SOG, "Aino", "Zoe", SETTINGS, SIGN_OUT];
    for (const text of order) {
      press("ArrowDown");
      expect(document.activeElement).toBe(row(text));
    }

    press("ArrowDown");
    expect(document.activeElement).toBe(row(MY_SOG));
    press("ArrowUp");
    expect(document.activeElement).toBe(row(SIGN_OUT));
  });

  it("jumps to either end with Home and End", () => {
    renderMenu(PARENT);
    openMenu();

    press("End");
    expect(document.activeElement).toBe(row(SIGN_OUT));

    press("Home");
    expect(document.activeElement).toBe(row(MY_SOG));
  });
});

describe("AccountMenu — switching to another member", () => {
  it("switches the session and takes the browser to the target's dashboard", async () => {
    renderMenu(PARENT);
    openMenu();

    fireEvent.click(row("Aino"));

    expect(mockSwitchAccount).toHaveBeenCalledWith(IDS.gamerAino, {});
    // A full-page navigation, never a router.push: the browser Supabase client
    // is seeded from cookies at construction and only a document reload
    // rebuilds it.
    await waitFor(() => expect(window.location.href).toBe("/gamer"));
  });

  it("sends a gamer switching into their parent to the parent dashboard", async () => {
    renderMenu(GAMER);
    openMenu();

    fireEvent.click(row("Riikka" + PARENT_ROLE));

    expect(mockSwitchAccount).toHaveBeenCalledWith(IDS.parent, {});
    await waitFor(() => expect(window.location.href).toBe("/parent"));
  });

  it("holds every row disabled from the click onward, spins the one clicked, and never re-enables", async () => {
    // The success path ends in a document unload, so a row that re-enables in
    // the gap lets a fast user fire a second switch.
    const settle = pendingSwitch();

    renderMenu(PARENT);
    openMenu();

    fireEvent.click(row("Aino"));

    // Every row bar none: the two switch targets, the two links and sign-out.
    // The count is asserted too — "every row is blocked" is vacuously true of
    // a panel that lost its rows.
    const assertCommitted = () => {
      const items = screen.getAllByRole("menuitem");
      expect(items.length).toBe(5);
      expect(items.every(isBlocked)).toBe(true);
      // The spinner takes the chevron's slot on the clicked row only.
      expect(hasSpinner(row("Aino"))).toBe(true);
      expect(hasSpinner(row("Zoe"))).toBe(false);
    };

    await waitFor(assertCommitted);

    settle();
    await waitFor(() => expect(window.location.href).toBe("/gamer"));
    // The resolved promise must not take the spinner down: the document is
    // still on screen until the navigation actually happens.
    assertCommitted();
  });

  it("re-enables the rows, drops the spinner, and says what went wrong in the viewer's language", async () => {
    mockSwitchAccount.mockRejectedValue(new Error("switch-account returned 500"));

    renderMenu(PARENT);
    openMenu();

    fireEvent.click(row("Aino"));

    const alert = await screen.findByRole("alert");
    // The translated line, not the server's English words — those go to the
    // console for whoever is debugging it.
    expect(alert.textContent).toBe(SWITCH_FAILED);
    expect(consoleError).toHaveBeenCalled();
    // A message is not a menu item, so it sits beside the menu element rather
    // than inside it.
    expect(alert.closest('[role="menu"]')).toBe(null);
    expect(isBlocked(row("Aino"))).toBe(false);
    expect(hasSpinner(row("Aino"))).toBe(false);
    // Nowhere was navigated to.
    expect(window.location.href).toBe("http://localhost/");
  });

  it("hands focus back to the row that failed, so the keyboard is still inside the panel", async () => {
    mockSwitchAccount.mockRejectedValue(new Error("switch-account returned 500"));

    renderMenu(PARENT);
    openMenu();

    fireEvent.click(row("Aino"));
    await screen.findByRole("alert");

    // Disabling the clicked row blurs it; re-enabling does not hand focus
    // back. Without this the arrow keys re-enter at the top of the list and a
    // screen-reader user has no way back to the line they need to read.
    // waitFor, not a bare expect: the restore runs in an effect keyed on the
    // committing flag, which can flush a beat after the alert renders — under
    // a loaded parallel suite the bare assertion raced it and flaked.
    await waitFor(() => expect(document.activeElement).toBe(row("Aino")));
  });

  it("scrolls the failure line into the panel's view", async () => {
    mockSwitchAccount.mockRejectedValue(new Error("switch-account returned 500"));

    renderMenu(PARENT);
    openMenu();

    fireEvent.click(row("Aino"));
    const alert = await screen.findByRole("alert");

    // The line is appended last inside a capped, scrolling card, so on a full
    // household already scrolled down it lands below the fold and a failed
    // switch produces no visible change at all.
    expect(scrollIntoView).toHaveBeenCalled();
    expect(scrollIntoView.mock.contexts.at(-1)).toBe(alert);
  });

  it("does not greet a later open with an earlier failure", async () => {
    mockSwitchAccount.mockRejectedValue(new Error("switch-account returned 500"));

    renderMenu(PARENT);
    openMenu();

    fireEvent.click(row("Aino"));
    expect(await screen.findByRole("alert")).not.toBe(null);

    openMenu();
    expect(menuIsOpen()).toBe(false);
    openMenu();

    // The panel unmounts on close but the message does not, so an open minutes
    // later would otherwise open on an alert about something long since past.
    expect(menuIsOpen()).toBe(true);
    expect(screen.queryByRole("alert")).toBe(null);
  });

  it("takes every row out of the arrow-key traversal while a switch is in flight", () => {
    pendingSwitch();
    renderMenu(PARENT);
    openMenu();

    fireEvent.click(row("Aino"));
    // The two links cannot carry `disabled` at all, so the data attribute is
    // the only thing excluding them — this is that half of the selector. With
    // no row left to move to, the caret stays where it is rather than landing
    // on a My SOG row that a click guard would then swallow.
    press("ArrowDown");
    expect(document.activeElement).not.toBe(row(MY_SOG));
    press("End");
    expect(document.activeElement).not.toBe(row(SIGN_OUT));
    expect(document.activeElement).toBe(document.body);
  });
});

describe("AccountMenu — sign out", () => {
  it("is the canonical form POST, not a client fetch", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const { container } = renderMenu(PARENT);
    openMenu();

    const submit = row(SIGN_OUT);
    expect(submit.getAttribute("type")).toBe("submit");

    const form = container.querySelector("form");
    expect(form?.getAttribute("method")).toBe("post");
    expect(form?.getAttribute("action")).toBe("/api/auth/signout");
    expect(form?.contains(submit)).toBe(true);

    if (!form) throw new Error("No sign-out form rendered");
    // The half the markup cannot show: the component lets the native submit
    // proceed. A `preventDefault` here — or a fetch standing in for the POST —
    // would leave the cookies the route rewrites unseen by the browser
    // Supabase singleton, which only a document reload rebuilds.
    expect(submitAndReadDefaultPrevented(form)).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("spins its own row and takes the whole menu out of service, and stays that way", () => {
    const { container } = renderMenu(PARENT);
    openMenu();

    const form = container.querySelector("form");
    if (!form) throw new Error("No sign-out form rendered");
    // The native submit is left to proceed — the browser stays on this
    // document until the 303 comes back, so the spinner is on screen for the
    // whole round trip and there is no success path that clears it.
    fireEvent.submit(form);

    expect(hasSpinner(row(SIGN_OUT))).toBe(true);
    // Nothing else can be clicked behind it: a second click must not race the
    // sign-out.
    const items = screen.getAllByRole("menuitem");
    expect(items.length).toBe(5);
    expect(items.every(isBlocked)).toBe(true);
    // Including the submit itself, which is what stops a second POST.
    expect(row(SIGN_OUT).hasAttribute("disabled")).toBe(true);
    // A member row's spinner is a different thing — it must not appear here.
    expect(hasSpinner(row("Aino"))).toBe(false);
  });
});

describe("AccountMenu — analytics", () => {
  // The event answers: who (role), from where, and which of the two chrome
  // affordances — the logo or this row. Every role emits under
  // "account_menu"; the old gedu-only "avatar" series ended when the avatar
  // became the menu trigger.
  it("emits dashboard_nav with method account_menu for a gedu", () => {
    renderMenu(GEDU);
    openMenu();

    fireEvent.click(row(MY_SOG));

    expect(mockTrack).toHaveBeenCalledWith("dashboard_nav", {
      role: "gedu",
      method: "account_menu",
      from: "/",
    });
  });

  it("emits the same event for a parent — no role is exempt", () => {
    renderMenu(PARENT);
    openMenu();

    fireEvent.click(row(MY_SOG));

    expect(mockTrack).toHaveBeenCalledWith("dashboard_nav", {
      role: "customer",
      method: "account_menu",
      from: "/",
    });
  });
});
