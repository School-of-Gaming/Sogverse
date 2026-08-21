import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import messages from "@/../messages/en.json";
import { AdminProductListPageBody } from "@/components/admin/products/list/admin-product-list-page-body";
import {
  EMPTY_PRODUCT_FILTERS,
  filterProductRows,
  sortProductRows,
} from "@/components/admin/products/list/admin-product-list-data";
import {
  ADMIN_PRODUCT_LIST_SCENARIOS,
  buildAdminProductListFixture,
} from "@/components/admin/products/mock-product-list-fixtures";
import { AdminProductPageBody } from "@/components/admin/products/detail/admin-product-page-body";
import {
  ADMIN_PRODUCT_DETAIL_NOW,
  ADMIN_PRODUCT_DETAIL_SCENARIOS,
  buildAdminProductDetailFixture,
} from "@/components/admin/products/mock-product-detail-fixtures";
import { findPreviewScene } from "@/components/preview/scenes";
import { NowProvider, TimezoneProvider } from "@/providers";
import type { GroupPending } from "@/services/groups";

/**
 * The two admin product scenes: that their registry entries name fixtures that
 * exist, that both bodies actually render every scenario, and the handful of
 * fixture invariants the design depends on.
 *
 * Rendered to static markup rather than driven in jsdom. Nothing asserted here
 * depends on an effect or a measurement, and the server's HTML is the frame an
 * admin meets — which also makes this the cheapest possible guard against the
 * failure these scenes are most exposed to: a fixture shape drifting from the
 * component that reads it, which type-checks fine and throws on first paint.
 */

const TIMEZONE = "Europe/Helsinki";

/** Nothing is ever in flight in a fixture render. */
const NO_PENDING: GroupPending = {
  moves: new Set(),
  removes: new Set(),
  renames: new Set(),
  deletes: new Set(),
  gedus: new Set(),
  creating: false,
};

function withProviders(now: Date, body: React.ReactNode): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={messages}>
      {/* The real providers, seeded rather than mocked: the table's schedule
          conversion and the page's voice window both read the viewer's zone and
          a request-stable `now` straight out of them. */}
      <TimezoneProvider initialTimezone={TIMEZONE}>
        <NowProvider initialNow={now}>{body}</NowProvider>
      </TimezoneProvider>
    </NextIntlClientProvider>,
  );
}

function listHtml(scenario: "populated" | "empty"): string {
  return withProviders(
    ADMIN_PRODUCT_DETAIL_NOW,
    <AdminProductListPageBody
      rows={buildAdminProductListFixture(scenario)}
      filters={EMPTY_PRODUCT_FILTERS}
      onFiltersChange={() => {}}
    />,
  );
}

describe("the admin product scenes are registered against real fixtures", () => {
  it("the catalogue's scenarios are its fixture's scenarios", () => {
    const scene = findPreviewScene("admin-products");
    expect(scene).not.toBeNull();
    expect(scene?.scenarios.map((s) => s.slug)).toEqual([
      ...ADMIN_PRODUCT_LIST_SCENARIOS,
    ]);
  });

  it("the product page's scenarios are its fixture's scenarios", () => {
    const scene = findPreviewScene("admin-product");
    expect(scene).not.toBeNull();
    expect(scene?.scenarios.map((s) => s.slug)).toEqual([
      ...ADMIN_PRODUCT_DETAIL_SCENARIOS,
    ]);
  });
});

describe("every scenario renders", () => {
  for (const scenario of ADMIN_PRODUCT_LIST_SCENARIOS) {
    it(`catalogue — ${scenario}`, () => {
      expect(listHtml(scenario).length).toBeGreaterThan(0);
    });
  }

  for (const scenario of ADMIN_PRODUCT_DETAIL_SCENARIOS) {
    it(`product page — ${scenario}`, () => {
      const { data } = buildAdminProductDetailFixture(
        ADMIN_PRODUCT_DETAIL_NOW,
        scenario,
      );
      const html = withProviders(
        ADMIN_PRODUCT_DETAIL_NOW,
        <AdminProductPageBody
          data={data}
          pending={NO_PENDING}
          groupActions={{
            onMove: () => {},
            onPromote: () => {},
            onDemote: () => {},
            onRemoveParticipant: () => {},
            onRenameGroup: () => {},
            onDeleteGroup: () => {},
            onCreateGroup: () => {},
            onRemoveGedu: () => {},
            onRequestAddGedu: () => {},
            onRequestAddParticipant: () => {},
          }}
          siteNotesEditing={false}
          onSiteNotesEditingChange={() => {}}
          onSaveSiteNotes={() => {}}
          editingGroupNotesId={null}
          onEditingGroupNotesChange={() => {}}
          onSaveGroupNotes={() => {}}
          feedNow={ADMIN_PRODUCT_DETAIL_NOW}
          editingEntryId={null}
          onEditEntry={() => {}}
          onSaveEntry={() => {}}
          onSendReport={() =>
            Promise.resolve({ sent: 0, failed: 0, skipped: 0 })
          }
        />,
      );
      // Every section the pill names has to be on the page, or the pill is a
      // set of links to nothing — which fails silently, since an anchor with no
      // target simply does not scroll.
      for (const id of [
        "at-a-glance",
        "as-sold",
        "how-it-runs",
        "money",
        "people",
        "sessions",
      ]) {
        expect(html, `${scenario}/${id}`).toContain(`id="${id}"`);
      }
    });
  }
});

/**
 * **A municipality club names its municipality whichever format it runs in.**
 *
 * The tie is to the Finnish kunta that funds it rather than to a building, so an
 * online municipality club is still Espoo's club and the row has to say so. It
 * is the one case where "Online" alone would be a lie of omission, and the
 * fixture plants an online muni club precisely so this can be checked.
 */
describe("municipality clubs always name their municipality", () => {
  const rows = buildAdminProductListFixture("populated");

  it("plants an online municipality club to prove the point", () => {
    const online = rows.filter(
      (row) => row.productType === "municipality_club" && row.isRemote,
    );
    expect(online.length).toBeGreaterThan(0);
  });

  it("gives every municipality club a municipality and nothing else one", () => {
    for (const row of rows) {
      if (row.productType === "municipality_club") {
        expect(row.municipalityName, row.name).not.toBeNull();
      } else {
        expect(row.municipalityName, row.name).toBeNull();
      }
    }
  });
});

/**
 * **The catalogue carries two clubs that differ only by weekday.**
 *
 * That pair is the whole argument for the cadence column: on the live list the
 * two rows are indistinguishable, and no amount of squinting at a start date
 * separates them. A fixture edit that deduplicated the names would take the case
 * away without failing anything else.
 */
describe("the catalogue keeps its same-named pairs", () => {
  const rows = buildAdminProductListFixture("populated");

  it("has at least one name held by two products on different weekdays", () => {
    const byName = new Map<string, Set<number>>();
    for (const row of rows) {
      const days = byName.get(row.name) ?? new Set<number>();
      for (const slot of row.schedule.schedule_slots) days.add(slot.weekday);
      byName.set(row.name, days);
    }
    const shared = [...byName.entries()].filter(
      ([name, days]) =>
        rows.filter((row) => row.name === name).length > 1 && days.size > 1,
    );
    expect(shared.length).toBeGreaterThan(0);
  });
});

/**
 * **The default filter is on, and it hides the finished runs.**
 *
 * Both halves matter and pull against each other: a list that opened on two
 * hundred completed products would bury the twenty being worked on, and a
 * filter nobody can see is engaged is worse than no filter. The visible half is
 * a rendering decision the chip makes; this pins the half that decides what a
 * reader sees at all.
 */
describe("the catalogue opens on active work", () => {
  const rows = buildAdminProductListFixture("populated");

  it("drops completed, expired and cancelled runs by default", () => {
    const shown = filterProductRows(rows, EMPTY_PRODUCT_FILTERS);
    expect(shown.length).toBeLessThan(rows.length);
    for (const row of shown) {
      expect(["running", "pending"], row.name).toContain(row.status);
    }
  });

  it("shows them once the filter is switched off", () => {
    const shown = filterProductRows(rows, {
      ...EMPTY_PRODUCT_FILTERS,
      activeOnly: false,
    });
    expect(shown.length).toBe(rows.length);
  });

  it("puts running work above pending work and finished work last", () => {
    const sorted = sortProductRows(
      filterProductRows(rows, { ...EMPTY_PRODUCT_FILTERS, activeOnly: false }),
      "default",
      "asc",
      "en",
    );
    const rank = ["running", "pending", "completed", "expired", "cancelled"];
    const ranks = sorted.map((row) => rank.indexOf(row.status));
    expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
  });
});

/**
 * **Every id that feeds an identicon is a real UUID.**
 *
 * The identicon is a pattern hashed out of an id's hex bytes, so a readable
 * stand-in does not render a *different* face — it renders a degenerate one, and
 * every avatar-bearing demo becomes a false picture of the real thing. The
 * seating panel draws one per chip and one per gedu pill, so both sets are swept
 * here.
 */
describe("identicon fixture ids are real UUIDs", () => {
  const UUID =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  for (const scenario of ADMIN_PRODUCT_DETAIL_SCENARIOS) {
    it(scenario, () => {
      const { data } = buildAdminProductDetailFixture(
        ADMIN_PRODUCT_DETAIL_NOW,
        scenario,
      );
      const seats = [
        ...data.groups.groups.flatMap((group) => group.participations),
        ...data.groups.unassigned,
        ...data.groups.waitlist,
      ];
      expect(seats.length).toBeGreaterThan(0);
      for (const seat of seats) {
        expect(seat.participant_id, seat.participant_first_name).toMatch(UUID);
        expect(seat.id, seat.participant_first_name).toMatch(UUID);
      }
      for (const group of data.groups.groups) {
        for (const gedu of group.gedus) {
          expect(gedu.id, gedu.first_name).toMatch(UUID);
        }
      }
    });
  }
});
