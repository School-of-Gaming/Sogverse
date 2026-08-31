import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useState } from "react";
import {
  act,
  cleanup,
  createEvent,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * **Changing a product's site, driven the way an admin drives it.**
 *
 * The field is three components deep — the chosen-place card, the tree dialog,
 * the per-municipality site list — and the pieces are individually sound in a
 * way that says nothing about whether a pick survives the round trip back into
 * the form. Two things can only be seen end to end: that confirming a site
 * reaches `onChange` with that site's id, and that the clear-on-invalid guard
 * does **not** fire on the fresh pick while its keyed read is still in the air.
 * The second is the expensive one — a wrongly-true guard clears the value the
 * frame after it lands, so the field looks like it refuses to change.
 *
 * Only the network is stubbed, at the service class: the React Query wiring,
 * the cache keys, the guard and the dialog's state machine are all the real
 * ones.
 */

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values
      ? `${key} ${Object.entries(values)
          .map(([name, value]) => `${name}=${String(value)}`)
          .join(" ")}`
      : key,
  useLocale: () => "en",
}));

import {
  ChosenSitePanel,
  LocationPicker,
} from "@/components/admin/products/location-picker";
import {
  LocationsService,
  type LocationWithChain,
} from "@/services/locations";
import { SitesService } from "@/services/sites";
import type { Location, LocationType } from "@/types";

/** Real generated UUIDs — nothing here feeds an identicon, but ids stay ids. */
const IDS = {
  finland: "0f4c1d2e-6b3a-4a5c-9d8e-7f6a5b4c3d2e",
  uusimaa: "1a2b3c4d-5e6f-4a8b-9c0d-1e2f3a4b5c6d",
  helsinki: "2b3c4d5e-6f70-4b9c-8d1e-2f3a4b5c6d7e",
  siteA: "3c4d5e6f-7081-4cad-9e2f-3a4b5c6d7e8f",
  siteB: "4d5e6f70-8192-4dbe-8f30-4b5c6d7e8f90",
};

function loc(
  id: string,
  name: string,
  type: LocationType,
  parentId: string | null,
): Location {
  return {
    id,
    name,
    name_i18n: null,
    type,
    parent_id: parentId,
    country_code: "FI",
    external_code: null,
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
  } as Location;
}

const FINLAND = loc(IDS.finland, "Finland", "country", null);
const UUSIMAA = loc(IDS.uusimaa, "Uusimaa", "region", IDS.finland);
const HELSINKI = loc(IDS.helsinki, "Helsinki", "municipality", IDS.uusimaa);
const SITE_A = loc(IDS.siteA, "Site A", "site", IDS.helsinki);
const SITE_B = loc(IDS.siteB, "Site B", "site", IDS.helsinki);

const CHAIN = [HELSINKI, UUSIMAA, FINLAND];

function withChain(row: Location): LocationWithChain {
  return { ...row, ancestors: CHAIN } as LocationWithChain;
}

const CHILDREN: Record<string, Location[]> = {
  root: [FINLAND],
  [IDS.finland]: [UUSIMAA],
  [IDS.uusimaa]: [HELSINKI],
};

beforeEach(() => {
  vi.spyOn(LocationsService.prototype, "getChildren").mockImplementation(
    async (parentId) => {
      const rows = CHILDREN[parentId ?? "root"] ?? [];
      return { rows, total: rows.length, hasMore: false };
    },
  );
  vi.spyOn(LocationsService.prototype, "getSitesByParent").mockImplementation(
    async (parentId) => (parentId === IDS.helsinki ? [SITE_A, SITE_B] : []),
  );
  vi.spyOn(LocationsService.prototype, "searchLocations").mockResolvedValue({
    total: 0,
    results: [],
  });
  vi.spyOn(LocationsService.prototype, "getLocationsByIds").mockImplementation(
    async (ids) =>
      [SITE_A, SITE_B, HELSINKI]
        .filter((row) => ids.includes(row.id))
        .map(withChain),
  );
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

/**
 * The field as the Where section holds it: state up here, the picker driving
 * it, and the site panel beside — never inside — the picker.
 */
function Field({
  initialValue,
  onChange,
}: {
  initialValue: string | null;
  onChange: (id: string | null) => void;
}) {
  const [value, setValue] = useState<string | null>(initialValue);
  return (
    <>
      <LocationPicker
        value={value}
        pickable="site"
        onChange={(id) => {
          onChange(id);
          setValue(id);
        }}
      />
      <ChosenSitePanel value={value} />
    </>
  );
}

function mount(initialValue: string | null) {
  const onChange = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <Field initialValue={initialValue} onChange={onChange} />
    </QueryClientProvider>,
  );
  return onChange;
}

function click(name: RegExp | string) {
  fireEvent.click(screen.getByRole("button", { name }));
}

/** Browse Finland → Uusimaa → Helsinki, confirm, and take a site from the list. */
async function browseToSite(siteName: string) {
  await waitFor(() => screen.getByRole("button", { name: /Finland/ }));
  click(/Finland/);
  await waitFor(() => screen.getByRole("button", { name: /Uusimaa$/ }));
  click(/Uusimaa$/);
  await waitFor(() => screen.getByRole("button", { name: /Helsinki$/ }));
  click(/Helsinki$/);
  click("confirm");
  await waitFor(() => screen.getByRole("button", { name: siteName }));
  click(siteName);
}

describe("the product form's site field", () => {
  it("takes a site chosen from an empty field", async () => {
    const onChange = mount(null);

    click("chooseSite");
    await browseToSite("Site A");

    expect(onChange).toHaveBeenCalledWith(IDS.siteA);
    // And the card that replaces the empty control names it, rather than the
    // guard clearing the pick the moment its keyed read lands.
    await waitFor(() => expect(screen.getByText("Site A")).toBeTruthy());
    expect(onChange).not.toHaveBeenCalledWith(null);
  });

  it("swaps one site for another on an existing product", async () => {
    const onChange = mount(IDS.siteA);
    await waitFor(() => expect(screen.getByText("Site A")).toBeTruthy());

    click("change");
    await browseToSite("Site B");

    expect(onChange).toHaveBeenCalledWith(IDS.siteB);
    await waitFor(() => expect(screen.getByText("Site B")).toBeTruthy());
    expect(onChange).not.toHaveBeenCalledWith(null);
  });

  // The one-step entrance: a site is confirmable straight off a search hit,
  // where browsing can only ever reach its municipality.
  it("takes a site confirmed straight from a search hit", async () => {
    vi.spyOn(LocationsService.prototype, "searchLocations").mockResolvedValue({
      total: 1,
      results: [
        {
          ...SITE_B,
          name_i18n: null,
          // The search RPC's chain nodes carry a narrower shape than a whole
          // row, and a hit is what the panel renders a path from.
          ancestors: CHAIN.map(({ id, name, type }) => ({
            id,
            name,
            type,
            name_i18n: null,
          })),
        },
      ],
    });

    const onChange = mount(IDS.siteA);
    await waitFor(() => expect(screen.getByText("Site A")).toBeTruthy());
    click("change");

    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Site B" },
    });
    await waitFor(() => screen.getByRole("button", { name: /^Site B/ }), {
      timeout: 3000,
    });
    click(/^Site B/);
    click("confirm");

    expect(onChange).toHaveBeenCalledWith(IDS.siteB);
    await waitFor(() => expect(screen.getByText("Site B")).toBeTruthy());
    expect(onChange).not.toHaveBeenCalledWith(null);
  });

  // Naming a building that does not exist yet, which is the only reason the
  // municipality step has a screen of its own.
  it("takes a site named on the spot under the confirmed municipality", async () => {
    const created = loc(
      "5e6f7081-92a3-4ecf-9041-5c6d7e8f9012",
      "New School",
      "site",
      IDS.helsinki,
    );
    vi.spyOn(LocationsService.prototype, "createLocation").mockResolvedValue(
      created,
    );
    vi.spyOn(LocationsService.prototype, "getLocationsByIds").mockImplementation(
      async (ids) =>
        [SITE_A, SITE_B, HELSINKI, created]
          .filter((row) => ids.includes(row.id))
          .map(withChain),
    );

    const onChange = mount(null);
    click("chooseSite");
    await waitFor(() => screen.getByRole("button", { name: /Finland/ }));
    click(/Finland/);
    await waitFor(() => screen.getByRole("button", { name: /Uusimaa$/ }));
    click(/Uusimaa$/);
    await waitFor(() => screen.getByRole("button", { name: /Helsinki$/ }));
    click(/Helsinki$/);
    click("confirm");

    await waitFor(() => screen.getByRole("button", { name: "addSite" }));
    click("addSite");

    const nameInput = document.getElementById("loc-name");
    if (!(nameInput instanceof HTMLInputElement)) {
      throw new Error("the name field did not render");
    }
    fireEvent.change(nameInput, { target: { value: "New School" } });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /^addType/ }));
    });

    expect(onChange).toHaveBeenCalledWith(created.id);
    await waitFor(() => expect(screen.getByText("New School")).toBeTruthy());
    expect(onChange).not.toHaveBeenCalledWith(null);
  });

  // The building itself, editable where the product that runs in it is edited.
  describe("the site panel under the chosen-place card", () => {
    /** Mount the field inside a real `<form>`, the way the product form does. */
    function mountInForm(initialValue: string | null) {
      const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
      const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      render(
        <QueryClientProvider client={client}>
          <form onSubmit={onSubmit}>
            <Field initialValue={initialValue} onChange={vi.fn()} />
            <button type="submit">submitProduct</button>
          </form>
        </QueryClientProvider>,
      );
      return onSubmit;
    }

    beforeEach(() => {
      vi.spyOn(SitesService.prototype, "getSiteNotes").mockResolvedValue({
        address: null,
        memberNote: null,
        staffNote: null,
      });
    });

    // The capability model: both saves are supplied, and supplying the details
    // one is the only thing that puts a name and an address in the editor.
    it("offers the name and the address, not only the two notes", async () => {
      mountInForm(IDS.siteA);

      // Bound to the site the field holds, said by name in the caption that
      // stays visible while the editor is open.
      await waitFor(() =>
        expect(screen.getByText("sharedCaption site=Site A")).toBeTruthy(),
      );

      fireEvent.click(screen.getByRole("button", { name: "edit" }));
      expect(screen.getByLabelText("nameLabel")).toBeTruthy();
      expect(screen.getByLabelText("addressLabel")).toBeTruthy();
    });

    it("is absent until a site is chosen", async () => {
      mountInForm(null);
      await waitFor(() => screen.getByRole("button", { name: "chooseSite" }));
      expect(screen.queryByRole("button", { name: "edit" })).toBeNull();
    });

    // The one way this panel could reach the form it is mounted in: Enter in a
    // text input is a browser's implicit submit. jsdom performs no implicit
    // submission of its own, so the assertion is on the default action being
    // refused rather than on a handler that would never have fired here.
    it("refuses Enter in its own fields, so the product form cannot submit", async () => {
      mountInForm(IDS.siteA);
      await waitFor(() =>
        expect(screen.getByText("sharedCaption site=Site A")).toBeTruthy(),
      );
      fireEvent.click(screen.getByRole("button", { name: "edit" }));

      const address = screen.getByLabelText("addressLabel");
      const enter = createEvent.keyDown(address, { key: "Enter" });
      fireEvent(address, enter);
      expect(enter.defaultPrevented).toBe(true);
    });
  });

  // The guard's own job, from the other side: a municipality id left in the
  // field by an online→in-person toggle IS cleared, so a passing suite above
  // means the guard is discriminating rather than simply inert.
  it("clears a municipality left behind by a delivery-mode toggle", async () => {
    const onChange = mount(IDS.helsinki);
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(null));
    expect(screen.getByRole("button", { name: "chooseSite" })).toBeTruthy();
  });
});
