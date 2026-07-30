import { describe, expect, it } from "vitest";
import {
  PREVIEW_SCENES,
  findPreviewScene,
  previewSceneHref,
  sceneHasScenario,
} from "@/components/preview/scenes";
import { GEDU_DASHBOARD_SCENARIOS } from "@/components/gedu/mock-dashboard-fixtures";
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
    expect(sceneHasScenario(scene!, "camp-daily")).toBe(true);
    expect(sceneHasScenario(scene!, "club-midterm")).toBe(true);
    expect(sceneHasScenario(scene!, "default")).toBe(false);
  });

  it("builds the route the dynamic page serves", () => {
    expect(previewSceneHref("gedu-product", "camp-daily")).toBe(
      "/preview/gedu-product/camp-daily",
    );
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
    const first = buildGeduProductPageFixture(now, "club-midterm");
    const second = buildGeduProductPageFixture(now, "club-midterm");
    expect(first.data.groups[0].gedus.map((g) => g.id)).toEqual(
      second.data.groups[0].gedus.map((g) => g.id),
    );
  });
});

/**
 * The product page's reference rail leads with the other groups on the product —
 * the "cover my room for ten minutes" surface. A scenario with no sister groups
 * only ever shows the rail's empty state, so the scenarios have to be split
 * deliberately between the two rather than by accident.
 */
describe("every scenario exercises the reference rail's other-groups card", () => {
  const now = new Date("2026-02-11T09:00:00Z");

  function peerCountFor(scenario: (typeof GEDU_PRODUCT_SCENARIOS)[number]) {
    const { data } = buildGeduProductPageFixture(now, scenario);
    return data.groups.filter((g) => g.id !== data.my_group_id).length;
  }

  it("gives every scenario but first-week at least one peer group", () => {
    for (const scenario of GEDU_PRODUCT_SCENARIOS) {
      if (scenario === "first-week") continue;
      expect(peerCountFor(scenario), scenario).toBeGreaterThan(0);
    }
  });

  it("keeps first-week at zero peers, as the rail's empty state", () => {
    expect(peerCountFor("first-week")).toBe(0);
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

describe("the year-long scenario stays a stress test", () => {
  const now = new Date("2026-02-11T09:00:00Z");

  it("carries 50+ past entries with a realistic mix of states", () => {
    const { entries } = buildGeduProductPageFixture(now, "club-yearlong");
    const past = entries.filter((e) => e.kind !== "future");
    expect(past.length).toBeGreaterThan(50);

    const kinds = new Set(past.map((e) => e.kind));
    // Mostly written up, with skips, owed write-ups and pre-epoch history —
    // otherwise the long-feed navigation is only exercised against one state.
    expect(kinds).toContain("recorded");
    expect(kinds).toContain("skipped");
    expect(kinds).toContain("needs_record");
    expect(kinds).toContain("no_record");
  });

  it("spans more than a year, so the month dividers cross a New Year", () => {
    const { entries } = buildGeduProductPageFixture(now, "club-yearlong");
    const oldest = entries[entries.length - 1].startsAt;
    const newest = entries[0].startsAt;
    const months =
      (newest.getUTCFullYear() - oldest.getUTCFullYear()) * 12 +
      (newest.getUTCMonth() - oldest.getUTCMonth());
    expect(months).toBeGreaterThan(12);
  });

  it("varies its recap copy rather than repeating one note 53 times", () => {
    const { entries } = buildGeduProductPageFixture(now, "club-yearlong");
    const notes = entries
      .filter((e) => e.kind === "recorded")
      .map((e) => e.publicNote);
    expect(new Set(notes).size).toBeGreaterThan(10);
  });
});
