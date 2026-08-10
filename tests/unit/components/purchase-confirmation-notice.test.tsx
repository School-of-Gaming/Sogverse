import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { PurchaseConfirmationNotice } from "@/components/public/products/purchase-confirmation-view";

// All three states follow a payment that *succeeded*, and each is reached only
// when the page has no order to show. What has to hold is the mapping from state
// to copy and to a way onward — a terminal state that offers neither leaves a
// parent who has just been charged with nowhere to go.
//
// Stub the translations so the assertions are about which key the component
// reached for, not about the wording in `messages/`.
vi.mock("next-intl", () => ({
  useTranslations: () => {
    const t = (key: string) => key;
    t.rich = (key: string) => key;
    return t;
  },
}));

describe("PurchaseConfirmationNotice", () => {
  it("renders the finalizing state as a structured wait, with no way to navigate away", () => {
    const { container, getByText } = render(
      <PurchaseConfirmationNotice kind="finalizing" />,
    );

    getByText("finalizing.heading");
    getByText("finalizing.subheading");
    // Ghost bars shaped like the summary card that replaces them, rather than a
    // spinner over empty space.
    expect(
      container.querySelectorAll(".animate-pulse").length,
    ).toBeGreaterThan(0);
    // Deliberately no links: this state resolves itself, and the panel is
    // swapped out from under anything the parent might be reaching for.
    expect(container.querySelectorAll("a")).toHaveLength(0);
  });

  it("renders the timed-out state with somewhere to go and a way to reach us", () => {
    const { container, getByText } = render(
      <PurchaseConfirmationNotice kind="timedOut" />,
    );

    getByText("timedOut.heading");
    getByText("timedOut.body");
    // No skeleton — nothing is still loading once the wait is over.
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(0);
    // Both CTAs plus the support line's mailto.
    expect(container.querySelectorAll("a").length).toBeGreaterThanOrEqual(2);
  });

  it("renders the duplicate-payment state the same terminal shape", () => {
    const { container, getByText } = render(
      <PurchaseConfirmationNotice kind="duplicatePayment" />,
    );

    getByText("duplicatePayment.heading");
    getByText("duplicatePayment.body");
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(0);
    expect(container.querySelectorAll("a").length).toBeGreaterThanOrEqual(2);
  });
});
