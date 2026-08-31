import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useState } from "react";
import {
  act,
  cleanup,
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

/**
 * Mount the field inside a real `<form>`, the way the product form holds it —
 * and the way `mount` above deliberately does not, which is the shape of every
 * bug this file exists to catch that the picker alone cannot show.
 */
function mountInForm(initialValue: string | null) {
  const onSubmit = vi.fn((event: React.FormEvent) => event.preventDefault());
  const onChange = vi.fn();
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  render(
    <QueryClientProvider client={client}>
      <form onSubmit={onSubmit}>
        <Field initialValue={initialValue} onChange={onChange} />
        <button type="submit">submitProduct</button>
      </form>
    </QueryClientProvider>,
  );
  return { onSubmit, onChange };
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

  /**
   * **Naming a site must not submit the product.**
   *
   * The create dialog is the one screen in this chain with a `<form>` of its
   * own, and it is mounted — through a portal — inside the product form's
   * `<form>`. A portal moves the *DOM* node out; it does not move the React
   * tree, and React dispatches an event up the tree it rendered rather than the
   * one the browser laid out. So the inner form's own submit walked straight
   * into the product form's `onSubmit`, which validated the state as it stood
   * (the old site — the pick had not landed yet), saved the product and
   * navigated away from the edit page, while the create request was still in
   * the air.
   *
   * The suite above could not see any of this: it mounts the picker bare, so
   * there was no outer handler in the path to be called. That is why this case
   * mounts in a form and asserts on the *outer* handler.
   *
   * **The containment is on the `Dialog` primitive, not in this chain** — the
   * trap belongs to portals rather than to this dialog, so `dialog-form-
   * containment` is where the class is pinned. This case is the real chain end
   * to end, which is the half that says the fix is reached by the code an admin
   * actually drives.
   *
   * jsdom performs no implicit form submission of its own, but that is not what
   * is being exercised here — this is React's synthetic propagation, which jsdom
   * reproduces exactly, because it is React's own dispatch loop rather than the
   * browser's.
   */
  it("does not submit the surrounding product form when a site is named", async () => {
    const created = loc(
      "6f708192-a3b4-4fd0-8152-6d7e8f901234",
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
    vi.spyOn(SitesService.prototype, "getSiteNotes").mockResolvedValue({
      address: null,
      memberNote: null,
      staffNote: null,
    });

    const { onSubmit, onChange } = mountInForm(null);

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

    // The site is created and picked …
    expect(onChange).toHaveBeenCalledWith(created.id);
    // … and the product form is left exactly where the admin left it.
    expect(onSubmit).not.toHaveBeenCalled();
  });

  /**
   * The building itself — **shown here, edited somewhere else.**
   *
   * This page is scoped to a product, so an Edit on it reads as a change to
   * *that* product; a rename typed here would land on the camp, the club and the
   * birthday party that also run in the building. So the panel is supplied
   * neither save and renders as a pure view, and the way to the record is a link
   * to `/admin/sites/[id]`, whose scope says what it is.
   *
   * That also settles the form question the case above exists for: with no
   * controls beyond a link, there is nothing here that can reach the product
   * form — not by click, and not by Enter, which needs a text input. The wrapper
   * used to refuse that key and the test used to pin the refusal; both went with
   * the inputs that made them necessary. What remains of that concern lives in
   * `dialog-form-containment`, which is about portals rather than this panel.
   */
  describe("the site panel under the chosen-place card", () => {
    beforeEach(() => {
      vi.spyOn(SitesService.prototype, "getSiteNotes").mockResolvedValue({
        address: null,
        memberNote: null,
        staffNote: null,
      });
    });

    it("shows the site and links out to edit it, offering no editor of its own", async () => {
      mountInForm(IDS.siteA);

      // Bound to the site the field holds, and said by name.
      await waitFor(() =>
        expect(screen.getByText("sharedCaption site=Site A")).toBeTruthy(),
      );

      // No pencil, so no editor to open — and therefore no name field, no
      // address field, and no Save that could write the building's record from
      // a page about one product in it.
      expect(screen.queryByRole("button", { name: "edit" })).toBeNull();
      expect(screen.queryByLabelText("nameLabel")).toBeNull();
      expect(screen.queryByLabelText("addressLabel")).toBeNull();
      expect(screen.queryByRole("button", { name: "save" })).toBeNull();

      // The way through: one navigation to the page that owns the record.
      const link = screen.getByRole("link", { name: "editSite" });
      expect(link.getAttribute("href")).toBe(`/admin/sites/${IDS.siteA}`);
    });

    it("is absent until a site is chosen", async () => {
      mountInForm(null);
      await waitFor(() => screen.getByRole("button", { name: "chooseSite" }));
      expect(screen.queryByRole("link", { name: "editSite" })).toBeNull();
      expect(screen.queryByText(/^sharedCaption/)).toBeNull();
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
