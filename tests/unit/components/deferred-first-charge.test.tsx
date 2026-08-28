import { describe, it, expect, vi } from "vitest";
import { render, renderHook } from "@testing-library/react";
import { PurchaseConfirmationView } from "@/components/public/products/purchase-confirmation-view";
import { useSignupPanelFields } from "@/components/public/products/use-signup-panel-fields";
import { buildScenarioFixture } from "@/components/public/products/mock-detail-fixtures";
import type { AuthState } from "@/components/public/products/signup-panel-view";
import type { ProductBrowseRow } from "@/types";

/**
 * The two parent-facing halves of deferred billing: the shop panel that has to
 * explain the €0 Stripe page *before* the click, and the confirmation that has
 * to restate the real date afterwards.
 *
 * What is actually under test here is the **projection rule**, because it is the
 * one place this feature can quietly lie about money. An unclamped anchor is the
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

function clubStarting(startDate: string | null): ProductBrowseRow {
  // A real paid consumer club off the shared fixtures, so the pricing option
  // resolves to `subscription` the way the live row does. Only the date moves.
  const { product } = buildScenarioFixture("consumer-club");
  return { ...product, start_date: startDate };
}

function firstChargeDateFor(product: ProductBrowseRow): string | null {
  // No required consents: this test is about the first-charge projection, and
  // the enrolment conditions are a different field of the same hook.
  const { result } = renderHook(() =>
    useSignupPanelFields(product, READY, []),
  );
  return result.current.firstChargeDate;
}

describe("the signup panel's first-charge date", () => {
  it("renders the club's bare start date when the anchor is not clamped", () => {
    // Three weeks out. The viewer is deliberately five hours *behind* the
    // product's zone: a date-only render is immune to that, and a viewer-zone
    // projection of Helsinki midnight would slip to the 23rd.
    viewerZone.value = "America/New_York";
    expect(firstChargeDateFor(clubStarting("2027-02-24"))).toBe("Feb 24, 2027");
  });

  it("projects a clamped anchor into the viewer's own zone", () => {
    // Four months out, so Stripe's ceiling pulls the charge to
    // now + 28d − 1h = 2027-03-03T22:30Z. That instant is still 3 March in UTC
    // and already 4 March in Helsinki — which is the day the money leaves the
    // viewer's account, and therefore the day to print.
    viewerZone.value = "Europe/Helsinki";
    expect(firstChargeDateFor(clubStarting("2027-06-01"))).toBe("Mar 4, 2027");
  });

  it("says nothing for a club that has already started, or has no date", () => {
    viewerZone.value = "Europe/Helsinki";
    expect(firstChargeDateFor(clubStarting("2027-01-05"))).toBeNull();
    expect(firstChargeDateFor(clubStarting(null))).toBeNull();
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

describe("the confirmation's first-charge line", () => {
  function renderConfirmation(
    firstChargeAt: string | null,
    startDate: string | null = "2027-06-01",
  ) {
    const { product } = buildScenarioFixture("consumer-club");
    return render(
      <PurchaseConfirmationView
        product={{ ...product, start_date: startDate }}
        participantName="Aino"
        outcome="enrolled"
        firstChargeAt={firstChargeAt}
      />,
    );
  }

  it("renders the club's bare start date when the stored anchor is not clamped", () => {
    // The stored instant is product-local midnight of the start date — an
    // unclamped anchor, i.e. the club's own start — so it must print as that
    // bare calendar date, exactly as the panel printed it before the click and
    // as the start date reads elsewhere on this page. The viewer is five hours
    // behind Helsinki, where a viewer-zone projection would slip it to the 23rd
    // and make one club start on two days on one screen.
    viewerZone.value = "America/New_York";
    const { container } = renderConfirmation(
      "2027-02-23T22:00:00.000Z",
      "2027-02-24",
    );
    expect(container.textContent).toContain(
      'next.firstCharge|{"date":"Feb 24, 2027"}',
    );
  });

  it("states a clamped anchor in the viewer's zone", () => {
    // Nowhere near the June start, so this instant is Stripe's ceiling rather
    // than the club's start: a true instant with no calendar date of its own.
    // The same instant-vs-day trap as the clamped panel case — 22:30 UTC is the
    // next day in Helsinki, and the parent's statement will say so.
    viewerZone.value = "Europe/Helsinki";
    const { container } = renderConfirmation("2027-03-03T22:30:00.000Z");
    expect(container.textContent).toContain(
      'next.firstCharge|{"date":"Mar 4, 2027"}',
    );
  });

  it("renders no billing line at all when nothing was deferred", () => {
    // Which is also what a gamer reading their own confirmation gets: the
    // payments policy is customer-only, so the page resolves null for them and
    // the line simply is not there.
    viewerZone.value = "Europe/Helsinki";
    const { container } = renderConfirmation(null);
    expect(container.textContent).not.toContain("next.firstCharge");
    // The standing monthly-billing line is unaffected — it is not the deferral.
    expect(container.textContent).toContain("next.subscription");
  });
});
