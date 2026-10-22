import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { PurchaseConfirmationView } from "@/components/public/products/purchase-confirmation-view";
import { buildScenarioFixture } from "@/components/public/products/mock-detail-fixtures";
import type { ProductBrowseRow, ProductType } from "@/types";

/**
 * Waitlists exist on every product type, so the waitlist confirmation's copy
 * has to survive being read by a camp parent and an event parent as well as a
 * club one: every one of its strings is type-neutral, and the queue states no
 * price because nothing has been bought.
 *
 * The translations are stubbed to echo the key, so these assertions are about
 * which key the component reaches for, not about the wording in `messages/`.
 */
vi.mock("next-intl", () => ({
  useTranslations: () => {
    const t = (key: string) => key;
    t.rich = (key: string) => key;
    return t;
  },
  useLocale: () => "en",
}));

// The summary card reads the viewer's clock and zone from the providers the
// real page mounts it under.
vi.mock("@/providers", () => ({
  useNow: () => new Date("2026-01-05T12:00:00Z"),
  useTimezone: () => "Europe/Helsinki",
}));

// One fixture product, re-typed per case. Only `product_type` is under test
// here, and taking it from the shared scenario fixture keeps the row honest
// (a complete `ProductBrowseRow`, no casts) instead of hand-rolling a partial.
function productOfType(productType: ProductType): ProductBrowseRow {
  const { product } = buildScenarioFixture("consumer-club-full-waitlist");
  return { ...product, product_type: productType };
}

function renderWaitlisted(productType: ProductType) {
  return render(
    <PurchaseConfirmationView
      product={productOfType(productType)}
      participantName="Aino"
      outcome="waitlisted"
      waitlistPosition={3}
    />,
  );
}

describe("waitlist confirmation copy", () => {
  it("states the same type-neutral strings on every product type", () => {
    for (const type of [
      "consumer_club",
      "municipality_club",
      "camp",
      "event",
    ] as const) {
      const { getByText, unmount } = renderWaitlisted(type);
      getByText("waitlist.heading");
      getByText("waitlist.subheading");
      getByText("waitlist.position");
      getByText("waitlist.next");
      getByText("email.sent");
      unmount();
    }
  });

  it("states no price on a place in a queue", () => {
    const { container } = renderWaitlisted("consumer_club");
    expect(container.textContent).not.toContain("price.");
  });

  it("drops the position line when the position could not be read", () => {
    const { queryByText } = render(
      <PurchaseConfirmationView
        product={productOfType("camp")}
        participantName="Aino"
        outcome="waitlisted"
        waitlistPosition={null}
      />,
    );
    expect(queryByText("waitlist.position")).toBeNull();
  });

  it("shows none of the waitlist copy on an ordinary enrolled signup", () => {
    // The free-club path lands here too — a free enrollment is confirmed on the
    // spot, so it renders the enrolled summary, not the queue one.
    const { queryByText, getByRole, getByText } = render(
      <PurchaseConfirmationView
        product={productOfType("consumer_club")}
        participantName="Aino"
        outcome="enrolled"
      />,
    );
    getByRole("heading", { level: 1, name: "heading" });
    getByText("next.placement");
    expect(queryByText("waitlist.heading")).toBeNull();
    expect(queryByText("waitlist.next")).toBeNull();
  });
});
