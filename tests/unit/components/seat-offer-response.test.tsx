import { describe, it, expect, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { SeatOfferResponse } from "@/components/seat-offer/seat-offer-response";

/**
 * The landing page's panels, and the one decision that cannot be seen anywhere
 * else: what the page does with an `expired` answer.
 *
 * The word means two different things depending on which button produced it,
 * and only the press knows which. On an ACCEPT it is an answer — the seat can
 * no longer be claimed, so the reader is moved onto the lapsed panel, which
 * still carries the one answer left open to them. On a DECLINE it is a refusal
 * wearing the same word: the database honours a late no for as long as the row
 * exists, so a decline can only come back `expired` when the compare-and-swap
 * was refused by the product guard and the dead-end read then classified a
 * still-live lapsed row. Nothing was written.
 *
 * Both are asserted here because either alone passes while the rule is half
 * implemented — and because the failure mode of getting the decline wrong is
 * invisible to every other kind of test: the panel simply re-renders itself,
 * with no word about why, and every further press does the same. A silent loop
 * with no exit.
 */

// Keys echo, so an assertion names the copy the panel reached for rather than
// the wording in messages/.
vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => {
    const t = (key: string, values?: Record<string, unknown>) => {
      const full = namespace ? `${namespace}.${key}` : key;
      return values ? `${full}(${JSON.stringify(values)})` : full;
    };
    t.rich = (key: string) => key;
    return t;
  },
  useLocale: () => "en",
}));

const SO = "seatOffer";

const OPEN_OFFER = {
  kind: "open" as const,
  participantName: "Aino",
  isSelfSeat: false,
  productName: "Fortnite Creative Club",
  deadline: "1 September 2026 at 16.00 (EEST)",
};

function click(label: string) {
  return act(async () => {
    screen.getByText(label).closest("button")?.click();
  });
}

describe("SeatOfferResponse — an `expired` answer", () => {
  /**
   * The accept half. The seat is gone, but the visit is not over: the lapsed
   * panel still has the decline on it, and its button is live again, so the
   * latch is released with it.
   */
  it("moves an accept that arrived too late onto the lapsed panel", async () => {
    const respond = vi.fn().mockResolvedValue("expired" as const);
    render(
      <SeatOfferResponse
        token="t"
        offer={OPEN_OFFER}
        initialIntent={null}
        respond={respond}
      />,
    );

    await click(`${SO}.offer.accept`);

    expect(respond).toHaveBeenCalledWith(true);
    expect(screen.getByText(`${SO}.expired.title`)).toBeTruthy();
    // An answer, not a fault.
    expect(screen.queryByText(new RegExp(`${SO}\\.offer\\.error`))).toBeNull();
    expect(
      screen.getByText(`${SO}.expired.declineAction`).closest("button")
        ?.disabled,
    ).toBe(false);
  });

  /**
   * The decline half, and the loop it used to be. Reached from the lapsed
   * panel — the only place a decline can be pressed on an offer whose window
   * has closed — so showing that same panel again on refusal would put the
   * reader back in front of the button they just pressed with nothing said.
   */
  it("reports a refused decline as a failure rather than re-drawing the panel", async () => {
    const respond = vi.fn().mockResolvedValue("expired" as const);
    render(
      <SeatOfferResponse
        token="t"
        offer={{ kind: "expired" }}
        initialIntent={null}
        respond={respond}
      />,
    );

    await click(`${SO}.expired.declineAction`);
    await click(`${SO}.offer.confirmAction`);

    expect(respond).toHaveBeenCalledWith(false);
    // The answer did not land, and the page says so…
    expect(
      screen.getByText(new RegExp(`${SO}\\.offer\\.error`)),
    ).toBeTruthy();
    // …without pretending the press was an answer: the confirmation is still
    // the panel on screen, and the lapsed panel it came from has not replaced
    // it.
    expect(screen.getByText(`${SO}.expired.confirmTitle`)).toBeTruthy();
    expect(screen.queryByText(`${SO}.expired.title`)).toBeNull();
    // And the reader can try again — nothing is in flight, so nothing is
    // latched and nothing is spinning.
    expect(
      screen.getByText(`${SO}.offer.confirmAction`).closest("button")?.disabled,
    ).toBe(false);
  });
});
