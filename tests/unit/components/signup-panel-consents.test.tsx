import { describe, it, expect, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import {
  SignupPanelView,
  type AuthState,
  type SignupPanelViewProps,
  type SignupParticipantChoice,
} from "@/components/public/products/signup-panel-view";
import { ROUTES } from "@/lib/constants";

/**
 * **The panel's Required consent section.**
 *
 * One section, always present, holding one tickable row per thing the parent is
 * agreeing to: the product's own documents when it attaches any, and — always,
 * last — our rules. The panel is presentational, so this drives it directly with
 * props: no mutation, no query client, no router. Translations are stubbed to
 * echo their keys, so nothing here depends on English wording.
 *
 * What is worth pinning: the section is never empty, the documents are named as
 * links a reader can follow before agreeing, one tick covers all of them, the
 * CTA names the section until every row in it is ticked, and a slug this deploy
 * cannot name is still listed and still gates.
 */
vi.mock("next-intl", () => {
  type PlainValue = string | number;
  const echo = (key: string, values?: Record<string, PlainValue>) =>
    values ? `${key}:${JSON.stringify(values)}` : key;
  const t = (key: string, values?: Record<string, PlainValue>) =>
    echo(key, values);
  return { useTranslations: () => t };
});

// A real UUID, hardcoded: the picker row carries an identicon, and a readable
// stand-in renders a degenerate one. Never generated at test time.
const CHILD: SignupParticipantChoice = {
  id: "0a4e3f21-6c8d-4f0b-9a17-2b5e8c1d4f60",
  name: "Aino",
  age: 11,
};

const TERMS = "roblox-programme-terms";
const PRIVACY = "roblox-privacy-policy";

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
    // The rules row is ticked in every case here unless a test says otherwise,
    // so "the documents are what is left" is a real assertion rather than a tie
    // with the row below them.
    agreed: true,
    onAgreedChange: () => {},
    requiredConsentSlugs: [],
    consentsAgreed: false,
    onConsentsAgreedChange: () => {},
    onSubmit: () => {},
    onJoinWaitlist: () => {},
    currency: "eur",
    locale: "en",
    ...overrides,
  };
}

/** The CTA — the submit button at the end of the form. */
const cta = (c: HTMLElement) => {
  const buttons = [...c.querySelectorAll("button")];
  return buttons[buttons.length - 1];
};

/** Every checkbox in the panel, in DOM order: documents first, rules last. */
const checkboxes = (c: HTMLElement) => [
  ...c.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
];

const links = (c: HTMLElement) => [...c.querySelectorAll("a")];

describe("a product with no required consents", () => {
  it("still renders the section, holding the rules row alone", () => {
    const { container } = render(<SignupPanelView {...panel()} />);

    // The heading is not conditional: the rules live under it, so the section
    // exists on every product and this is the baseline every panel shows.
    expect(container.textContent).toContain("consents.heading");
    // No document list, no document sentence — nothing is reserved for a row
    // that is not there.
    expect(container.textContent).not.toContain("consents.agree");
    expect(checkboxes(container)).toHaveLength(1);
    expect(links(container)).toHaveLength(0);
    expect(cta(container).textContent).toContain("ctaActive");
    expect(cta(container).disabled).toBe(false);
  });

  it("names the section when the rules row is the only thing unticked", () => {
    const { container } = render(
      <SignupPanelView {...panel({ agreed: false })} />,
    );

    // One label for the whole section, whichever row inside it is outstanding —
    // the two rows look alike, so pointing at one of them by name would be
    // pointing at something the reader cannot pick out.
    expect(cta(container).textContent).toBe("ctaAgreeConsent");
    expect(cta(container).disabled).toBe(true);
  });
});

describe("a product that requires consents", () => {
  it("names every document in a link that opens in a new tab", () => {
    const { container } = render(
      <SignupPanelView
        {...panel({ requiredConsentSlugs: [TERMS, PRIVACY] })}
      />,
    );

    const anchors = links(container);
    expect(anchors.map((a) => a.getAttribute("href"))).toEqual([
      ROUTES.robloxTerms,
      ROUTES.robloxPrivacy,
    ]);
    for (const anchor of anchors) {
      expect(anchor.getAttribute("target")).toBe("_blank");
      // Both tokens: `noopener` is the security half, `noreferrer` the one
      // older engines need to get it.
      expect(anchor.getAttribute("rel")).toContain("noopener");
      expect(anchor.getAttribute("rel")).toContain("noreferrer");
    }
  });

  it("offers ONE unticked box for the documents, plus the rules row", () => {
    const { container } = render(
      <SignupPanelView
        {...panel({ requiredConsentSlugs: [TERMS, PRIVACY] })}
      />,
    );

    // Two documents, one consent: the pair is handed over together and cannot
    // be accepted apart, so a second box would offer a choice that does not
    // exist. The second checkbox here is the rules row, which is ticked.
    const boxes = checkboxes(container);
    expect(boxes).toHaveLength(2);
    expect(boxes[0].checked).toBe(false);
    expect(container.textContent).toContain("consents.agree");
  });

  it("does not tick the box when a document link is clicked", () => {
    const onConsentsAgreedChange = vi.fn();
    const { container } = render(
      <SignupPanelView
        {...panel({ requiredConsentSlugs: [TERMS], onConsentsAgreedChange })}
      />,
    );

    // A listener OUTSIDE React's root container, so it sees the native click
    // only after React has dispatched any handler of ours.
    const escaped = vi.fn();
    container.parentElement!.addEventListener("click", escaped);

    fireEvent.click(links(container)[0]);

    // Two claims, separated because they are guaranteed by different things.
    //
    // The box staying unticked is now STRUCTURAL: the links are rendered above
    // the `<label>`, not inside it, so no click on one can reach the input. The
    // assertion below is what would catch a future edit that moved the list
    // back into the box — where it would need a handler again.
    expect(onConsentsAgreedChange).not.toHaveBeenCalled();
    // The other half, pinned separately: the anchor really is outside the
    // label. Without this, a component that moved the list inside the box and
    // added a `stopPropagation` would pass the assertion above while having
    // quietly changed which mechanism is doing the work.
    const label = container.querySelector("label:has(input)");
    expect(label?.querySelector("a")).toBeNull();
    // Nothing stops the click, because nothing needs to: it never entered a
    // label in the first place.
    expect(escaped).toHaveBeenCalled();
  });

  it("reports the new value when the documents box is ticked", () => {
    const onConsentsAgreedChange = vi.fn();
    const { container } = render(
      <SignupPanelView
        {...panel({
          requiredConsentSlugs: [TERMS, PRIVACY],
          onConsentsAgreedChange,
        })}
      />,
    );

    fireEvent.click(checkboxes(container)[0]);

    expect(onConsentsAgreedChange).toHaveBeenCalledWith(true);
  });

  it("blocks the CTA and names the section while the documents are unticked", () => {
    const onSubmit = vi.fn();
    const { container } = render(
      <SignupPanelView
        {...panel({
          requiredConsentSlugs: [TERMS, PRIVACY],
          consentsAgreed: false,
          onSubmit,
        })}
      />,
    );

    expect(cta(container).textContent).toBe("ctaAgreeConsent");
    expect(cta(container).disabled).toBe(true);
    fireEvent.click(cta(container));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("still blocks the CTA when only the rules row is outstanding", () => {
    const { container } = render(
      <SignupPanelView
        {...panel({
          requiredConsentSlugs: [TERMS, PRIVACY],
          consentsAgreed: true,
          agreed: false,
        })}
      />,
    );

    // Same label as the case above, which is the point of merging the two
    // steps: the reader is sent to one section, not to one of two boxes.
    expect(cta(container).textContent).toBe("ctaAgreeConsent");
    expect(cta(container).disabled).toBe(true);
  });

  it("releases the CTA once both rows are ticked", () => {
    const onSubmit = vi.fn();
    const { container } = render(
      <SignupPanelView
        {...panel({
          requiredConsentSlugs: [TERMS, PRIVACY],
          consentsAgreed: true,
          onSubmit,
        })}
      />,
    );

    expect(cta(container).disabled).toBe(false);
    fireEvent.click(cta(container));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("puts the rules row last, below the documents", () => {
    const { container } = render(
      <SignupPanelView
        {...panel({
          requiredConsentSlugs: [TERMS],
          consentsAgreed: true,
          agreed: false,
        })}
      />,
    );

    // Ours is the final thing agreed to before the button, so it is the last
    // checkbox in the section — and the only unticked one here.
    const boxes = checkboxes(container);
    expect(boxes).toHaveLength(2);
    expect(boxes[0].checked).toBe(true);
    expect(boxes[1].checked).toBe(false);
  });
});

describe("a required slug this deploy cannot name", () => {
  const UNKNOWN = "some-future-document";

  it("is still listed, as the slug itself and with no link", () => {
    const { container } = render(
      <SignupPanelView {...panel({ requiredConsentSlugs: [UNKNOWN] })} />,
    );

    expect(container.textContent).toContain(UNKNOWN);
    // Never an anchor with nowhere to go: an empty href resolves to the page
    // the reader is already on.
    expect(links(container)).toHaveLength(0);
    // The documents row is offered exactly as it is for a named document.
    expect(checkboxes(container)).toHaveLength(2);
  });

  it("still gates the CTA", () => {
    const { container } = render(
      <SignupPanelView {...panel({ requiredConsentSlugs: [UNKNOWN] })} />,
    );

    // The whole point of the fallback: dropping an unnameable requirement
    // would let the enrolment through without a consent the product legally
    // requires, which is worse than an ugly list entry.
    expect(cta(container).disabled).toBe(true);
    expect(cta(container).textContent).toBe("ctaAgreeConsent");
  });
});
