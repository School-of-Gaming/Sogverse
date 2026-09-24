import { describe, it, expect, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { GeduPickerSheet } from "@/components/admin/products/gedu-picker-sheet";
import type { UserListEntry } from "@/services/users";

/**
 * Who the gedu picker will not let an admin take, and — the part that matters —
 * **why it says so**.
 *
 * The sheet used to hold one refusal of the caller's: a list of ids that all
 * read "already assigned", which is the permanent assignment editor's rule and
 * nobody else's. It is now a map from id to reason, because the same sheet
 * staffs a permanent assignment on one surface and one session's sub on
 * another, and those refuse different people for different reasons. A row the
 * action cannot apply to is shown disabled with its reason in place of its
 * status, rather than being reached and refused later.
 *
 * Two refusals stay the sheet's own and are checked here alongside: the person
 * already filling the slot, and an uncertified account — which it can decide
 * off the row it is drawing, because certification is a column of the shared
 * people read rather than a lookup of its own.
 *
 * Translations echo their keys, so nothing depends on English wording.
 */
vi.mock("next-intl", () => ({
  useTranslations: (namespace?: string) => {
    const t = (key: string) => (namespace ? `${namespace}.${key}` : key);
    t.rich = (key: string) => key;
    return t;
  },
}));

vi.mock("@/hooks/use-language-names", () => ({
  useLanguageNames: () => (code: string) => code,
}));

// Real UUIDs, hardcoded: every row draws an identicon out of the id's hex bytes.
const IDS = {
  free: "0c1f2b2e-7f1a-4f2e-9d54-4b0d2a9d9d21",
  assigned: "a4f4b01a-6a2e-4e97-a4a1-ec3b8a4b6d55",
  expected: "5d2c8f8b-3f57-4a1d-8f3f-5e0a3a2b7c19",
  absent: "9e7f1a45-2d61-4c8b-9f0e-6c2d1b3a4e57",
  uncertified: "7b3e9c22-1a4d-4b6f-8e2c-0d5a6f7b8c93",
  surnameless: "3f8a6d14-9c2b-4e71-b5d0-2a7e1c9f4b86",
} as const;

function gedu(
  id: string,
  firstName: string,
  lastName = "Virtanen",
): UserListEntry {
  return {
    id,
    first_name: firstName,
    last_name: lastName,
    email: `${firstName.toLowerCase()}@example.test`,
    email_verified_at: null,
    role: "gedu",
    phone: null,
    currency: null,
    locale: null,
    home_location_id: null,
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    spoken_languages: [],
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    certified: id !== IDS.uncertified,
    criminal_record_check_passed: true,
    linked_gamers: [],
  };
}

const GEDUS = [
  gedu(IDS.free, "Aino"),
  gedu(IDS.assigned, "Eeli"),
  gedu(IDS.expected, "Saana"),
  gedu(IDS.absent, "Milo"),
  gedu(IDS.uncertified, "Onni"),
  gedu(IDS.surnameless, "Mikko", ""),
];

// One page of the shared people read is the whole fixture: certification rides
// on the row, so there is no second lookup to stand in for. `hasNextPage: false`
// keeps the sentinel unmounted, which is what leaves jsdom's missing
// `IntersectionObserver` out of these cases — paging has its own suite.
vi.mock("@/services/users", () => ({
  useUserList: () => ({
    data: { pages: [{ rows: GEDUS, total: GEDUS.length }] },
    isPending: false,
    isPlaceholderData: false,
    hasNextPage: false,
    isFetching: false,
    isFetchingNextPage: false,
    fetchNextPage: () => Promise.resolve(),
  }),
}));

/** The row for one person, found by the full name it renders. */
function rowFor(name: string): HTMLButtonElement {
  const row = screen.getByText(name).closest("button");
  if (row === null) throw new Error(`No row rendered for ${name}`);
  return row;
}

function openPicker(
  unavailable?: Map<string, "assigned" | "expected" | "absent">,
) {
  render(
    <GeduPickerSheet
      open
      onOpenChange={() => {}}
      title="Pick a Gedu"
      description="For this group"
      unavailable={unavailable}
      onSelect={() => {}}
    />,
  );
}

describe("the gedu picker's row name", () => {
  it("shows first and last name, so same-named gedus can be told apart", () => {
    openPicker();

    expect(rowFor("Aino Virtanen")).toBeTruthy();
  });

  it("shows the first name alone, with no trailing space, when the surname is blank", () => {
    openPicker();

    // Exact text match: "Mikko " would not be found.
    expect(rowFor("Mikko")).toBeTruthy();
  });
});

describe("the gedu picker's caller-supplied refusals", () => {
  it("disables each named candidate and badges the caller's own reason", () => {
    openPicker(
      new Map<string, "assigned" | "expected" | "absent">([
        [IDS.assigned, "assigned"],
        [IDS.expected, "expected"],
        [IDS.absent, "absent"],
      ]),
    );

    const cases = [
      ["Eeli Virtanen", "admin.products.geduPicker.alreadyAssigned"],
      ["Saana Virtanen", "admin.products.geduPicker.alreadyExpected"],
      ["Milo Virtanen", "admin.products.geduPicker.absentGedu"],
    ] as const;

    for (const [name, badge] of cases) {
      const row = rowFor(name);
      expect(row.disabled).toBe(true);
      expect(within(row).getByText(badge)).toBeTruthy();
    }
  });

  it("leaves everyone the caller did not name selectable", () => {
    openPicker(
      new Map<string, "assigned" | "expected" | "absent">([
        [IDS.assigned, "assigned"],
      ]),
    );

    const row = rowFor("Aino Virtanen");
    expect(row.disabled).toBe(false);
    expect(
      within(row).queryByText("admin.products.geduPicker.alreadyAssigned"),
    ).toBeNull();
  });

  it("keeps its own uncertified refusal, and never shows two reasons at once", () => {
    openPicker(
      new Map<string, "assigned" | "expected" | "absent">([
        [IDS.uncertified, "assigned"],
      ]),
    );

    const row = rowFor("Onni Virtanen");
    expect(row.disabled).toBe(true);
    // The caller's reason wins the badge: it is the one that describes what the
    // admin was trying to do, and a row wearing both would be saying the same
    // refusal twice.
    expect(
      within(row).getByText("admin.products.geduPicker.alreadyAssigned"),
    ).toBeTruthy();
    expect(
      within(row).queryByText("admin.products.geduPicker.notCertified"),
    ).toBeNull();
  });

  it("refuses an uncertified candidate the caller said nothing about", () => {
    openPicker();

    const row = rowFor("Onni Virtanen");
    expect(row.disabled).toBe(true);
    expect(
      within(row).getByText("admin.products.geduPicker.notCertified"),
    ).toBeTruthy();
    // And nobody else: with no map at all, the certified rows stand.
    expect(rowFor("Eeli Virtanen").disabled).toBe(false);
  });

  it("badges the person already filling the slot as current, not as refused", () => {
    render(
      <GeduPickerSheet
        open
        onOpenChange={() => {}}
        title="Pick a Gedu"
        description="For this group"
        unavailable={new Map([[IDS.assigned, "assigned" as const]])}
        highlightId={IDS.assigned}
        onSelect={() => {}}
      />,
    );

    const row = rowFor("Eeli Virtanen");
    expect(row.disabled).toBe(true);
    expect(within(row).getByText("admin.products.geduPicker.current")).toBeTruthy();
    expect(
      within(row).queryByText("admin.products.geduPicker.alreadyAssigned"),
    ).toBeNull();
  });
});
