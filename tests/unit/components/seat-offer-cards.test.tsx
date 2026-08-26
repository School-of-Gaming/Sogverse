import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { WaitlistCard } from "@/components/admin/products/groups/waitlist-card";
import { EnrollmentCard } from "@/components/family/EnrollmentCard";
import type { FamilyEnrollmentSummary } from "@/components/family/enrollment-rollup";
import { SEAT_OFFER_WINDOW_MS } from "@/lib/constants/seat-offer";
import type { ProductGroupsSnapshot } from "@/types";

/**
 * What an offer looks like on the two cards that draw one.
 *
 * The arithmetic behind it is tested on its own (`seat-offer-state.test.ts`);
 * this file is about the decisions only a rendered card makes, and there are
 * five of them worth pinning:
 *
 *  1. **A live offer replaces the Invite button.** That absence *is* the
 *     double-send guard an admin can see, and it is invisible to any test of
 *     the pure rules.
 *  2. **An expired one brings the button back**, because the database allows a
 *     re-offer and an admin who is not shown that has lost the seat.
 *  3. **A family card mounted on an already-lapsed offer draws no block at
 *     all**, while one whose offer lapses *under the reader* keeps its block in
 *     place. Same data, opposite answers, decided by which of them the card was
 *     mounted on — the whole of the no-shift-on-time's-schedule rule here.
 *  4. **The leave-waitlist link steps aside while an offer stands**, because
 *     "No, thank you" is the same act with the right words on it.
 *  5. **Disabled and spinning are two states.** The buttons stay inert through
 *     a refusal and the spinner does not, and the spinner sits on whichever
 *     button was pressed — neither is visible to anything but a render.
 */

// Keys echo, so an assertion names the copy the card reached for rather than
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

// The two providers both cards read. Stubbed rather than wrapped, so a case
// can move the clock without a provider re-render getting in the way.
const clock = vi.hoisted(() => ({ now: new Date() }));
vi.mock("@/providers", () => ({
  useNow: () => clock.now,
  useTimezone: () => "Europe/Helsinki",
}));

// dnd-kit and the chip are the waitlist card's other half and are not what this
// file is about.
vi.mock("@dnd-kit/core", () => ({
  useDroppable: () => ({ setNodeRef: () => {}, isOver: false }),
}));
vi.mock("@/components/admin/products/groups/participant-chip", () => ({
  ParticipantChip: ({ firstName }: { firstName: string }) => (
    <div>{firstName}</div>
  ),
}));

const NOW = new Date("2026-08-26T12:00:00.000Z");
const OFFERED_TWO_DAYS_AGO = new Date(
  NOW.getTime() - 2 * 24 * 60 * 60 * 1000,
).toISOString();
/** Stamped so its window closes one minute from `NOW`. */
const OFFERED_ALMOST_OUT = new Date(
  NOW.getTime() + 60_000 - SEAT_OFFER_WINDOW_MS,
).toISOString();
const OFFERED_AND_LAPSED = new Date(
  NOW.getTime() - SEAT_OFFER_WINDOW_MS - 60_000,
).toISOString();

const PARTICIPATION_ID = "0d4dd1e6-2e0b-4ee6-8f6f-6d3d3f7d3f0b";
const PARTICIPANT_ID = "a3a1d0f9-6b3f-4c3d-9a1e-2f0b7c5d8e41";

beforeEach(() => {
  clock.now = NOW;
});

// ---------------------------------------------------------------------------
// The admin waitlist card
// ---------------------------------------------------------------------------

type Participation = ProductGroupsSnapshot["unassigned"][number];

function queued(seatOfferSentAt: string | null): Participation {
  return {
    id: PARTICIPATION_ID,
    participant_id: PARTICIPANT_ID,
    participant_first_name: "Aino",
    participant_date_of_birth: null,
    participant_gender: null,
    participant_minecraft_username: null,
    participant_minecraft_uuid: null,
    participant_roblox_username: null,
    participant_roblox_user_id: null,
    parent_first_name: null,
    parent_last_name: null,
    participant_email: null,
    status: "waitlisted",
    signed_up_at: "2026-01-01T00:00:00Z",
    has_live_subscription: false,
    has_payment_marker: false,
    group_joined_at: null,
    note: null,
    note_updated_by_first_name: null,
    seat_offer_sent_at: seatOfferSentAt,
    seat_offer_expiry_notified_at: null,
  };
}

function renderWaitlist(
  seatOfferSentAt: string | null,
  seatOffers: Parameters<typeof WaitlistCard>[0]["seatOffers"] = {
    kind: "available",
  },
  onSendSeatOffer?: (participationId: string) => Promise<void>,
) {
  render(
    <WaitlistCard
      participations={[queued(seatOfferSentAt)]}
      pendingChipIds={new Set()}
      gamePlatform={null}
      robloxRenders={undefined}
      seatOffers={seatOffers}
      onSendSeatOffer={onSendSeatOffer}
    />,
  );
}

const PANEL = "admin.products.groupsPanel.waitlist.seatOffer";

describe("WaitlistCard — the offer states", () => {
  it("offers Invite on a queued row nobody has asked yet", () => {
    renderWaitlist(null, { kind: "available" }, vi.fn());
    expect(screen.getByText(`${PANEL}.invite`)).toBeTruthy();
    expect(screen.queryByText(`${PANEL}.noAnswer`)).toBeNull();
  });

  it("replaces the button with the time left while an offer is live", () => {
    renderWaitlist(OFFERED_TWO_DAYS_AGO, { kind: "available" }, vi.fn());

    // Three days of a five-day window, and — the load-bearing half — no way to
    // press Invite again.
    expect(screen.getByText(`${PANEL}.leftDays({"count":3})`)).toBeTruthy();
    expect(screen.queryByText(`${PANEL}.invite`)).toBeNull();
    expect(screen.queryByText(`${PANEL}.inviteAgain`)).toBeNull();
  });

  it("stops counting inside the last hour", () => {
    renderWaitlist(OFFERED_ALMOST_OUT, { kind: "available" }, vi.fn());
    expect(screen.getByText(`${PANEL}.leftLastHour`)).toBeTruthy();
  });

  it("says nobody answered, and lets the admin ask again", () => {
    renderWaitlist(OFFERED_AND_LAPSED, { kind: "available" }, vi.fn());
    expect(screen.getByText(`${PANEL}.noAnswer`)).toBeTruthy();
    expect(screen.getByText(`${PANEL}.inviteAgain`)).toBeTruthy();
  });

  it("commits the button on the click and holds it there", async () => {
    // The promise never settles, which is the whole point: between the click
    // and the refetched snapshot there must be no frame where the button is
    // pressable again.
    const send = vi.fn(() => new Promise<void>(() => {}));
    renderWaitlist(null, { kind: "available" }, send);

    const button = screen.getByText(`${PANEL}.invite`).closest("button");
    await act(async () => {
      button?.click();
    });

    expect(send).toHaveBeenCalledWith(PARTICIPATION_ID);
    expect(
      screen.getByText(`${PANEL}.invite`).closest("button")?.disabled,
    ).toBe(true);
  });

  it("draws nothing at all on a paid product", () => {
    // Not a disabled button and not a note: the refusal is a property of the
    // product, and repeating it down the length of a queue is noise an admin
    // can do nothing with.
    renderWaitlist(null, { kind: "unavailable" }, vi.fn());
    expect(screen.queryByText(`${PANEL}.invite`)).toBeNull();
    expect(screen.queryByText(new RegExp(`${PANEL}.needsOneGroup`))).toBeNull();
  });

  it("explains the group count once, below the queue rather than above it", () => {
    renderWaitlist(null, { kind: "needsOneGroup", groupCount: 2 }, vi.fn());

    expect(screen.queryByText(`${PANEL}.invite`)).toBeNull();
    expect(
      screen.getByText(`${PANEL}.needsOneGroup({"count":2})`),
    ).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// The family's own card
// ---------------------------------------------------------------------------

const FAMILY = "parent.waitlist.seatOffer";

function waitlistedEnrollment(
  seatOfferSentAt: string | null,
): FamilyEnrollmentSummary {
  return {
    participationId: PARTICIPATION_ID,
    productName: "Fortnite Creative Club",
    productType: "consumer_club",
    nextSessionStart: null,
    nextSessionEnd: null,
    hasVoiceRoom: true,
    voiceHref: "#",
    siteName: null,
    openHref: "#",
    endDate: null,
    timezone: "Europe/Helsinki",
    waitlistPosition: 3,
    seatOfferSentAt,
    awaiting: false,
    paymentProblem: false,
    cancellation: null,
    scheduleLines: [],
  };
}

function renderFamilyCard(
  seatOfferSentAt: string | null,
  onRespondToSeatOffer?: (
    accept: boolean,
  ) => Promise<"accepted" | "declined" | "expired">,
) {
  return render(
    <EnrollmentCard
      enrollment={waitlistedEnrollment(seatOfferSentAt)}
      audience="customer"
      gamerFirstName="Aino"
      onLeaveWaitlist={() => {}}
      onRespondToSeatOffer={onRespondToSeatOffer}
    />,
  );
}

describe("EnrollmentCard — the family's seat offer", () => {
  it("draws the block, with both answers, while the offer is live", () => {
    renderFamilyCard(OFFERED_TWO_DAYS_AGO, vi.fn());

    expect(screen.getByText(`${FAMILY}.title`)).toBeTruthy();
    expect(screen.getByText(`${FAMILY}.accept`)).toBeTruthy();
    expect(screen.getByText(`${FAMILY}.decline`)).toBeTruthy();
  });

  it("stands the leave link down while an offer is live", () => {
    // Two destructive affordances a centimetre apart would be one of them
    // silently doing less: declining also tells staff the seat is free.
    renderFamilyCard(OFFERED_TWO_DAYS_AGO, vi.fn());
    expect(screen.queryByText("parent.waitlist.leave.trigger")).toBeNull();

    // …and it is back on an ordinary queue place.
    screen.getByText(`${FAMILY}.title`);
  });

  it("keeps the leave link on a queue place with no offer", () => {
    renderFamilyCard(null, vi.fn());
    expect(screen.getByText("parent.waitlist.leave.trigger")).toBeTruthy();
    expect(screen.queryByText(`${FAMILY}.title`)).toBeNull();
  });

  it("draws no block at all for an offer that lapsed before the visit", () => {
    // History, not a question. There is nothing to answer and nothing to say.
    renderFamilyCard(OFFERED_AND_LAPSED, vi.fn());
    expect(screen.queryByText(`${FAMILY}.title`)).toBeNull();
    expect(screen.getByText("parent.waitlist.leave.trigger")).toBeTruthy();
  });

  it("keeps the block in place when the window closes under the reader", () => {
    const { rerender } = renderFamilyCard(OFFERED_ALMOST_OUT, vi.fn());
    expect(screen.getByText(`${FAMILY}.accept`)).toBeTruthy();

    // The clock crosses the deadline. Nothing the parent did.
    act(() => {
      clock.now = new Date(NOW.getTime() + 120_000);
    });
    rerender(
      <EnrollmentCard
        enrollment={waitlistedEnrollment(OFFERED_ALMOST_OUT)}
        audience="customer"
        gamerFirstName="Aino"
        onLeaveWaitlist={() => {}}
        onRespondToSeatOffer={vi.fn()}
      />,
    );

    // Same block, same buttons, same place — and both inert.
    expect(screen.getByText(`${FAMILY}.lapsed`)).toBeTruthy();
    expect(
      screen.getByText(`${FAMILY}.accept`).closest("button")?.disabled,
    ).toBe(true);
    expect(
      screen.getByText(`${FAMILY}.decline`).closest("button")?.disabled,
    ).toBe(true);
  });

  it("draws a server refusal as the lapsed state rather than an error", async () => {
    // The parent pressed after the window closed. The server says `expired`,
    // which is an answer and not a fault, so the block flips exactly as it
    // would have on the clock alone.
    const respond = vi.fn().mockResolvedValue("expired" as const);
    const { container } = renderFamilyCard(OFFERED_ALMOST_OUT, respond);

    await act(async () => {
      screen.getByText(`${FAMILY}.accept`).closest("button")?.click();
    });

    expect(respond).toHaveBeenCalledWith(true);
    expect(screen.getByText(`${FAMILY}.lapsed`)).toBeTruthy();
    expect(
      screen.queryByText(new RegExp(`${FAMILY}.error`)),
    ).toBeNull();

    // The buttons stay inert — that latch survives the refusal on purpose —
    // but nothing is still working, so nothing may still be spinning. The two
    // used to be one flag, and this state was the one where that showed.
    expect(container.querySelector(".animate-spin")).toBeNull();
    expect(
      screen.getByText(`${FAMILY}.accept`).closest("button")?.disabled,
    ).toBe(true);
  });

  it("spins the button the parent actually pressed", async () => {
    // Declining goes through a confirmation that closes on confirm, so the
    // block is on screen for the whole of the request — and the spinner has to
    // be on Decline, not on the button nobody touched. The promise never
    // settles, which is what holds the in-flight frame still to look at.
    const respond = vi.fn(() => new Promise<"declined">(() => {}));
    renderFamilyCard(OFFERED_TWO_DAYS_AGO, respond);

    await act(async () => {
      screen.getByText(`${FAMILY}.decline`).closest("button")?.click();
    });
    await act(async () => {
      screen.getByText(`${FAMILY}.confirmCta`).closest("button")?.click();
    });

    expect(respond).toHaveBeenCalledWith(false);
    expect(
      screen
        .getByText(`${FAMILY}.decline`)
        .closest("button")
        ?.querySelector(".animate-spin"),
    ).toBeTruthy();
    expect(
      screen
        .getByText(`${FAMILY}.accept`)
        .closest("button")
        ?.querySelector(".animate-spin"),
    ).toBeNull();
    // Both inert either way: one answer is in flight and the other must not be
    // reachable behind it.
    expect(
      screen.getByText(`${FAMILY}.accept`).closest("button")?.disabled,
    ).toBe(true);
  });

  it("offers the child their own copy to read and no way to answer it", () => {
    // The respond route is authorized to the purchasing parent, so a button
    // here could only ever produce a refusal.
    render(
      <EnrollmentCard
        enrollment={waitlistedEnrollment(OFFERED_TWO_DAYS_AGO)}
        audience="gamer"
      />,
    );

    expect(screen.getByText(`${FAMILY}.bodyGamer`)).toBeTruthy();
    expect(screen.queryByText(`${FAMILY}.accept`)).toBeNull();
  });
});
