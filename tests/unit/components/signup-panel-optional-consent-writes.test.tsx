import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render } from "@testing-library/react";
import type { GamerPhotoConsentType, MarketingConsentType } from "@/types";

/**
 * **What the panel does with the two optional answers a parent gives it.**
 *
 * The view's half — that the boxes exist, sit last, and never gate the CTA — is
 * pinned in `signup-panel-marketing-consent`. This is the other half, and it is
 * where the optional asks come furthest from the required ones:
 *
 *   * **every optional box starts unticked, on every enrolment**, and no read is
 *     made to seed one. The marketing box used to be seeded from the parent's
 *     account; it is not any more, because a box we ticked for a parent is the
 *     platform answering a question it is putting to them;
 *   * **every box that was asked is written at the click**, whatever its value —
 *     an untouched box is a "no" the parent looked at, not the absence of an
 *     answer, so "send only what changed" would drop the commonest answer on
 *     the panel;
 *   * both writes carry `source: 'enrolment'`, and both go out on **both**
 *     doors;
 *   * the photo answer additionally carries the **child it is about**, is asked
 *     only when the seat is a child's, and does not survive the parent
 *     selecting a different child;
 *   * and all of it is **fire-and-forget**: a rejected write must not stop,
 *     delay or fail the enrolment.
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

const setMarketingMutate = vi.fn();
const setPhotoMutate = vi.fn();

// **No account read is mocked here, and that is an assertion in itself.** The
// panel used to call `useMyMarketingConsents` to seed its boxes; a module mock
// that no longer exports it would fail loudly if that call came back, because
// the hook is a real React Query call and there is no QueryClientProvider
// around these renders.
vi.mock("@/services/marketing-consents", () => ({
  useSetMarketingConsent: () => ({ mutate: setMarketingMutate }),
}));

vi.mock("@/services/gamer-photo-consents", () => ({
  useSetGamerPhotoConsent: () => ({ mutate: setPhotoMutate }),
}));

import { SignupPanel } from "@/components/public/products/signup-panel";
import type { AuthState } from "@/components/public/products/signup-panel-view";

const PRODUCT_ID = "7c9e1f42-3a55-4c8e-b1d6-9f0a2e4c7b83";
const CHILD_ID = "0a4e3f21-6c8d-4f0b-9a17-2b5e8c1d4f60";
const SIBLING_ID = "3f8b6d10-4e27-4a93-8c05-7d1a9b2e6c44";
const PARENT_ID = "11111111-1111-4111-8111-111111111111";
const LYNX_MARKETING: MarketingConsentType = "lynx_educate";
const LYNX_PHOTO: GamerPhotoConsentType = "lynx_educate";

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

/** Two children, so the panel has a switch to make. */
const AUTH_TWO_CHILDREN: AuthState = {
  kind: "ready",
  participants: [
    { id: CHILD_ID, name: "Aino", age: 11 },
    { id: SIBLING_ID, name: "Ville", age: 9 },
  ],
  gamerCount: 2,
};

/**
 * A product whose audience admits adults, with the parent's own row preselected
 * — the one state in which the photo question is not asked at all.
 */
const AUTH_SELF_SEAT: AuthState = {
  kind: "ready",
  participants: [{ id: PARENT_ID, name: "Sanna", age: null, isSelf: true }],
  gamerCount: 0,
};

const OPEN = {
  kind: "open",
  seatCount: null,
  seatsLeft: null,
  waitlistEnabled: false,
} as const;

function panel({
  state = OPEN,
  authState = AUTH,
}: {
  state?: React.ComponentProps<typeof SignupPanel>["state"];
  authState?: AuthState;
} = {}) {
  return (
    <SignupPanel
      product={PRODUCT}
      requiredConsentSlugs={[]}
      marketingConsentTypes={[LYNX_MARKETING]}
      gamerPhotoConsentTypes={[LYNX_PHOTO]}
      state={state}
      authState={authState}
      regionGate={{ kind: "unlocked" }}
      homeLocationName={null}
      onLocationConfirmed={() => {}}
    />
  );
}

const boxes = (c: HTMLElement) => [
  ...c.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
];
/**
 * The panel's checkbox order on a product that requires no documents: our
 * rules, then the photo ask, then the marketing ask — which is the order a
 * parent meets them down the panel.
 */
const rulesBox = (c: HTMLElement) => boxes(c)[0];
const photoBox = (c: HTMLElement) => boxes(c)[1];
const marketingBox = (c: HTMLElement) => boxes(c)[boxes(c).length - 1];
const participantRows = (c: HTMLElement) => [
  ...c.querySelectorAll<HTMLButtonElement>('[role="radio"]'),
];
const cta = (c: HTMLElement) => {
  const buttons = [...c.querySelectorAll("button")];
  return buttons[buttons.length - 1];
};

/** Everything the CTA actually needs: our rules, ticked. */
function agreeToTheRules(container: HTMLElement) {
  fireEvent.click(rulesBox(container));
}

/** The single call each writer got, as its variables object. */
const onlyCall = (mock: typeof setPhotoMutate) => mock.mock.calls[0][0];

beforeEach(() => {
  createMutate.mockReset();
  waitlistMutate.mockReset();
  setMarketingMutate.mockReset();
  setPhotoMutate.mockReset();
});

describe("every optional box starts unticked", () => {
  it("draws both asks empty on a panel nobody has touched", () => {
    // The rule that replaced seeding, and the reason for it: a ticked box a
    // parent did not tick is us answering a question we are asking them.
    const { container } = render(panel());

    expect(boxes(container)).toHaveLength(3);
    expect(photoBox(container).checked).toBe(false);
    expect(marketingBox(container).checked).toBe(false);
  });
});

describe("what submitting sends", () => {
  it("answers every asked box, including the ones nobody touched", () => {
    const { container } = render(panel());

    agreeToTheRules(container);
    fireEvent.click(cta(container));

    // The commonest case on the panel, and the one the old change-only rule
    // dropped: two boxes left alone are two "no"s the parent looked at.
    expect(createMutate).toHaveBeenCalledTimes(1);
    expect(onlyCall(setMarketingMutate)).toEqual({
      consentType: LYNX_MARKETING,
      granted: false,
      source: "enrolment",
    });
    expect(onlyCall(setPhotoMutate)).toEqual({
      gamerId: CHILD_ID,
      consentType: LYNX_PHOTO,
      granted: false,
      source: "enrolment",
    });
  });

  it("sends both grants when both boxes are ticked", () => {
    const { container } = render(panel());

    fireEvent.click(photoBox(container));
    fireEvent.click(marketingBox(container));
    agreeToTheRules(container);
    fireEvent.click(cta(container));

    expect(onlyCall(setMarketingMutate)).toMatchObject({ granted: true });
    // The `gamerId` is the one field on the stored photo answer that nothing
    // else can corroborate: the consent is about a particular child, and the
    // selected participant is who it was given about.
    expect(onlyCall(setPhotoMutate)).toEqual({
      gamerId: CHILD_ID,
      consentType: LYNX_PHOTO,
      granted: true,
      source: "enrolment",
    });
  });

  it("sends them on the waitlist door too", () => {
    const { container } = render(
      panel({ state: { kind: "full_waitlist", seatCount: 8 } }),
    );

    fireEvent.click(photoBox(container));
    agreeToTheRules(container);
    fireEvent.click(cta(container));

    // The parent answered one panel; which button they pressed must not decide
    // whether their answers were recorded.
    expect(waitlistMutate).toHaveBeenCalledTimes(1);
    expect(setMarketingMutate).toHaveBeenCalledTimes(1);
    expect(onlyCall(setPhotoMutate)).toMatchObject({
      gamerId: CHILD_ID,
      granted: true,
      source: "enrolment",
    });
  });
});

describe("the photo question is about one particular child", () => {
  it("is not answerable when the parent takes the seat themselves", () => {
    // A consent about a gamer's image cannot be given about the adult giving
    // it, and there is no gamer row for the answer to be keyed to.
    const { container } = render(panel({ authState: AUTH_SELF_SEAT }));

    // The row is **on screen and disabled**, not withheld. It used to be
    // withheld — this assertion read `toHaveLength(2)` — and the question then
    // appeared out of nowhere the moment a child was picked, between the
    // conditions the parent had just agreed to and the button they were
    // reaching for. The product asks it, so it is drawn; what the selection
    // decides is only whether it can be ticked.
    expect(boxes(container)).toHaveLength(3);
    expect(photoBox(container).disabled).toBe(true);

    agreeToTheRules(container);
    fireEvent.click(cta(container));

    expect(createMutate).toHaveBeenCalledTimes(1);
    expect(setMarketingMutate).toHaveBeenCalledTimes(1);
    expect(setPhotoMutate).not.toHaveBeenCalled();
  });

  it("forgets a tick when the parent switches to a sibling", () => {
    const { container } = render(panel({ authState: AUTH_TWO_CHILDREN }));

    fireEvent.click(photoBox(container));
    expect(photoBox(container).checked).toBe(true);

    // Ville is not Aino. Carrying the tick across would record a permission for
    // a child nobody gave it for.
    fireEvent.click(participantRows(container)[1]);
    expect(photoBox(container).checked).toBe(false);

    agreeToTheRules(container);
    fireEvent.click(cta(container));

    expect(onlyCall(setPhotoMutate)).toMatchObject({
      gamerId: SIBLING_ID,
      granted: false,
    });
  });

  it("keeps the marketing answer across the same switch", () => {
    // The marketing answer is about the *parent's* mailbox, so which child is
    // selected has nothing to say about it — the reset is a property of the
    // photo answer alone, not of the picker.
    const { container } = render(panel({ authState: AUTH_TWO_CHILDREN }));

    fireEvent.click(marketingBox(container));
    fireEvent.click(participantRows(container)[1]);

    expect(marketingBox(container).checked).toBe(true);
  });
});

describe("the writes never get in the enrolment's way", () => {
  it("enrols anyway when both consent writes fail", () => {
    const explode = (
      _variables: unknown,
      options?: { onError?: (error: unknown) => void },
    ) => {
      options?.onError?.(new Error("consent write exploded"));
    };
    setMarketingMutate.mockImplementation(explode);
    setPhotoMutate.mockImplementation(explode);
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});

    const { container } = render(panel());
    fireEvent.click(photoBox(container));
    fireEvent.click(marketingBox(container));
    agreeToTheRules(container);
    fireEvent.click(cta(container));

    // A parent who came to buy a seat must never be told their purchase failed
    // because a mailing-list preference or a photo permission did. Both
    // failures are logged and dropped; the enrolment goes out regardless, and
    // no error is shown beside the CTA.
    expect(createMutate).toHaveBeenCalledTimes(1);
    expect(logged).toHaveBeenCalledTimes(2);
    expect(container.querySelector('[role="alert"]')).toBeNull();
    logged.mockRestore();
  });
});
