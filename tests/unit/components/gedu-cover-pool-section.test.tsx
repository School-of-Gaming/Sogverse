import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { GeduCoverPoolSection } from "@/components/gedu/GeduCoverPoolSection";
import { TimezoneProvider } from "@/providers/timezone-provider";
import type { OpenCoverRequest } from "@/services/session-cover";

/**
 * ============================================================================
 * Sessions needing cover: what the section is like once a write lands
 * ============================================================================
 *
 * One `committingRequestId` holds **every** button on the section, because the
 * offers move each other — an approval shortens the queue — and a second press
 * before the first has landed acts on a list that is already stale. That makes
 * the flag's release the whole behaviour: nothing here unmounts when an offer
 * lands, the row simply redraws as its withdrawal, so a flag cleared only on a
 * refusal froze the entire pool for the rest of the visit after one press.
 *
 * The write is deferred by hand so the in-flight frame can be asserted on
 * before it is let go, which is the frame the flag exists for.
 */

const offerDeferred = vi.hoisted(() => ({
  resolve: () => {},
  reject: (_: unknown) => {},
  promise: null as Promise<void> | null,
}));

function armOffer(): void {
  offerDeferred.promise = new Promise<void>((resolve, reject) => {
    offerDeferred.resolve = resolve;
    offerDeferred.reject = reject;
  });
}

/**
 * The two writes, stubbed; the key factory and the contracts are kept real —
 * the section awaits an invalidation on `sessionCoverKeys.all` after every
 * write, and a stubbed key would let a rename through.
 */
vi.mock("@/services/session-cover", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/session-cover")>()),
  useOfferSessionCover: () => ({
    mutateAsync: () => offerDeferred.promise ?? Promise.resolve(),
  }),
  useWithdrawSessionCoverOffer: () => ({
    mutateAsync: () => offerDeferred.promise ?? Promise.resolve(),
  }),
}));

const copy = messages.gedu.cover;
const TIME_ZONE = "Europe/Helsinki";

/** One open request, enough of a product for the row to draw itself. */
function request(id: string, name: string): OpenCoverRequest {
  return {
    request_id: id,
    group_id: `group-${id}`,
    group_name: `Group ${id}`,
    session_date: "2026-03-17",
    role: "primary",
    fee_cents: 6500,
    has_offered: false,
    product: {
      id: `product-${id}`,
      product_type: "consumer_club",
      topic: "minecraft_java",
      spoken_language_code: "fi",
      timezone: TIME_ZONE,
      is_remote: true,
      start_date: "2026-01-06",
      end_date: null,
      site_name: null,
      translations: [{ locale: "en", name, description: "" }],
      schedule_slots: [
        { weekday: 2, start_time: "17:00", duration_minutes: 90 },
      ],
    },
  };
}

function renderSection(requests: readonly OpenCoverRequest[]) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="en" messages={messages}>
        <TimezoneProvider initialTimezone={TIME_ZONE}>
          <GeduCoverPoolSection requests={requests} />
        </TimezoneProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

function offerButtons(): HTMLElement[] {
  return screen.queryAllByRole("button", { name: copy.poolOfferAction });
}

function isDisabled(element: HTMLElement): boolean {
  return element.hasAttribute("disabled");
}

describe("the cover pool section", () => {
  it("gives every row back once the offer has landed", async () => {
    armOffer();
    renderSection([request("a", "Redstone Club"), request("b", "Builders")]);

    const [first, second] = offerButtons();
    fireEvent.click(first);

    // In flight: the pressed row says so and its neighbour is held with it.
    expect(
      screen.getByRole("button", { name: copy.poolOfferPending }),
    ).toBeTruthy();
    expect(isDisabled(second)).toBe(true);

    await act(async () => {
      offerDeferred.resolve();
    });

    // The section is still on screen — the pool is what it was, minus this
    // gedu's press — so the flag has to come back off by itself.
    for (const button of offerButtons()) expect(isDisabled(button)).toBe(false);
    expect(
      screen.queryByRole("button", { name: copy.poolOfferPending }),
    ).toBeNull();
  });

  it("gives every row back when the write is refused, and names it on its own row", async () => {
    armOffer();
    renderSection([request("a", "Redstone Club"), request("b", "Builders")]);

    fireEvent.click(offerButtons()[0]);
    await act(async () => {
      offerDeferred.reject(new Error("nope"));
    });

    expect(screen.getByText(copy.poolActionFailed)).toBeTruthy();
    for (const button of offerButtons()) expect(isDisabled(button)).toBe(false);
  });

  it("says nothing needs cover when the answer is an empty pool", () => {
    renderSection([]);
    expect(screen.getByText(copy.poolAllClear)).toBeTruthy();
  });
});
