import { describe, it, expect, vi } from "vitest";
import { act, render, screen, within } from "@testing-library/react";
import { CoverRequestsPanel } from "@/components/admin/dashboard/cover-requests-panel";
import type {
  CoverOffer,
  CoverRequest,
} from "@/components/admin/dashboard/admin-dashboard-data";
import { ROUTES } from "@/lib/constants";

/**
 * The admin dashboard's cover queue, and the three claims that are only true
 * of the rendered panel.
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
 *
 * Translations echo their keys, so nothing here depends on English wording.
 */
vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => {
    const t = (key: string) => (namespace ? `${namespace}.${key}` : key);
    t.rich = (key: string) => key;
    return t;
  },
}));

// Real UUIDs, hardcoded: every chip draws an identicon out of the id's hex
// bytes, and a readable stand-in renders a degenerate one rather than a
// different one. Never generated at test time.
const IDS = {
  requester: "3f8682f8-1994-4e4b-b849-73c4066efac4",
  offererA: "52cae3c1-b538-4513-9036-d22863bb8766",
  offererB: "ea0111ac-09ed-438c-85ef-f9f138b00209",
} as const;

function offer(id: string, geduId: string, name: string): CoverOffer {
  return {
    id,
    geduId,
    name,
    certified: true,
    criminalRecordCheckOn: "4 May 2026",
  };
}

const WITH_OFFERS: CoverRequest = {
  id: "request-with-offers",
  groupId: "group-a",
  groupName: "Ryhmä A",
  productName: "Minecraft-klubi Espoo",
  productType: "consumer_club",
  sessionDate: "Tue 18 Aug",
  sessionTime: "17:00–18:30",
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

const WITHOUT_OFFERS: CoverRequest = {
  ...WITH_OFFERS,
  id: "request-without-offers",
  groupId: "group-b",
  groupName: "Ryhmä B",
  productName: "Roblox Studio -leiri Espoo",
  productType: "camp",
  sessionDate: "Tue 25 Aug",
  // The orphan: an admin moved the schedule's weekday after this request was
  // filed, so no slot names its date and the row has no time to state.
  sessionTime: null,
  reasonNote: null,
  groupHref: ROUTES.admin.productGroup("camp", "camp-2", "group-b"),
  offers: [],
};

describe("the admin dashboard's cover requests panel", () => {
  it("renders one row per request, with the session, the absent gedu and every offer", () => {
    render(
      <CoverRequestsPanel
        requests={[WITH_OFFERS, WITHOUT_OFFERS]}
        onApproveOffer={() => Promise.resolve()}
      />,
    );

    // Direct children only: an offers list nests inside a row, so a role query
    // over the whole subtree would count its items as rows too.
    const rows = [
      ...screen.getByRole("list", {
        name: "admin.dashboard.cover.listLabel",
      }).children,
    ].filter((child): child is HTMLElement => child instanceof HTMLElement);
    expect(rows).toHaveLength(2);

    const staffed = within(rows[0]);
    expect(staffed.getByText("Minecraft-klubi Espoo")).toBeTruthy();
    expect(staffed.getByText("Ryhmä A")).toBeTruthy();
    expect(staffed.getByText("Tue 18 Aug")).toBeTruthy();
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

  it("says nobody has offered and points at the group page", () => {
    render(
      <CoverRequestsPanel
        requests={[WITHOUT_OFFERS]}
        onApproveOffer={() => Promise.resolve()}
      />,
    );

    expect(
      screen.getByText("admin.dashboard.cover.noOffers"),
    ).toBeTruthy();
    expect(
      screen
        .getByRole("link", { name: /admin.dashboard.cover.openGroup/ })
        .getAttribute("href"),
    ).toBe("/admin/camps/camp-2/groups/group-b");
    // Nothing to approve, so nothing is pressable on this row.
    expect(screen.queryByRole("button")).toBeNull();
  });

  /**
   * An orphaned request — the schedule's weekday moved after it was filed —
   * still has a date and no longer has an occurrence. It stays in the queue,
   * which is the whole reason the queue orders by date rather than by a derived
   * instant, and it states the date alone rather than a time nothing projects.
   */
  it("renders a request the schedule no longer projects with its date and no time", () => {
    render(
      <CoverRequestsPanel
        requests={[WITHOUT_OFFERS]}
        onApproveOffer={() => Promise.resolve()}
      />,
    );

    expect(screen.getByText("Tue 25 Aug")).toBeTruthy();
    expect(screen.queryByText(/\d\d:\d\d/)).toBeNull();
  });

  it("approves the offer that was pressed, by the offer's own id", async () => {
    const approve = vi.fn(() => Promise.resolve());
    render(
      <CoverRequestsPanel requests={[WITH_OFFERS]} onApproveOffer={approve} />,
    );

    const second = screen
      .getAllByRole("button", { name: "admin.dashboard.cover.approve" })
      .at(1);
    await act(async () => second?.click());

    expect(approve).toHaveBeenCalledTimes(1);
    expect(approve).toHaveBeenCalledWith("offer-b");
  });

  it("keeps the row, and gives up the receipt, while the list is still offering the request", async () => {
    render(
      <CoverRequestsPanel
        requests={[WITH_OFFERS]}
        onApproveOffer={() => Promise.resolve()}
      />,
    );

    await act(async () =>
      screen
        .getAllByRole("button", { name: "admin.dashboard.cover.approve" })[0]
        .click(),
    );

    // The write landed, but this snapshot still carries the request — a second
    // admin clearing the sub looks exactly like this. The source wins: the row
    // stays and the receipt is surrendered rather than standing for a fact that
    // is no longer true.
    expect(screen.getByText("Minecraft-klubi Espoo")).toBeTruthy();
    expect(screen.queryByText("admin.dashboard.cover.justNow")).toBeNull();
  });

  it("hands every offer back on a row that survived its own approval", async () => {
    render(
      <CoverRequestsPanel
        requests={[WITH_OFFERS]}
        onApproveOffer={() => Promise.resolve()}
      />,
    );

    const pressed = screen.getAllByRole("button", {
      name: "admin.dashboard.cover.approve",
    })[0];
    await act(async () => pressed.click());

    // The row is the one the case above describes: approved, and offered again
    // by the source. It is the *same* component instance — the panel keys the
    // list item by the request id — so the committing flag it set on the click
    // is still the one deciding whether anything here may be pressed. Left set,
    // every offer on a live request would be unpressable for the rest of the
    // sitting, with no second admin around to undo it.
    const buttons = screen.getAllByRole<HTMLButtonElement>("button", {
      name: "admin.dashboard.cover.approve",
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

    const { rerender } = render(
      <CoverRequestsPanel requests={[WITH_OFFERS]} onApproveOffer={approve} />,
    );

    act(() =>
      screen
        .getAllByRole("button", { name: "admin.dashboard.cover.approve" })[0]
        .click(),
    );

    rerender(<CoverRequestsPanel requests={[]} onApproveOffer={approve} />);
    await act(async () => land());

    expect(screen.queryByText("Minecraft-klubi Espoo")).toBeNull();
    // The receipt survives the collapse, which is why the panel rather than the
    // list holds it: a list rendered only while it has rows would have taken the
    // confirmation away at the moment there was most to confirm.
    expect(screen.getByText("admin.dashboard.cover.justNow")).toBeTruthy();
    expect(screen.getByText("admin.dashboard.cover.allClear")).toBeTruthy();
  });

  it("collapses to an all-clear row when nothing needs a sub", () => {
    render(
      <CoverRequestsPanel requests={[]} onApproveOffer={() => Promise.resolve()} />,
    );

    expect(
      screen.getByText("admin.dashboard.cover.allClear"),
    ).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
  });

  it("shows a failure on the row that failed and leaves it pressable", async () => {
    render(
      <CoverRequestsPanel
        requests={[WITH_OFFERS]}
        onApproveOffer={() => Promise.reject(new Error("nope"))}
      />,
    );

    const approve = screen.getAllByRole("button", {
      name: "admin.dashboard.cover.approve",
    })[0];
    await act(async () => approve.click());

    expect(screen.getByText("admin.dashboard.cover.failed")).toBeTruthy();
    expect(screen.getByText("Minecraft-klubi Espoo")).toBeTruthy();
    expect(
      screen.getAllByRole<HTMLButtonElement>("button", {
        name: "admin.dashboard.cover.approve",
      })[0].disabled,
    ).toBe(false);
  });
});
