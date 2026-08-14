import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { ParticipantPickerSheet } from "@/components/admin/products/participant-picker-sheet";
import {
  audienceAdmitsRole,
  type ProductAudience,
} from "@/components/public/products/product-audience";
import { Constants } from "@/types/database.types";
import type { Profile, UserRole } from "@/types";

/**
 * Who the admin comp-enrollment picker offers an Add button to, in two layers:
 * the rule itself, and the rule reaching the buttons.
 *
 * The rule is a pure function and is exercised as a table — it is the cheapest
 * thing here to test exhaustively, and every surface that ever asks "may this
 * person hold a seat" gets its answer from it. What the table cannot see is the
 * defect this file was written for: the picker offered Add to everybody
 * regardless, so a rule that is right and unread looks exactly like no rule at
 * all. Hence the rendered half, which pins the one claim the table cannot
 * make — the button is withheld from the person the audience cannot seat, and
 * from nobody else.
 *
 * The rows themselves are deliberately NOT conditional: a person the product
 * cannot admit is still listed, still named, still has their family block.
 * Only the action goes, and nothing on screen explains why (owner decision —
 * the pattern reads in aggregate), so there is no copy here to assert on.
 *
 * Translations echo their keys, so nothing depends on English wording.
 */
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
}));

// Real UUIDs, hardcoded: every row draws an identicon from the id's hex bytes,
// and a readable stand-in renders a degenerate one. Never generated at test
// time — the same face has to come back on every run.
const IDS = {
  parent: "8755dfcd-b887-4ac8-9194-1d003e4f4325",
  child: "38b2e4c7-b218-4b44-b90b-ed1f29ca3887",
  lonelyParent: "87d4478d-8f5c-47d5-8c13-e0a6a125d388",
} as const;

function profile(id: string, firstName: string, role: UserRole): Profile {
  return {
    id,
    first_name: firstName,
    last_name: "Virtanen",
    email: `${firstName.toLowerCase()}@example.test`,
    role,
    phone: null,
    currency: null,
    locale: null,
    home_location_id: null,
    referral_code: null,
    spoken_languages: [],
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

const PARENT = profile(IDS.parent, "Marja", "customer");
const CHILD = profile(IDS.child, "Oona", "gamer");
// The family with no linked child: it has to keep appearing whatever the
// audience says, because a parents-only product is exactly what such a family
// signs up for.
const LONELY_PARENT = profile(IDS.lonelyParent, "Petri", "customer");

vi.mock("@/services/users", () => ({
  useUsers: () => ({ data: [PARENT, CHILD, LONELY_PARENT], isLoading: false }),
  useSearchUsers: () => ({ data: undefined, isLoading: false }),
  useParentGamerLinks: () => ({
    data: [{ parent_id: IDS.parent, gamer_id: IDS.child }],
  }),
}));

function openPicker(
  audience: ProductAudience,
  enrolledParticipantIds: Set<string> = new Set(),
) {
  render(
    <ParticipantPickerSheet
      open
      onOpenChange={() => {}}
      audience={audience}
      enrolledParticipantIds={enrolledParticipantIds}
      onAddParticipant={async () => {}}
    />,
  );
}

/**
 * The Add button sitting in the same row as this person's name, or null when
 * the row carries none. Both row shapes — the parent header and a nested child
 * — are the flex container the name and the button share, so the nearest
 * `justify-between` ancestor of the name is exactly one person's row.
 *
 * **Any button in that row counts, not only the one reading "add".** The button
 * carries four captions depending on state (add / adding / added /
 * alreadyAdded), so matching one of them would report "no button" for a row
 * that has one in another state — which is precisely the distinction the
 * already-enrolled case below turns on. Looking up the row first is what makes
 * the loose match safe: there is only ever one button in it.
 */
function addButtonFor(name: string): HTMLElement | null {
  const row = screen.getByText(name).closest("div.justify-between");
  if (!(row instanceof HTMLElement)) {
    throw new Error(`no row rendered for ${name}`);
  }
  return within(row).queryByRole("button");
}

describe("audienceAdmitsRole", () => {
  // Role → the audiences that may seat them. Anything absent is a refusal, so
  // the table states both halves at once and a new role added to the enum
  // shows up here as a missing key rather than as a silent `false`.
  const admitted: Record<UserRole, ProductAudience[]> = {
    gamer: ["gamers", "both"],
    customer: ["parents", "both"],
    gedu: [],
    admin: [],
  };
  // Audiences are enumerated through a record keyed by the union rather than as
  // a bare array, for the same reason the roles come from the generated enum
  // tuple: `satisfies Record<ProductAudience, …>` means a fourth audience fails
  // to compile here instead of silently going untested against every role.
  // Values rather than keys, so `Object.values` hands back the union itself and
  // the loop needs no assertion to spend it.
  const EVERY_AUDIENCE = {
    gamers: "gamers",
    parents: "parents",
    both: "both",
  } as const satisfies Record<ProductAudience, ProductAudience>;
  const ALL = Object.values(EVERY_AUDIENCE);

  // Roles come from the generated enum tuple rather than a list typed here, so
  // a role added to the schema arrives in this loop on its own and the Record
  // above is what refuses to compile until somebody answers for it.
  for (const role of Constants.public.Enums.user_role) {
    for (const audience of ALL) {
      const expected = admitted[role].includes(audience);
      it(`${expected ? "admits" : "refuses"} a ${role} on a ${audience} product`, () => {
        expect(audienceAdmitsRole(audience, role)).toBe(expected);
      });
    }
  }
});

describe("ParticipantPickerSheet — the audience reaches the buttons", () => {
  it("offers both rows on a product for gamers and parents alike", () => {
    openPicker("both");
    expect(addButtonFor("Marja")).not.toBeNull();
    expect(addButtonFor("Oona")).not.toBeNull();
  });

  it("offers the child and not the parent on a gamers-only product", () => {
    openPicker("gamers");
    expect(addButtonFor("Oona")).not.toBeNull();
    expect(addButtonFor("Marja")).toBeNull();
  });

  it("offers the parent and not the child on a parents-only product", () => {
    openPicker("parents");
    expect(addButtonFor("Marja")).not.toBeNull();
    expect(addButtonFor("Oona")).toBeNull();
  });

  it("keeps every row on screen whatever the audience admits", () => {
    // The withheld button must not take the person with it: an admin looking
    // for a family finds them either way, and reads what the product can seat
    // off which buttons are there.
    openPicker("parents");
    expect(screen.getByText("Oona")).toBeTruthy();
    expect(screen.getByText("Petri")).toBeTruthy();
  });

  it("still lists a childless parent, and still offers them a seat", () => {
    openPicker("parents");
    expect(addButtonFor("Petri")).not.toBeNull();
  });

  it("lists that same parent with no action on a gamers-only product", () => {
    openPicker("gamers");
    expect(screen.getByText("Petri")).toBeTruthy();
    expect(addButtonFor("Petri")).toBeNull();
  });

  // A product's audience can be narrowed after seats were given out —
  // update_product assigns both columns on every save and guards no existing
  // participation — so this crossing is reachable rather than theoretical. The
  // button is this sheet's only sign that somebody already holds a seat, and
  // withholding it here would leave a seated parent indistinguishable from an
  // unseated one on the only surface that lists both.
  it("keeps the button for someone already seated whom the audience no longer admits", () => {
    openPicker("gamers", new Set([IDS.parent]));
    expect(addButtonFor("Marja")).not.toBeNull();
  });

  it("still withholds it from an unseated person of the same role", () => {
    // The pair matters: without this, the case above would also pass if the
    // audience gate had simply been dropped.
    openPicker("gamers", new Set([IDS.parent]));
    expect(addButtonFor("Petri")).toBeNull();
  });
});
