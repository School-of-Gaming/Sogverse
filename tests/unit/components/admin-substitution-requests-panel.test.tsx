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
 * 1. **Approve posts the OFFER's id.** The row names a session and a person,
 *    and the id that has to reach the RPC is neither of those — it is the offer
 *    joining them. Handing over the request or the gedu would look identical on
 *    screen and approve nothing.
 * 2. **A row leaves only when both halves agree**: the write resolved *and* the
 *    list it was given stopped offering that request. The second half is what
 *    protects the panel from a receipt that outlives its own fact — a second
 *    admin clearing the sub puts the request back, and the row has to come with
 *    it. A panel that dropped the row on the resolution alone would filter it
 *    out of a list that is still offering it, with nothing left to act on.
 * 3. **Empty collapses to one row.** The all-clear is not an empty card with a
 *    sentence in it; it is the panel giving its space back.
 * 4. **Urgency is a tint, not a re-ordering**, and it is carried by the row it
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
    certified: true,
    criminalRecordCheckOn: "4 May 2026",
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

    // Direct children only: an offers list nests inside a row, so a role query
    // over the whole subtree would count its items as rows too.
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
    // Both standings ship on every offer, as they do on a certification row.
    expect(
      staffed.getAllByText("admin.users.certification.certified"),
    ).toHaveLength(2);
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
    // The urgency treatment is the row's own edge and nothing else — one token,
    // no badge, no second colour.
    expect(rows[0].querySelector(".border-l-warning")).toBeTruthy();

    // The orphan has no start, so it makes no claim about how soon it is and
    // cannot be urgent.
    expect(within(rows[1]).queryByText("in 3 hours")).toBeNull();
    expect(rows[1].querySelector(".border-l-warning")).toBeNull();
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

  it("approves the offer that was pressed, by the offer's own id", async () => {
    const approve = vi.fn(() => Promise.resolve());
    renderPanel([WITH_OFFERS], approve);

    const second = screen
      .getAllByRole("button", { name: "admin.substitutions.approve" })
      .at(1);
    await act(async () => second?.click());

    expect(approve).toHaveBeenCalledTimes(1);
    expect(approve).toHaveBeenCalledWith("offer-b");
  });

  it("keeps the row, and gives up the receipt, while the list is still offering the request", async () => {
    renderPanel([WITH_OFFERS], () => Promise.resolve());

    await act(async () =>
      screen
        .getAllByRole("button", { name: "admin.substitutions.approve" })[0]
        .click(),
    );

    // The write landed, but this document still carries the request — a second
    // admin clearing the sub looks exactly like this. The source wins: the row
    // stays and the receipt is surrendered rather than standing for a fact that
    // is no longer true.
    expect(screen.getByText("Minecraft-klubi Espoo")).toBeTruthy();
    expect(screen.queryByText("admin.substitutions.justNow")).toBeNull();
  });

  it("hands every offer back on a row that survived its own approval", async () => {
    renderPanel([WITH_OFFERS], () => Promise.resolve());

    const pressed = screen.getAllByRole("button", {
      name: "admin.substitutions.approve",
    })[0];
    await act(async () => pressed.click());

    // The row is the one the case above describes: approved, and offered again
    // by the source. It is the *same* component instance — the panel keys the
    // list item by the request id — so the committing flag it set on the click
    // is still the one deciding whether anything here may be pressed. Left set,
    // every offer on a live request would be unpressable for the rest of the
    // sitting, with no second admin around to undo it.
    const buttons = screen.getAllByRole<HTMLButtonElement>("button", {
      name: "admin.substitutions.approve",
    });
    expect(buttons).toHaveLength(2);
    for (const button of buttons) expect(button.disabled).toBe(false);
  });

  it("keeps the receipt on screen after the last request collapses the panel", async () => {
    // The live ordering, reproduced: the refetch behind the write lands first —
    // which is what the shell's awaited invalidation buys — and the promise
    // settles after it. A deferred promise is the only way to put the two in
    // that order here.
    let land: () => void = () => {};
    const approve = () =>
      new Promise<void>((resolve) => {
        land = resolve;
      });

    const { rerender } = renderPanel([WITH_OFFERS], approve);

    act(() =>
      screen
        .getAllByRole("button", { name: "admin.substitutions.approve" })[0]
        .click(),
    );

    rerender(
      <SubstitutionRequestsPanel
        requests={[]}
        now={NOW}
        onApproveOffer={approve}
      />,
    );
    await act(async () => land());

    expect(screen.queryByText("Minecraft-klubi Espoo")).toBeNull();
    // The receipt survives the collapse, which is why the panel rather than the
    // list holds it: a list rendered only while it has rows would have taken the
    // confirmation away at the moment there was most to confirm.
    expect(screen.getByText("admin.substitutions.justNow")).toBeTruthy();
    expect(screen.getByText("admin.substitutions.allClear")).toBeTruthy();
  });

  it("collapses to an all-clear row when nothing needs a sub", () => {
    renderPanel([], () => Promise.resolve());

    expect(screen.getByText("admin.substitutions.allClear")).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("shows a failure on the row that failed and leaves it pressable", async () => {
    renderPanel([WITH_OFFERS], () => Promise.reject(new Error("nope")));

    const approve = screen.getAllByRole("button", {
      name: "admin.substitutions.approve",
    })[0];
    await act(async () => approve.click());

    expect(screen.getByText("admin.substitutions.failed")).toBeTruthy();
    expect(screen.getByText("Minecraft-klubi Espoo")).toBeTruthy();
    expect(
      screen.getAllByRole<HTMLButtonElement>("button", {
        name: "admin.substitutions.approve",
      })[0].disabled,
    ).toBe(false);
  });
});
