import { describe, it, expect, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import {
  SignupPanelView,
  type AuthState,
  type SignupPanelViewProps,
  type SignupParticipantChoice,
} from "@/components/public/products/signup-panel-view";

/**
 * **What the region lock does to the signup panel.**
 *
 * The gate has three states the panel answers, in three different shapes, which
 * is the thing worth pinning: a missing location is a question, so the form
 * stays whole and grows a section that asks it; being in the right country is a
 * statement, so the same slot holds the answer and nothing else changes; a
 * wrong country is a refusal, so the form goes entirely. Between them they
 * carry the panel's grammar — the CTA never opens the dialog, the section does;
 * the CTA names the next missing step in section order; an overlay means there
 * is no decision to present.
 *
 * Translations are stubbed to echo their keys, so nothing here depends on
 * English wording. The interpolated country still comes through, which is how
 * the refusal's one variable is checked.
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
  overrides: Partial<SignupPanelViewProps> = {},
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
    // makes "the location step outranks it" a real assertion rather than a tie.
    agreed: true,
    onAgreedChange: () => {},
    onSubmit: () => {},
    onJoinWaitlist: () => {},
    currency: "eur",
    locale: "en",
    ...overrides,
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

/** The location section's own affordance, which is not the CTA. */
const setLocationButton = (c: HTMLElement) =>
  [...c.querySelectorAll("button")].find(
    (b) => b.textContent.includes("regionLock.setLocation") && b !== cta(c),
  );

describe("unlocked", () => {
  it("leaves the panel exactly as it was, with or without a gate", () => {
    for (const regionGate of [
      undefined,
      { gate: { kind: "unlocked" } as const, onSetLocation: () => {} },
    ]) {
      const { container } = render(<SignupPanelView {...panel({ regionGate })} />);
      expect(rows(container)).toHaveLength(1);
      expect(container.textContent).not.toContain("regionLock");
      expect(cta(container).textContent).toContain("ctaActive");
      expect(cta(container).disabled).toBe(false);
    }
  });
});

describe("wrong country", () => {
  const wrongCountry = {
    gate: { kind: "wrong_country" as const, requiredCountry: "FI" },
    onSetLocation: () => {},
  };

  it("replaces the form rather than disabling it", () => {
    const { container } = render(
      <SignupPanelView {...panel({ regionGate: wrongCountry })} />,
    );
    // No picker, no consent, no CTA — nothing on screen before the swap is
    // still on screen after it, so nothing moved.
    expect(rows(container)).toHaveLength(0);
    expect(container.textContent).not.toContain("rulesHeading");
    expect(container.querySelector("button")).toBeNull();
  });

  it("names the country, in the reader's own language", () => {
    const { container } = render(
      <SignupPanelView {...panel({ regionGate: wrongCountry })} />,
    );
    expect(container.textContent).toContain("regionLock.wrongCountry");
    expect(container.textContent).toContain("Finland");
  });

  it("still shows the panel's own header and price", () => {
    const { container } = render(
      <SignupPanelView {...panel({ regionGate: wrongCountry })} />,
    );
    expect(container.textContent).toContain("noun.consumer_club");
  });
});

const eligible = {
  gate: { kind: "eligible" as const, requiredCountry: "FI" },
  locationName: "Helsinki",
  onSetLocation: () => {},
};

describe("no location", () => {
  const noLocation = (onSetLocation = () => {}) => ({
    gate: { kind: "no_location" as const },
    onSetLocation,
  });

  it("keeps the form and adds the section that asks for one", () => {
    const { container } = render(
      <SignupPanelView {...panel({ regionGate: noLocation() })} />,
    );
    expect(rows(container)).toHaveLength(1);
    expect(container.textContent).toContain("regionLock.heading");
    expect(container.textContent).toContain("regionLock.note");
    // Between the picker and the rules, which is the order the CTA names them
    // in.
    const text = container.textContent;
    expect(text.indexOf("regionLock.heading")).toBeGreaterThan(
      text.indexOf("whoAreYouSigningUp"),
    );
    expect(text.indexOf("regionLock.heading")).toBeLessThan(
      text.indexOf("rulesHeading"),
    );
  });

  it("puts the action in the section, and never on the CTA", () => {
    const onSetLocation = vi.fn();
    const onSubmit = vi.fn();
    const { container } = render(
      <SignupPanelView
        {...panel({ regionGate: noLocation(onSetLocation), onSubmit })}
      />,
    );

    const button = setLocationButton(container);
    expect(button).toBeDefined();
    fireEvent.click(button!);
    expect(onSetLocation).toHaveBeenCalledTimes(1);

    // The CTA is an instruction here and nothing else: disabled, and clicking
    // it neither submits nor opens the dialog.
    fireEvent.click(cta(container));
    expect(onSubmit).not.toHaveBeenCalled();
    expect(onSetLocation).toHaveBeenCalledTimes(1);
  });

  it("names the location step on a disabled CTA", () => {
    const { container } = render(
      <SignupPanelView {...panel({ regionGate: noLocation() })} />,
    );
    expect(cta(container).textContent).toContain("regionLock.setLocation");
    expect(cta(container).disabled).toBe(true);
  });

  it("swaps to the confirmation in the same slot once a matching place lands", () => {
    // The transform the in-place answer rests on: same mount, same position,
    // the question replaced by its own answer. Rendering it as a rerender is
    // what makes "in place" a claim about this component rather than about two
    // screenshots.
    const { container, rerender } = render(
      <SignupPanelView {...panel({ regionGate: noLocation() })} />,
    );
    expect(container.textContent).toContain("regionLock.note");

    rerender(<SignupPanelView {...panel({ regionGate: eligible })} />);
    expect(container.textContent).not.toContain("regionLock.note");
    expect(container.textContent).toContain("regionLock.eligible");

    const text = container.textContent;
    expect(text.indexOf("regionLock.eligible")).toBeGreaterThan(
      text.indexOf("whoAreYouSigningUp"),
    );
    expect(text.indexOf("regionLock.eligible")).toBeLessThan(
      text.indexOf("rulesHeading"),
    );
  });

  it("keeps the CTA in section order: gamer, then location, then rules", () => {
    // Nobody selected yet: the picker is above the location section, so its
    // prompt comes first even though the location is missing too.
    const noGamer = render(
      <SignupPanelView
        {...panel({
          regionGate: noLocation(),
          selectedParticipantId: null,
        })}
      />,
    );
    expect(cta(noGamer.container).textContent).toContain("ctaAddGamer");

    // Selected but nothing agreed: the location sits above the rules, so it is
    // the step named.
    const unagreed = render(
      <SignupPanelView {...panel({ regionGate: noLocation(), agreed: false })} />,
    );
    expect(cta(unagreed.container).textContent).toContain(
      "regionLock.setLocation",
    );
  });
});

describe("eligible", () => {
  it("keeps the whole form and states where the product is offered", () => {
    const { container } = render(
      <SignupPanelView {...panel({ regionGate: eligible })} />,
    );
    expect(rows(container)).toHaveLength(1);
    expect(container.textContent).toContain("rulesHeading");
    expect(container.textContent).toContain("regionLock.eligible");
    // The country is named, in the reader's own language — the same courtesy
    // the refusal does, and the reason this state says anything at all.
    expect(container.textContent).toContain("Finland");
  });

  it("says which location it is talking about", () => {
    const { container } = render(
      <SignupPanelView {...panel({ regionGate: eligible })} />,
    );
    expect(container.textContent).toContain("regionLock.eligibleLocation");
    expect(container.textContent).toContain("Helsinki");
  });

  it("makes its statement without one when no name resolved", () => {
    // A label with nothing after it would be worse than not naming the place.
    const { container } = render(
      <SignupPanelView
        {...panel({ regionGate: { ...eligible, locationName: null } })}
      />,
    );
    expect(container.textContent).toContain("regionLock.eligible");
    expect(container.textContent).not.toContain("regionLock.eligibleLocation");
  });

  it("offers no action at all — location changes belong to settings", () => {
    const { container } = render(
      <SignupPanelView {...panel({ regionGate: eligible })} />,
    );
    // No set-location affordance anywhere, and nothing else clickable inside
    // the section either — a parent mid-purchase is not invited to rewrite a
    // profile field.
    expect(setLocationButton(container)).toBeUndefined();
    expect(container.textContent).not.toContain("regionLock.setLocation");
    const regionButtons = [...container.querySelectorAll("button")].filter((b) =>
      b.textContent.includes("regionLock"),
    );
    expect(regionButtons).toEqual([]);
  });

  it("leaves the CTA exactly as an unlocked product would", () => {
    // Eligible blocks nothing, so it adds no step to the checklist: same live
    // label, same enabled button, and clicking it still submits.
    const onSubmit = vi.fn();
    const { container } = render(
      <SignupPanelView {...panel({ regionGate: eligible, onSubmit })} />,
    );
    expect(cta(container).textContent).toContain("ctaActive");
    expect(cta(container).disabled).toBe(false);
    fireEvent.click(cta(container));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});
