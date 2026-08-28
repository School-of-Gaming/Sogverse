import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render } from "@testing-library/react";

/**
 * **What the panel actually sends once the boxes are ticked.**
 *
 * The gate itself is tested against the view (`signup-panel-consents`); this is
 * the other half — that the adapter turns the ticked set into the field the
 * enrolment routes read, on both doors. Both are worth pinning separately: a
 * CTA that unlocks while the request goes out empty would leave the database
 * refusing an enrolment the parent had every reason to think they had
 * completed.
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

// The two dialogs the adapter owns. Neither has anything to do with consents,
// and both drag in trees this test has no interest in constructing.
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

import { SignupPanel } from "@/components/public/products/signup-panel";
import type { AuthState } from "@/components/public/products/signup-panel-view";

const PRODUCT_ID = "7c9e1f42-3a55-4c8e-b1d6-9f0a2e4c7b83";
const CHILD_ID = "0a4e3f21-6c8d-4f0b-9a17-2b5e8c1d4f60";
const TERMS = "roblox-programme-terms";
const PRIVACY = "roblox-privacy-policy";

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

const boxes = (c: HTMLElement) => [
  ...c.querySelectorAll<HTMLInputElement>('input[type="checkbox"]'),
];
const cta = (c: HTMLElement) => {
  const buttons = [...c.querySelectorAll("button")];
  return buttons[buttons.length - 1];
};

/** Tick the rules box and then every document box, in order. */
function agreeToEverything(container: HTMLElement) {
  for (const box of boxes(container)) fireEvent.click(box);
}

beforeEach(() => {
  createMutate.mockReset();
  waitlistMutate.mockReset();
});

describe("the ticked documents reach the enrolment request", () => {
  it("sends them on a signup", () => {
    const { container } = render(
      <SignupPanel
        product={PRODUCT}
        requiredConsentSlugs={[TERMS, PRIVACY]}
        state={{
          kind: "open",
          seatCount: null,
          seatsLeft: null,
          waitlistEnabled: false,
        }}
        authState={AUTH}
        regionGate={{ kind: "unlocked" }}
        homeLocationName={null}
        onLocationConfirmed={() => {}}
      />,
    );

    agreeToEverything(container);
    fireEvent.click(cta(container));

    expect(createMutate).toHaveBeenCalledTimes(1);
    expect(createMutate.mock.calls[0][0]).toMatchObject({
      productId: PRODUCT_ID,
      participantId: CHILD_ID,
      consentedDocuments: [TERMS, PRIVACY],
    });
  });

  it("sends them on a waitlist join too", () => {
    const { container } = render(
      <SignupPanel
        product={PRODUCT}
        requiredConsentSlugs={[TERMS, PRIVACY]}
        state={{ kind: "full_waitlist", seatCount: 8 }}
        authState={AUTH}
        regionGate={{ kind: "unlocked" }}
        homeLocationName={null}
        onLocationConfirmed={() => {}}
      />,
    );

    agreeToEverything(container);
    fireEvent.click(cta(container));

    expect(waitlistMutate).toHaveBeenCalledTimes(1);
    expect(waitlistMutate.mock.calls[0][0]).toMatchObject({
      productId: PRODUCT_ID,
      participantId: CHILD_ID,
      consentedDocuments: [TERMS, PRIVACY],
    });
  });

  it("sends an empty list on a product that requires nothing", () => {
    const { container } = render(
      <SignupPanel
        product={PRODUCT}
        requiredConsentSlugs={[]}
        state={{
          kind: "open",
          seatCount: null,
          seatsLeft: null,
          waitlistEnabled: false,
        }}
        authState={AUTH}
        regionGate={{ kind: "unlocked" }}
        homeLocationName={null}
        onLocationConfirmed={() => {}}
      />,
    );

    agreeToEverything(container);
    fireEvent.click(cta(container));

    // Explicitly `[]` rather than omitted: the field is what the RPC compares
    // against a requirement set, and "I agreed to nothing" is a claim the
    // overwhelming majority of enrolments make truthfully.
    expect(createMutate.mock.calls[0][0].consentedDocuments).toEqual([]);
  });
});
