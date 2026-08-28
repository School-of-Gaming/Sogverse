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
 * agreeing to: one row per bundle of the product's documents, one row for any
 * slug belonging to no bundle, and — always, last — our rules. The panel is
 * presentational, so this drives it directly with props: no mutation, no query
 * client, no router. Translations are stubbed to echo their keys, so nothing
 * here depends on English wording.
 *
 * What is worth pinning: the section is never empty, a bundle is ONE row whose
 * sentence carries a link per document inside the very box that consents to
 * them, clicking a link reads instead of ticking while clicking anywhere else
 * in the box ticks, the CTA names the section until every row in it is ticked,
 * and a slug this deploy cannot name still gets a row of its own and still
 * gates.
 */
vi.mock("next-intl", async () => {
  const { createElement, Fragment } = await import("react");
  type TagFn = (chunks: unknown) => import("react").ReactNode;
  type PlainValue = string | number;
  const echo = (key: string, values?: Record<string, PlainValue>) =>
    values ? `${key}:${JSON.stringify(values)}` : key;
  const t = (key: string, values?: Record<string, PlainValue>) =>
    echo(key, values);
  // Each named tag wraps its own name, SIDE BY SIDE after the echoed key —
  // which is the shape a real bundle sentence has (two links in one sentence).
  // Nesting them, as a reduce would, produces an anchor inside an anchor and
  // would make the two-link assertions below meaningless.
  t.rich = (key: string, values?: Record<string, PlainValue | TagFn>) => {
    const plain: Record<string, PlainValue> = {};
    const tags: [string, TagFn][] = [];
    for (const [name, value] of Object.entries(values ?? {})) {
      if (typeof value === "function") tags.push([name, value]);
      else plain[name] = value;
    }
    return createElement(
      Fragment,
      null,
      echo(key, plain),
      ...tags.map(([name, tag]) =>
        createElement(Fragment, { key: name }, tag(name)),
      ),
    );
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
/** The key `describeRequiredConsents` gives the Roblox pair's single row. */
const ROBLOX_BUNDLE = "roblox-programme";

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
    consentAgreements: new Set<string>(),
    onConsentAgreementChange: () => {},
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
    // No bundle sentence, no fallback sentence — nothing is reserved for a row
    // that is not there.
    expect(container.textContent).not.toContain("robloxProgramme");
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
    // the rows look alike, so pointing at one of them by name would be pointing
    // at something the reader cannot pick out.
    expect(cta(container).textContent).toBe("ctaAgreeConsent");
    expect(cta(container).disabled).toBe(true);
  });
});

describe("a bundle of documents", () => {
  const bundled = (overrides: Partial<SignupPanelViewProps> = {}) =>
    panel({ requiredConsentSlugs: [TERMS, PRIVACY], ...overrides });

  it("is ONE row, whose sentence names both documents as links", () => {
    const { container } = render(<SignupPanelView {...bundled()} />);

    // The pair is handed over together and cannot be accepted apart, so a
    // second box would offer a choice that does not exist. The second checkbox
    // here is the rules row, which is ticked.
    const boxes = checkboxes(container);
    expect(boxes).toHaveLength(2);
    expect(boxes[0].checked).toBe(false);
    // The sentence IS the consent: it is the bundle's own authored string, not
    // a generic one with a list bolted above it.
    expect(container.textContent).toContain("robloxProgramme");
    expect(container.textContent).not.toContain("consents.agree");
  });

  it("points each link at its own document, in a new tab", () => {
    const { container } = render(<SignupPanelView {...bundled()} />);

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

  it("keeps both links inside the box that consents to them", () => {
    const { container } = render(<SignupPanelView {...bundled()} />);

    // One box is one consent unit, and the sentence in it is what the parent is
    // agreeing to — so the documents it names cannot sit anywhere else. This is
    // the structural half of the behaviour pinned in the two tests below.
    const label = container.querySelector("label:has(input)");
    expect(label?.querySelectorAll("a")).toHaveLength(2);
  });

  it("does not tick the box when a document link is clicked", () => {
    const onConsentAgreementChange = vi.fn();
    const { container } = render(
      <SignupPanelView {...bundled({ onConsentAgreementChange })} />,
    );

    // A listener OUTSIDE React's root container, so it sees the native click
    // only after React has dispatched any handler of ours.
    const escaped = vi.fn();
    container.parentElement!.addEventListener("click", escaped);

    fireEvent.click(links(container)[0]);

    // Two claims, separated because they are guaranteed by different things.
    //
    // The box staying unticked is the DOM's own rule: a `<label>`'s activation
    // behaviour is skipped when the click lands on an interactive descendant,
    // and an `<a href>` inside the box is one. A link reads; it does not tick.
    expect(onConsentAgreementChange).not.toHaveBeenCalled();
    // The other half, pinned separately: WHICH mechanism is doing that work.
    // Nothing swallows the click on its way out, so the assertion above cannot
    // be being satisfied by a `stopPropagation` on the anchor — and a future
    // edit that reached for one instead of relying on the DOM would fail here
    // rather than pass quietly.
    expect(escaped).toHaveBeenCalled();
  });

  it("ticks when the box is clicked anywhere but a link", () => {
    const onConsentAgreementChange = vi.fn();
    const { container } = render(
      <SignupPanelView {...bundled({ onConsentAgreementChange })} />,
    );

    // The other side of the same coin, and the reason the whole box stays
    // clickable: everything in it that is not a link is the tick target,
    // including the words of the sentence between the two links.
    fireEvent.click(container.querySelector("label:has(input)")!);

    expect(onConsentAgreementChange).toHaveBeenCalledWith(ROBLOX_BUNDLE, true);
  });

  it("reports its own row key when the checkbox is ticked", () => {
    const onConsentAgreementChange = vi.fn();
    const { container } = render(
      <SignupPanelView {...bundled({ onConsentAgreementChange })} />,
    );

    fireEvent.click(checkboxes(container)[0]);

    // The key, not a bare boolean: a product with two bundles has two rows, and
    // the caller has to know which one moved.
    expect(onConsentAgreementChange).toHaveBeenCalledWith(ROBLOX_BUNDLE, true);
  });

  it("blocks the CTA and names the section while the bundle is unticked", () => {
    const onSubmit = vi.fn();
    const { container } = render(
      <SignupPanelView {...bundled({ onSubmit })} />,
    );

    expect(cta(container).textContent).toBe("ctaAgreeConsent");
    expect(cta(container).disabled).toBe(true);
    fireEvent.click(cta(container));
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("still blocks the CTA when only the rules row is outstanding", () => {
    const { container } = render(
      <SignupPanelView
        {...bundled({
          consentAgreements: new Set([ROBLOX_BUNDLE]),
          agreed: false,
        })}
      />,
    );

    // Same label as the case above, which is the point of merging the two
    // steps: the reader is sent to one section, not to one of two boxes.
    expect(cta(container).textContent).toBe("ctaAgreeConsent");
    expect(cta(container).disabled).toBe(true);
  });

  it("releases the CTA once every row is ticked", () => {
    const onSubmit = vi.fn();
    const { container } = render(
      <SignupPanelView
        {...bundled({
          consentAgreements: new Set([ROBLOX_BUNDLE]),
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
        {...bundled({
          consentAgreements: new Set([ROBLOX_BUNDLE]),
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

  it("is one row even when the product stores only half the bundle", () => {
    const { container } = render(
      <SignupPanelView {...panel({ requiredConsentSlugs: [TERMS] })} />,
    );

    // A half-set should be unreachable from the admin form, but it can predate
    // the bundle or arrive by hand. The sentence names the programme's
    // documents whatever the product stores, so it is still one row and still
    // two links — the wire payload is the half that is actually required.
    expect(checkboxes(container)).toHaveLength(2);
    expect(links(container)).toHaveLength(2);
  });
});

describe("a required slug in no bundle", () => {
  const UNKNOWN = "some-future-document";

  it("gets a row of its own, as the slug itself and with no link", () => {
    const { container } = render(
      <SignupPanelView {...panel({ requiredConsentSlugs: [UNKNOWN] })} />,
    );

    // No bundle means no authored sentence and nothing to link to, so the row
    // falls back to the generic sentence with the raw slug above it.
    expect(container.textContent).toContain(UNKNOWN);
    expect(container.textContent).toContain("consents.agree");
    // Never an anchor with nowhere to go: an empty href resolves to the page
    // the reader is already on.
    expect(links(container)).toHaveLength(0);
    expect(checkboxes(container)).toHaveLength(2);
  });

  it("still gates the CTA", () => {
    const { container } = render(
      <SignupPanelView {...panel({ requiredConsentSlugs: [UNKNOWN] })} />,
    );

    // The whole point of the fallback: dropping an unnameable requirement
    // would let the enrolment through without a consent the product legally
    // requires, which is worse than an ugly row.
    expect(cta(container).disabled).toBe(true);
    expect(cta(container).textContent).toBe("ctaAgreeConsent");
  });

  it("keys its tick on the slug, and stands beside a bundle rather than in it", () => {
    const onConsentAgreementChange = vi.fn();
    const { container } = render(
      <SignupPanelView
        {...panel({
          requiredConsentSlugs: [TERMS, PRIVACY, UNKNOWN],
          consentAgreements: new Set([ROBLOX_BUNDLE]),
          onConsentAgreementChange,
        })}
      />,
    );

    // Three rows: the bundle (ticked), the drift slug (not), the rules
    // (ticked) — so the one unticked box is the drift row, and it alone is
    // still holding the button.
    const boxes = checkboxes(container);
    expect(boxes.map((b) => b.checked)).toEqual([true, false, true]);
    expect(cta(container).disabled).toBe(true);

    fireEvent.click(boxes[1]);
    expect(onConsentAgreementChange).toHaveBeenCalledWith(UNKNOWN, true);
  });
});
