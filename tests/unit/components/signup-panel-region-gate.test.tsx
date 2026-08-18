import { describe, it, expect, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import {
  SignupPanelView,
  type AuthState,
  type SignupPanelViewProps,
  type SignupParticipantChoice,
} from "@/components/public/products/signup-panel-view";

/**
 * **The region lock's seam into the signup panel.**
 *
 * Three candidate blocks are being compared on the preview scenes and two will
 * be deleted, but the seam they all go through is in the live panel: three
 * optional slots the view places without knowing what a region lock is. What is
 * pinned here is that seam, not any candidate's composition —
 *
 *  - a `replacesForm` node stands where the form did, and the form is *gone*
 *    rather than disabled, so nothing survives the swap to be moved by it;
 *  - a `note` leaves the form intact underneath;
 *  - a `cta` outranks every other missing-step label the button resolves, and
 *    is live exactly when it carries a handler.
 *
 * A candidate deleted from `region-lock/` leaves every one of these standing,
 * which is the point of testing the seam rather than the candidates.
 *
 * Translations are stubbed to echo their keys, so nothing here depends on
 * English wording — and the draft copy the candidates carry is literal English
 * held outside `messages/`, which is another reason not to assert on it.
 */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));

// A real UUID, hardcoded: the picker row carries an identicon, and a readable
// stand-in renders a degenerate one. Never generated at test time.
const CHILD: SignupParticipantChoice = {
  id: "6aaac864-5ea7-451b-8d02-93f9ae6f25b5",
  name: "Oona",
  age: 10,
};

function panel(
  regionGate: SignupPanelViewProps["regionGate"],
): SignupPanelViewProps {
  const authState: AuthState = {
    kind: "ready",
    participants: [CHILD],
    gamerCount: 1,
  };
  return {
    productType: "consumer_club",
    forGamers: true,
    state: {
      kind: "open",
      seatCount: null,
      seatsLeft: null,
      waitlistEnabled: false,
    },
    authState,
    pricingOption: { kind: "free" },
    selectedParticipantId: CHILD.id,
    onSelectParticipant: () => {},
    onAddGamer: () => {},
    // Agreed, so the CTA would otherwise be on its live label — which is what
    // makes "the region CTA outranks it" a real assertion rather than a tie.
    agreed: true,
    onAgreedChange: () => {},
    onSubmit: () => {},
    onJoinWaitlist: () => {},
    currency: "eur",
    locale: "en",
    regionGate,
  };
}

/** The rows the picker offers — absent entirely once the form is replaced. */
const rows = (c: HTMLElement) => [
  ...c.querySelectorAll<HTMLButtonElement>('[role="radio"]'),
];

/** The CTA — the submit button at the end of the form. */
const cta = (c: HTMLElement) => {
  const buttons = [...c.querySelectorAll("button")];
  return buttons[buttons.length - 1];
};

describe("no gate", () => {
  it("leaves the panel exactly as it was", () => {
    const { container } = render(<SignupPanelView {...panel(undefined)} />);
    expect(rows(container)).toHaveLength(1);
    expect(cta(container).textContent).toContain("ctaActive");
    expect(cta(container).disabled).toBe(false);
  });
});

describe("replacesForm", () => {
  it("removes the form rather than disabling it", () => {
    const { container } = render(
      <SignupPanelView
        {...panel({ replacesForm: <p>region overlay</p> })}
      />,
    );
    expect(container.textContent).toContain("region overlay");
    // No picker, no consent, no CTA — nothing on screen before the swap is
    // still on screen after it, so nothing moved.
    expect(rows(container)).toHaveLength(0);
    expect(container.textContent).not.toContain("rulesHeading");
  });

  it("still shows the panel's own price and header", () => {
    const { container } = render(
      <SignupPanelView
        {...panel({ replacesForm: <p>region overlay</p> })}
      />,
    );
    expect(container.textContent).toContain("noun.consumer_club");
  });
});

describe("note", () => {
  it("sits above a form that stays usable", () => {
    const { container } = render(
      <SignupPanelView {...panel({ note: <p>region note</p> })} />,
    );
    expect(container.textContent).toContain("region note");
    expect(rows(container)).toHaveLength(1);
    expect(cta(container).disabled).toBe(false);
  });
});

describe("cta", () => {
  it("outranks the live label and runs its own handler", () => {
    const onClick = vi.fn();
    const onSubmit = vi.fn();
    const { container } = render(
      <SignupPanelView
        {...panel({ cta: { label: "Set your location", onClick } })}
        onSubmit={onSubmit}
      />,
    );
    const button = cta(container);
    expect(button.textContent).toContain("Set your location");
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("is disabled when it carries no handler", () => {
    const { container } = render(
      <SignupPanelView {...panel({ cta: { label: "Not available here" } })} />,
    );
    const button = cta(container);
    expect(button.textContent).toContain("Not available here");
    expect(button.disabled).toBe(true);
  });
});
