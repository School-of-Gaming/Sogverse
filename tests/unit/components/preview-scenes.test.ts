import { describe, expect, it } from "vitest";
import {
  PREVIEW_SCENES,
  findPreviewScene,
  previewSceneHref,
  sceneHasScenario,
} from "@/components/preview/scenes";
import { GEDU_DASHBOARD_SCENARIOS } from "@/components/gedu/mock-dashboard-fixtures";
import { GEDU_PRODUCT_SCENARIOS } from "@/components/gedu/session-details/mock-product-page-fixtures";
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
