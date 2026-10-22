import { describe, it, expect, vi } from "vitest";
import { act, render, renderHook } from "@testing-library/react";
import {
  SignupPanelView,
  type AuthState,
  type SignupPanelViewProps,
  type SignupParticipantChoice,
} from "@/components/public/products/signup-panel-view";
import { useSignupPanelFields } from "@/components/public/products/use-signup-panel-fields";
import { MAX_GAMERS_PER_PARENT } from "@/lib/constants/account-limits";
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
const PARENT_ID = "5b0f2b6d-6ad9-4a02-8f75-3a3d2a4a7c11";

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

/** The reader's own row, on a product whose audience admits adults. */
const SELF: SignupParticipantChoice = {
  id: PARENT_ID,
  name: "Marja",
  age: null,
  isSelf: true,
};

/**
 * The ready state these rows sit in. `gamerCount` is the account's children,
 * never the picker's rows, so the parent's own row is discounted from it — the
 * same distinction the adapter draws.
 */
const readyWith = (
  participants: readonly SignupParticipantChoice[],
): AuthState => ({
  kind: "ready",
  participants,
  gamerCount: participants.filter((p) => p.isSelf !== true).length,
});

function panel(
  participants: readonly SignupParticipantChoice[],
  selectedParticipantId: string | null,
): SignupPanelViewProps {
  const authState: AuthState = readyWith(participants);
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
  start_date: "2026-01-12",
  timezone: "Europe/Helsinki",
};

function fieldsFor(participants: readonly SignupParticipantChoice[]) {
  const { result } = renderHook(() =>
    useSignupPanelFields(PRODUCT, readyWith(participants), [], [], []),
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
    // The panel then shows no picker at all — the form gives way to the age
    // refusal (below) — but the hook must not have picked anyone behind it.
    expect(fieldsFor([ELIAS, SOFIA]).selectedParticipantId).toBeNull();
  });

  it("skips a refused row whichever reason it carries", () => {
    expect(
      fieldsFor([{ ...OONA, signupState: "active" }, SOFIA, ELIAS])
        .selectedParticipantId,
    ).toBeNull();
  });

  it("drops a user pick the band refuses back to the first selectable row", () => {
    // The rows are not static: a parent can pick a child, and the panel can
    // then learn — from a birth year and month landing, or from the parent editing them —
    // that the row they picked is out of band. A selection the CTA would
    // refuse is a panel that looks ready and is not, so the pick is discarded
    // rather than held, and the default takes over.
    const inBand: SignupParticipantChoice = { ...ELIAS, ageBlock: undefined };
    const { result, rerender } = renderHook(
      ({ participants }: { participants: readonly SignupParticipantChoice[] }) =>
        useSignupPanelFields(PRODUCT, readyWith(participants), [], [], []),
      { initialProps: { participants: [OONA, inBand] } },
    );

    act(() => result.current.onSelectParticipant(ELIAS_ID));
    expect(result.current.selectedParticipantId).toBe(ELIAS_ID);

    rerender({ participants: [OONA, ELIAS] });
    expect(result.current.selectedParticipantId).toBe(OONA_ID);
  });

  it("preselects the parent's own row when every child is refused", () => {
    // A both-audiences product with an out-of-band roster: the children are
    // all refused, and the reader's own seat is the one thing left the panel
    // can offer. It is an ordinary member of the selectable list, so "the
    // first selectable row" lands on it with no special case — and the CTA is
    // live rather than pointing at an add-a-child row.
    expect(fieldsFor([ELIAS, SOFIA, SELF]).selectedParticipantId).toBe(
      PARENT_ID,
    );
  });
});

/**
 * **A roster refused for age alone replaces the form with a message**, because
 * a form nobody on it can complete reads as a step the parent has missed. The
 * form survives wherever there is still something on it for this reader: a
 * seat a child already holds, or the reader's own selectable row.
 */
describe("a roster refused for age alone gives way to a message", () => {
  // A 13–17 club, and three children under it: two in the shop's 10–12 band
  // and one in its 7–9 band.
  const DAVID: SignupParticipantChoice = {
    id: "3f7d2a91-6c4e-4b85-a0d2-8e1f5b7c9a34",
    name: "David",
    age: 9,
    ageBlock: { kind: "under", bound: 13 },
  };
  const JONI: SignupParticipantChoice = {
    id: "b8e4c1f2-9a3d-4e67-8b05-2c6f1d9e4a73",
    name: "Joni",
    age: 11,
    ageBlock: { kind: "under", bound: 13 },
  };
  const JUHA: SignupParticipantChoice = {
    id: "e2a95d7c-4b18-4f3e-9c61-7d0b8a2f5e96",
    name: "Juha",
    age: 10,
    ageBlock: { kind: "under", bound: 13 },
  };

  function refusedPanel(
    participants: readonly SignupParticipantChoice[],
    gamerCount = participants.filter((p) => p.isSelf !== true).length,
  ): SignupPanelViewProps {
    return {
      ...panel(participants, null),
      productType: "consumer_club",
      authState: {
        kind: "ready",
        participants,
        gamerCount,
        ageRange: { min: 13, max: 17 },
      },
    };
  }

  const shopHref = (c: HTMLElement) =>
    c.querySelector<HTMLAnchorElement>('a[href^="/shop"]')?.getAttribute("href");
  const addGamer = (c: HTMLElement) =>
    [...c.querySelectorAll("button")].find((b) =>
      b.textContent.includes("ageRefusal.addGamer"),
    );

  it("replaces the picker, the consent and the CTA", () => {
    const { container } = render(
      <SignupPanelView {...refusedPanel([JONI, JUHA])} />,
    );
    expect(rows(container)).toHaveLength(0);
    expect(container.querySelector('[role="checkbox"]')).toBeNull();
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
    expect(container.textContent).not.toContain("ctaAddGamer");
    expect(container.textContent).not.toContain("ctaAllSet");
  });

  it("names the whole band, and each child with their age", () => {
    const { container } = render(
      <SignupPanelView {...refusedPanel([JONI, JUHA])} />,
    );
    const text = container.textContent;
    expect(text).toContain("ageRefusal.heading.consumer_club");
    expect(text).toContain("ageRefusal.range.between");
    expect(text).toContain('\\"min\\":13,\\"max\\":17');
    expect(text).toContain('\\"name\\":\\"Joni\\",\\"age\\":11');
    expect(text).toContain('\\"name\\":\\"Juha\\",\\"age\\":10');
    expect(text).toContain('"count":2');
  });

  it("links to the shop filtered to the one band every child is in", () => {
    const { container } = render(
      <SignupPanelView {...refusedPanel([JONI, JUHA])} />,
    );
    expect(shopHref(container)).toBe("/shop?category=clubs&age=10-12");
  });

  it("links to the unfiltered listing when the children span bands", () => {
    const { container } = render(
      <SignupPanelView {...refusedPanel([DAVID, JONI, JUHA])} />,
    );
    expect(shopHref(container)).toBe("/shop?category=clubs");
  });

  it("keeps the form when a child already holds a seat", () => {
    const { container } = render(
      <SignupPanelView
        {...refusedPanel([{ ...JONI, signupState: "active" }, JUHA])}
      />,
    );
    expect(rows(container)).toHaveLength(2);
    expect(container.textContent).not.toContain("ageRefusal.heading");
  });

  it("keeps the form when the reader's own seat is selectable", () => {
    const { container } = render(
      <SignupPanelView {...refusedPanel([JONI, JUHA, SELF])} />,
    );
    expect(rows(container)).toHaveLength(3);
    expect(container.textContent).not.toContain("ageRefusal.heading");
  });

  it("offers to add another gamer through the picker's own callback", () => {
    const onAddGamer = vi.fn();
    const { container } = render(
      <SignupPanelView
        {...refusedPanel([JONI, JUHA])}
        onAddGamer={onAddGamer}
      />,
    );
    addGamer(container)?.click();
    expect(onAddGamer).toHaveBeenCalledOnce();
  });

  it("withholds that offer at the gamer cap", () => {
    const { container } = render(
      <SignupPanelView
        {...refusedPanel([JONI, JUHA], MAX_GAMERS_PER_PARENT)}
      />,
    );
    expect(container.textContent).toContain("ageRefusal.heading");
    expect(addGamer(container)).toBeUndefined();
  });
});
