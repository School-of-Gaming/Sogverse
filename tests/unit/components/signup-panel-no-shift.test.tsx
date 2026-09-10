import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import {
  SignupPanelView,
  type AuthState,
  type SignupPanelViewProps,
} from "@/components/public/products/signup-panel-view";
import type {
  GamerPhotoConsentType,
  MarketingConsentType,
} from "@/types";
import type { RegistrationState } from "@/components/public/products/derive-registration-state";

/**
 * The signup panel's one absolute rule: **after the countdown reaches zero,
 * nothing in the panel moves.**
 *
 * Two clocks make that hard to hold. The CTA flips from "Ready & waiting" to
 * the live action label on a 1-second countdown inside the panel; the
 * registration *state* is re-derived from a 30-second tick outside it. So for
 * up to 29 seconds a parent is looking at a live button on a panel still being
 * handed `closed_pre` — and when the swap finally lands it must be invisible.
 * Before this, it was not: the seat bar mounted for the first time *above* the
 * button, shoving it down under a cursor that had been parked on it since
 * before the drop.
 *
 * The assertions below are deliberately about DOM node *identity*. A node that
 * is the same object either side of the swap was reconciled in place — it was
 * never unmounted, never re-inserted, and cannot have moved. Comparing rendered
 * markup would pass just as happily on a panel that tore itself down and built
 * an identical one somewhere lower on the page.
 *
 * Translations are stubbed to echo their keys, so nothing here depends on
 * English wording. `rich` echoes the key and then hands it to whatever tag
 * functions the call passed, so the rules row's linked policy name renders as
 * the anchor it really is rather than vanishing from the panel's height.
 */
vi.mock("next-intl", () => {
  type TagFn = (chunks: unknown) => unknown;
  const t = (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key;
  t.rich = (key: string, values?: Record<string, TagFn>) =>
    Object.values(values ?? {}).reduce<unknown>(
      (chunks, tag) => tag(chunks),
      key,
    );
  return { useTranslations: () => t };
});

// Real UUID, hardcoded: the gamer picker hashes it into an identicon, and a
// readable stand-in renders a degenerate one. Never generated at test time —
// the same child has to get the same face on every run.
const GAMER_ID = "e8e14bde-b6f1-4c5b-ab6a-44561d32aabe";

const READY: AuthState = {
  kind: "ready",
  participants: [{ id: GAMER_ID, name: "Oona", age: 10 }],
  gamerCount: 1,
};

// An hour out, so the countdown is genuinely mid-flight at mount.
const OPENS_AT = new Date(Date.now() + 60 * 60 * 1000).toISOString();

const CAPPED = { seatCount: 15, seatsLeft: 13, waitlistEnabled: false } as const;
const UNCAPPED = {
  seatCount: null,
  seatsLeft: null,
  waitlistEnabled: false,
} as const;

function panel(state: RegistrationState): SignupPanelViewProps {
  return {
    productType: "municipality_club",
    forGamers: true,
    state,
    authState: READY,
    pricingOption: { kind: "external" },
    selectedParticipantId: GAMER_ID,
    onSelectParticipant: () => {},
    onAddGamer: () => {},
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
    // No optional photo ask by default, which is what withholds the block —
    // the *enabled* flag no longer does, and the case at the foot of this file
    // is about exactly that.
    gamerPhotoConsentTypes: [],
    gamerPhotoConsentsEnabled: false,
    gamerPhotoConsents: new Set<GamerPhotoConsentType>(),
    onGamerPhotoConsentChange: () => {},
    onSubmit: () => {},
    onJoinWaitlist: () => {},
    currency: "eur",
    locale: "en",
  };
}

/** The seat bar, identified by the role it exposes rather than its markup. */
const seatBar = (c: HTMLElement) => c.querySelector("[role=progressbar]");
/** The countdown's four-cell grid. */
const clock = (c: HTMLElement) => c.querySelector(".grid-cols-4");
/** The CTA — the only button whose label comes from the panel's cta* keys. */
const cta = (c: HTMLElement) =>
  Array.from(c.querySelectorAll("button")).find((b) =>
    b.textContent.startsWith("cta"),
  ) ?? null;

describe("the seat bar is present in every state a product can be signed up on", () => {
  it("draws it before registration opens, on a capped product", () => {
    const { container } = render(
      <SignupPanelView {...panel({ kind: "closed_pre", opensAt: OPENS_AT, ...CAPPED })} />,
    );
    const bar = seatBar(container);
    expect(bar).not.toBeNull();
    // Real availability, not a full track: two places are already comped away.
    expect(bar?.getAttribute("aria-valuenow")).toBe("13");
    expect(bar?.getAttribute("aria-valuemax")).toBe("15");
  });

  it("draws it on a threshold-pending product too", () => {
    const { container } = render(
      <SignupPanelView
        {...panel({
          kind: "pending_thr",
          threshold: 6,
          count: 2,
          seatCount: 20,
          seatsLeft: 18,
          waitlistEnabled: false,
        })}
      />,
    );
    expect(seatBar(container)?.getAttribute("aria-valuenow")).toBe("18");
  });

  it("draws it full-and-waitlisted at the other end of the range", () => {
    const { container } = render(
      <SignupPanelView {...panel({ kind: "full_waitlist", seatCount: 15 })} />,
    );
    expect(seatBar(container)?.getAttribute("aria-valuenow")).toBe("0");
  });

  it("draws nothing at all pre-open when the product has no cap", () => {
    // An uncapped product has no seat story to tell at any point in its life,
    // and inventing one pre-open would be worse than the shift it prevents.
    const { container } = render(
      <SignupPanelView
        {...panel({ kind: "closed_pre", opensAt: OPENS_AT, ...UNCAPPED })}
      />,
    );
    expect(seatBar(container)).toBeNull();
  });
});

describe("the pre-open → open swap is invisible", () => {
  it("keeps every element in the panel body, as the same node in the same order", () => {
    const { container, rerender } = render(
      <SignupPanelView {...panel({ kind: "closed_pre", opensAt: OPENS_AT, ...CAPPED })} />,
    );

    const barBefore = seatBar(container);
    const clockBefore = clock(container);
    const ctaBefore = cta(container);
    expect(barBefore).not.toBeNull();
    expect(clockBefore).not.toBeNull();
    expect(ctaBefore).not.toBeNull();

    // The panel body is whatever holds the countdown — no class-name guessing.
    const body = clockBefore!.parentElement!;
    const childrenBefore = Array.from(body.children);

    // What the 30-second tick does, up to 29 seconds after the drop.
    rerender(<SignupPanelView {...panel({ kind: "open", ...CAPPED })} />);

    expect(seatBar(container)).toBe(barBefore);
    expect(cta(container)).toBe(ctaBefore);
    // The clock outlives its own countdown: the cells stay put and go to `--`.
    expect(clock(container)).toBe(clockBefore);
    // Re-query the body through the live container — asserting on the
    // captured `body` alone would still pass against a detached node if the
    // panel had remounted, which is exactly the failure this test exists to
    // catch.
    const bodyAfter = clock(container)!.parentElement!;
    expect(bodyAfter).toBe(body);
    expect(Array.from(bodyAfter.children)).toEqual(childrenBefore);
  });

  it("holds the countdown slot open even though the open state has no target", () => {
    const { container, rerender } = render(
      <SignupPanelView {...panel({ kind: "closed_pre", opensAt: OPENS_AT, ...CAPPED })} />,
    );
    rerender(<SignupPanelView {...panel({ kind: "open", ...CAPPED })} />);
    const cells = clock(container)?.children;
    expect(cells?.length).toBe(4);
    for (const cell of Array.from(cells ?? [])) {
      expect(cell.textContent).toContain("--");
    }
  });

  it("survives the swap into threshold-pending, which is where a countdown lands when the intake is still short", () => {
    const { container, rerender } = render(
      <SignupPanelView {...panel({ kind: "closed_pre", opensAt: OPENS_AT, ...CAPPED })} />,
    );
    const clockBefore = clock(container);
    const barBefore = seatBar(container);
    rerender(
      <SignupPanelView
        {...panel({
          kind: "pending_thr",
          threshold: 6,
          count: 2,
          ...CAPPED,
        })}
      />,
    );
    expect(clock(container)).toBe(clockBefore);
    expect(seatBar(container)).toBe(barBefore);
  });

  it("gives a page loaded after the doors opened no countdown at all", () => {
    // Nobody is mid-hover on a fresh load, so there is nothing to preserve —
    // and a `--` clock on a product that opened last month is just clutter.
    const { container } = render(
      <SignupPanelView {...panel({ kind: "open", ...CAPPED })} />,
    );
    expect(clock(container)).toBeNull();
    expect(seatBar(container)).not.toBeNull();
  });
});

/**
 * **The photo ask does not arrive with the selection.**
 *
 * It used to: the rows were drawn only once a child was picked, so a parent who
 * had read the whole panel on the way down met a question they had not seen,
 * inserted between the conditions they had just agreed to and the button they
 * were reaching for. A participant switch is a user action, so nothing there
 * broke the layout rule outright — but a question arriving by surprise, in the
 * one section a reader is least able to anticipate from what is above it, is
 * its own defect.
 *
 * So the rows are drawn from the panel's first paint on any product that asks
 * them of a gamer audience, and only their `disabled` state follows the
 * selection. These assertions are about DOM node *identity* for the same reason
 * the swap cases above are: a node that is the same object either side of the
 * change was reconciled in place and cannot have moved.
 */
describe("the photo ask stands before anybody is selected", () => {
  /** Every checkbox on the panel, in the order it is met down the page. */
  const boxes = (c: HTMLElement) => [
    ...c.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
  ];
  /** Rules first, then the photo ask — see the section order in the view. */
  const photoBox = (c: HTMLElement) => boxes(c)[1];

  /** The panel above, plus the one photo ask this product makes. */
  const asking = (
    selectedParticipantId: string | null,
  ): SignupPanelViewProps => ({
    ...panel({ kind: "open", ...CAPPED }),
    selectedParticipantId,
    gamerPhotoConsentTypes: ["lynx_educate"],
    gamerPhotoConsentsEnabled: selectedParticipantId !== null,
  });

  it("draws the row disabled with nobody selected and enables it in place", () => {
    const { container, rerender } = render(
      <SignupPanelView {...asking(null)} />,
    );

    // Present before the parent has picked anyone, and not a target yet.
    expect(boxes(container)).toHaveLength(2);
    const before = photoBox(container);
    expect(before.disabled).toBe(true);
    // The row the box sits in, so the assertion covers the whole thing a
    // reader can see rather than the input alone.
    const rowBefore = before.closest("label");
    expect(rowBefore).not.toBeNull();

    rerender(<SignupPanelView {...asking(GAMER_ID)} />);

    // The same input and the same row, one attribute apart: nothing was
    // inserted, nothing was replaced, so nothing below it moved.
    expect(boxes(container)).toHaveLength(2);
    expect(photoBox(container)).toBe(before);
    expect(photoBox(container).closest("label")).toBe(rowBefore);
    expect(photoBox(container).disabled).toBe(false);
  });

  it("keeps the CTA the same node across that change", () => {
    // The button is what the reader is reaching for when they pick a child,
    // and it sits directly under the section that used to grow.
    const { container, rerender } = render(
      <SignupPanelView {...asking(null)} />,
    );
    const ctaBefore = cta(container);
    rerender(<SignupPanelView {...asking(GAMER_ID)} />);
    expect(cta(container)).toBe(ctaBefore);
  });

  it("draws nothing at all on a product that asks no photo consent", () => {
    // The block's existence still comes off the product read, which is what
    // keeps it absent from first paint on the overwhelming majority of them.
    const { container } = render(
      <SignupPanelView {...panel({ kind: "open", ...CAPPED })} />,
    );
    expect(boxes(container)).toHaveLength(1);
  });

  it("draws nothing on a product with no gamer audience", () => {
    // A parents-only product asks nobody about a child's image, whatever it
    // has stored: there is no gamer audience for the question to be about.
    const { container } = render(
      <SignupPanelView
        {...asking(null)}
        forGamers={false}
        authState={{
          kind: "ready",
          participants: [{ id: GAMER_ID, name: "Marja", age: null, isSelf: true }],
          gamerCount: 0,
        }}
      />,
    );
    expect(boxes(container)).toHaveLength(1);
  });
});
