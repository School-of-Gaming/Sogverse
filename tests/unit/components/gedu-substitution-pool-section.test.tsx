import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { GeduSubstitutionPoolSection } from "@/components/gedu/GeduSubstitutionPoolSection";
import { NowProvider } from "@/providers/now-provider";
import { TimezoneProvider } from "@/providers/timezone-provider";
import type { OpenSubstitutionRequest } from "@/services/session-substitution";

/**
 * ============================================================================
 * Sessions needing a substitute: the two writes, answered in two places
 * ============================================================================
 *
 * **Offering asks first.** It can be refused — the request filled while the
 * card was on screen, the session already started — so it runs inside the
 * shared confirm dialog's holding mode: the dialog stays up until the write
 * settles, reads the refusal out in place, and closes only once the pool has
 * been read again. A volunteer must never walk away from a dialog that closed
 * on the press believing they had offered.
 *
 * **Withdrawing does not.** It is the undo of a decision already made, so it
 * keeps the inline flag, and the flag's *release* is the whole behaviour:
 * nothing here unmounts when a withdrawal lands, so a flag cleared only on a
 * refusal would freeze the queue for the rest of the visit.
 *
 * Both writes are deferred by hand so the in-flight frame can be asserted on
 * before it is let go, which is the frame the discipline exists for.
 */

const deferred = vi.hoisted(() => ({
  resolve: () => {},
  reject: (_: unknown) => {},
  promise: null as Promise<void> | null,
  offerCalls: 0,
}));

function armWrite(): void {
  deferred.offerCalls = 0;
  deferred.promise = new Promise<void>((resolve, reject) => {
    deferred.resolve = resolve;
    deferred.reject = reject;
  });
}

/**
 * The two writes, stubbed; the key factory and the contracts are kept real —
 * the section awaits an invalidation on `sessionSubstitutionKeys.all` after every
 * write, and a stubbed key would let a rename through.
 */
vi.mock("@/services/session-substitution", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/services/session-substitution")>()),
  useOfferSessionSubstitution: () => ({
    mutateAsync: () => {
      deferred.offerCalls += 1;
      return deferred.promise ?? Promise.resolve();
    },
  }),
  useWithdrawSessionSubstitutionOffer: () => ({
    mutateAsync: () => deferred.promise ?? Promise.resolve(),
  }),
}));

const copy = messages.gedu.substitution;
const TIME_ZONE = "Europe/Helsinki";

/** A fixed instant well before the fixture's session, so nothing is urgent. */
const NOW = new Date("2026-03-10T09:00:00Z");

/** One open request, enough of a product for the card to draw itself. */
function request(
  id: string,
  name: string,
  hasOffered = false,
): OpenSubstitutionRequest {
  return {
    request_id: id,
    group_id: `group-${id}`,
    group_name: `Group ${id}`,
    session_date: "2026-03-17",
    role: "primary",
    fee_cents: 6500,
    has_offered: hasOffered,
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

function renderSection(requests: readonly OpenSubstitutionRequest[] | undefined) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="en" messages={messages}>
        <TimezoneProvider initialTimezone={TIME_ZONE}>
          <NowProvider initialNow={NOW}>
            <GeduSubstitutionPoolSection requests={requests} />
          </NowProvider>
        </TimezoneProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

/** The cards' own offer buttons — never the dialog's, which is a portal. */
function cardOfferButtons(container: HTMLElement): HTMLElement[] {
  return within(container).queryAllByRole("button", {
    name: copy.poolOfferAction,
  });
}

/**
 * The open dialog, found by its own backdrop — the same handle the shared
 * dialog's own suite uses. It is a portal into `document.body`, which is what
 * makes "inside the dialog" a real assertion here and lets the card's button be
 * told apart from the dialog's, since the two carry the same label.
 */
function dialog(): HTMLElement {
  const scrim = document.querySelector(".bg-scrim");
  const root = scrim?.parentElement;
  if (!(root instanceof HTMLElement)) throw new Error("no dialog is open");
  return root;
}

function dialogIsOpen(): boolean {
  return document.querySelector(".bg-scrim") !== null;
}

function isDisabled(element: HTMLElement): boolean {
  return element.hasAttribute("disabled");
}

describe("offering to substitute", () => {
  it("draws its control as a label and nothing else", () => {
    const { container } = renderSection([request("a", "Redstone Club")]);
    const [offer] = cardOfferButtons(container);
    expect(offer.querySelector("svg")).toBeNull();
  });

  it("asks before it writes", () => {
    armWrite();
    const { container } = renderSection([request("a", "Redstone Club")]);

    fireEvent.click(cardOfferButtons(container)[0]);

    expect(within(dialog()).getByText(copy.offerConfirmTitle)).toBeTruthy();
    // The press opened a question, not a write.
    expect(deferred.offerCalls).toBe(0);
  });

  it("names the session it is about, and nobody", () => {
    armWrite();
    const { container } = renderSection([request("a", "Redstone Club")]);
    fireEvent.click(cardOfferButtons(container)[0]);

    // The product is in the body; the absent gedu is not in the row at all, so
    // there is no name for the dialog to leak.
    expect(dialog().textContent).toContain("Redstone Club");
  });

  it("writes once on confirm and holds itself open until the write lands", async () => {
    armWrite();
    const { container } = renderSection([request("a", "Redstone Club")]);
    fireEvent.click(cardOfferButtons(container)[0]);

    const confirm = within(dialog()).getByRole("button", {
      name: copy.poolOfferAction,
    });
    fireEvent.click(confirm);
    // A second press in the same frame must reach nothing.
    fireEvent.click(confirm);

    expect(deferred.offerCalls).toBe(1);
    expect(dialogIsOpen()).toBe(true);
    expect(isDisabled(confirm)).toBe(true);

    await act(async () => {
      deferred.resolve();
    });

    expect(dialogIsOpen()).toBe(false);
  });

  it("stays open and names the refusal in place when the write is refused", async () => {
    armWrite();
    const { container } = renderSection([request("a", "Redstone Club")]);
    fireEvent.click(cardOfferButtons(container)[0]);
    fireEvent.click(
      within(dialog()).getByRole("button", { name: copy.poolOfferAction }),
    );

    await act(async () => {
      deferred.reject(new Error("nope"));
    });

    // In front of the button that caused it, never behind the dialog.
    expect(within(dialog()).getByText(copy.poolActionFailed)).toBeTruthy();
    // And the card behind it is untouched: still an offer, not an offered.
    expect(cardOfferButtons(container)).toHaveLength(1);
  });

  it("writes nothing when the question is cancelled", () => {
    armWrite();
    const { container } = renderSection([request("a", "Redstone Club")]);
    fireEvent.click(cardOfferButtons(container)[0]);

    fireEvent.click(
      within(dialog()).getByRole("button", { name: messages.common.cancel }),
    );

    expect(deferred.offerCalls).toBe(0);
    expect(dialogIsOpen()).toBe(false);
  });
});

describe("withdrawing an offer", () => {
  function withdrawButtons(): HTMLElement[] {
    return screen.queryAllByRole("button", { name: copy.poolWithdrawAction });
  }

  it("goes straight through, with no question in front of it", () => {
    armWrite();
    renderSection([request("a", "Redstone Club", true)]);

    const [withdraw] = withdrawButtons();
    expect(withdraw.querySelector("svg")).toBeNull();

    fireEvent.click(withdraw);
    expect(dialogIsOpen()).toBe(false);
  });

  it("gives every card back once the withdrawal has landed", async () => {
    armWrite();
    renderSection([
      request("a", "Redstone Club", true),
      request("b", "Builders", true),
    ]);

    const [first, second] = withdrawButtons();
    fireEvent.click(first);

    // In flight: the pressed card says so and its neighbour is held with it.
    expect(
      screen.getByRole("button", { name: copy.poolWithdrawPending }),
    ).toBeTruthy();
    expect(isDisabled(second)).toBe(true);

    await act(async () => {
      deferred.resolve();
    });

    // The section is still on screen — the pool is what it was, minus this
    // gedu's press — so the flag has to come back off by itself.
    for (const button of withdrawButtons()) {
      expect(isDisabled(button)).toBe(false);
    }
    expect(
      screen.queryByRole("button", { name: copy.poolWithdrawPending }),
    ).toBeNull();
  });

  it("gives every card back when the write is refused, and names it on its own card", async () => {
    armWrite();
    renderSection([
      request("a", "Redstone Club", true),
      request("b", "Builders", true),
    ]);

    fireEvent.click(withdrawButtons()[0]);
    await act(async () => {
      deferred.reject(new Error("nope"));
    });

    expect(screen.getByText(copy.poolActionFailed)).toBeTruthy();
    for (const button of withdrawButtons()) {
      expect(isDisabled(button)).toBe(false);
    }
  });
});

describe("the pool's two empty answers", () => {
  it("says nothing needs a substitute when the answer is an empty pool", () => {
    renderSection([]);
    expect(screen.getByText(copy.poolAllClear)).toBeTruthy();
  });

  /**
   * "Nothing needs a substitute" and "nobody has answered yet" are different
   * facts, and the second one must never be told as the first: a gedu who read
   * an all-clear line off a read that had not returned would close the page.
   */
  it("says nothing at all while the read is still out", () => {
    const { container } = renderSection(undefined);
    expect(screen.queryByText(copy.poolAllClear)).toBeNull();
    expect(cardOfferButtons(container)).toHaveLength(0);
  });
});
