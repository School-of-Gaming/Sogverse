import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { SessionStaffingEditor } from "@/components/admin/products/session-staffing-editor";
import {
  deriveSessionStaffing,
  type SubstitutionRequestInput,
  type StaffingAssignment,
} from "@/lib/session-staffing";
import type { UserListEntry } from "@/services/users";

/**
 * ============================================================================
 * The admin's staffing editor, on one session card
 * ============================================================================
 *
 * The editor is the one surface that seats a sub with no offer behind it, and
 * the three writes it makes are the whole of what an admin may do to a
 * session's staffing. What is worth holding still here is not the markup but
 * the **arguments**: a set-substitution that named the wrong seat, or a clear that
 * named the wrong request, is a write nothing downstream can tell from a
 * correct one.
 *
 * Two behaviours beyond the calls earn their own cases, because each is a rule
 * the plan settled rather than an implementation detail:
 *
 * - **The first step exists only where there is a question.** One expected gedu
 *   is not a choice, so the dialog goes straight to the picker.
 * - **The picker's refusals are the caller's**, and they are two: the gedu
 *   being substituted, and anybody else already due at that session. Seating one of
 *   the latter would collapse two seats onto one person.
 */

/** Real generated UUIDs — an id that reaches an identicon is never a stub. */
const SANNA = "4a84d001-b789-41f5-ace3-cfcffa139869";
const PETRA = "96e29545-ad63-4948-b783-14e91189ad75";
const JOONAS = "d2826073-1d3f-4023-b45e-f42fea4332ca";

const SESSION_DATE = "2026-03-16";

const NAMES: Record<string, string> = {
  [SANNA]: "Sanna",
  [PETRA]: "Petra",
  [JOONAS]: "Joonas",
};

function candidate(id: string): UserListEntry {
  return {
    id,
    created_at: "2024-01-01T00:00:00.000Z",
    updated_at: "2024-01-01T00:00:00.000Z",
    currency: null,
    email: `${NAMES[id].toLowerCase()}@example.com`,
    email_verified_at: null,
    first_name: NAMES[id],
    last_name: "Virtanen",
    home_location_id: null,
    locale: "fi",
    phone: null,
    role: "gedu",
    spoken_languages: ["fi"],
    utm_campaign: null,
    utm_medium: null,
    utm_source: null,
    certified: true,
    criminal_record_check_passed: true,
    linked_gamers: [],
  };
}

/** Every gedu the picker may offer, and all of them certified. */
const CANDIDATES = [candidate(SANNA), candidate(PETRA), candidate(JOONAS)];

// The picker reads one page of the shared people list, and certification is a
// column of it — so this one mock is the whole of what it asks for. Nothing left
// to page through, so no sentinel is mounted and jsdom needs no
// `IntersectionObserver`.
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

const copy = messages.admin.products.staffing;
const pickerCopy = messages.admin.products.geduPicker;

function staffingOf(
  gedus: readonly StaffingAssignment[],
  requests: readonly SubstitutionRequestInput[] = [],
) {
  return deriveSessionStaffing({ gedus, requests, sessionDate: SESSION_DATE });
}

const ONE_PRIMARY: readonly StaffingAssignment[] = [
  { id: SANNA, firstName: "Sanna", role: "primary" },
];
const TWO_SEATS: readonly StaffingAssignment[] = [
  { id: SANNA, firstName: "Sanna", role: "primary" },
  { id: PETRA, firstName: "Petra", role: "assistant" },
];

function renderEditor({
  gedus,
  requests = [],
  onSetSubstitution = vi.fn(() => Promise.resolve()),
  onClearSubstitution = vi.fn(() => Promise.resolve()),
  onWithdrawRequest = vi.fn(() => Promise.resolve()),
}: {
  gedus: readonly StaffingAssignment[];
  requests?: readonly SubstitutionRequestInput[];
  onSetSubstitution?: ReturnType<typeof vi.fn>;
  onClearSubstitution?: ReturnType<typeof vi.fn>;
  onWithdrawRequest?: ReturnType<typeof vi.fn>;
}) {
  const view = render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SessionStaffingEditor
        staffing={staffingOf(gedus, requests)}
        sessionDate={SESSION_DATE}
        onSetSubstitution={onSetSubstitution}
        onClearSubstitution={onClearSubstitution}
        onWithdrawRequest={onWithdrawRequest}
      />
    </NextIntlClientProvider>,
  );
  return { ...view, onSetSubstitution, onClearSubstitution, onWithdrawRequest };
}

function button(name: string | RegExp) {
  return screen.getByRole("button", { name });
}

/** Open the card's menu, which is where every admin action lives now. */
function openMenu() {
  fireEvent.click(screen.getByRole("button", { name: copy.menuLabel }));
}

/** The menu's rows, in the order an admin reads them. */
function menuItems(): (string | null)[] {
  return screen.getAllByRole("menuitem").map((item) => item.textContent);
}

/** Open the menu and choose one row by its label. */
function choose(name: string | RegExp) {
  openMenu();
  fireEvent.click(screen.getByRole("menuitem", { name }));
}

/**
 * Answer the confirm step's one required question.
 *
 * Nothing is selected when it opens — an admin seating a substitute states why,
 * exactly as a gedu filing an absence does, and a pre-selected "Sick" would
 * record health data about a contractor that nobody stated.
 */
function chooseReason() {
  fireEvent.click(screen.getByRole("radio", { name: copy.reasonSick }));
}

/** The picker's row for one candidate, badge text and all. */
function pickerRow(id: string): HTMLElement {
  return screen.getByRole("button", {
    name: (accessibleName) => accessibleName.includes(NAMES[id]),
  });
}

/** Whether a control is refusing presses, without narrowing the element. */
function isDisabled(element: HTMLElement): boolean {
  return element.hasAttribute("disabled");
}

describe("the admin session staffing editor", () => {
  it("goes straight to the picker when only one gedu is expected", async () => {
    const { onSetSubstitution } = renderEditor({ gedus: ONE_PRIMARY });

    choose(copy.setSubstitute);

    // No question to ask: with one seat, who is away is already known.
    expect(screen.queryByText(copy.absentStepTitle)).toBeNull();

    fireEvent.click(pickerRow(PETRA));
    chooseReason();
    await act(async () => {
      fireEvent.click(button(copy.confirmAction));
    });

    expect(onSetSubstitution).toHaveBeenCalledTimes(1);
    expect(onSetSubstitution).toHaveBeenCalledWith({
      absentGeduId: SANNA,
      subGeduId: PETRA,
      reason: "sick",
    });
  });

  it("asks which gedu is away when more than one is expected", async () => {
    const { onSetSubstitution } = renderEditor({ gedus: TWO_SEATS });

    choose(copy.setSubstitute);
    expect(screen.getByText(copy.absentStepTitle)).not.toBeNull();

    // The seats are offered with their roles, which is what tells two people on
    // one card apart.
    fireEvent.click(screen.getByRole("radio", { name: /Petra/ }));
    fireEvent.click(button(messages.common.continue));

    fireEvent.click(pickerRow(JOONAS));
    chooseReason();
    await act(async () => {
      fireEvent.click(button(copy.confirmAction));
    });

    expect(onSetSubstitution).toHaveBeenCalledWith({
      absentGeduId: PETRA,
      subGeduId: JOONAS,
      reason: "sick",
    });
  });

  it("refuses the absent gedu and everyone else expected, each with its reason", () => {
    renderEditor({ gedus: TWO_SEATS });

    choose(copy.setSubstitute);
    fireEvent.click(screen.getByRole("radio", { name: /Sanna/ }));
    fireEvent.click(button(messages.common.continue));

    const sanna = pickerRow(SANNA);
    const petra = pickerRow(PETRA);
    const joonas = pickerRow(JOONAS);

    expect(within(sanna).getByText(pickerCopy.absentGedu)).not.toBeNull();
    expect(within(petra).getByText(pickerCopy.alreadyExpected)).not.toBeNull();
    expect(isDisabled(sanna)).toBe(true);
    expect(isDisabled(petra)).toBe(true);
    // Everybody else is available: certification is the sheet's own refusal and
    // this caller adds none of its own.
    expect(isDisabled(joonas)).toBe(false);
  });

  it("badges the substitute being replaced as current, not as a clash", () => {
    // Joonas is on this session only because he is substituting Sanna, so the
    // derivation puts him among the expected and the refusal map refuses him
    // like anybody else already due. Read as "Already at this session" that is
    // a lie about the one person this flow is about, so the flow names him as
    // the current holder and the sheet's precedence does the rest
    // *(owner, 2026-09)*. He stays unpickable either way.
    renderEditor({
      gedus: TWO_SEATS,
      requests: [substitutedRequest(SANNA, "Sanna", JOONAS, "Joonas")],
    });

    // One absence on the card, so the row names it and the picker opens on
    // Sanna's seat with no question in between.
    choose(copy.changeSubstitute);

    const joonas = pickerRow(JOONAS);
    expect(within(joonas).getByText(pickerCopy.current)).not.toBeNull();
    expect(
      within(joonas).queryByText(pickerCopy.alreadyExpected),
    ).toBeNull();
    expect(isDisabled(joonas)).toBe(true);
    // And the seat being answered keeps its own reason, which is the pair the
    // map only ever holds.
    expect(within(pickerRow(SANNA)).getByText(pickerCopy.absentGedu)).not.toBeNull();
  });

  it("badges nobody as current where the request is still open", () => {
    // Nothing is being replaced on an open request, so the flow names no
    // current holder and every refusal reads as itself.
    renderEditor({
      gedus: TWO_SEATS,
      requests: [openRequest(SANNA, "Sanna")],
    });

    choose(copy.setSubstitute);
    fireEvent.click(screen.getByRole("radio", { name: /Sanna/ }));
    fireEvent.click(button(messages.common.continue));

    expect(screen.queryByText(pickerCopy.current)).toBeNull();
    expect(
      within(pickerRow(PETRA)).getByText(pickerCopy.alreadyExpected),
    ).not.toBeNull();
  });

  it("carries an optional reason and note into the write", async () => {
    const { onSetSubstitution } = renderEditor({ gedus: ONE_PRIMARY });

    choose(copy.setSubstitute);
    fireEvent.click(pickerRow(PETRA));

    fireEvent.click(screen.getByRole("radio", { name: copy.reasonSick }));
    // By name: the picker's own search box stays mounted behind the dialog, so
    // "the textbox" is two of them.
    fireEvent.change(screen.getByRole("textbox", { name: /Note for the office/ }), {
      target: { value: "  Called in at 8am  " },
    });
    chooseReason();
    await act(async () => {
      fireEvent.click(button(copy.confirmAction));
    });

    expect(onSetSubstitution).toHaveBeenCalledWith({
      absentGeduId: SANNA,
      subGeduId: PETRA,
      reason: "sick",
      reasonNote: "Called in at 8am",
    });
  });

  it("offers a seat that has already filed, and says the set approves its request", async () => {
    // Sanna has filed, so the derivation no longer expects her — and her seat
    // is still the one an admin answers. The database agrees: it demands the
    // absent gedu be expected only where there is no substitution request in
    // place. Nothing has been seated yet, so the row still offers to set one.
    const { onSetSubstitution } = renderEditor({
      gedus: ONE_PRIMARY,
      requests: [openRequest(SANNA, "Sanna")],
    });

    choose(copy.setSubstitute);
    fireEvent.click(pickerRow(PETRA));

    expect(screen.getByText(copy.approvesOpenRequest)).not.toBeNull();
    chooseReason();
    await act(async () => {
      fireEvent.click(button(copy.confirmAction));
    });
    expect(onSetSubstitution).toHaveBeenCalledWith({
      absentGeduId: SANNA,
      subGeduId: PETRA,
      reason: "sick",
    });
  });

  it("says a change on a substituted seat replaces the substitute filling it", () => {
    renderEditor({
      gedus: ONE_PRIMARY,
      requests: [substitutedRequest(SANNA, "Sanna", PETRA, "Petra")],
    });

    // One absence, so the row names what it will do and goes straight to the
    // picker: asking which seat would be asking a question already answered.
    choose(copy.changeSubstitute);
    fireEvent.click(pickerRow(JOONAS));

    expect(
      screen.getByText(
        copy.replacesCurrentSub.replace("{name}", "Petra"),
      ),
    ).not.toBeNull();
  });

  it("clears one request's sub through the hook, by request id", async () => {
    const request = substitutedRequest(SANNA, "Sanna", JOONAS, "Joonas");
    const { onClearSubstitution } = renderEditor({
      gedus: TWO_SEATS,
      requests: [request],
    });

    choose(copy.clearSubstitute);
    await act(async () => {
      fireEvent.click(button(copy.clearConfirm));
    });

    expect(onClearSubstitution).toHaveBeenCalledWith(request.id);
  });

  it("withdraws one request through the hook, by request id", async () => {
    const request = openRequest(SANNA, "Sanna");
    const { onWithdrawRequest } = renderEditor({
      gedus: TWO_SEATS,
      requests: [request],
    });

    choose(copy.withdrawRequest);
    await act(async () => {
      fireEvent.click(button(copy.withdrawConfirm));
    });

    expect(onWithdrawRequest).toHaveBeenCalledWith(request.id);
  });

  it("offers no clear on an open request — there is no substitute to unseat", () => {
    renderEditor({ gedus: TWO_SEATS, requests: [openRequest(SANNA, "Sanna")] });

    openMenu();
    expect(menuItems()).toEqual([copy.setSubstitute, copy.withdrawRequest]);
  });

  it("renders nothing at all when nobody is due and nobody has filed", () => {
    // No action to put in a menu, so no menu — and nothing else either. The
    // editor draws into the card's header cluster now, so anything it left
    // behind would be a mark on an admin's card that a gedu's does not carry.
    const { container } = renderEditor({ gedus: [] });

    expect(
      screen.queryByRole("button", { name: copy.menuLabel }),
    ).toBeNull();
    expect(container.innerHTML).toBe("");
  });

  it("names every seat's own row where two gedus are away", () => {
    renderEditor({
      gedus: TWO_SEATS,
      requests: [
        substitutedRequest(SANNA, "Sanna", JOONAS, "Joonas"),
        openRequest(PETRA, "Petra"),
      ],
    });

    openMenu();
    // One way in to the flow that asks which seat, then each seat's own
    // actions — named, because a bare "Clear substitute" could not say whose.
    // The seats are in the order the staffing note prints them, so the rows
    // follow the names a reader has just read rather than a second order.
    expect(menuItems()).toEqual([
      copy.setSubstitute,
      "Withdraw request for Petra",
      "Change substitute for Sanna",
      "Clear substitute for Sanna",
    ]);
  });

  it("says change rather than set where the one seat already has a substitute", () => {
    renderEditor({
      gedus: ONE_PRIMARY,
      requests: [substitutedRequest(SANNA, "Sanna", JOONAS, "Joonas")],
    });

    openMenu();
    expect(menuItems()).toEqual([
      copy.changeSubstitute,
      copy.clearSubstitute,
    ]);
  });

  it("offers set and withdraw on a single seat's open request", () => {
    renderEditor({ gedus: ONE_PRIMARY, requests: [openRequest(SANNA, "Sanna")] });

    openMenu();
    expect(menuItems()).toEqual([copy.setSubstitute, copy.withdrawRequest]);
  });

  it("waits for a reason before the confirm will commit", () => {
    renderEditor({ gedus: ONE_PRIMARY });

    choose(copy.setSubstitute);
    fireEvent.click(pickerRow(PETRA));

    // Nothing is chosen, so the press is refused — an admin seating a
    // substitute states why, and a pre-selected "Sick" would invent it.
    expect(isDisabled(button(copy.confirmAction))).toBe(true);
    chooseReason();
    expect(isDisabled(button(copy.confirmAction))).toBe(false);
  });

  it("offers no reason anybody has to read as unstated", () => {
    renderEditor({ gedus: ONE_PRIMARY });

    choose(copy.setSubstitute);
    fireEvent.click(pickerRow(PETRA));

    // The two the gedu's own dialog offers, in the same words and no third.
    expect(
      screen.getAllByRole("radio").map((radio) => radio.getAttribute("value")),
    ).toEqual(["sick", "other"]);
    expect(screen.queryByText("Not stated")).toBeNull();
  });

  it("keeps the confirm button disabled while the write is in the air", async () => {
    let settle: () => void = () => {};
    const onSetSubstitution = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          settle = resolve;
        }),
    );
    renderEditor({ gedus: ONE_PRIMARY, onSetSubstitution });

    choose(copy.setSubstitute);
    fireEvent.click(pickerRow(PETRA));
    fireEvent.click(button(copy.confirmAction));

    expect(isDisabled(button(copy.confirmAction))).toBe(true);
    await act(async () => {
      settle();
    });
  });

  it("hands the control back and names the failure when the write is refused", async () => {
    const onSetSubstitution = vi.fn(() => Promise.reject(new Error("nope")));
    renderEditor({ gedus: ONE_PRIMARY, onSetSubstitution });

    choose(copy.setSubstitute);
    fireEvent.click(pickerRow(PETRA));
    chooseReason();
    await act(async () => {
      fireEvent.click(button(copy.confirmAction));
    });

    expect(screen.getByText(copy.setFailed)).not.toBeNull();
    expect(isDisabled(button(copy.confirmAction))).toBe(false);
  });

  it("keeps the clear confirm disabled while that write is in the air", async () => {
    let settle: () => void = () => {};
    const onClearSubstitution = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          settle = resolve;
        }),
    );
    renderEditor({
      gedus: TWO_SEATS,
      requests: [substitutedRequest(SANNA, "Sanna", JOONAS, "Joonas")],
      onClearSubstitution,
    });

    choose(copy.clearSubstitute);
    fireEvent.click(button(copy.clearConfirm));

    expect(isDisabled(button(copy.clearConfirm))).toBe(true);
    expect(isDisabled(button(messages.common.cancel))).toBe(true);
    await act(async () => {
      settle();
    });
  });

  it("names a refused withdraw in front of the button that caused it", async () => {
    const onWithdrawRequest = vi.fn(() => Promise.reject(new Error("nope")));
    const { container } = renderEditor({
      gedus: TWO_SEATS,
      requests: [openRequest(SANNA, "Sanna")],
      onWithdrawRequest,
    });

    choose(copy.withdrawRequest);
    await act(async () => {
      fireEvent.click(button(copy.withdrawConfirm));
    });

    expect(screen.getByText(copy.withdrawFailed)).not.toBeNull();
    // The editor rides a card; the dialog is a portal out of it, and the
    // refusal has to be in the dialog rather than under its overlay.
    expect(container.textContent).not.toContain(copy.withdrawFailed);
    expect(isDisabled(button(copy.withdrawConfirm))).toBe(false);
  });
});

/** An open request somebody filed on this session. */
function openRequest(id: string, firstName: string): SubstitutionRequestInput {
  return {
    id: `request-${id}`,
    sessionDate: SESSION_DATE,
    requestedBy: { id, firstName },
    role: "primary",
    status: "open",
    substituteId: null,
    offerCount: null,
  };
}

/** The same request, answered. */
function substitutedRequest(
  id: string,
  firstName: string,
  subId: string,
  subName: string,
): SubstitutionRequestInput {
  return {
    ...openRequest(id, firstName),
    status: "substituted",
    substituteId: { id: subId, firstName: subName },
  };
}
