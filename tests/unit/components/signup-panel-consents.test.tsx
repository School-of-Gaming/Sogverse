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
 * **What a product's required consents do to the signup panel.**
 *
 * The panel is presentational, so this drives it directly with props — no
 * mutation, no query client, no router. Translations are stubbed to echo their
 * keys, so nothing here depends on English wording; `rich` echoes the same way
 * and then hands the result to the tag functions the call passed, so the link
 * wrapper is really invoked and the anchor it builds is really in the DOM.
 *
 * The gate itself is one rule — every required slug ticked — and the three
 * things worth pinning are its ends: a product requiring none is untouched, a
 * product requiring some cannot be submitted until all of them are ticked, and
 * a slug this deploy cannot name still counts.
 */
vi.mock("next-intl", () => {
  type TagFn = (chunks: unknown) => unknown;
  type PlainValue = string | number;
  const echo = (key: string, values?: Record<string, PlainValue>) =>
    values ? `${key}:${JSON.stringify(values)}` : key;
  const t = (key: string, values?: Record<string, PlainValue>) =>
    echo(key, values);
  t.rich = (key: string, values?: Record<string, PlainValue | TagFn>) => {
    const plain: Record<string, PlainValue> = {};
    const tags: TagFn[] = [];
    for (const [name, value] of Object.entries(values ?? {})) {
      if (typeof value === "function") tags.push(value);
      else plain[name] = value;
    }
    return tags.reduce<unknown>((chunks, tag) => tag(chunks), echo(key, plain));
  };
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
    // The rules box is already ticked in every case here, so "the documents
    // are what is left" is a real assertion rather than a tie with the step
    // above it.
    agreed: true,
    onAgreedChange: () => {},
    requiredConsentSlugs: [],
    consentedSlugs: new Set<string>(),
    onConsentChange: () => {},
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

/** Every checkbox in the panel: the rules one, then one per document. */
const checkboxes = (c: HTMLElement) => [
  ...c.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
];

const links = (c: HTMLElement) => [...c.querySelectorAll("a")];

describe("a product with no required consents", () => {
  it("renders no consent section and leaves the CTA on its live label", () => {
    const { container } = render(<SignupPanelView {...panel()} />);

    expect(container.textContent).not.toContain("consents.");
    // The rules box, and nothing beside it.
    expect(checkboxes(container)).toHaveLength(1);
    expect(cta(container).textContent).toContain("ctaActive");
    expect(cta(container).disabled).toBe(false);
  });
});

describe("a product that requires consents", () => {
  it("renders one checkbox per document, none of them ticked", () => {
    const { container } = render(
      <SignupPanelView
        {...panel({ requiredConsentSlugs: [TERMS, PRIVACY] })}
      />,
    );

    const boxes = checkboxes(container);
    // The rules box plus one per document.
    expect(boxes).toHaveLength(3);
    expect(boxes.slice(1).every((box) => !box.checked)).toBe(true);
    expect(container.textContent).toContain("consents.heading");
  });

  it("names each document in a link that opens in a new tab", () => {
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

  it("does not tick the box when the document link is clicked", () => {
    const onConsentChange = vi.fn();
    const { container } = render(
      <SignupPanelView
        {...panel({ requiredConsentSlugs: [TERMS], onConsentChange })}
      />,
    );

    fireEvent.click(links(container)[0]);

    // Reading a document is not agreeing to it. The whole box is a label, so
    // without the anchor stopping the click this would have toggled.
    expect(onConsentChange).not.toHaveBeenCalled();
  });

  it("reports the slug and the new value when a box is ticked", () => {
    const onConsentChange = vi.fn();
    const { container } = render(
      <SignupPanelView
        {...panel({
          requiredConsentSlugs: [TERMS, PRIVACY],
          onConsentChange,
        })}
      />,
    );

    fireEvent.click(checkboxes(container)[2]);

    expect(onConsentChange).toHaveBeenCalledWith(PRIVACY, true);
  });

  it("blocks the CTA and names the step while any document is unticked", () => {
    const onSubmit = vi.fn();
    const { container } = render(
      <SignupPanelView
        {...panel({
          requiredConsentSlugs: [TERMS, PRIVACY],
          // One of two — the case a boolean "have they agreed" would get wrong.
          consentedSlugs: new Set([TERMS]),
          onSubmit,
        })}
      />,
    );

    expect(cta(container).textContent).toBe("ctaAgreeConsents");
    expect(cta(container).disabled).toBe(true);
    fireEvent.click(cta(container));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("releases the CTA once every document is ticked", () => {
    const onSubmit = vi.fn();
    const { container } = render(
      <SignupPanelView
        {...panel({
          requiredConsentSlugs: [TERMS, PRIVACY],
          consentedSlugs: new Set([TERMS, PRIVACY]),
          onSubmit,
        })}
      />,
    );

    expect(cta(container).disabled).toBe(false);
    fireEvent.click(cta(container));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("names the rules step first, and the documents step after it", () => {
    const { container } = render(
      <SignupPanelView
        {...panel({
          agreed: false,
          requiredConsentSlugs: [TERMS],
        })}
      />,
    );

    // Both steps are outstanding; the checklist walks down the panel, and the
    // rules box sits above the documents.
    expect(cta(container).textContent).toBe("ctaAgreeRules");
  });
});

describe("a required slug this deploy cannot name", () => {
  const UNKNOWN = "some-future-document";

  it("still renders a checkbox, labelled with the slug and carrying no link", () => {
    const { container } = render(
      <SignupPanelView {...panel({ requiredConsentSlugs: [UNKNOWN] })} />,
    );

    expect(checkboxes(container)).toHaveLength(2);
    expect(container.textContent).toContain(UNKNOWN);
    // Never an anchor with nowhere to go: an empty href resolves to the page
    // the reader is already on.
    expect(links(container)).toHaveLength(0);
  });

  it("still gates the CTA", () => {
    const { container } = render(
      <SignupPanelView {...panel({ requiredConsentSlugs: [UNKNOWN] })} />,
    );

    // The whole point of the fallback: dropping an unnameable requirement
    // would let the enrolment through without a consent the product legally
    // requires, which is worse than an ugly checkbox.
    expect(cta(container).disabled).toBe(true);
    expect(cta(container).textContent).toBe("ctaAgreeConsents");
  });
});
