import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { PurchaseConfirmationView } from "@/components/public/products/purchase-confirmation-view";
import { buildScenarioFixture } from "@/components/public/products/mock-detail-fixtures";

/**
 * The confirmation page tells the reader where the confirmation email went —
 * the payer's own address, which the page can only name when the payer is the
 * one reading. Anyone else gets the same promise with no address in it, never
 * an address guessed from somewhere else.
 *
 * Translations echo the key (and, for the rich line, the address handed to
 * it), so the assertions are about which line is chosen and with what.
 */
vi.mock("next-intl", () => ({
  useTranslations: () => {
    const t = (key: string) => key;
    t.rich = (key: string, values?: Record<string, unknown>) =>
      `${key}|${String(values?.email)}`;
    return t;
  },
  useLocale: () => "en",
}));

vi.mock("@/providers", () => ({
  useNow: () => new Date("2026-01-05T12:00:00Z"),
  useTimezone: () => "Europe/Helsinki",
}));

function renderWith(recipientEmail: string | null) {
  const { product } = buildScenarioFixture("consumer-club");
  return render(
    <PurchaseConfirmationView
      product={product}
      participantName="Aino"
      recipientEmail={recipientEmail}
    />,
  );
}

describe("the confirmation's email line", () => {
  it("names the address the mail went to when the payer is reading", () => {
    const { getByText, queryByText } = renderWith("marja@example.com");
    getByText("email.sentTo|marja@example.com");
    expect(queryByText("email.sent")).toBeNull();
  });

  it("promises the mail without an address when none can be read", () => {
    const { getByText, container } = renderWith(null);
    getByText("email.sent");
    expect(container.textContent).not.toContain("email.sentTo");
  });
});
