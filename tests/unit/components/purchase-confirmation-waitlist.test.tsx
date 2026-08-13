import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { PurchaseConfirmationView } from "@/components/public/products/purchase-confirmation-view";
import { buildScenarioFixture } from "@/components/public/products/mock-detail-fixtures";
import type { ProductBrowseRow, ProductType } from "@/types";

/**
 * Waitlists exist on every product type now, so the waitlist confirmation's
 * copy has to survive being read by a camp parent and an event parent as well
 * as a club one. Exactly one of its lines is term-shaped — "keeps their place
 * in line for the whole term" — and this pins that it is the only one that
 * varies: the heading, the email promise and the My SOG pointer are true of all
 * four types and must stay type-neutral, because a second type-keyed key is a
 * second place for a locale to fall out of step.
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

// The overview card inside the summary reads the viewer's clock and zone from
// the providers the real page mounts it under.
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
  it.each<[ProductType, string]>([
    ["consumer_club", "waitlist.next2.consumer_club"],
    ["municipality_club", "waitlist.next2.municipality_club"],
    ["camp", "waitlist.next2.camp"],
    ["event", "waitlist.next2.event"],
  ])("keys the term-shaped next-step line by type (%s)", (type, key) => {
    const { getByText } = renderWaitlisted(type);
    getByText(key);
  });

  it("leaves every other waitlist string type-neutral", () => {
    // The same three keys on all four types. A type suffix creeping onto any of
    // them would show up here as a missing node.
    for (const type of [
      "consumer_club",
      "municipality_club",
      "camp",
      "event",
    ] as const) {
      const { getByText, unmount } = renderWaitlisted(type);
      getByText("waitlist.heading");
      getByText("waitlist.next1");
      getByText("waitlist.next3");
      unmount();
    }
  });

  it("shows none of the waitlist copy on an ordinary enrolled signup", () => {
    // The free-club path lands here too — a free enrollment is confirmed on the
    // spot, so it renders the enrolled summary, not the queue one.
    const { queryByText, getByText } = render(
      <PurchaseConfirmationView
        product={productOfType("consumer_club")}
        participantName="Aino"
        outcome="enrolled"
      />,
    );
    getByText("heading");
    expect(queryByText("waitlist.heading")).toBeNull();
    expect(queryByText("waitlist.next2.consumer_club")).toBeNull();
  });
});
