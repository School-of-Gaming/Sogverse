import { describe, it, expect, vi } from "vitest";
import { render, renderHook } from "@testing-library/react";
import { PurchaseConfirmationView } from "@/components/public/products/purchase-confirmation-view";
import { useSignupPanelFields } from "@/components/public/products/use-signup-panel-fields";
import { buildScenarioFixture } from "@/components/public/products/mock-detail-fixtures";
import type { AuthState } from "@/components/public/products/signup-panel-view";
import type { ProductBrowseRow } from "@/types";

/**
 * The parent-facing side of deferred billing: the shop panel that has to
 * explain the €0 Stripe page *before* the click, and the confirmation page that
 * afterwards states only the club's start and its monthly price — the start is
 * in practice the first session and the first charge, so it names no separate
 * payment date.
 *
 * What is mostly under test here is the panel's **projection rule**, because it
 * is the one place this feature can quietly lie about money. An unclamped anchor is the
 * club's own start date and must render as the bare calendar date the rest of
 * the page shows; a clamped one is a true instant with no calendar date of its
 * own and must be projected into the *viewer's* zone, because that is the day
 * the charge lands on their statement. Both viewer zones below are chosen so a
 * wrong projection changes the rendered day, not just the wording.
 */

const { clock, viewerZone } = vi.hoisted(() => ({
  clock: { value: new Date("2027-02-03T23:30:00Z") },
  viewerZone: { value: "Europe/Helsinki" },
}));

vi.mock("@/providers", () => ({
  useNow: () => clock.value,
  useTimezone: () => viewerZone.value,
}));

// Translations echo their key and the values interpolated into it, so these
// assertions are about which key is reached for and what date is handed to it —
// never about the wording in `messages/`.
vi.mock("next-intl", () => ({
  useTranslations: () => {
    const t = (key: string, values?: Record<string, unknown>) =>
      values === undefined ? key : `${key}|${JSON.stringify(values)}`;
    t.rich = (key: string) => key;
    return t;
  },
  useLocale: () => "en",
}));

const READY: AuthState = { kind: "ready", participants: [], gamerCount: 0 };

function clubStarting(startDate: string): ProductBrowseRow {
  // A real paid consumer club off the shared fixtures, so the pricing option
  // resolves to `subscription` the way the live row does. Only the date moves.
  const { product } = buildScenarioFixture("consumer-club");
  return { ...product, start_date: startDate };
}

function firstChargeDateFor(product: ProductBrowseRow): string | null {
  // No consents of any kind: this test is about the first-charge projection,
  // and the three ask sets are different fields of the same hook.
  const { result } = renderHook(() =>
    useSignupPanelFields(product, READY, [], [], []),
  );
  return result.current.firstChargeDate;
}

describe("the signup panel's first-charge date", () => {
  it("renders the club's bare start date when the anchor is not clamped", () => {
    // Three weeks out. The viewer is deliberately five hours *behind* the
    // product's zone: a date-only render is immune to that, and a viewer-zone
    // projection of Helsinki midnight would slip to the 23rd.
    viewerZone.value = "America/New_York";
    expect(firstChargeDateFor(clubStarting("2027-02-24"))).toBe("24 Feb 2027");
  });

  it("projects a clamped anchor into the viewer's own zone", () => {
    // Four months out, so Stripe's ceiling pulls the charge to
    // now + 28d − 1h = 2027-03-03T22:30Z. That instant is still 3 March in UTC
    // and already 4 March in Helsinki — which is the day the money leaves the
    // viewer's account, and therefore the day to print.
    viewerZone.value = "Europe/Helsinki";
    expect(firstChargeDateFor(clubStarting("2027-06-01"))).toBe("4 Mar 2027");
  });

  it("says nothing for a club that has already started", () => {
    viewerZone.value = "Europe/Helsinki";
    expect(firstChargeDateFor(clubStarting("2027-01-05"))).toBeNull();
  });

  it("says nothing for a product that is not sold as a subscription", () => {
    // A camp starting in three weeks was paid for in full at checkout: there is
    // no later first charge to promise, whatever its start date says.
    viewerZone.value = "Europe/Helsinki";
    const { product } = buildScenarioFixture("camp-open");
    expect(
      firstChargeDateFor({ ...product, start_date: "2027-02-24" }),
    ).toBeNull();
  });
});

describe("the confirmation for a club bought before it starts", () => {
  it("states the start and the plain monthly price, and no payment date", () => {
    viewerZone.value = "Europe/Helsinki";
    const { product } = buildScenarioFixture("consumer-club");
    const { container } = render(
      <PurchaseConfirmationView
        product={{ ...product, start_date: "2027-02-24" }}
        participantName="Aino"
        outcome="enrolled"
      />,
    );
    const text = container.textContent;
    expect(text).toContain('card.starts|{"date":"24 Feb 2027"}');
    expect(text).toContain("price.subscription|");
    expect(text).not.toMatch(/firstCharge|first payment/i);
  });
});
