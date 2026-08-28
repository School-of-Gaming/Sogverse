import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import {
  SignupPanelView,
  type AuthState,
  type SignupPanelViewProps,
  type SignupParticipantChoice,
} from "@/components/public/products/signup-panel-view";
import { MAX_GAMERS_PER_PARENT } from "@/lib/constants";

/**
 * The three shapes the signup panel takes once a product can be sold to
 * parents, and the two places the panel has to tell a self seat from a child's.
 *
 * Everything mechanical about a row — selection, the identicon, the
 * already-enrolled lockout — is keyed on the id alone and is deliberately
 * blind to who the row is. What is *not* blind, and is what these tests pin:
 *
 *  - the add-a-child cap counts children, never picker rows (a parent's own row
 *    riding in the same array would otherwise hide the affordance one child
 *    early);
 *  - a product with no gamer audience offers no add-a-child row at all;
 *  - the consent sentence follows the *selection*, not the product, because on
 *    a mixed product the same panel consents about a child or about the reader
 *    depending on which row is lit.
 *
 * Translations are stubbed to echo their keys, so nothing here depends on
 * English wording. `rich` echoes the key and then hands it to whatever tag
 * functions the call passed — the rules sentence is rich text (it names the
 * Anti-Bullying policy as a link), and a stub that dropped the tags would drop
 * the key these assertions read.
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

// Real UUIDs, hardcoded: every row here carries an identicon, and a readable
// stand-in renders a degenerate one. Never generated at test time.
const PARENT_ID = "5b0f2b6d-6ad9-4a02-8f75-3a3d2a4a7c11";
const CHILD_IDS = [
  "6aaac864-5ea7-451b-8d02-93f9ae6f25b5",
  "decdae83-3f51-4209-bf1a-254e88f1c32f",
  "d010872c-7034-401b-9c2d-5dfa675f60d8",
  "0d0f4b02-2fd2-4a0e-9b53-90f1f2f5b0d1",
  "3d4a5c1e-9f16-4f5a-8f2a-5b7c8d9e0a12",
  "7f2e6b44-0c8d-4e1a-9a6b-2c3d4e5f6071",
  "b1c2d3e4-f506-4a7b-8c9d-0e1f2a3b4c5d",
] as const;

const CHILD: SignupParticipantChoice = {
  id: CHILD_IDS[0],
  name: "Oona",
  age: 10,
};
const SELF: SignupParticipantChoice = {
  id: PARENT_ID,
  name: "Marja",
  age: null,
  isSelf: true,
};

function panel({
  forGamers,
  participants,
  gamerCount,
  selectedParticipantId,
}: {
  forGamers: boolean;
  participants: readonly SignupParticipantChoice[];
  gamerCount: number;
  selectedParticipantId: string | null;
}): SignupPanelViewProps {
  const authState: AuthState = { kind: "ready", participants, gamerCount };
  return {
    productType: "municipality_club",
    forGamers,
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
    // No enrolment conditions: the ordinary product, which is what every
    // assertion in this file is about.
    requiredConsentSlugs: [],
    consentAgreements: new Set<string>(),
    onConsentAgreementChange: () => {},
    onSubmit: () => {},
    onJoinWaitlist: () => {},
    currency: "eur",
    locale: "en",
  };
}

/** The dashed add-a-child row, which renders the family namespace's label. */
const addRow = (c: HTMLElement) =>
  [...c.querySelectorAll("button")].find(
    (b) => b.textContent.trim() === "addGamer",
  ) ?? null;

/** The rows the radiogroup offers, in order. */
const rows = (c: HTMLElement) => [
  ...c.querySelectorAll<HTMLButtonElement>('[role="radio"]'),
];

/** The CTA — the submit button at the end of the form. */
const cta = (c: HTMLElement) => {
  const buttons = [...c.querySelectorAll("button")];
  return buttons[buttons.length - 1];
};

describe("gamers-only — the case that must not move", () => {
  it("asks the per-type question and offers the add-a-child row", () => {
    const { container } = render(
      <SignupPanelView
        {...panel({
          forGamers: true,
          participants: [CHILD],
          gamerCount: 1,
          selectedParticipantId: CHILD.id,
        })}
      />,
    );
    expect(container.textContent).toContain(
      "whoAreYouSigningUp.municipality_club",
    );
    expect(container.textContent).not.toContain("seatIsFor");
    expect(addRow(container)).not.toBeNull();
    expect(rows(container)).toHaveLength(1);
  });

  it("consents about a child", () => {
    const { container } = render(
      <SignupPanelView
        {...panel({
          forGamers: true,
          participants: [CHILD],
          gamerCount: 1,
          selectedParticipantId: CHILD.id,
        })}
      />,
    );
    expect(container.textContent).toContain("municipality_club");
    expect(container.textContent).not.toContain("municipality_club_self");
  });
});

describe("parents-only — the reader is the whole picker", () => {
  const props = panel({
    forGamers: false,
    participants: [SELF],
    gamerCount: 3,
    selectedParticipantId: SELF.id,
  });

  it("states the seat instead of asking who it is for", () => {
    const { container } = render(<SignupPanelView {...props} />);
    expect(container.textContent).toContain("seatIsFor");
    expect(container.textContent).not.toContain("whoAreYouSigningUp");
  });

  it("offers exactly one row — the reader — and no add-a-child", () => {
    // The account has three children and the add row is still withheld: it is
    // the product's audience, not the cap, that withdraws it here. Adding a
    // child would create an account this page could not sign up.
    const { container } = render(<SignupPanelView {...props} />);
    expect(rows(container)).toHaveLength(1);
    expect(rows(container)[0].textContent).toContain("Marja");
    expect(addRow(container)).toBeNull();
  });

  it("renders no age pill for an adult", () => {
    const { container } = render(<SignupPanelView {...props} />);
    expect(container.textContent).not.toContain("agePill");
  });

  it("consents about the reader's own seat", () => {
    const { container } = render(<SignupPanelView {...props} />);
    expect(container.textContent).toContain("municipality_club_self");
  });

  it("locks the reader out once they already hold the seat", () => {
    // The lockout arrives the same way a child's does — the counts read is
    // filtered on the customer and keyed on the participant column, so a self
    // seat is already filed under the reader's own id. With the only row
    // disabled and no add-a-child row beneath it, the CTA falls through to the
    // nothing-left-to-do label rather than the add-a-child prompt.
    const { container } = render(
      <SignupPanelView
        {...panel({
          forGamers: false,
          participants: [{ ...SELF, signupState: "active" }],
          gamerCount: 0,
          selectedParticipantId: null,
        })}
      />,
    );
    expect(rows(container)[0].disabled).toBe(true);
    expect(container.textContent).toContain(
      "gamerAlreadySignedUp.municipality_club",
    );
    expect(cta(container).textContent).toBe("ctaAllSet");
    expect(cta(container).disabled).toBe(true);
  });
});

describe("both audiences — children and the reader in one picker", () => {
  it("lists the children first and the reader beneath them", () => {
    const { container } = render(
      <SignupPanelView
        {...panel({
          forGamers: true,
          participants: [CHILD, SELF],
          gamerCount: 1,
          selectedParticipantId: CHILD.id,
        })}
      />,
    );
    const labels = rows(container).map((r) => r.textContent);
    expect(labels[0]).toContain("Oona");
    expect(labels[1]).toContain("Marja");
  });

  it("follows the selection into the consent sentence, not the product", () => {
    const base = {
      forGamers: true,
      participants: [CHILD, SELF],
      gamerCount: 1,
    };
    const child = render(
      <SignupPanelView
        {...panel({ ...base, selectedParticipantId: CHILD.id })}
      />,
    );
    expect(child.container.textContent).not.toContain("municipality_club_self");

    const self = render(
      <SignupPanelView
        {...panel({ ...base, selectedParticipantId: SELF.id })}
      />,
    );
    expect(self.container.textContent).toContain("municipality_club_self");
  });

  /**
   * The regression the plan names by hand: the reader's row rides in the same
   * array as the children, so a cap measured against `participants.length`
   * would hide the add affordance from a family one child short of it.
   */
  it("counts children, not picker rows, against the add-a-child cap", () => {
    const children = CHILD_IDS.slice(0, MAX_GAMERS_PER_PARENT - 1).map(
      (id, i) => ({ id, name: `Child ${i}`, age: 8 + i }),
    );
    const { container } = render(
      <SignupPanelView
        {...panel({
          forGamers: true,
          participants: [...children, SELF],
          gamerCount: children.length,
          selectedParticipantId: children[0].id,
        })}
      />,
    );
    // MAX rows on screen, MAX-1 of them children — the add row must survive.
    expect(rows(container)).toHaveLength(MAX_GAMERS_PER_PARENT);
    expect(addRow(container)).not.toBeNull();
  });

  it("still withdraws the add row at the real cap", () => {
    const children = CHILD_IDS.slice(0, MAX_GAMERS_PER_PARENT).map((id, i) => ({
      id,
      name: `Child ${i}`,
      age: 8 + i,
    }));
    const { container } = render(
      <SignupPanelView
        {...panel({
          forGamers: true,
          participants: [...children, SELF],
          gamerCount: children.length,
          selectedParticipantId: children[0].id,
        })}
      />,
    );
    expect(addRow(container)).toBeNull();
  });
});

describe("the signed-in-but-wrong-role note", () => {
  it("names the gamer registration on a gamers-only product", () => {
    const { container } = render(
      <SignupPanelView
        {...panel({
          forGamers: true,
          participants: [],
          gamerCount: 0,
          selectedParticipantId: null,
        })}
        authState={{ kind: "non_customer" }}
      />,
    );
    expect(container.textContent).toContain("nonCustomerNote");
    expect(container.textContent).not.toContain("nonCustomerNoteParents");
  });

  it("says the same thing about the seat on a parents-only product", () => {
    const { container } = render(
      <SignupPanelView
        {...panel({
          forGamers: false,
          participants: [],
          gamerCount: 0,
          selectedParticipantId: null,
        })}
        authState={{ kind: "non_customer" }}
      />,
    );
    expect(container.textContent).toContain("nonCustomerNoteParents");
  });
});
