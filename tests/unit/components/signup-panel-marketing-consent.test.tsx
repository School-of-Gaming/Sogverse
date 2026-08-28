import { describe, it, expect, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import {
  SignupPanelView,
  type AuthState,
  type SignupPanelViewProps,
  type SignupParticipantChoice,
} from "@/components/public/products/signup-panel-view";
import { LYNX_EDUCATE_URL } from "@/lib/constants/marketing-consents";
import type { MarketingConsentType } from "@/types";

/**
 * **The panel's optional marketing ask.**
 *
 * A product may carry a partner's marketing consent, and the panel puts the
 * question to the parent on the way past. Everything worth pinning here is
 * about the line between this box and the ones above it, because a parent who
 * believed this one was required would be handing over their address to get a
 * seat they could have had anyway:
 *
 *   * it exists only on a product that asks, and nothing is reserved for it;
 *   * it is the LAST thing before the button and stands outside the Required
 *     consent section, rather than being a row inside it;
 *   * it never gates the CTA, in either direction;
 *   * it names the partner as a link, in a new tab, so a parent can go and see
 *     who they are being asked about without losing a half-filled form.
 *
 * The panel is presentational, so this drives it with props — no mutation, no
 * query client, no router. Translations echo their keys, so nothing here
 * depends on English wording.
 */
vi.mock("next-intl", async () => {
  const { createElement, Fragment } = await import("react");
  type TagFn = (chunks: unknown) => import("react").ReactNode;
  type PlainValue = string | number;
  const echo = (key: string, values?: Record<string, PlainValue>) =>
    values ? `${key}:${JSON.stringify(values)}` : key;
  const t = (key: string, values?: Record<string, PlainValue>) =>
    echo(key, values);
  // Each named tag wraps its own name, side by side after the echoed key —
  // the same shape the consents test uses, so a sentence with one `<link>` tag
  // renders exactly one anchor.
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
// stand-in renders a degenerate one.
const CHILD: SignupParticipantChoice = {
  id: "0a4e3f21-6c8d-4f0b-9a17-2b5e8c1d4f60",
  name: "Aino",
  age: 11,
};

const LYNX: MarketingConsentType = "lynx_educate";
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
    // Ticked unless a case says otherwise, so "the optional box is what is left
    // unticked" is a real assertion rather than a tie with the rules row.
    agreed: true,
    onAgreedChange: () => {},
    requiredConsentSlugs: [],
    consentAgreements: new Set<string>(),
    onConsentAgreementChange: () => {},
    marketingConsentTypes: [],
    marketingConsents: new Set<MarketingConsentType>(),
    onMarketingConsentChange: () => {},
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

/** Every checkbox in the panel, in DOM order: consents first, marketing last. */
const checkboxes = (c: HTMLElement) => [
  ...c.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
];

/** Every clickable box in the panel — a `<label>` holding a checkbox. */
const rows = (c: HTMLElement) => [
  ...c.querySelectorAll<HTMLElement>("label:has(input)"),
];

const asking = (overrides: Partial<SignupPanelViewProps> = {}) =>
  panel({ marketingConsentTypes: [LYNX], ...overrides });

describe("a product that asks for no marketing", () => {
  it("renders no optional box at all", () => {
    const { container } = render(<SignupPanelView {...panel()} />);

    // Nothing is held open for a question this product does not ask: the ask
    // set arrives with the product read, so there is no late arrival to
    // reserve room for.
    expect(container.textContent).not.toContain("marketing");
    // The one checkbox is the rules row.
    expect(checkboxes(container)).toHaveLength(1);
  });
});

describe("a product that asks for a partner's marketing", () => {
  it("renders the box, its sentence and its optional hint", () => {
    const { container } = render(<SignupPanelView {...asking()} />);

    expect(container.textContent).toContain("lynxEducate");
    // The hint is what says "optional" in the panel's own words, and it is
    // rendered beside the sentence rather than left to the box's styling.
    expect(container.textContent).toContain("hint");
    expect(checkboxes(container)).toHaveLength(2);
  });

  it("puts it last, below the Required consent section", () => {
    const { container } = render(
      <SignupPanelView
        {...asking({
          requiredConsentSlugs: [TERMS, PRIVACY],
          consentAgreements: new Set([ROBLOX_BUNDLE]),
        })}
      />,
    );

    // Three boxes: the bundle, our rules, then the optional ask. The optional
    // one is last because it is not part of the act the CTA names — a row
    // inside that section which did not gate the button would be a box the
    // reader cannot tell from the ones that do.
    const boxes = checkboxes(container);
    expect(boxes).toHaveLength(3);
    expect(boxes[2].checked).toBe(false);
    // And it is not inside the required rows' bordered boxes: it is its own
    // row, the last one in the panel.
    expect(rows(container)).toHaveLength(3);
    expect(rows(container)[2].contains(boxes[2])).toBe(true);
  });

  it("marks only the ask — the gates carry no chip at all", () => {
    const { container } = render(
      <SignupPanelView
        {...asking({
          requiredConsentSlugs: [TERMS, PRIVACY],
          consentAgreements: new Set([ROBLOX_BUNDLE]),
        })}
      />,
    );

    // **One marked exception among unmarked defaults.** Every consent row is
    // the same bordered control — the border marks the click target, not the
    // stakes — so this single word is all a parent has to tell the partner's
    // mailing list from the two rows holding the button. Chipping the gates too
    // was tried and made a column of repeated words that wrapped badly at rail
    // width; a gate is the ordinary thing to find here, so it goes unmarked.
    const [bundle, rules, marketing] = rows(container);
    expect(bundle.textContent).not.toContain("optional");
    expect(rules.textContent).not.toContain("optional");
    expect(marketing.textContent).toContain("optional");
    // Nothing anywhere in the panel claims "required" any more — the heading
    // dropped the word when the chip took over the job.
    expect(container.textContent).not.toContain("required");
  });

  it("announces the Optional chip, so the distinction is not screen-only", () => {
    const { container } = render(<SignupPanelView {...asking()} />);

    // The chip is the whole distinction, so a chip nobody reads out is a
    // distinction a screen-reader user does not have. It rides in the box's
    // `aria-describedby` beside the hint.
    const box = checkboxes(container)[1];
    const described = (box.getAttribute("aria-describedby") ?? "")
      .split(" ")
      .filter(Boolean)
      .map((id) => document.getElementById(id)?.textContent ?? "")
      .join(" ");
    expect(described).toContain("optional");
    expect(described).toContain("hint");
  });

  it("names the partner as a link, in a new tab", () => {
    const { container } = render(<SignupPanelView {...asking()} />);

    // Scoped to the optional row: a parent asked to hand their address to
    // somebody has to be able to look at who that somebody is, and the panel
    // behind them is holding a half-filled form that must survive the reading.
    const anchors = [...rows(container)[1].querySelectorAll("a")];
    expect(anchors.map((a) => a.getAttribute("href"))).toEqual([
      LYNX_EDUCATE_URL,
    ]);
    expect(anchors[0].getAttribute("target")).toBe("_blank");
    // Both tokens: `noopener` is the security half, `noreferrer` the one older
    // engines need to get it.
    expect(anchors[0].getAttribute("rel")).toContain("noopener");
    expect(anchors[0].getAttribute("rel")).toContain("noreferrer");
  });

  it("reports its own consent type when ticked", () => {
    const onMarketingConsentChange = vi.fn();
    const { container } = render(
      <SignupPanelView {...asking({ onMarketingConsentChange })} />,
    );

    fireEvent.click(checkboxes(container)[1]);

    expect(onMarketingConsentChange).toHaveBeenCalledWith(LYNX, true);
  });

  it("reports a withdrawal when a ticked box is unticked", () => {
    const onMarketingConsentChange = vi.fn();
    const { container } = render(
      <SignupPanelView
        {...asking({
          marketingConsents: new Set([LYNX]),
          onMarketingConsentChange,
        })}
      />,
    );

    // An untick is an answer, not the absence of one — that is the whole point
    // of a revocable consent, and the box has to be able to say so.
    expect(checkboxes(container)[1].checked).toBe(true);
    fireEvent.click(checkboxes(container)[1]);
    expect(onMarketingConsentChange).toHaveBeenCalledWith(LYNX, false);
  });
});

/**
 * **The line that matters most.** A required consent holds the button; this one
 * must not, in either direction — not by disabling it while unticked, and not
 * by appearing in the checklist the disabled label walks through.
 */
describe("the optional ask never gates the CTA", () => {
  it("leaves the button live with the box unticked", () => {
    const onSubmit = vi.fn();
    const { container } = render(<SignupPanelView {...asking({ onSubmit })} />);

    expect(checkboxes(container)[1].checked).toBe(false);
    expect(cta(container).disabled).toBe(false);
    expect(cta(container).textContent).toContain("ctaActive");
    fireEvent.click(cta(container));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it("leaves the button live on the waitlist door too", () => {
    const onJoinWaitlist = vi.fn();
    const { container } = render(
      <SignupPanelView
        {...asking({
          state: { kind: "full_waitlist", seatCount: 8 },
          onJoinWaitlist,
        })}
      />,
    );

    expect(cta(container).disabled).toBe(false);
    fireEvent.click(cta(container));
    expect(onJoinWaitlist).toHaveBeenCalledTimes(1);
  });

  it("still lets the REQUIRED rows hold the button, with the optional one ticked", () => {
    const { container } = render(
      <SignupPanelView
        {...asking({
          requiredConsentSlugs: [TERMS, PRIVACY],
          marketingConsents: new Set([LYNX]),
        })}
      />,
    );

    // The converse of the case above, and the reason both are here: granting
    // the optional consent must not buy a parent past a condition, any more
    // than declining it may cost them a seat.
    expect(cta(container).disabled).toBe(true);
    expect(cta(container).textContent).toBe("ctaAgreeConsent");
  });
});
