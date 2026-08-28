import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import type { MarketingConsent, MarketingConsentType } from "@/types";

/**
 * **What the panel does with a parent's account-level marketing answer.**
 *
 * The view's half — that the box exists, sits last, and never gates the CTA —
 * is pinned in `signup-panel-marketing-consent`. This is the other half, and it
 * is where the two consent systems come furthest apart:
 *
 *   * the box is **seeded** from the account, because a marketing consent is a
 *     single present-tense state rather than a per-enrolment event, and showing
 *     `false` to a parent who is opted in would invite them to "fix" it into a
 *     withdrawal;
 *   * the seed arrives a round trip after first paint, so **a reader's own edit
 *     outranks an answer that lands after it**;
 *   * a write goes out **only when the box now differs from the account**, with
 *     `source: 'enrolment'`, on **both** doors;
 *   * and it is **fire-and-forget**: a rejected write must not stop, delay or
 *     fail the enrolment.
 */
vi.mock("next-intl", async () => {
  const { createElement, Fragment } = await import("react");
  type TagFn = (chunks: unknown) => import("react").ReactNode;
  type PlainValue = string | number;
  const echo = (key: string, values?: Record<string, PlainValue>) =>
    values ? `${key}:${JSON.stringify(values)}` : key;
  const t = (key: string, values?: Record<string, PlainValue>) =>
    echo(key, values);
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
  return { useTranslations: () => t, useLocale: () => "en" };
});

vi.mock("@/providers", () => ({
  useNow: () => new Date("2026-01-05T12:00:00Z"),
  useTimezone: () => "Europe/Helsinki",
}));

vi.mock("@/providers/auth-provider", () => ({
  useAuth: () => ({
    user: { id: "11111111-1111-4111-8111-111111111111" },
    refreshProfile: () => {},
  }),
}));

// Two dialogs the adapter owns, neither of which has anything to do with this.
vi.mock("@/components/family", () => ({ AddGamerDialog: () => null }));
vi.mock(
  "@/components/public/products/region-lock/set-location-dialog",
  () => ({ SetLocationDialog: () => null }),
);

const createMutate = vi.fn();
const waitlistMutate = vi.fn();

vi.mock("@/services/participations", () => ({
  useCreateParticipation: () => ({ mutate: createMutate }),
  useJoinWaitlist: () => ({ mutate: waitlistMutate }),
}));

vi.mock("@/services/users", () => ({
  useUpdateProfile: () => ({ mutateAsync: vi.fn() }),
}));

/**
 * The account read, driven per test. `undefined` is "the read has not answered
 * yet", which is a different state from an empty array — the panel treats the
 * first as unknown and the second as "never asked or never answered".
 */
let accountConsents: MarketingConsent[] | undefined;
const setConsentMutate = vi.fn();

vi.mock("@/services/marketing-consents", () => ({
  useMyMarketingConsents: () => ({ data: accountConsents }),
  useSetMarketingConsent: () => ({ mutate: setConsentMutate }),
}));

import { SignupPanel } from "@/components/public/products/signup-panel";
import type { AuthState } from "@/components/public/products/signup-panel-view";

const PRODUCT_ID = "7c9e1f42-3a55-4c8e-b1d6-9f0a2e4c7b83";
const CHILD_ID = "0a4e3f21-6c8d-4f0b-9a17-2b5e8c1d4f60";
const CUSTOMER_ID = "11111111-1111-4111-8111-111111111111";
const LYNX: MarketingConsentType = "lynx_educate";

const PRODUCT = {
  id: PRODUCT_ID,
  product_type: "consumer_club" as const,
  billing_mode: "free" as const,
  product_prices: [],
  for_gamers: true,
  start_date: null,
  timezone: "Europe/Helsinki",
};

const AUTH: AuthState = {
  kind: "ready",
  participants: [{ id: CHILD_ID, name: "Aino", age: 11 }],
  gamerCount: 1,
};

const OPEN = {
  kind: "open",
  seatCount: null,
  seatsLeft: null,
  waitlistEnabled: false,
} as const;

/** One row of the account's stored answers. */
function storedConsent(granted: boolean): MarketingConsent {
  return {
    customer_id: CUSTOMER_ID,
    consent_type: LYNX,
    granted,
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

function panel(
  state: React.ComponentProps<typeof SignupPanel>["state"] = OPEN,
) {
  return (
    <SignupPanel
      product={PRODUCT}
      requiredConsentSlugs={[]}
      marketingConsentTypes={[LYNX]}
      state={state}
      authState={AUTH}
      regionGate={{ kind: "unlocked" }}
      homeLocationName={null}
      onLocationConfirmed={() => {}}
    />
  );
}

const boxes = (c: HTMLElement) => [
  ...c.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
];
/** Our rules — first box on a product that requires no documents. */
const rulesBox = (c: HTMLElement) => boxes(c)[0];
/** The optional marketing ask — always the last box in the panel. */
const marketingBox = (c: HTMLElement) => boxes(c)[boxes(c).length - 1];
const cta = (c: HTMLElement) => {
  const buttons = [...c.querySelectorAll("button")];
  return buttons[buttons.length - 1];
};

/** Everything the CTA actually needs: our rules, ticked. */
function agreeToTheRules(container: HTMLElement) {
  fireEvent.click(rulesBox(container));
}

beforeEach(() => {
  createMutate.mockReset();
  waitlistMutate.mockReset();
  setConsentMutate.mockReset();
  accountConsents = undefined;
});

describe("the box is seeded from the account", () => {
  it("ticks for a consent the parent has granted", () => {
    accountConsents = [storedConsent(true)];
    const { container } = render(panel());

    expect(marketingBox(container).checked).toBe(true);
  });

  it("leaves it unticked for a consent they have declined", () => {
    accountConsents = [storedConsent(false)];
    const { container } = render(panel());

    expect(marketingBox(container).checked).toBe(false);
  });

  it("leaves it unticked when the account has no row at all", () => {
    // An absent row means never asked or never answered. Both mean "do not
    // mail", so both draw the same empty box.
    accountConsents = [];
    const { container } = render(panel());

    expect(marketingBox(container).checked).toBe(false);
  });

  it("draws the box before the read has answered", () => {
    // The seed arrives a round trip after first paint, and the box must not
    // wait for it: its existence comes off the product, so only the tick is
    // allowed to change later. Nothing moves when the answer lands.
    const { container } = render(panel());

    expect(marketingBox(container)).toBeDefined();
    expect(marketingBox(container).checked).toBe(false);
  });
});

describe("a reader's own edit outranks a late seed", () => {
  it("keeps a tick made before the read answered", () => {
    const { container, rerender } = render(panel());
    fireEvent.click(marketingBox(container));
    expect(marketingBox(container).checked).toBe(true);

    // The answer lands, and agrees with them. Nothing to send, and nothing
    // moves on screen.
    accountConsents = [storedConsent(true)];
    rerender(panel());

    expect(marketingBox(container).checked).toBe(true);
    agreeToTheRules(container);
    fireEvent.click(cta(container));
    expect(setConsentMutate).not.toHaveBeenCalled();
  });

  it("keeps an untick against an answer that arrives again", () => {
    // The case that bites: the read lands granted, the parent unticks, and a
    // refetch re-delivers the row that is still on file. Their withdrawal must
    // survive it — otherwise the box springs back under them and the write they
    // were about to make is silently undone.
    accountConsents = [storedConsent(true)];
    const { container, rerender } = render(panel());
    expect(marketingBox(container).checked).toBe(true);

    fireEvent.click(marketingBox(container));
    accountConsents = [storedConsent(true)];
    rerender(panel());

    expect(marketingBox(container).checked).toBe(false);
  });
});

describe("what submitting sends", () => {
  it("sends nothing when the box was not touched", () => {
    accountConsents = [storedConsent(true)];
    const { container } = render(panel());

    agreeToTheRules(container);
    fireEvent.click(cta(container));

    // The ordinary case, and the reason it is silent: the RPC is idempotent,
    // but its event log records CHANGES, so a page load must not become one.
    expect(createMutate).toHaveBeenCalledTimes(1);
    expect(setConsentMutate).not.toHaveBeenCalled();
  });

  it("sends the grant, with the enrolment source, when the box is ticked", () => {
    accountConsents = [];
    const { container } = render(panel());

    fireEvent.click(marketingBox(container));
    agreeToTheRules(container);
    fireEvent.click(cta(container));

    expect(setConsentMutate).toHaveBeenCalledTimes(1);
    expect(setConsentMutate.mock.calls[0][0]).toEqual({
      consentType: LYNX,
      granted: true,
      // The one field on the stored event that nothing else can corroborate,
      // and the reason the RPC accepts only the two sources a signed-in caller
      // can legitimately be on.
      source: "enrolment",
    });
  });

  it("sends the withdrawal when a granted box is unticked", () => {
    accountConsents = [storedConsent(true)];
    const { container } = render(panel());

    fireEvent.click(marketingBox(container));
    agreeToTheRules(container);
    fireEvent.click(cta(container));

    // Un-ticking and submitting IS a withdrawal, and it is recorded as one —
    // which is the whole difference between this system and the non-revocable
    // enrolment conditions above it on the panel.
    expect(setConsentMutate.mock.calls[0][0]).toEqual({
      consentType: LYNX,
      granted: false,
      source: "enrolment",
    });
  });

  it("sends it on the waitlist door too", () => {
    accountConsents = [];
    const { container } = render(
      panel({ kind: "full_waitlist", seatCount: 8 }),
    );

    fireEvent.click(marketingBox(container));
    agreeToTheRules(container);
    fireEvent.click(cta(container));

    // The parent answered one panel; which button they pressed must not decide
    // whether their answer was recorded.
    expect(waitlistMutate).toHaveBeenCalledTimes(1);
    expect(setConsentMutate).toHaveBeenCalledTimes(1);
    expect(setConsentMutate.mock.calls[0][0]).toMatchObject({
      granted: true,
      source: "enrolment",
    });
  });
});

describe("the write never gets in the enrolment's way", () => {
  it("enrols anyway when the consent write fails", () => {
    accountConsents = [];
    setConsentMutate.mockImplementation(
      (
        _variables: unknown,
        options?: { onError?: (error: unknown) => void },
      ) => {
        options?.onError?.(new Error("consent write exploded"));
      },
    );
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const { container } = render(panel());
    fireEvent.click(marketingBox(container));
    agreeToTheRules(container);
    fireEvent.click(cta(container));

    // A parent who came to buy a seat must never be told their purchase failed
    // because a mailing-list preference did. The failure is logged and dropped;
    // the enrolment goes out regardless, and no error is shown beside the CTA.
    expect(createMutate).toHaveBeenCalledTimes(1);
    expect(logged).toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')).toBeNull();
    logged.mockRestore();
  });
});
