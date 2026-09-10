import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { ProductBrowseFilterPanel } from "@/components/public/products/product-browse-filter-panel";

/**
 * **The filter rows are mounted in one place at a time, and the sheet keeps
 * them for as long as it is on screen.**
 *
 * Below `lg` the rows live in a bottom sheet that slides; from `lg` up they are
 * the rail. Both copies write the same URL params, so two mounted at once is a
 * defect however briefly it lasts — and a sheet that dropped its rows the
 * instant it was closed would slide down empty. Those two pull in opposite
 * directions across the close, which is where the tests concentrate: the rows
 * ride the panel down, and come back to the rail only once the slide has
 * reported its end or its fallback has run out.
 *
 * The rows themselves are stood in for by a component that counts how many of
 * it are mounted. It counts in a layout effect, whose cleanup for an unmounted
 * copy runs before the mount of a new one in the same commit — so a swap reads
 * one, and two copies in any committed tree read two.
 *
 * The bar's own shape is here too, for what it renders rather than how it is
 * drawn: Clear and the summary exist only while something is lit.
 */

const mounted = vi.hoisted(() => ({ now: 0, most: 0 }));

vi.mock("@/components/public/products/product-browse-filters", async () => {
  const { useLayoutEffect } = await import("react");
  function RowsStandIn({ variant = "card" }: { variant?: "card" | "sheet" }) {
    useLayoutEffect(() => {
      mounted.now += 1;
      mounted.most = Math.max(mounted.most, mounted.now);
      return () => {
        mounted.now -= 1;
      };
    }, []);
    return <div data-testid={`rows-${variant}`} />;
  }
  return { ProductBrowseFilters: RowsStandIn };
});

// The global setup mocks `useSearchParams` as permanently empty, and the bar's
// summary cannot be tested against an empty URL.
const mockSearch = { value: new URLSearchParams() };
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => "/shop",
  useSearchParams: () => mockSearch.value,
}));

// jsdom has no `matchMedia`, and the panel listens for the window widening
// past the rail's breakpoint while the sheet is open. The stand-in hands the
// test the listener, so a test can do the widening.
let widen: ((event: MediaQueryListEvent) => void) | null = null;

function WithMessages({ children }: { children: React.ReactNode }) {
  return (
    <NextIntlClientProvider
      locale="en"
      messages={messages}
      timeZone="Europe/Helsinki"
    >
      {children}
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  mockSearch.value = new URLSearchParams();
  mounted.now = 0;
  mounted.most = 0;
  widen = null;
  vi.stubGlobal("matchMedia", (media: string) => ({
    matches: false,
    media,
    addEventListener: (_type: string, listener: typeof widen) => {
      widen = listener;
    },
    removeEventListener: (_type: string, listener: typeof widen) => {
      if (widen === listener) widen = null;
    },
  }));
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function renderPanel(query = "") {
  mockSearch.value = new URLSearchParams(query);
  render(<ProductBrowseFilterPanel surface="shop" />, { wrapper: WithMessages });
}

const railRows = () => screen.queryByTestId("rows-card");
const sheetRows = () => screen.queryByTestId("rows-sheet");
const filtersButton = () => screen.getByRole("button", { name: /^Filters/ });

function openSheet() {
  fireEvent.click(filtersButton());
}

function closeSheet() {
  fireEvent.click(screen.getByRole("button", { name: messages.common.close }));
}

/** The sheet's sliding panel: the portal's child that holds the rows. */
function slidingPanel(): HTMLElement {
  let node: HTMLElement | null = screen.getByTestId("rows-sheet");
  while (node && node.parentElement?.parentElement !== document.body) {
    node = node.parentElement;
  }
  if (!node) throw new Error("the sheet's rows are not inside its portal");
  return node;
}

/** A transition on `target` finishing, as the browser reports it. */
function endTransition(target: Element, propertyName: string) {
  const event = new Event("transitionend", { bubbles: true });
  Object.defineProperty(event, "propertyName", { value: propertyName });
  act(() => {
    target.dispatchEvent(event);
  });
}

describe("the rows across the sheet's open, slide down and close", () => {
  it("are in the rail and not the sheet while the sheet is closed", () => {
    renderPanel();
    expect(railRows()).not.toBeNull();
    expect(sheetRows()).toBeNull();
    // Nothing of the sheet's own is there to be tabbed to either.
    expect(
      screen.queryByRole("button", { name: messages.common.close }),
    ).toBeNull();
  });

  it("move into the sheet as it opens", () => {
    renderPanel();
    openSheet();
    expect(sheetRows()).not.toBeNull();
    expect(railRows()).toBeNull();
    expect(mounted.most).toBe(1);
  });

  it("ride the panel down, and return to the rail when its slide ends", () => {
    renderPanel();
    openSheet();
    expect(document.body.style.overflow).toBe("hidden");

    closeSheet();
    // Closed, so the page scrolls again at once — but still in the sheet.
    expect(document.body.style.overflow).toBe("");
    expect(sheetRows()).not.toBeNull();
    expect(railRows()).toBeNull();

    const panel = slidingPanel();
    // A transition finishing on something inside the panel, or on some other
    // property of the panel, is not the slide.
    endTransition(screen.getByTestId("rows-sheet"), "translate");
    endTransition(panel, "opacity");
    expect(sheetRows()).not.toBeNull();

    endTransition(panel, "translate");
    expect(sheetRows()).toBeNull();
    expect(railRows()).not.toBeNull();
    expect(mounted.most).toBe(1);
  });

  it("return to the rail when the slide never reports its end", () => {
    vi.useFakeTimers();
    renderPanel();
    openSheet();
    closeSheet();

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(sheetRows()).not.toBeNull();
    expect(railRows()).toBeNull();

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(sheetRows()).toBeNull();
    expect(railRows()).not.toBeNull();
    expect(mounted.most).toBe(1);
  });

  it("stay in a sheet reopened before its slide down had finished", () => {
    vi.useFakeTimers();
    renderPanel();
    openSheet();
    closeSheet();
    act(() => {
      vi.advanceTimersByTime(100);
    });

    openSheet();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(sheetRows()).not.toBeNull();
    expect(railRows()).toBeNull();
    expect(document.body.style.overflow).toBe("hidden");
    expect(mounted.most).toBe(1);
  });

  it("leave the sheet and its scroll lock when Escape closes it", () => {
    vi.useFakeTimers();
    renderPanel();
    openSheet();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(document.body.style.overflow).toBe("");

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(sheetRows()).toBeNull();
    expect(railRows()).not.toBeNull();
    expect(mounted.most).toBe(1);
  });

  it("leave the sheet and its scroll lock when the window widens past the rail's breakpoint", () => {
    vi.useFakeTimers();
    renderPanel();
    openSheet();
    expect(widen).not.toBeNull();

    act(() => {
      widen?.(
        Object.assign(new Event("change"), {
          matches: true,
          media: "(min-width: 1024px)",
        }),
      );
    });
    expect(document.body.style.overflow).toBe("");

    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(sheetRows()).toBeNull();
    expect(railRows()).not.toBeNull();
    expect(mounted.most).toBe(1);
  });
});

describe("the bar", () => {
  const clearLabel = messages.productBrowse.filters.clearAll;

  it("is the Filters button alone with nothing lit", () => {
    renderPanel();
    // Absent, not merely hidden: the bar holds no slot open for it.
    expect(screen.queryByText(clearLabel)).toBeNull();
    expect(screen.queryAllByRole("button", { name: /^Remove / })).toEqual([]);

    const topLine = filtersButton().parentElement;
    expect(topLine?.children).toHaveLength(1);
    // And no summary row beneath that line.
    expect(topLine?.parentElement?.children).toHaveLength(1);
  });

  it("puts Clear on the button's line and every lit filter on a row of its own", () => {
    renderPanel("category=clubs&topic=fortnite&days=0");

    const topLine = filtersButton().parentElement;
    const clearButton = screen.getByRole("button", { name: clearLabel });
    expect(clearButton.parentElement).toBe(topLine);

    const chips = screen.getAllByRole("button", { name: /^Remove / });
    expect(chips.map((chip) => chip.getAttribute("aria-label"))).toEqual([
      "Remove Type Clubs",
      "Remove Subject Fortnite",
      "Remove Days Monday",
    ]);
    const summary = chips[0].parentElement;
    expect(summary).not.toBe(topLine);
    expect(summary?.parentElement).toBe(topLine?.parentElement);
    for (const chip of chips) expect(chip.parentElement).toBe(summary);
  });

  it("drops a filter from the summary when its chip is tapped", () => {
    renderPanel("days=0");
    const replaceState = vi
      .spyOn(window.history, "replaceState")
      .mockImplementation(() => {});

    fireEvent.click(screen.getByRole("button", { name: "Remove Days Monday" }));
    expect(replaceState).toHaveBeenCalled();
    replaceState.mockRestore();
  });
});
