import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { SeatAvailabilityBar } from "@/components/public/products/seat-availability-bar";

/**
 * Overfull is a legal state. A seat cap on a *paid* product is a soft cap — the
 * pre-Checkout gate refuses new entrants once it is reached, but a parent
 * already inside a Stripe Checkout session completes and gets their seat, so a
 * product can end up with more active participations than seats. An admin sees
 * that overfill unclamped, on purpose; a family must never see it, because
 * "-2 of 20 seats remaining" is not a fact about anything they can act on.
 *
 * This bar is the shared component behind both the family-facing detail panel
 * and the municipality browse card, so the clamp lives here rather than at each
 * call site — and its absence would be invisible until a real product oversold.
 *
 * The translation is stubbed to echo the key *and its values*, so the count the
 * component passed into the message is assertable without depending on the
 * English wording.
 */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));

function bar(props: {
  seatCount: number | null;
  seatsLeft: number;
  waitlistEnabled?: boolean;
}) {
  const { container } = render(
    <SeatAvailabilityBar
      seatCount={props.seatCount}
      seatsLeft={props.seatsLeft}
      waitlistEnabled={props.waitlistEnabled ?? false}
    />,
  );
  return container.querySelector("[role=progressbar]");
}

describe("SeatAvailabilityBar clamps what it is given", () => {
  it("floors a negative seats-left at zero on an overfull product", () => {
    // 22 active on a 20-seat product: two over. The family reads "0 of 20".
    const progress = bar({ seatCount: 20, seatsLeft: -2 });
    expect(progress?.getAttribute("aria-valuenow")).toBe("0");
    expect(progress?.getAttribute("aria-valuemax")).toBe("20");
    expect(progress?.getAttribute("aria-label")).toContain('"count":0');
    expect(progress?.getAttribute("aria-label")).toContain('"total":20');
  });

  it("leaves the fill empty rather than negative-width at that point", () => {
    const { container } = render(
      <SeatAvailabilityBar seatCount={20} seatsLeft={-2} waitlistEnabled />,
    );
    const fill = container.querySelector<HTMLElement>(
      "[role=progressbar] > div",
    );
    expect(fill?.style.width).toBe("0%");
  });

  it("still offers the waitlist chip when an overfull product has one", () => {
    // Clamping is a display rule, not a state change: overfull is full, and a
    // full product with a waitlist still has something for the parent to do.
    const { getByText } = render(
      <SeatAvailabilityBar seatCount={20} seatsLeft={-2} waitlistEnabled />,
    );
    getByText("waitlistAvailable");
  });

  it("caps seats-left at the seat count from the other side too", () => {
    const progress = bar({ seatCount: 15, seatsLeft: 99 });
    expect(progress?.getAttribute("aria-valuenow")).toBe("15");
  });

  it("renders nothing at all without a cap", () => {
    // An uncapped product has no seat story; the bar withdraws rather than
    // drawing an empty track.
    const { container } = render(
      <SeatAvailabilityBar seatCount={null} seatsLeft={0} waitlistEnabled />,
    );
    expect(container.firstChild).toBeNull();
  });
});
