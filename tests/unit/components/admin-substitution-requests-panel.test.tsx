import { describe, it, expect, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import { SubstitutionRequestsPanel } from "@/components/admin/substitutions/substitution-requests-panel";
import type {
  SubstitutionOffer,
  SubstitutionRequest,
} from "@/components/admin/substitutions/admin-substitutions-data";
import { ROUTES } from "@/lib/constants";

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
}));

// Real UUIDs, hardcoded: every chip draws an identicon out of the id's hex
// bytes, and a readable stand-in renders a degenerate one rather than a
// different one. Never generated at test time.
const IDS = {
  requester: "3f8682f8-1994-4e4b-b849-73c4066efac4",
  offererA: "52cae3c1-b538-4513-9036-d22863bb8766",
  offererB: "ea0111ac-09ed-438c-85ef-f9f138b00209",
} as const;

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
) {
  return render(
    <SubstitutionRequestsPanel
      requests={requests}
      now={NOW}
      onApproveOffer={onApproveOffer}
    />,
  );
}

describe("the admin Substitutions page's queue panel", () => {
  it("renders one row per request, with the session, the absent gedu and every offer", () => {
    renderPanel([WITH_OFFERS, WITHOUT_OFFERS], () => Promise.resolve());

    // Direct children only: an offers list nests inside a request card, so a
    // role query over the whole subtree would count its items as rows too.
    const rows = [
      ...screen.getByRole("list", {
        name: "admin.substitutions.listLabel",
      }).children,
    ].filter((child): child is HTMLElement => child instanceof HTMLElement);
    expect(rows).toHaveLength(2);

    const staffed = within(rows[0]);
    expect(staffed.getByText("Minecraft-klubi Espoo")).toBeTruthy();
    expect(staffed.getByText("Ryhmä A")).toBeTruthy();
    expect(staffed.getByText("Mon 17 Aug")).toBeTruthy();
    // The clock face sits beside the date, so an admin staffing a group that
    // meets twice on one day knows which of the two is short-staffed.
    expect(staffed.getByText("17:00–18:30")).toBeTruthy();
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
  it("says how long until the session starts, and marks the urgent row", () => {
    renderPanel([WITH_OFFERS, WITHOUT_OFFERS], () => Promise.resolve());

    const rows = [
      ...screen.getByRole("list", {
        name: "admin.substitutions.listLabel",
      }).children,
    ].filter((child): child is HTMLElement => child instanceof HTMLElement);

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
    // Nothing to approve, so nothing is pressable on this row.
    expect(screen.queryByRole("button")).toBeNull();
  });

  /**
   * An orphaned request — the schedule's weekday moved after it was filed —
   * still has a date and no longer has an occurrence. It stays in the queue,
   * which is the whole reason the read orders by date rather than by a derived
   * instant, and it states the date alone rather than a time nothing projects.
   */
  it("renders a request the schedule no longer projects with its date and no time", () => {
    renderPanel([WITHOUT_OFFERS], () => Promise.resolve());

    expect(screen.getByText("Tue 25 Aug")).toBeTruthy();
    expect(screen.queryByText(/\d\d:\d\d/)).toBeNull();
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
