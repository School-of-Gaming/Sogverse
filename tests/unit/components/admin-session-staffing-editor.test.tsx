import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { SessionStaffingEditor } from "@/components/admin/products/session-staffing-editor";
import {
  deriveSessionStaffing,
  type CoverRequestInput,
  type StaffingAssignment,
} from "@/lib/session-staffing";
import type { Profile } from "@/types";

/**
 * ============================================================================
 * The admin's staffing editor, on one session card
 * ============================================================================
 *
 * The editor is the one surface that seats a sub with no offer behind it, and
 * the three writes it makes are the whole of what an admin may do to a
 * session's staffing. What is worth holding still here is not the markup but
 * the **arguments**: a set-cover that named the wrong seat, or a clear that
 * named the wrong request, is a write nothing downstream can tell from a
 * correct one.
 *
 * Two behaviours beyond the calls earn their own cases, because each is a rule
 * the plan settled rather than an implementation detail:
 *
 * - **The first step exists only where there is a question.** One expected gedu
 *   is not a choice, so the dialog goes straight to the picker.
 * - **The picker's refusals are the caller's**, and they are two: the gedu
 *   being covered, and anybody else already due at that session. Seating one of
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

function profile(id: string): Profile {
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
  };
}

/** Every gedu the picker may offer, and all of them certified. */
const CANDIDATES = [profile(SANNA), profile(PETRA), profile(JOONAS)];

vi.mock("@/services/users", () => ({
  useUsersByRole: () => ({ data: CANDIDATES }),
}));

vi.mock("@/services/gedu", () => ({
  useGeduCertificationMap: () => ({
    map: new Map(
      CANDIDATES.map((candidate) => [
        candidate.id,
        { user_id: candidate.id, certified: true },
      ]),
    ),
    isError: false,
    isPending: false,
  }),
}));

const copy = messages.admin.products.staffing;
const pickerCopy = messages.admin.products.geduPicker;

function staffingOf(
  gedus: readonly StaffingAssignment[],
  requests: readonly CoverRequestInput[] = [],
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
  onSetCover = vi.fn(() => Promise.resolve()),
  onClearCover = vi.fn(() => Promise.resolve()),
  onWithdrawRequest = vi.fn(() => Promise.resolve()),
}: {
  gedus: readonly StaffingAssignment[];
  requests?: readonly CoverRequestInput[];
  onSetCover?: ReturnType<typeof vi.fn>;
  onClearCover?: ReturnType<typeof vi.fn>;
  onWithdrawRequest?: ReturnType<typeof vi.fn>;
}) {
  render(
    <NextIntlClientProvider locale="en" messages={messages}>
      <SessionStaffingEditor
        staffing={staffingOf(gedus, requests)}
        sessionDate={SESSION_DATE}
        onSetCover={onSetCover}
        onClearCover={onClearCover}
        onWithdrawRequest={onWithdrawRequest}
      />
    </NextIntlClientProvider>,
  );
  return { onSetCover, onClearCover, onWithdrawRequest };
}

function button(name: string | RegExp) {
  return screen.getByRole("button", { name });
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
    const { onSetCover } = renderEditor({ gedus: ONE_PRIMARY });

    fireEvent.click(button(copy.setSub));

    // No question to ask: with one seat, who is away is already known.
    expect(screen.queryByText(copy.absentStepTitle)).toBeNull();

    fireEvent.click(pickerRow(PETRA));
    await act(async () => {
      fireEvent.click(button(copy.confirmAction));
    });

    expect(onSetCover).toHaveBeenCalledTimes(1);
    expect(onSetCover).toHaveBeenCalledWith({
      absentGeduId: SANNA,
      subGeduId: PETRA,
    });
  });

  it("asks which gedu is away when more than one is expected", async () => {
    const { onSetCover } = renderEditor({ gedus: TWO_SEATS });

    fireEvent.click(button(copy.setSub));
    expect(screen.getByText(copy.absentStepTitle)).not.toBeNull();

    // The seats are offered with their roles, which is what tells two people on
    // one card apart.
    fireEvent.click(screen.getByRole("radio", { name: /Petra/ }));
    fireEvent.click(button(messages.common.continue));

    fireEvent.click(pickerRow(JOONAS));
    await act(async () => {
      fireEvent.click(button(copy.confirmAction));
    });

    expect(onSetCover).toHaveBeenCalledWith({
      absentGeduId: PETRA,
      subGeduId: JOONAS,
    });
  });

  it("refuses the absent gedu and everyone else expected, each with its reason", () => {
    renderEditor({ gedus: TWO_SEATS });

    fireEvent.click(button(copy.setSub));
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

  it("refuses the sub already filling a covered request, as one more expected gedu", () => {
    // Petra is nobody’s assignment here — she is on this session only because
    // she is covering Sanna — and the picker still has to refuse her: seating
    // her as somebody else’s sub would collapse two seats onto one person.
    // Nothing in the picker’s caller says so specially, and nothing needs to:
    // the derivation puts a covered request’s sub into `expected`, which is the
    // set the refusal is built from. This case is what keeps that true.
    renderEditor({
      gedus: TWO_SEATS,
      requests: [coveredRequest(SANNA, "Sanna", JOONAS, "Joonas")],
    });

    fireEvent.click(button(copy.setSub));
    fireEvent.click(screen.getByRole("radio", { name: /Sanna/ }));
    fireEvent.click(button(messages.common.continue));

    const joonas = pickerRow(JOONAS);
    expect(within(joonas).getByText(pickerCopy.alreadyExpected)).not.toBeNull();
    expect(isDisabled(joonas)).toBe(true);
    // And the seat being answered is refused for the other reason, which is the
    // pair the map only ever holds.
    expect(within(pickerRow(SANNA)).getByText(pickerCopy.absentGedu)).not.toBeNull();
  });

  it("carries an optional reason and note into the write", async () => {
    const { onSetCover } = renderEditor({ gedus: ONE_PRIMARY });

    fireEvent.click(button(copy.setSub));
    fireEvent.click(pickerRow(PETRA));

    fireEvent.click(screen.getByRole("radio", { name: copy.reasonSick }));
    // By name: the picker's own search box stays mounted behind the dialog, so
    // "the textbox" is two of them.
    fireEvent.change(screen.getByRole("textbox", { name: /Note for the office/ }), {
      target: { value: "  Called in at 8am  " },
    });
    await act(async () => {
      fireEvent.click(button(copy.confirmAction));
    });

    expect(onSetCover).toHaveBeenCalledWith({
      absentGeduId: SANNA,
      subGeduId: PETRA,
      reason: "sick",
      reasonNote: "Called in at 8am",
    });
  });

  it("offers a seat that has already filed, and says the set approves its request", async () => {
    // Sanna has filed, so the derivation no longer expects her — and her seat
    // is still the one an admin answers. The database agrees: it demands the
    // absent gedu be expected only where there is no request to cover in place.
    const { onSetCover } = renderEditor({
      gedus: ONE_PRIMARY,
      requests: [openRequest(SANNA, "Sanna")],
    });

    fireEvent.click(button(copy.setSub));
    fireEvent.click(pickerRow(PETRA));

    expect(screen.getByText(copy.approvesOpenRequest)).not.toBeNull();
    await act(async () => {
      fireEvent.click(button(copy.confirmAction));
    });
    expect(onSetCover).toHaveBeenCalledWith({
      absentGeduId: SANNA,
      subGeduId: PETRA,
    });
  });

  it("says a set on a covered seat replaces the sub filling it", () => {
    renderEditor({
      gedus: ONE_PRIMARY,
      requests: [coveredRequest(SANNA, "Sanna", PETRA, "Petra")],
    });

    // Two seats: Sanna's, which is covered, and Petra's, who now holds it — so
    // the walk starts at the question.
    fireEvent.click(button(copy.setSub));
    fireEvent.click(screen.getByRole("radio", { name: /Sanna/ }));
    fireEvent.click(button(messages.common.continue));
    fireEvent.click(pickerRow(JOONAS));

    expect(
      screen.getByText(
        copy.replacesCurrentSub.replace("{name}", "Petra"),
      ),
    ).not.toBeNull();
  });

  it("clears one request's sub through the hook, by request id", async () => {
    const request = coveredRequest(SANNA, "Sanna", JOONAS, "Joonas");
    const { onClearCover } = renderEditor({
      gedus: TWO_SEATS,
      requests: [request],
    });

    fireEvent.click(button(copy.clearSub));
    await act(async () => {
      fireEvent.click(button(copy.clearConfirm));
    });

    expect(onClearCover).toHaveBeenCalledWith(request.id);
  });

  it("withdraws one request through the hook, by request id", async () => {
    const request = openRequest(SANNA, "Sanna");
    const { onWithdrawRequest } = renderEditor({
      gedus: TWO_SEATS,
      requests: [request],
    });

    fireEvent.click(button(copy.withdraw));
    await act(async () => {
      fireEvent.click(button(copy.withdrawConfirm));
    });

    expect(onWithdrawRequest).toHaveBeenCalledWith(request.id);
  });

  it("offers no Clear on an open request — there is no sub to unseat", () => {
    renderEditor({ gedus: TWO_SEATS, requests: [openRequest(SANNA, "Sanna")] });

    expect(screen.queryByRole("button", { name: copy.clearSub })).toBeNull();
    expect(screen.queryByRole("button", { name: copy.withdraw })).not.toBeNull();
  });

  it("disables Set a sub with a reason when nobody is expected", () => {
    renderEditor({ gedus: [] });

    expect(isDisabled(button(copy.setSub))).toBe(true);
    expect(screen.getByText(copy.nobodyExpectedHint)).not.toBeNull();
  });

  it("keeps the confirm button disabled while the write is in the air", async () => {
    let settle: () => void = () => {};
    const onSetCover = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          settle = resolve;
        }),
    );
    renderEditor({ gedus: ONE_PRIMARY, onSetCover });

    fireEvent.click(button(copy.setSub));
    fireEvent.click(pickerRow(PETRA));
    fireEvent.click(button(copy.confirmAction));

    expect(isDisabled(button(copy.confirmAction))).toBe(true);
    await act(async () => {
      settle();
    });
  });

  it("hands the control back and names the failure when the write is refused", async () => {
    const onSetCover = vi.fn(() => Promise.reject(new Error("nope")));
    renderEditor({ gedus: ONE_PRIMARY, onSetCover });

    fireEvent.click(button(copy.setSub));
    fireEvent.click(pickerRow(PETRA));
    await act(async () => {
      fireEvent.click(button(copy.confirmAction));
    });

    expect(screen.getByText(copy.setFailed)).not.toBeNull();
    expect(isDisabled(button(copy.confirmAction))).toBe(false);
  });
});

/** An open request somebody filed on this session. */
function openRequest(id: string, firstName: string): CoverRequestInput {
  return {
    id: `request-${id}`,
    sessionDate: SESSION_DATE,
    requestedBy: { id, firstName },
    role: "primary",
    status: "open",
    coveredBy: null,
    offerCount: null,
  };
}

/** The same request, answered. */
function coveredRequest(
  id: string,
  firstName: string,
  subId: string,
  subName: string,
): CoverRequestInput {
  return {
    ...openRequest(id, firstName),
    status: "covered",
    coveredBy: { id: subId, firstName: subName },
  };
}
