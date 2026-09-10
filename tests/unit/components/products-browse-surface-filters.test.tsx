import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, renderHook, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { useBrowseFilterRows } from "@/components/public/products/browse-filter-rows";
import type { BrowseSurface } from "@/components/public/products/browse-surface";
import { filterProducts } from "@/components/public/products/filter-products";
import { ProductBrowseFilterPanel } from "@/components/public/products/product-browse-filter-panel";
import { ProductBrowseFilters } from "@/components/public/products/product-browse-filters";
import { PRODUCT_TAG_VALUES } from "@/components/public/products/product-tag";
import { useOfferedBrowseFilters } from "@/components/public/products/use-browse-filters";
import { SUPPORTED_LOCALES } from "@/lib/constants/locales";
import { formatWeekday } from "@/lib/products/format-product-schedule";
import type { ProductBrowseRow } from "@/types";

/**
 * **A page applies, counts and clears exactly the filters it draws a row for.**
 *
 * Two pages render the browse body and they do not offer the same filters, but
 * the URL is shared by both: any param can arrive on either. Four readers act
 * on a filter — the rows, the grid's predicate, the bar's count and summary,
 * and the Clear button — and the defect this pins is one of them acting on a
 * filter the others ignore. A school page loaded with a shop link's
 * `?audience=parents` used to empty its grid and light Clear with no chip on
 * screen to explain either.
 *
 * So the tests ask each reader the same question on both pages. The rows and
 * the grid's input are asked through their hooks; the count, the summary and
 * Clear are asked of the rendered bar, because that is where they have to
 * agree with each other.
 */

// The global setup mocks `useSearchParams` as permanently empty, which is the
// one thing a URL-state hook cannot be tested against.
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
  arriveWith("");
});

afterEach(cleanup);

function rowIds(surface: BrowseSurface) {
  const { result } = renderHook(() => useBrowseFilterRows(surface), {
    wrapper: WithMessages,
  });
  return result.current.map((row) => row.id);
}

/** The bar as a reader meets it: its count, its summary chips, and whether a
 *  Clear is on offer anywhere — the bar's own and the rail's, which must agree. */
function renderBar(surface: BrowseSurface) {
  render(<ProductBrowseFilterPanel surface={surface} />, { wrapper: WithMessages });
  return {
    count: screen.queryByText(/filters? active$/)?.textContent ?? null,
    summary: screen
      .queryAllByRole("button", { name: /^Remove / })
      .map((button) => button.getAttribute("aria-label")),
    // A Clear with nothing to clear stays in the layout but is hidden from
    // assistive tech, so the role query sees only the ones on offer.
    clearButtons: screen.queryAllByRole("button", {
      name: messages.productBrowse.filters.clearAll,
    }).length,
  };
}

/** A school's club as the school page lists it: billed to the municipality,
 *  stating no price, badged with no audience. */
const SCHOOL_CLUB: ProductBrowseRow = {
  id: "school-club",
  billing_mode: "paid",
  start_date: null,
  end_date: null,
  image_path: null,
  is_remote: false,
  for_gamers: true,
  for_parents: false,
  min_age: 7,
  max_age: 12,
  tag: null,
  product_type: "municipality_club",
  registration_opens_at: "2026-01-01T00:00:00.000Z",
  seat_count: null,
  signup_threshold: null,
  spoken_language_code: "fi",
  status: "running",
  timezone: "Europe/Helsinki",
  topic: "minecraft_education",
  waitlist_enabled: false,
  product_translations: [],
  product_prices: [],
  schedule_slots: [],
  locations: null,
};

describe("which rows each page offers", () => {
  it("offers every row on the shop", () => {
    expect(rowIds("shop")).toEqual([
      "categories",
      "audiences",
      "tags",
      "topics",
      "format",
      "price",
      "languages",
      "age",
      "days",
    ]);
  });

  it("withholds Type, Audience and Price on a school page, and leads with Designed for", () => {
    expect(rowIds("municipality")).toEqual([
      "tags",
      "topics",
      "format",
      "languages",
      "age",
      "days",
    ]);
  });
});

describe("a param for a row the page does not offer", () => {
  it.each(["audience=parents", "price=free", "category=clubs"])(
    "leaves a school page's grid whole with %s",
    (query) => {
      arriveWith(query);
      const { result } = renderHook(() =>
        useOfferedBrowseFilters("municipality"),
      );
      expect(filterProducts([SCHOOL_CLUB], result.current.filters)).toEqual([
        SCHOOL_CLUB,
      ]);
      expect(result.current.hasAny).toBe(false);
    },
  );

  it.each(["audience=parents", "price=free", "audience=parents&price=free"])(
    "lights no count, summary or Clear on a school page with %s",
    (query) => {
      arriveWith(query);
      expect(renderBar("municipality")).toEqual({
        count: null,
        summary: [],
        clearButtons: 0,
      });
    },
  );

  it("still lets an offered filter beside it count on its own", () => {
    const tag = PRODUCT_TAG_VALUES[0];
    arriveWith(`audience=parents&price=free&tag=${tag}`);
    const bar = renderBar("municipality");
    expect(bar.count).toBe("1 filter active");
    expect(bar.summary).toHaveLength(1);
    expect(bar.clearButtons).toBe(2);
  });

  it("reads a topic no chip offers as no selection", () => {
    arriveWith("topic=bogus,fortnite");
    const { result } = renderHook(() => useOfferedBrowseFilters("shop"));
    expect(result.current.filters.topics).toEqual(["fortnite"]);

    arriveWith("topic=bogus");
    expect(
      renderHook(() => useOfferedBrowseFilters("shop")).result.current.hasAny,
    ).toBe(false);
  });
});

describe("the lit count and summary on the shop", () => {
  it("counts Type chips and chip filters together, in row order", () => {
    arriveWith(
      "days=0&lang=fi&price=free&topic=fortnite,minecraft_java&category=clubs,camps",
    );
    const bar = renderBar("shop");
    expect(bar.count).toBe("7 filters active");
    expect(bar.summary).toEqual([
      "Remove Type Clubs",
      "Remove Type Camps",
      "Remove Subject Minecraft",
      "Remove Subject Fortnite",
      "Remove Price Free",
      "Remove Language FI Finnish",
      "Remove Days Monday",
    ]);
  });
});

describe("Clear", () => {
  it("is not offered on an unfiltered page", () => {
    expect(renderBar("shop").clearButtons).toBe(0);
    cleanup();
    expect(renderBar("municipality").clearButtons).toBe(0);
  });

  it("is offered on the shop for a Type selection alone", () => {
    arriveWith("category=clubs");
    const bar = renderBar("shop");
    expect(bar.clearButtons).toBe(2);
    expect(bar.count).toBe("1 filter active");
  });

  it("is offered on a school page for a filter the page draws", () => {
    arriveWith("days=2");
    const bar = renderBar("municipality");
    expect(bar.clearButtons).toBe(2);
    expect(bar.summary).toEqual(["Remove Days Wednesday"]);
  });
});

describe("a chip drawn from a richer label", () => {
  it("is named by its text, which contains what the chip shows", () => {
    render(<ProductBrowseFilters surface="shop" />, { wrapper: WithMessages });

    const finnish = screen.getByRole("button", { name: "FI Finnish" });
    expect(finnish.textContent).toContain("FI");

    const monday = screen.getByRole("button", { name: "Monday" });
    expect(monday.textContent).toContain("Mon");
  });

  // The Days chip shows a short weekday at some widths and is named by the
  // full one, which holds only while every short form begins its full name.
  // That is Intl's data rather than ours, so it is checked rather than assumed.
  it.each(SUPPORTED_LOCALES)(
    "shows a short weekday its full name begins with, in %s",
    (locale) => {
      for (let weekday = 0; weekday < 7; weekday++) {
        const long = formatWeekday(weekday, locale, "long").toLowerCase();
        const short = formatWeekday(weekday, locale, "short")
          .replace(/\.$/, "")
          .toLowerCase();
        expect(long.startsWith(short), `${short} / ${long}`).toBe(true);
      }
    },
  );
});
