import { describe, it, expect, vi } from "vitest";
import { render, renderHook } from "@testing-library/react";
import {
  SignupPanelView,
  type AuthState,
  type SignupPanelViewProps,
  type SignupParticipantChoice,
} from "@/components/public/products/signup-panel-view";
import { useSignupPanelFields } from "@/components/public/products/use-signup-panel-fields";
import type {
  GamerPhotoConsentType,
  MarketingConsentType,
  ProductBrowseRow,
} from "@/types";

/**
 * **A child outside the product's age band is refused where the parent can see
 * it**, in the same place and the same treatment as a child who already holds a
 * seat: the row is disabled, muted, and says why in its status slot.
 *
 * Three things are worth pinning, and only one of them is the label:
 *
 *  - the row is genuinely not a target — `disabled`, not merely dimmed;
 *  - the hook's preselection **skips** it, because a preselected row the CTA
 *    would refuse is a panel that looks ready and is not;
 *  - already-enrolled **outranks** it on a row that carries both, because
 *    holding a seat is the more specific fact about that child on that product
 *    and it is the one answering the parent's actual question.
 *
 * Translations are stubbed to echo their key and the values interpolated into
 * it, so the assertions are about which key is reached for and which bound is
 * handed to it — never about the wording in `messages/`.
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
  return { useTranslations: () => t, useLocale: () => "en" };
});

vi.mock("@/providers", () => ({
  useNow: () => new Date("2026-09-10T09:00:00Z"),
  useTimezone: () => "Europe/Helsinki",
}));

// Real UUIDs, hardcoded: every row carries an identicon, and a readable
// stand-in renders a degenerate one. Never generated at test time.
const OONA_ID = "6aaac864-5ea7-451b-8d02-93f9ae6f25b5";
const ELIAS_ID = "c4f1a9e6-2b7d-4e83-95a1-6d0c3f8b2e57";
const SOFIA_ID = "9b3e7c25-8d41-4a06-b7f9-1e5a0c6d3842";

/** In the band, and the row a working panel should land on. */
const OONA: SignupParticipantChoice = { id: OONA_ID, name: "Oona", age: 10 };
/** Two years short of the product's minimum. */
const ELIAS: SignupParticipantChoice = {
  id: ELIAS_ID,
  name: "Elias",
  age: 6,
  ageBlock: { kind: "under", bound: 8 },
};
/** Two years past its maximum. */
const SOFIA: SignupParticipantChoice = {
  id: SOFIA_ID,
  name: "Sofia",
  age: 14,
  ageBlock: { kind: "over", bound: 12 },
};

function panel(
  participants: readonly SignupParticipantChoice[],
  selectedParticipantId: string | null,
): SignupPanelViewProps {
  const authState: AuthState = {
    kind: "ready",
    participants,
    gamerCount: participants.length,
  };
  return {
    productType: "municipality_club",
    forGamers: true,
    state: {
      kind: "open",
      seatCount: null,
      seatsLeft: null,
      waitlistEnabled: false,
    },
    authState,
    pricingOption: { kind: "external" },
    selectedParticipantId,
    onSelectParticipant: () => {},
    onAddGamer: () => {},
    agreed: true,
    onAgreedChange: () => {},
    requiredConsentSlugs: [],
    consentAgreements: new Set<string>(),
    onConsentAgreementChange: () => {},
    marketingConsentTypes: [],
    marketingConsents: new Set<MarketingConsentType>(),
    onMarketingConsentChange: () => {},
    gamerPhotoConsentTypes: [],
    gamerPhotoConsentsEnabled: true,
    gamerPhotoConsents: new Set<GamerPhotoConsentType>(),
    onGamerPhotoConsentChange: () => {},
    onSubmit: () => {},
    onJoinWaitlist: () => {},
    currency: "eur",
    locale: "en",
  };
}

const rows = (c: HTMLElement) => [
  ...c.querySelectorAll<HTMLButtonElement>('[role="radio"]'),
];

/** A product the hook can build its pricing from — none of it is under test. */
const PRODUCT: Pick<
  ProductBrowseRow,
  | "product_type"
  | "billing_mode"
  | "product_prices"
  | "for_gamers"
  | "start_date"
  | "timezone"
> = {
  product_type: "municipality_club",
  billing_mode: "external_contract",
  product_prices: [],
  for_gamers: true,
  start_date: null,
  timezone: "Europe/Helsinki",
};

function fieldsFor(participants: readonly SignupParticipantChoice[]) {
  const authState: AuthState = {
    kind: "ready",
    participants,
    gamerCount: participants.length,
  };
  const { result } = renderHook(() =>
    useSignupPanelFields(PRODUCT, authState, [], [], []),
  );
  return result.current;
}

describe("a row outside the band is refused in place", () => {
  it("disables it and names the bound it fell under", () => {
    const { container } = render(
      <SignupPanelView {...panel([OONA, ELIAS], OONA_ID)} />,
    );
    const [oona, elias] = rows(container);
    expect(oona.disabled).toBe(false);
    expect(elias.disabled).toBe(true);
    expect(elias.textContent).toContain('gamerUnderAge:{"min":8}');
  });

  it("disables it and names the bound it fell over", () => {
    const { container } = render(
      <SignupPanelView {...panel([OONA, SOFIA], OONA_ID)} />,
    );
    const [, sofia] = rows(container);
    expect(sofia.disabled).toBe(true);
    expect(sofia.textContent).toContain('gamerOverAge:{"max":12}');
  });

  it("still prints the age pill on a refused row", () => {
    // The band refuses the seat, not the child: how old they are is the fact
    // the refusal is about, and hiding it would leave the label unexplained.
    const { container } = render(
      <SignupPanelView {...panel([OONA, SOFIA], OONA_ID)} />,
    );
    expect(container.textContent).toContain('agePill:{"age":14}');
  });
});

describe("already enrolled beats out of band", () => {
  it("says the seat, not the age, on a row carrying both", () => {
    // The child aged out between enrolling and today. They are on the product;
    // that is what the parent needs to be told, and the age would read as a
    // refusal of a seat they already hold.
    const { container } = render(
      <SignupPanelView
        {...panel([{ ...SOFIA, signupState: "active" }], null)}
      />,
    );
    const [sofia] = rows(container);
    expect(sofia.disabled).toBe(true);
    expect(sofia.textContent).toContain(
      "gamerAlreadySignedUp.municipality_club",
    );
    expect(sofia.textContent).not.toContain("gamerOverAge");
  });
});

describe("preselection skips a refused row", () => {
  it("lands on the first child inside the band, not the first row", () => {
    expect(fieldsFor([ELIAS, OONA]).selectedParticipantId).toBe(OONA_ID);
  });

  it("selects nobody when every child is outside it", () => {
    // The panel still renders — the picker shows each row's reason and the CTA
    // stays disabled, exactly as it does when everyone is already enrolled.
    expect(fieldsFor([ELIAS, SOFIA]).selectedParticipantId).toBeNull();
  });

  it("skips a refused row whichever reason it carries", () => {
    expect(
      fieldsFor([{ ...OONA, signupState: "active" }, SOFIA, ELIAS])
        .selectedParticipantId,
    ).toBeNull();
  });
});
