import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import type { ReactNode } from "react";
import productBrowse from "@/../messages/en/productBrowse.json";
import roblox from "@/../messages/en/roblox.json";
import type { ProductBrowseRow } from "@/types";

/**
 * **The shared product rail pipeline, as the Roblox page runs it, and the rail
 * itself.** The Roblox "What's on" section and a landing page's products
 * section draw the same rail from the same live listing; this pins the Roblox
 * half — its programme slice, its empty state and its shop link — and the
 * rail's own behaviour every surface gets: the shop's card per product, the
 * arrows only when the row can overflow, and a row its cards do not fill
 * centred, never one that can overflow.
 *
 * The card is replaced by a stub naming the product, so what is asserted is
 * which rows reach the shop's card and in what order, not the card's own
 * rendering, which its own tests own.
 */
vi.mock("@/components/public/products/product-browse-card", () => ({
  ProductBrowseCard: ({ product }: { product: ProductBrowseRow }) => (
    <article data-product={product.id}>{product.product_translations[0]?.name}</article>
  ),
}));

import { ProductRail } from "@/components/public/products/product-rail";
import { productRailSeed } from "@/components/public/products/product-rail-selection";
import { PROGRAMME_RAIL_SELECTION } from "@/components/roblox/programme-filters";
import { UpcomingEventsBrowse } from "@/components/roblox/upcoming-events-browse";
import { browseRow, emptyCounts } from "../../mocks/product-browse-row";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function Providers({ children }: { children: ReactNode }) {
  // Seeded data stays fresh, as the app's query provider keeps it for its
  // staleTime: the rail paints from the seed and fetches nothing.
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  return (
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={{ productBrowse, roblox }}>
        {children}
      </NextIntlClientProvider>
    </QueryClientProvider>
  );
}

const shownProducts = () =>
  Array.from(document.querySelectorAll("article[data-product]")).map((card) =>
    card.getAttribute("data-product"),
  );

/** The rail's scrolling row, the flex container holding the cards. */
const row = () => {
  const first = document.querySelector("article[data-product]");
  const container = first?.parentElement?.parentElement;
  if (!(container instanceof HTMLElement)) throw new Error("no rail row");
  return container;
};

describe("the Roblox page's upcoming events, through the shared pipeline", () => {
  const LISTING = [
    browseRow(id(1), { name: "Roblox club A" }),
    browseRow(id(2), { name: "In-person club", delivery_mode: "in_person" }),
    browseRow(id(3), { name: "Minecraft club", topic: "minecraft_java" }),
    browseRow(id(5), { name: "Paid club", billing_mode: "paid" }),
    browseRow(id(4), { name: "Roblox club B" }),
  ];

  it("shows the programme's slice of the live listing on the first frame, with the shop link", () => {
    const prefetch = { listing: LISTING, counts: [id(1), id(2), id(4)].map(emptyCounts) };
    render(
      <Providers>
        <UpcomingEventsBrowse seed={productRailSeed(prefetch, PROGRAMME_RAIL_SELECTION)} />
      </Providers>,
    );
    expect(screen.getByRole("heading", { level: 2, name: roblox.events.heading })).toBeTruthy();
    expect(shownProducts()).toEqual([id(1), id(2), id(4)]);
    expect(screen.getByRole("link", { name: roblox.events.browseShop })).toBeTruthy();
    expect(screen.queryByText(roblox.events.empty)).toBeNull();
  });

  it("keeps its own empty state, and no shop link, when the slice is empty", () => {
    const prefetch = { listing: [LISTING[2], LISTING[3]], counts: [] };
    render(
      <Providers>
        <UpcomingEventsBrowse seed={productRailSeed(prefetch, PROGRAMME_RAIL_SELECTION)} />
      </Providers>,
    );
    expect(screen.getByText(roblox.events.empty)).toBeTruthy();
    expect(shownProducts()).toEqual([]);
    expect(screen.queryByRole("link", { name: roblox.events.browseShop })).toBeNull();
  });

  it("names its arrows in its own words when there are more events than a row holds", () => {
    const listing = [1, 4, 5, 6].map((n) => browseRow(id(n)));
    render(
      <Providers>
        <UpcomingEventsBrowse
          seed={productRailSeed({ listing, counts: [] }, PROGRAMME_RAIL_SELECTION)}
        />
      </Providers>,
    );
    expect(screen.getByRole("button", { name: roblox.events.previous })).toBeTruthy();
    expect(screen.getByRole("button", { name: roblox.events.next })).toBeTruthy();
  });
});

describe("the product rail", () => {
  const labels = { previous: "Back", next: "On" };

  function renderRail(count: number) {
    const products = Array.from({ length: count }, (_, n) => browseRow(id(n + 1)));
    return render(<ProductRail products={products} counts={[]} labels={labels} />);
  }

  it("draws the shop's card for every product, in the order given", () => {
    const products = [3, 1, 2].map((n) => browseRow(id(n)));
    render(<ProductRail products={products} counts={[]} labels={labels} />);
    expect(shownProducts()).toEqual([id(3), id(1), id(2)]);
  });

  it("centres a row its cards do not fill, tier by tier", () => {
    const one = renderRail(1);
    expect(row().className).toContain("sm:justify-center");
    expect(row().className).toContain("lg:justify-center");
    one.unmount();

    const two = renderRail(2);
    expect(row().className).not.toContain("sm:justify-center");
    expect(row().className).toContain("lg:justify-center");
    two.unmount();
  });

  it("never centres a row that can overflow, so its first card stays in reach", () => {
    for (const count of [3, 4, 9]) {
      const rail = renderRail(count);
      expect(row().className).not.toContain("justify-center");
      rail.unmount();
    }
  });

  it("keeps its exact widths and peek: full width alone, an 85% card with a neighbour", () => {
    const one = renderRail(1);
    const card = () => document.querySelector("article[data-product]")?.parentElement;
    expect(card()?.className).toContain("w-full");
    expect(card()?.className).toContain("sm:w-[calc((100%-1.5rem)/2)]");
    one.unmount();

    renderRail(3);
    expect(card()?.className).toContain("w-[85%]");
    expect(card()?.className).toContain("sm:w-[calc((100%-4.5rem)/2)]");
    expect(card()?.className).toContain("lg:w-[calc((100%-3rem)/3)]");
  });

  it("renders its arrows only when the row can overflow, with the surface's names", () => {
    const two = renderRail(2);
    expect(screen.queryByRole("button")).toBeNull();
    two.unmount();

    renderRail(3);
    const buttons = screen.getAllByRole("button", { hidden: true });
    expect(buttons.map((button) => button.getAttribute("aria-label"))).toEqual(["Back", "On"]);
    // Parked at the start, so the back arrow is out of play from the first frame.
    expect(within(document.body).getByRole("button", { name: "Back" }).hasAttribute("disabled")).toBe(true);
  });
});
