import { describe, expect, it } from "vitest";
import {
  PREVIEW_SCENES,
  findPreviewScene,
  previewSceneHref,
  sceneHasScenario,
} from "@/components/preview/scenes";
import {
  GEDU_DASHBOARD_SCENARIOS,
  buildGeduDashboardFixture,
} from "@/components/gedu/mock-dashboard-fixtures";
import {
  GEDU_PRODUCT_SCENARIOS,
  buildGeduProductPageFixture,
} from "@/components/gedu/session-details/mock-product-page-fixtures";
import { SESSION_FEED_ROSTER } from "@/components/gedu/session-feed/mock-fixtures";
import { PREVIEW_SCENARIOS } from "@/components/public/products/mock-detail-fixtures";

/**
 * The preview registry is the only thing standing between a link on the style
 * guide and a 404: the route validates a URL against it, and each scene's
 * renderer narrows the slug against its own fixtures. Those two lists are
 * declared separately, so this pins them together — a scenario renamed in a
 * fixture and not in the registry would otherwise only show up as a dead link
 * someone happens to click.
 */

function slugsFor(surface: string): string[] {
  const scene = findPreviewScene(surface);
  if (!scene) throw new Error(`no preview scene registered for "${surface}"`);
  return scene.scenarios.map((s) => s.slug);
}

describe("preview scene registry", () => {
  it("has a unique, non-empty surface for every scene", () => {
    const surfaces = PREVIEW_SCENES.map((s) => s.surface);
    expect(new Set(surfaces).size).toBe(surfaces.length);
    for (const surface of surfaces) expect(surface).not.toBe("");
  });

  it("gives every scene at least one scenario, with unique slugs", () => {
    for (const scene of PREVIEW_SCENES) {
      expect(scene.scenarios.length).toBeGreaterThan(0);
      const slugs = scene.scenarios.map((s) => s.slug);
      expect(new Set(slugs).size).toBe(slugs.length);
      for (const scenario of scene.scenarios) {
        expect(scenario.label.trim()).not.toBe("");
      }
    }
  });

  it("resolves a known surface and rejects an unknown one", () => {
    expect(findPreviewScene("products")?.surface).toBe("products");
    expect(findPreviewScene("nope")).toBeNull();
  });

  it("matches scenarios against the scene that declares them", () => {
    const scene = findPreviewScene("gedu-product");
    expect(scene).not.toBeNull();
    expect(sceneHasScenario(scene!, "camp")).toBe(true);
    expect(sceneHasScenario(scene!, "club")).toBe(true);
    expect(sceneHasScenario(scene!, "default")).toBe(false);
  });

  it("builds the route the dynamic page serves", () => {
    expect(previewSceneHref("gedu-product", "camp")).toBe(
      "/preview/gedu-product/camp",
    );
  });

  /**
   * The scenario lists were deliberately collapsed to the states that cannot
   * coexist: everything else belongs in the kitchen sink. A scene creeping back
   * up to a scenario per state is the drift this pins down, and a scene whose
   * scenarios each need a sentence of explanation has to actually carry one.
   */
  it("keeps the gedu scenes down to their mutually-exclusive scenarios", () => {
    for (const surface of ["gedu-product", "gedu-dashboard"] as const) {
      const scene = findPreviewScene(surface);
      expect(scene).not.toBeNull();
      expect(scene!.scenarios.length, surface).toBe(2);
      for (const scenario of scene!.scenarios) {
        expect(scenario.description?.trim(), `${surface}/${scenario.slug}`)
          .toBeTruthy();
      }
    }
  });
});

describe("registry scenarios match their fixtures", () => {
  it("gedu dashboard", () => {
    expect(slugsFor("gedu-dashboard")).toEqual([...GEDU_DASHBOARD_SCENARIOS]);
  });

  it("gedu product page", () => {
    expect(slugsFor("gedu-product")).toEqual([...GEDU_PRODUCT_SCENARIOS]);
  });

  it("public product surfaces", () => {
    const productSlugs = PREVIEW_SCENARIOS.map((s) => s.slug);
    expect(slugsFor("products")).toEqual(productSlugs);
    expect(slugsFor("confirmation")).toEqual(productSlugs);
  });
});

/**
 * An identicon is a pattern hashed out of the id's hex bytes, so a readable
 * fixture id like `"mock-gamer-aino"` parses to nothing and renders an empty
 * square. Every fixture id that reaches an avatar therefore has to be a real
 * UUID — and a hardcoded one, since generating them would give the same person a
 * different face on every render.
 */
const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("identicon fixture ids are real UUIDs", () => {
  it("every child on the feed roster", () => {
    expect(SESSION_FEED_ROSTER.length).toBeGreaterThan(0);
    for (const gamer of SESSION_FEED_ROSTER) {
      expect(gamer.id).toMatch(UUID_V4);
    }
  });

  it("every gedu chip and roster row in every product-page scenario", () => {
    const now = new Date("2026-02-11T09:00:00Z");
    for (const scenario of GEDU_PRODUCT_SCENARIOS) {
      const { data } = buildGeduProductPageFixture(now, scenario);
      for (const group of data.groups) {
        for (const gedu of group.gedus) {
          expect(gedu.id, `${scenario}/${group.name}`).toMatch(UUID_V4);
        }
        for (const child of group.roster ?? []) {
          expect(child.gamer_id, `${scenario}/${group.name}`).toMatch(UUID_V4);
          if (child.minecraft_uuid !== null) {
            expect(child.minecraft_uuid).toMatch(UUID_V4);
          }
        }
      }
    }
  });

  it("keeps the same ids across two builds, so avatars never change under a reload", () => {
    const now = new Date("2026-02-11T09:00:00Z");
    const first = buildGeduProductPageFixture(now, "club");
    const second = buildGeduProductPageFixture(now, "club");
    expect(first.data.groups[0].gedus.map((g) => g.id)).toEqual(
      second.data.groups[0].gedus.map((g) => g.id),
    );
  });
});

/**
 * The product page's reference rail leads with the other groups on the product —
 * the "cover my room for ten minutes" surface. With only two scenarios left,
 * neither may be the one that skips it: an empty rail on half the scenes would
 * mean the peer-cover row is only ever reviewable on one page.
 */
describe("every scenario exercises the reference rail's other-groups card", () => {
  const now = new Date("2026-02-11T09:00:00Z");

  function peerCountFor(scenario: (typeof GEDU_PRODUCT_SCENARIOS)[number]) {
    const { data } = buildGeduProductPageFixture(now, scenario);
    return data.groups.filter((g) => g.id !== data.my_group_id).length;
  }

  it("gives every scenario at least one peer group", () => {
    for (const scenario of GEDU_PRODUCT_SCENARIOS) {
      expect(peerCountFor(scenario), scenario).toBeGreaterThan(0);
    }
  });

  it("covers a peer group with nobody teaching it yet", () => {
    const unstaffed = GEDU_PRODUCT_SCENARIOS.flatMap((scenario) => {
      const { data } = buildGeduProductPageFixture(now, scenario);
      return data.groups.filter(
        (g) => g.id !== data.my_group_id && g.gedus.length === 0,
      );
    });
    expect(unstaffed.length).toBeGreaterThan(0);
  });
});

/**
 * Remote-vs-in-person is the axis the two scenarios exist to split, and site
 * notes hang off exactly one side of it: an in-person product always has a
 * venue (the schema requires a location), a remote one never does. A fixture
 * that lost the site would silently take the whole site-notes panel off every
 * scene without failing anything else.
 */
describe("site notes follow in-person, and only in-person", () => {
  const now = new Date("2026-02-11T09:00:00Z");

  it("gives the in-person camp a venue with both notes and an address", () => {
    const { data, site } = buildGeduProductPageFixture(now, "camp");
    expect(data.product.is_remote).toBe(false);
    expect(site).not.toBeNull();
    expect(site!.name.trim()).not.toBe("");
    expect(site!.address).not.toBeNull();
    expect(site!.publicNote).not.toBeNull();
    expect(site!.staffNote).not.toBeNull();
  });

  it("gives the remote club no venue at all", () => {
    const { data, site } = buildGeduProductPageFixture(now, "club");
    expect(data.product.is_remote).toBe(true);
    expect(site).toBeNull();
  });
});

/**
 * The consolidated `club` scenario is the kitchen sink: everything that can
 * coexist on one product page now has to be reachable from that one page,
 * because there is no longer a second scenario to hide a missing state in.
 */
describe("the club scenario stays the kitchen sink", () => {
  const now = new Date("2026-02-11T09:00:00Z");

  it("carries 50+ past entries with a realistic mix of states", () => {
    const { entries } = buildGeduProductPageFixture(now, "club");
    const past = entries.filter((e) => e.kind !== "future");
    expect(past.length).toBeGreaterThan(50);

    const kinds = new Set(past.map((e) => e.kind));
    // Skips and pre-epoch history alongside the ordinary weeks — otherwise the
    // long-feed navigation is only exercised against one state.
    expect(kinds).toContain("past");
    expect(kinds).toContain("skipped");
    expect(kinds).toContain("no_record");
  });

  it("mixes recorded weeks, bare gaps and a written-up week still owed", () => {
    // The three shapes a past entry can take, all in one feed. The third is the
    // one the attendance model exists for: notes present, attendance null, so
    // it renders its body *and* its alert.
    const { entries } = buildGeduProductPageFixture(now, "club");
    const pastEntries = entries.filter((e) => e.kind === "past");

    expect(
      pastEntries.filter((e) => e.presentGamerIds !== null).length,
    ).toBeGreaterThan(40);
    expect(
      pastEntries.some(
        (e) => e.presentGamerIds === null && e.publicNote === null,
      ),
    ).toBe(true);
    expect(
      pastEntries.some(
        (e) => e.presentGamerIds === null && e.publicNote !== null,
      ),
    ).toBe(true);
  });

  it("plans at least one future session, so the planning editor has a filled state", () => {
    const { entries } = buildGeduProductPageFixture(now, "club");
    const planned = entries.filter(
      (e) =>
        e.kind === "future" && (e.publicNote !== null || e.staffNote !== null),
    );
    expect(planned.length).toBeGreaterThan(0);
  });

  it("spans more than a year, so the month dividers cross a New Year", () => {
    const { entries } = buildGeduProductPageFixture(now, "club");
    const oldest = entries[entries.length - 1].startsAt;
    const newest = entries[0].startsAt;
    const months =
      (newest.getUTCFullYear() - oldest.getUTCFullYear()) * 12 +
      (newest.getUTCMonth() - oldest.getUTCMonth());
    expect(months).toBeGreaterThan(12);
  });

  it("varies its recap copy rather than repeating one note 53 times", () => {
    const { entries } = buildGeduProductPageFixture(now, "club");
    const notes = entries
      .filter((e) => e.kind === "past")
      .map((e) => e.publicNote)
      .filter((n) => n !== null);
    expect(new Set(notes).size).toBeGreaterThan(10);
  });
});

/**
 * The camp is the "nothing outstanding" side of the pair, and the dashboard
 * leans on it: its badge counts are derived from these very feeds, so a camp
 * that quietly grew a gap would put the same badge on both dashboard cards and
 * take the zero state off the scene entirely.
 */
describe("the camp scenario is fully written up", () => {
  const now = new Date("2026-02-11T09:00:00Z");

  it("has no past session still owing its attendance", () => {
    const { entries } = buildGeduProductPageFixture(now, "camp");
    const owed = entries.filter(
      (e) => e.kind === "past" && e.presentGamerIds === null,
    );
    expect(owed).toEqual([]);
  });

  it("still runs several days, so the daily cadence is visible", () => {
    const { entries } = buildGeduProductPageFixture(now, "camp");
    expect(entries.filter((e) => e.kind === "past").length).toBeGreaterThan(3);
  });
});

/**
 * The dashboard's whole job is four states — open Join, locked Join, a badge,
 * no badge — and an open voice window is true for about two hours a week, so
 * the fixture manufactures one rather than leaving the most interesting state
 * unreviewable six days out of seven. That is worth pinning: it is derived from
 * `now` through the real schedule expansion, so a change to either the slot
 * arithmetic or the window boundaries would silently take it away again.
 *
 * `now` is late evening in the club's own zone, outside the camp's daytime
 * hours, so the camp cannot accidentally be open too.
 */
describe("the gedu dashboard scene puts every card state on one screen", () => {
  const now = new Date("2026-02-11T20:00:00Z");

  function summaries() {
    return buildGeduDashboardFixture(
      now,
      "default",
      "en",
      "Europe/Helsinki",
    ).assignments.map((card) => card.assignment);
  }

  it("has exactly one card mid-session, with its room open", () => {
    const open = summaries().filter((a) => a.voiceIsOpen);
    expect(open).toHaveLength(1);
    expect(open[0].nextSessionStart!.getTime()).toBeLessThanOrEqual(
      now.getTime(),
    );
  });

  it("shows one card behind on write-ups and one clear", () => {
    const counts = summaries()
      .map((a) => a.attentionCount)
      .sort((a, b) => a - b);
    expect(counts).toHaveLength(2);
    expect(counts[0]).toBe(0);
    expect(counts[1]).toBeGreaterThan(0);
  });

  it("points every card at the product-page scene its badge was counted from", () => {
    for (const assignment of summaries()) {
      expect(assignment.openHref).toMatch(
        /^\/preview\/gedu-product\/(club|camp)$/,
      );
    }
  });

  it("only withholds verification in the scenario that is about it", () => {
    for (const scenario of GEDU_DASHBOARD_SCENARIOS) {
      const { verified } = buildGeduDashboardFixture(
        now,
        scenario,
        "en",
        "Europe/Helsinki",
      );
      expect(verified, scenario).toBe(scenario !== "unverified");
    }
  });
});
