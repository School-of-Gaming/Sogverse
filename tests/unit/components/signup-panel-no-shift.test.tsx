import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import {
  SignupPanelView,
  type AuthState,
  type SignupPanelViewProps,
} from "@/components/public/products/signup-panel-view";
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
 * English wording.
 */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));

// Real UUID, hardcoded: the gamer picker hashes it into an identicon, and a
// readable stand-in renders a degenerate one. Never generated at test time —
// the same child has to get the same face on every run.
const GAMER_ID = "e8e14bde-b6f1-4c5b-ab6a-44561d32aabe";

const READY: AuthState = {
  kind: "ready",
  gamers: [{ id: GAMER_ID, name: "Oona", age: 10 }],
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
    state,
    authState: READY,
    pricingOption: { kind: "external" },
    selectedGamerId: GAMER_ID,
    onSelectGamer: () => {},
    onAddGamer: () => {},
    agreed: true,
    onAgreedChange: () => {},
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
    expect(Array.from(body.children)).toEqual(childrenBefore);
    expect(body.parentElement).not.toBeNull();
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
