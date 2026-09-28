import { describe, it, expect, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import { SubstitutionRequestsPanel } from "@/components/admin/substitutions/substitution-requests-panel";
import { seatSubstituteWrite } from "@/components/admin/substitutions/seat-substitute-flow";
import type {
  SeatSubstituteDraft,
  SubstitutionOffer,
  SubstitutionRequest,
} from "@/components/admin/substitutions/admin-substitutions-data";
import type { UserListEntry } from "@/services/users";
import { ROUTES } from "@/lib/constants";
import { formatDayMonth } from "@/lib/calendar-date";
import { formatDateOnly } from "@/lib/utils";

/**
 * The admin Substitutions page's queue panel, and the claims that are only true
 * of the rendered list.
 *
 * 1. **Approve asks first, and the press writes nothing.** Approving seats a
 *    person on a session and opens the group's workspace — its roster, its
 *    children — to them, so it goes through the shared confirm dialog in its
 *    holding mode: the dialog owns the latch, the disabled buttons and the
 *    refusal line, and the panel owns nothing but which offer is being asked
 *    about.
 * 2. **The confirm posts the OFFER's id.** The row names a session and a
 *    person, and the id that has to reach the RPC is neither of those — it is
 *    the offer joining them. Handing over the request or the gedu would look
 *    identical on screen and approve nothing.
 * 3. **A row leaves only when both halves agree**: the write resolved *and* the
 *    list it was given stopped offering that request. The second half is what
 *    protects the panel from a receipt that outlives its own fact — a second
 *    admin clearing the sub puts the request back, and the row has to come with
 *    it. A panel that dropped the row on the resolution alone would filter it
 *    out of a list that is still offering it, with nothing left to act on.
 * 4. **The requests are the cards; the list is a heading over a stack.** Each
 *    request is a peer with an action of its own, and nothing inside one is
 *    boxed — the offers are divider-separated rows under a muted label. Empty
 *    is a line under the heading, not a card holding a line.
 * 5. **Urgency is a tint, not a re-ordering**, and it is carried by the row it
 *    belongs to rather than recomputed from the clock in the component.
 * 6. **The queue is grouped by day**, one label per date, soonest day first,
 *    each day's requests in the order they were handed over. The day comes
 *    from the request's own calendar date, so the orphan still has one.
 * 7. **Any request can be answered with somebody who did not offer**, from its
 *    own card: the picker opens on the request's seat, the confirm asks no
 *    reason and shows the gedu's own back, and the write names the request's
 *    group, date and absent gedu and sends no reason at all.
 *
 * Translations echo their keys, so nothing here depends on English wording, and
 * the relative-time formatter echoes a fixed phrase: what this file is about is
 * the panel's behaviour, and the phrasing is `Intl`'s own.
 */
vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => {
    const t = (key: string) => (namespace ? `${namespace}.${key}` : key);
    t.rich = (key: string) => key;
    return t;
  },
  useFormatter: () => ({ relativeTime: () => "in 3 hours" }),
  useLocale: () => "en",
}));

// Real UUIDs, hardcoded: every chip draws an identicon out of the id's hex
// bytes, and a readable stand-in renders a degenerate one rather than a
// different one. Never generated at test time.
const IDS = {
  requester: "3f8682f8-1994-4e4b-b849-73c4066efac4",
  offererA: "52cae3c1-b538-4513-9036-d22863bb8766",
  offererB: "ea0111ac-09ed-438c-85ef-f9f138b00209",
  colleague: "c61f2a0e-5d8b-4b8e-9f2c-0a7c3e61d4b2",
} as const;

function candidate(id: string, firstName: string): UserListEntry {
  return {
    id,
    created_at: "2024-01-01T00:00:00.000Z",
    updated_at: "2024-01-01T00:00:00.000Z",
    currency: null,
    email: `${firstName.toLowerCase()}@example.com`,
    email_verified_at: null,
    first_name: firstName,
    last_name: "Virtanen",
    home_location_id: null,
    locale: "fi",
    phone: null,
    role: "gedu",
    spoken_languages: ["fi"],
    utm_campaign: null,
    registration_completed_at: "2026-01-01T00:00:00.000Z",
    utm_medium: null,
    utm_source: null,
    certified: true,
    criminal_record_check_passed: true,
    linked_gamers: [],
  };
}

/** What the picker lists: the absent gedu themselves, and a colleague who did not offer. */
const CANDIDATES = [
  candidate(IDS.requester, "Milo"),
  candidate(IDS.colleague, "Iida"),
];

// The picker reads one page of the shared people list; nothing left to page
// through, so no sentinel is mounted.
vi.mock("@/services/users", () => ({
  useUserList: () => ({
    data: { pages: [{ rows: CANDIDATES, total: CANDIDATES.length }] },
    isPending: false,
    isPlaceholderData: false,
    hasNextPage: false,
    isFetching: false,
    isFetchingNextPage: false,
    fetchNextPage: () => Promise.resolve(),
  }),
}));

/** The panel's pinned clock. Nothing here reads it; every row carries it. */
const NOW = new Date("2026-08-17T09:20:00+03:00");

function offer(id: string, geduId: string, name: string): SubstitutionOffer {
  return {
    id,
    geduId,
    name,
  };
}

const WITH_OFFERS: SubstitutionRequest = {
  id: "request-with-offers",
  groupId: "group-a",
  groupName: "Ryhmä A",
  productName: "Minecraft-klubi Espoo",
  productType: "consumer_club",
  sessionDay: "2026-08-17",
  sessionDate: "Mon 17 Aug",
  sessionTime: "17:00–18:30",
  startsAt: new Date("2026-08-17T17:00:00+03:00"),
  urgent: true,
  role: "primary",
  reason: "sick",
  reasonNote: "Flunssa.",
  requesterId: IDS.requester,
  requesterName: "Milo Korhonen",
  groupHref: ROUTES.admin.productGroup(
    "consumer_club",
    "consumer-club-1",
    "group-a",
  ),
  offers: [
    offer("offer-a", IDS.offererA, "Eeli Virtanen"),
    offer("offer-b", IDS.offererB, "Saana Nieminen"),
  ],
};

const WITHOUT_OFFERS: SubstitutionRequest = {
  ...WITH_OFFERS,
  id: "request-without-offers",
  groupId: "group-b",
  groupName: "Ryhmä B",
  productName: "Roblox Studio -leiri Espoo",
  productType: "camp",
  sessionDay: "2026-08-25",
  sessionDate: "Tue 25 Aug",
  // The orphan: an admin moved the schedule's weekday after this request was
  // filed, so no slot names its date. It has no time and no claim about when it
  // starts, which is why it can never be urgent.
  sessionTime: null,
  startsAt: null,
  urgent: false,
  reasonNote: null,
  groupHref: ROUTES.admin.productGroup("camp", "camp-2", "group-b"),
  offers: [],
};

function renderPanel(
  requests: readonly SubstitutionRequest[],
  onApproveOffer: (offerId: string) => Promise<void>,
  onSeatSubstitute: (draft: SeatSubstituteDraft) => Promise<void> = () =>
    Promise.resolve(),
) {
  return render(
    <SubstitutionRequestsPanel
      requests={requests}
      now={NOW}
      onApproveOffer={onApproveOffer}
      onSeatSubstitute={onSeatSubstitute}
    />,
  );
}

describe("the admin Substitutions page's queue panel", () => {
  it("renders one row per request, with the session, the absent gedu and every offer", () => {
    renderPanel([WITH_OFFERS, WITHOUT_OFFERS], () => Promise.resolve());

    const rows = requestCards();
    expect(rows).toHaveLength(2);

    const staffed = within(rows[0]);
    expect(staffed.getByText("Minecraft-klubi Espoo")).toBeTruthy();
    expect(staffed.getByText("Ryhmä A")).toBeTruthy();
    // The clock face stays on the card, so an admin staffing a group that
    // meets twice on one day knows which of the two is short-staffed.
    expect(staffed.getByText("17:00–18:30")).toBeTruthy();
    // The date does not: the day label beside the card states it once.
    expect(staffed.queryByText("Mon 17 Aug")).toBeNull();
    expect(staffed.getByText("Milo Korhonen")).toBeTruthy();
    expect(staffed.getByText("Flunssa.")).toBeTruthy();
    expect(staffed.getByText("Eeli Virtanen")).toBeTruthy();
    expect(staffed.getByText("Saana Nieminen")).toBeTruthy();
    // A name and nothing else: no certification chip, no extract stamp.
    expect(
      staffed.queryByText("admin.users.certification.certified"),
    ).toBeNull();
  });

  /**
   * How soon a session is, is the row's own sentence — the list is sorted by
   * it, so a reader scanning a run of deadlines must not have to subtract a
   * clock face from a date to find the next one.
   */
  it("collapses to an all-clear line when no session needs a substitute", () => {
    renderPanel([], () => Promise.resolve());

    expect(screen.getByText("admin.substitutions.allClear")).toBeTruthy();
    // A line under the heading, not a list and not a card holding one.
    expect(screen.queryByRole("list")).toBeNull();
    // The heading survives the empty state — it is what holds the stack, so
    // the panel would otherwise be a sentence nothing introduces.
    expect(
      screen.getByRole("heading", { name: "admin.substitutions.listLabel" }),
    ).toBeTruthy();
  });

  it("says how long until the session starts, and marks the urgent row", () => {
    renderPanel([WITH_OFFERS, WITHOUT_OFFERS], () => Promise.resolve());

    const rows = requestCards();

    expect(within(rows[0]).getByText("in 3 hours")).toBeTruthy();
    // The urgency treatment is the request CARD's own edge and nothing else —
    // one token, no badge, no second colour, and no extra box to carry it.
    expect(rows[0].querySelector(".border-l-warning")).toBeTruthy();

    // The orphan has no start, so it makes no claim about how soon it is and
    // cannot be urgent.
    expect(within(rows[1]).queryByText("in 3 hours")).toBeNull();
    expect(rows[1].querySelector(".border-l-warning")).toBeNull();
  });

  /**
   * The card rule, pinned where it was broken: the panel used to be a card
   * holding bordered request boxes holding tinted offer boxes — three levels of
   * edge, each spending a border and two paddings of a 360px screen. Now the
   * request is the only box, and the offers are rows told apart by dividers.
   */
  it("boxes the request and nothing inside it", () => {
    const { container } = renderPanel(
      [WITH_OFFERS, WITHOUT_OFFERS],
      () => Promise.resolve(),
    );

    const cards = container.querySelectorAll(".rounded-lg.border");
    expect(cards).toHaveLength(2);
    for (const card of cards) {
      // No bordered CONTAINER inside a card — the shape this page used to nest
      // two deep. Scoped to `div` on purpose: a person chip and the
      // open-the-group link are a chip and a control, and the rule's own
      // exceptions cover both, so their borders are theirs to have.
      expect(
        card.querySelector("div.rounded-lg.border, div.rounded-md.border"),
      ).toBeNull();
    }

    // The offers are rows under a label, joined by dividers rather than boxed.
    const offers = screen.getByRole("list", {
      name: "admin.substitutions.offersLabel",
    });
    expect(offers.className).toContain("divide-y");
    expect(offers.children).toHaveLength(2);
  });

  it("says nobody has offered and points at the group page", () => {
    renderPanel([WITHOUT_OFFERS], () => Promise.resolve());

    expect(screen.getByText("admin.substitutions.noOffers")).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: /admin.substitutions.openGroup/ })
        .getAttribute("href"),
    ).toBe("/admin/camps/camp-2/groups/group-b");
    // Nothing to approve, so the one press on this row is seating somebody
    // who did not offer.
    expect(
      screen.getAllByRole("button").map((button) => button.textContent),
    ).toEqual(["admin.substitutions.seatSomeoneElse"]);
  });

  it("offers to seat someone else on every open request, with offers or without", () => {
    renderPanel([WITH_OFFERS, WITHOUT_OFFERS], () => Promise.resolve());

    for (const card of requestCards()) {
      expect(
        within(card).getByRole("button", {
          name: "admin.substitutions.seatSomeoneElse",
        }),
      ).toBeTruthy();
    }
  });

  it("opens the picker on the request's seat, refusing the absent gedu", async () => {
    const seat = vi.fn(() => Promise.resolve());
    const { container } = renderPanel([WITHOUT_OFFERS], approveNothing, seat);

    await act(async () => pressSeat(container, 0));

    // Straight to the full list: the card already knows whose seat it is, so
    // there is no "who is away" question in between.
    expect(
      screen.getByText("admin.products.staffing.pickerTitle"),
    ).toBeTruthy();
    expect(pickerRow("Milo").hasAttribute("disabled")).toBe(true);
    expect(pickerRow("Iida").hasAttribute("disabled")).toBe(false);
    expect(seat).not.toHaveBeenCalled();
  });

  it("asks no reason, shows the gedu's own back, and seats on the request's own seat", async () => {
    const seat = vi.fn((_draft: SeatSubstituteDraft) => Promise.resolve());
    const { container } = renderPanel([WITHOUT_OFFERS], approveNothing, seat);

    await act(async () => pressSeat(container, 0));
    await act(async () => pickerRow("Iida").click());

    expect(
      screen.getByText("admin.substitutions.seatConfirmTitle"),
    ).toBeTruthy();
    // The reason the gedu gave, read-only — and nothing to choose.
    expect(screen.getByText("admin.substitutions.seatReasonLabel")).toBeTruthy();
    expect(screen.getByText("admin.substitutions.reason.sick")).toBeTruthy();
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.queryByRole("textbox", { name: /note/i })).toBeNull();

    await act(async () =>
      screen
        .getByRole("button", { name: "admin.substitutions.seatConfirm" })
        .click(),
    );

    expect(seat).toHaveBeenCalledTimes(1);
    const draft = seat.mock.calls[0][0];
    expect(draft.request.id).toBe(WITHOUT_OFFERS.id);
    expect(draft.sub).toEqual({
      id: IDS.colleague,
      firstName: "Iida",
      lastName: "Virtanen",
    });
    // The write the shell makes from it: the request's group, its own
    // product-local date and its absent gedu — and no reason or note key at
    // all, so the gedu's own stays on the row.
    expect(seatSubstituteWrite(draft)).toStrictEqual({
      groupId: "group-b",
      sessionDate: "2026-08-25",
      absentGeduId: IDS.requester,
      subGeduId: IDS.colleague,
    });
  });

  it("drops the request once the seat and the refetch have both landed", async () => {
    let land: () => void = () => {};
    const seat = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          land = resolve;
        }),
    );
    const { container, rerender } = renderPanel(
      [WITH_OFFERS],
      approveNothing,
      seat,
    );

    await act(async () => pressSeat(container, 0));
    await act(async () => pickerRow("Iida").click());
    await act(async () =>
      screen
        .getByRole("button", { name: "admin.substitutions.seatConfirm" })
        .click(),
    );

    rerender(
      <SubstitutionRequestsPanel
        requests={[]}
        now={NOW}
        onApproveOffer={approveNothing}
        onSeatSubstitute={seat}
      />,
    );
    await act(async () => land());

    expect(
      screen.queryByText("admin.substitutions.seatConfirmTitle"),
    ).toBeNull();
    expect(screen.queryByText("Minecraft-klubi Espoo")).toBeNull();
    // A seat from the card is receipted exactly as an approval is.
    expect(screen.getByText("admin.substitutions.justNow")).toBeTruthy();
  });

  it.each([
    [
      "the chosen gedu is already due or cannot substitute",
      {
        code: "23514",
        message: "gedu 3 cannot substitute on group 2 on 2026-08-25",
      },
      "admin.substitutions.seatFailedIneligible",
    ],
    [
      "the absent gedu no longer holds the seat",
      {
        code: "23514",
        message: "gedu 1 is not expected at group 2 on 2026-08-25",
      },
      "admin.substitutions.seatFailedSeatGone",
    ],
    [
      "the schedule no longer has the date",
      {
        code: "23514",
        message: "No scheduled session on 2026-08-25 for this group",
      },
      "admin.substitutions.seatFailedNotScheduled",
    ],
    ["something nobody mapped", new Error("boom"), "admin.substitutions.seatFailed"],
  ])(
    "keeps the seat dialog open and names the refusal when %s",
    async (_case, error, line) => {
      const seat = vi.fn(() => Promise.reject(error));
      const { container } = renderPanel([WITHOUT_OFFERS], approveNothing, seat);

      await act(async () => pressSeat(container, 0));
      await act(async () => pickerRow("Iida").click());
      await act(async () =>
        screen
          .getByRole("button", { name: "admin.substitutions.seatConfirm" })
          .click(),
      );

      expect(screen.getByText(line)).toBeTruthy();
      expect(
        screen.getByRole<HTMLButtonElement>("button", {
          name: "admin.substitutions.seatConfirm",
        }).disabled,
      ).toBe(false);
      expect(screen.queryByText("admin.substitutions.justNow")).toBeNull();
    },
  );

  /**
   * An orphaned request — the schedule's weekday moved after it was filed —
   * still has a date and no longer has an occurrence. It stays in the queue,
   * which is the whole reason the read orders by date rather than by a derived
   * instant, and it states the date alone rather than a time nothing projects.
   */
  it("renders a request the schedule no longer projects under its day, with no time", () => {
    renderPanel([WITHOUT_OFFERS], () => Promise.resolve());

    expect(
      within(dayList("2026-08-25")).getByText("Roblox Studio -leiri Espoo"),
    ).toBeTruthy();
    expect(screen.queryByText(/\d\d:\d\d/)).toBeNull();
  });

  /**
   * An admin could not tell how the list was ordered from the cards alone, so
   * it is grouped by the day each session falls on — the order a reader scans
   * is then legible from the labels.
   */
  it("groups the requests by day, soonest day first, in the order handed over within a day", () => {
    const sameDayLater: SubstitutionRequest = {
      ...WITH_OFFERS,
      id: "request-same-day-later",
      productName: "Roblox-klubben Solna",
      startsAt: new Date("2026-08-17T19:00:00+03:00"),
      urgent: false,
    };
    // Sorted by instant, a session just after midnight in one zone can come
    // before a late one on the previous date in another; the day list still
    // puts the earlier date first.
    const nextDayEarly: SubstitutionRequest = {
      ...WITH_OFFERS,
      id: "request-next-day-early",
      productName: "Fortnite-klubi Vantaa",
      sessionDay: "2026-08-18",
      startsAt: new Date("2026-08-17T21:30:00Z"),
      urgent: false,
    };
    renderPanel(
      [nextDayEarly, WITH_OFFERS, sameDayLater, WITHOUT_OFFERS],
      () => Promise.resolve(),
    );

    const days = [...queue().children];
    expect(days).toHaveLength(3);
    expect(days[0].contains(dayList("2026-08-17"))).toBe(true);
    expect(days[1].contains(dayList("2026-08-18"))).toBe(true);
    expect(days[2].contains(dayList("2026-08-25"))).toBe(true);

    // Within the day, the order handed over — soonest start first.
    expect(
      [...dayList("2026-08-17").children].map(
        (card) => card.querySelector("span.font-medium")?.textContent,
      ),
    ).toEqual(["Minecraft-klubi Espoo", "Roblox-klubben Solna"]);
  });

  it("draws a month heading only where the month changes", () => {
    const september: SubstitutionRequest = {
      ...WITHOUT_OFFERS,
      id: "request-september",
      sessionDay: "2026-09-01",
    };
    renderPanel([WITH_OFFERS, WITHOUT_OFFERS, september], () =>
      Promise.resolve(),
    );

    expect(screen.getAllByText("August 2026")).toHaveLength(1);
    expect(screen.getAllByText("September 2026")).toHaveLength(1);
  });

  /**
   * Approving seats a person on a session and opens a group's workspace — its
   * roster, its children — to them, so it asks first. The press must reach
   * nothing at all: a dialog the admin can still cancel is not a decision.
   */
  it("opens the dialog on the press and writes nothing", async () => {
    const approve = vi.fn(() => Promise.resolve());
    const { container } = renderPanel([WITH_OFFERS], approve);

    await act(async () => pressApprove(container, 0));

    expect(dialog(container)).not.toBeNull();
    expect(
      screen.getByText("admin.substitutions.approveConfirmTitle"),
    ).toBeTruthy();
    expect(approve).not.toHaveBeenCalled();
  });

  it("writes nothing when the dialog is cancelled", async () => {
    const approve = vi.fn(() => Promise.resolve());
    const { container } = renderPanel([WITH_OFFERS], approve);

    await act(async () => pressApprove(container, 0));
    await act(async () => dialogButton(container, "common.cancel").click());

    expect(dialog(container)).toBeNull();
    expect(approve).not.toHaveBeenCalled();
    expect(screen.getByText("Minecraft-klubi Espoo")).toBeTruthy();
  });

  it("writes once for the pressed offer, however fast the confirm is pressed twice", async () => {
    const approve = vi.fn(() => new Promise<void>(() => {}));
    const { container } = renderPanel([WITH_OFFERS], approve);

    // The second offer, so a handler taking the request or the gedu instead of
    // the offer would be caught — on screen the two are indistinguishable.
    await act(async () => pressApprove(container, 1));
    await act(async () => {
      const confirm = dialogButton(container, "admin.substitutions.approve");
      confirm.click();
      confirm.click();
    });

    expect(approve).toHaveBeenCalledTimes(1);
    expect(approve).toHaveBeenCalledWith("offer-b");
  });

  it("holds the dialog open with both buttons disabled while the write is in the air", async () => {
    const approve = vi.fn(() => new Promise<void>(() => {}));
    const { container } = renderPanel([WITH_OFFERS], approve);

    await act(async () => pressApprove(container, 0));
    await act(async () =>
      dialogButton(container, "admin.substitutions.approve").click(),
    );

    expect(dialog(container)).not.toBeNull();
    expect(
      dialogButton(container, "admin.substitutions.approve").disabled,
    ).toBe(true);
    expect(dialogButton(container, "common.cancel").disabled).toBe(true);
    // The row is untouched behind it — the dialog is modal, so there is nothing
    // for the card to disable and nothing on it that can change height.
    expect(screen.getByText("Minecraft-klubi Espoo")).toBeTruthy();
  });

  /**
   * The resolution is what closes the dialog, and the handler only resolves
   * once the queue has been read again — so by the time it closes, the list
   * behind it has already dropped the request. A deferred promise is the only
   * way to put those in that order here.
   */
  it("closes and drops the request once the write and the refetch have both landed", async () => {
    let land: () => void = () => {};
    const approve = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          land = resolve;
        }),
    );

    const { container, rerender } = renderPanel([WITH_OFFERS], approve);

    await act(async () => pressApprove(container, 0));
    await act(async () =>
      dialogButton(container, "admin.substitutions.approve").click(),
    );

    // The refetch lands first, as the shell's awaited invalidation arranges.
    rerender(
      <SubstitutionRequestsPanel
        requests={[]}
        now={NOW}
        onApproveOffer={approve}
        onSeatSubstitute={() => Promise.resolve()}
      />,
    );
    await act(async () => land());

    expect(dialog(container)).toBeNull();
    expect(screen.queryByText("Minecraft-klubi Espoo")).toBeNull();
    // The receipt survives the list emptying, which is why the panel rather
    // than the row holds it: it is recorded on the resolution, so it stands for
    // a fact that landed rather than for a press that was made.
    expect(screen.getByText("admin.substitutions.justNow")).toBeTruthy();
    expect(screen.getByText("admin.substitutions.allClear")).toBeTruthy();
  });

  /**
   * Every refusal the RPC raises, in the words an admin reads. They are told
   * apart because an admin can act on the difference — and anything unmatched
   * falls to the generic line rather than to the server's own English, which is
   * untranslated and names UUIDs.
   */
  it.each([
    [
      "the offer was taken back",
      { code: "P0002", message: "Substitution offer not found" },
      "admin.substitutions.approveFailedOfferGone",
    ],
    [
      "another admin settled it",
      {
        code: "23514",
        message: "this substitution request is already substituted",
      },
      "admin.substitutions.approveFailedAlreadySettled",
    ],
    [
      "the absent gedu lost the seat",
      {
        code: "23514",
        message: "gedu 1 no longer holds a seat on group 2 (2026-08-17)",
      },
      "admin.substitutions.approveFailedSeatGone",
    ],
    [
      "the volunteer went stale",
      {
        code: "23514",
        message: "gedu 3 can no longer substitute on group 2 on 2026-08-17",
      },
      "admin.substitutions.approveFailedIneligible",
    ],
    ["something nobody mapped", new Error("boom"), "admin.substitutions.failed"],
  ])(
    "keeps the dialog open and names the refusal when %s",
    async (_case, error, line) => {
      const approve = vi.fn(() => Promise.reject(error));
      const { container } = renderPanel([WITH_OFFERS], approve);

      await act(async () => pressApprove(container, 0));
      await act(async () =>
        dialogButton(container, "admin.substitutions.approve").click(),
      );

      expect(dialog(container)).not.toBeNull();
      expect(screen.getByText(line)).toBeTruthy();
      // The buttons come back, and the row behind is exactly as it was.
      expect(
        dialogButton(container, "admin.substitutions.approve").disabled,
      ).toBe(false);
      expect(screen.getByText("Minecraft-klubi Espoo")).toBeTruthy();
      expect(screen.queryByText("admin.substitutions.justNow")).toBeNull();
    },
  );
});

/** An approval handler for cases that never approve. */
function approveNothing(): Promise<void> {
  return Promise.resolve();
}

/** The nth card's "Seat someone else" — on the list, not in an overlay. */
function pressSeat(container: HTMLElement, index: number) {
  within(container)
    .getAllByRole<HTMLButtonElement>("button", {
      name: "admin.substitutions.seatSomeoneElse",
    })
    [index].click();
}

/** The picker's row for one candidate, by first name. */
function pickerRow(firstName: string): HTMLElement {
  return screen.getByRole("button", {
    name: (accessibleName) => accessibleName.includes(firstName),
  });
}

/** The queue: one item per day. */
function queue(): HTMLElement {
  return screen.getByRole("list", { name: "admin.substitutions.listLabel" });
}

/**
 * Every request card, across every day, in the order they render.
 *
 * Each day's list's direct children only: an offers list nests inside a
 * request card, so a role query over the whole subtree would count its items
 * as rows too.
 */
function requestCards(): HTMLElement[] {
  return [...queue().querySelectorAll(":scope > li > div > ul > li")].filter(
    (item): item is HTMLElement => item instanceof HTMLElement,
  );
}

/** The list of one day's requests, found by the label that names it. */
function dayList(date: string): HTMLElement {
  const label = `${formatDateOnly(date, "en", { weekday: "short" })} ${formatDayMonth(date, "en")}`;
  // Anchored at both ends of the date, so "8/1" cannot match "8/17".
  return screen.getByRole("list", {
    name: (name) => name.startsWith(label) && !/\d/.test(name.charAt(label.length)),
  });
}

/**
 * The nth Approve button **on the list**, which is what opens the question.
 *
 * Scoped to the harness's own container because the dialog it opens carries an
 * Approve of its own with the very same label — the confirm and the press that
 * summons it are deliberately the same word.
 */
function pressApprove(container: HTMLElement, index: number) {
  within(container)
    .getAllByRole<HTMLButtonElement>("button", {
      name: "admin.substitutions.approve",
    })
    [index].click();
}

/**
 * The open dialog, or `null`.
 *
 * It is a portal into `document.body` and carries no ARIA role of its own, so
 * it is found as the body child that is not the harness's container — which is
 * how the shared dialog's own suite scopes it too.
 */
function dialog(container: HTMLElement): HTMLElement | null {
  const root = [...document.body.children].find((el) => el !== container);
  return root instanceof HTMLElement ? root : null;
}

/** A button inside the open dialog. */
function dialogButton(container: HTMLElement, name: string): HTMLButtonElement {
  const root = dialog(container);
  if (root === null) throw new Error("the dialog is not open");
  return within(root).getByRole<HTMLButtonElement>("button", { name });
}
