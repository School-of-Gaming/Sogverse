import { describe, it, expect, vi } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import {
  SignupPanelView,
  type AuthState,
  type SignupPanelViewProps,
  type SignupParticipantChoice,
} from "@/components/public/products/signup-panel-view";
import type { MarketingConsentType } from "@/types";

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
 *
 * `rich` echoes the same way and then hands the result to whatever tag
 * functions the call passed, so a chunk wrapper is actually *invoked* rather
 * than skipped — which is what lets the refusal's "the country carries weight"
 * assertion be about the rendered element instead of about the source.
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
    // No enrolment conditions: the ordinary product, which is what every
    // assertion in this file is about.
    requiredConsentSlugs: [],
    consentAgreements: new Set<string>(),
    onConsentAgreementChange: () => {},
    // No optional marketing ask by default: that is what nearly every
    // product looks like, and the block is absent when the set is empty.
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

/**
 * The blocks the region-lock surfaces render inside.
 *
 * Matched as a whole class token (`~=`) rather than by substring: the edge is
 * `border-info` at its authored value on all three surfaces, and a substring
 * match would also catch a hypothetical `border-info-foreground` while a
 * `.border-info` selector would need escaping the day an opacity modifier came
 * back.
 */
const infoBlocks = (c: HTMLElement) => [
  ...c.querySelectorAll<HTMLElement>('[class~="border-info"]'),
];

/**
 * The info-coloured lucide glyph *anchoring* `block` — the family's shared voice.
 *
 * Position, not presence. An anchor marks the block, so it is a direct child of
 * the block itself (the refusal, whose glyph and sentence are siblings) or of
 * the block's first row (the question's heading, the confirmation's statement
 * line). A `text-info` icon anywhere deeper is something else — and that
 * distinction is the whole point of this helper: a plain subtree count passed on
 * the question while the question had no anchor at all, because it was counting
 * the set-location button's pin.
 */
const anchorGlyphs = (block: HTMLElement) => {
  const rows: Element[] = [block];
  if (block.firstElementChild) rows.push(block.firstElementChild);
  return rows.flatMap((row) =>
    [...row.children].filter(
      (el) =>
        el.tagName === "svg" &&
        (el.getAttribute("class") ?? "").includes("text-info"),
    ),
  );
};

/**
 * Every class token on `el` and on everything inside it, as a set.
 *
 * Tokens rather than a substring search of the markup: `text-primary` is a
 * prefix of `text-primary-foreground`, so `innerHTML.not.toContain` reported a
 * violation for a class that is not the one being forbidden — and it could not
 * see the block's own classes at all.
 */
const classTokens = (el: HTMLElement) => {
  const tokens = new Set<string>();
  for (const node of [el, ...el.querySelectorAll("*")]) {
    for (const token of (node.getAttribute("class") ?? "").split(/\s+/)) {
      if (token) tokens.add(token);
    }
  }
  return tokens;
};

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
    expect(container.textContent).not.toContain("consents.heading");
    expect(container.querySelector("button")).toBeNull();
  });

  it("names the country, in the reader's own language", () => {
    const { container } = render(
      <SignupPanelView {...panel({ regionGate: wrongCountry })} />,
    );
    expect(container.textContent).toContain("regionLock.wrongCountry");
    expect(container.textContent).toContain("Finland");
  });

  it("states it as information, with the country weighted", () => {
    // The treatment is the point of this state, not decoration: a parent who
    // came to buy meets an inert panel, so the one thing left on it has to
    // read as an answer rather than as a page that failed to load. It is the
    // info family (nothing is wrong and nothing is theirs to fix), carried by a
    // full-value edge over a neutral fill, and the country — the single fact
    // they are scanning for — goes through a weighted wrapper.
    //
    // The panel's own type header is weighted too, so the assertion is which
    // weighted element the country landed in rather than that one exists.
    const { container } = render(
      <SignupPanelView {...panel({ regionGate: wrongCountry })} />,
    );
    expect(container.innerHTML).toContain("border-info");
    expect(container.innerHTML).not.toContain("bg-info/");
    const weighted = [...container.querySelectorAll(".font-semibold")].filter(
      (el) => el.textContent.includes("Finland"),
    );
    expect(weighted).toHaveLength(1);
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
    // Between the picker and the consent section, which is the order the CTA
    // names them in.
    const text = container.textContent;
    expect(text.indexOf("regionLock.heading")).toBeGreaterThan(
      text.indexOf("whoAreYouSigningUp"),
    );
    expect(text.indexOf("regionLock.heading")).toBeLessThan(
      text.indexOf("consents.heading"),
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
      text.indexOf("consents.heading"),
    );
  });

  it("keeps the CTA in section order: gamer, then location, then consent", () => {
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

    // Selected but nothing agreed: the location sits above the consent
    // section, so it is the step named.
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
    expect(container.textContent).toContain("consents.heading");
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

/**
 * **The three surfaces are one visual family, and that is a claim worth
 * pinning.**
 *
 * The refusal, the question and the confirmation are one subject told at three
 * moments — this product is a bit different, it wants your attention, nothing
 * is wrong. A parent who meets two of them in one visit (asked for a location,
 * then told it fits) should recognise the second as the same voice as the
 * first, so all three wear the `info` surface, its hairline border and an
 * `info`-coloured glyph anchoring the block. The eligible line in particular
 * used to carry the panel's *action* colour, which said "you can act on this"
 * about the one state that offers nothing to act on.
 *
 * The hue marks the *subject*, not inactionability — the question's block holds
 * a button and wears the same border — so what is pinned per surface is that
 * the anchor sits in anchor position, and that the action colour appears
 * nowhere in the block. A control inside one keeps announcing itself the way
 * every other control on the panel does, from its own affordance.
 *
 * Asserted on the semantic tokens rather than on any literal colour: the point
 * is that the three agree, and that they agree on `info` rather than on
 * `primary`, `warning` or `destructive`.
 */
describe("the info family", () => {
  const surfaces = [
    {
      name: "the refusal",
      regionGate: {
        gate: { kind: "wrong_country" as const, requiredCountry: "FI" },
        onSetLocation: () => {},
      },
      says: "regionLock.wrongCountry",
      // The loud tier: the refusal replaces the form and is the one thing on
      // the panel, so it is the one of the three that fills its surface. The
      // fill is a neutral token — a brand hue mixed down into a ground is no
      // longer that hue, so every surface here says "info" with its edge.
      filled: true,
    },
    {
      name: "the question",
      regionGate: {
        gate: { kind: "no_location" as const },
        onSetLocation: () => {},
      },
      says: "regionLock.note",
      // The quiet tier: a section inside a working form carries the family's
      // hue on its border alone (the EnrollmentCard "awaiting" opacity), so
      // the form stays the loudest thing on its own panel.
      filled: false,
    },
    {
      name: "the confirmation",
      regionGate: eligible,
      says: "regionLock.eligible",
      filled: false,
    },
  ];

  for (const { name, regionGate, says, filled } of surfaces) {
    it(`marks ${name} as information, anchored by an info-coloured glyph`, () => {
      const { container } = render(
        <SignupPanelView {...panel({ regionGate })} />,
      );
      const blocks = infoBlocks(container);
      // Exactly one: a state says its piece in a single block, and a second
      // info-marked box in the same panel would be two voices where there is
      // one.
      expect(blocks).toHaveLength(1);
      const block = blocks[0];
      expect(block.textContent).toContain(says);
      // One edge value across all three: the family's hue at the value the
      // palette authors it at, never mixed toward the panel behind it.
      expect(classTokens(block)).toContain("border-info");
      // Volume follows stakes: only the refusal fills its surface, and it fills
      // it with a neutral.
      expect([...classTokens(block)].includes("bg-muted")).toBe(filled);
      // No surface carries a shaded version of the family hue anywhere.
      expect(block.className).not.toMatch(/(bg|border|text)-info\//);
      // One anchor, and in anchor position — see `anchorGlyphs`.
      expect(anchorGlyphs(block)).toHaveLength(1);
      // Never the action colour, never an alarm colour: nothing here has gone
      // wrong, and the hue marks the subject rather than a control. Asserted as
      // exact class tokens, so a `text-primary-foreground` on a control inside
      // the block is not mistaken for the action colour on the block.
      const tokens = classTokens(block);
      for (const forbidden of [
        "text-primary",
        "text-destructive",
        "text-warning",
      ]) {
        expect(tokens).not.toContain(forbidden);
      }
    });
  }

  it("agrees on the family's shared tokens across all three", () => {
    const shared = surfaces.map(({ regionGate }) => {
      const { container } = render(
        <SignupPanelView {...panel({ regionGate })} />,
      );
      const block = infoBlocks(container)[0];
      return new Set(block.className.split(/\s+/));
    });
    // One family, one geometry, one hue — the tiers differ only in volume,
    // which the per-surface cases above pin.
    for (const tokens of shared) {
      for (const token of ["rounded-md", "border", "p-4"]) {
        expect(tokens).toContain(token);
      }
      expect(tokens).toContain("border-info");
    }
  });

  it("puts the question's own words at full weight, not in the margin", () => {
    // The note is the message, not a footnote to it: a grey line inside a
    // tinted block reads as something the panel is mumbling.
    const { container } = render(
      <SignupPanelView
        {...panel({
          regionGate: { gate: { kind: "no_location" }, onSetLocation: () => {} },
        })}
      />,
    );
    // The block's first paragraph is the note: the heading above it is an h3
    // and the affordance below it is a button.
    const note = infoBlocks(container)[0].querySelector("p");
    expect(note?.className).toContain("text-foreground");
    expect(note?.className).not.toContain("text-muted-foreground");
  });

  it("leaves the confirmation's receipt line quiet beneath it", () => {
    // The sentence is the statement; the place name under it is a receipt, and
    // a receipt that competes with what it is receipting has the weights the
    // wrong way round.
    const { container } = render(
      <SignupPanelView {...panel({ regionGate: eligible })} />,
    );
    // Two paragraphs, in the order they are read: the statement, then the
    // receipt beneath it.
    const [statement, receipt] =
      infoBlocks(container)[0].querySelectorAll("p");
    expect(statement.textContent).toContain("regionLock.eligible");
    expect(receipt.textContent).toContain("regionLock.eligibleLocation");
    expect(receipt.className).toContain("text-muted-foreground");
  });
});
