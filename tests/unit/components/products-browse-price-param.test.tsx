import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useBrowseFilters } from "@/components/public/products/use-browse-filters";

/**
 * **The price chip is a URL param, and the URL is the only place it lives.**
 *
 * So what is worth pinning is the round trip: what a URL turns into, what a tap
 * writes back, and the two behaviours a single-valued row has that a
 * multi-select one does not — tapping the lit chip turns the row off rather
 * than adding to it, and tapping the other chip replaces rather than joins.
 *
 * A hand-edited value is the third: this param is typed by anyone who can edit
 * an address bar, and a value the row never offered has to read as no
 * selection rather than as a filter matching nothing.
 */

// The global setup mocks `useSearchParams` as permanently empty, which is the
// one thing a URL-state hook cannot be tested against. Overridden here so a
// test can put a grid's URL behind the render.
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

/** The URL the next render reads. */
function arriveWith(query: string) {
  mockSearch.value = new URLSearchParams(query);
}

/** The path the hook last wrote through the History API. */
let written: string | null = null;

beforeEach(() => {
  arriveWith("");
  written = null;
  vi.spyOn(window.history, "replaceState").mockImplementation((...args) => {
    written = String(args[2]);
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("the browse grid's price param", () => {
  it("reads the two values the row offers", () => {
    arriveWith("price=free");
    expect(renderHook(() => useBrowseFilters()).result.current.price).toBe(
      "free",
    );

    arriveWith("price=paid");
    expect(renderHook(() => useBrowseFilters()).result.current.price).toBe(
      "paid",
    );
  });

  it("reads anything else as no selection", () => {
    arriveWith("price=cheap");
    const { result } = renderHook(() => useBrowseFilters());
    expect(result.current.price).toBeNull();
    // And it does not light the Clear button either: a row nobody can see is
    // narrowing nothing.
    expect(result.current.hasAny).toBe(false);
  });

  it("counts as a filter for the Clear button", () => {
    arriveWith("price=paid");
    expect(renderHook(() => useBrowseFilters()).result.current.hasAny).toBe(
      true,
    );
  });

  it("writes the tapped chip, leaving the rest of the URL alone", () => {
    arriveWith("topic=minecraft_java&mock=1");
    const { result } = renderHook(() => useBrowseFilters());
    act(() => result.current.togglePrice("free"));
    expect(written).toBe("/shop?topic=minecraft_java&mock=1&price=free");
  });

  it("clears the row when the lit chip is tapped again", () => {
    arriveWith("price=free");
    const { result } = renderHook(() => useBrowseFilters());
    act(() => result.current.togglePrice("free"));
    expect(written).toBe("/shop");
  });

  it("replaces rather than joins when the other chip is tapped", () => {
    arriveWith("price=free");
    const { result } = renderHook(() => useBrowseFilters());
    act(() => result.current.togglePrice("paid"));
    expect(written).toBe("/shop?price=paid");
  });

  it("goes with everything else on Clear all", () => {
    arriveWith("price=paid&topic=minecraft_java&category=clubs");
    const { result } = renderHook(() => useBrowseFilters());
    act(() => result.current.clear());
    expect(written).toBe("/shop");
  });
});
