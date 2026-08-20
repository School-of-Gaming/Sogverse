import { describe, expect, it } from "vitest";

import {
  computeLinkPlan,
  deriveLabel,
  looksLikeCataloguePath,
  manifestDiffIsClean,
  normaliseExtension,
  planLegacyDeletion,
  projectRefFromSupabaseUrl,
  targetNeedsLiveFlag,
  verifyManifest,
} from "../../../scripts/lib/product-image-catalogue";
import type {
  CatalogueRow,
  ImagedProduct,
  LegacyResolution,
} from "../../../scripts/lib/product-image-catalogue";

// Two fabricated hashes, written out rather than computed: the plan is a pure
// function of the hash, and a literal keeps the expectations readable.
const SHA_A = "a".repeat(64);
const SHA_B = "b".repeat(64);

function product(overrides: Partial<ImagedProduct> & { id: string }): ImagedProduct {
  return {
    imagePath: "legacy-1.png",
    imageId: null,
    createdAt: "2026-01-01T00:00:00Z",
    name: "A product",
    ...overrides,
  };
}

function hashed(sha256: string, ext = "png"): LegacyResolution {
  return { kind: "hashed", sha256, ext };
}

describe("normaliseExtension", () => {
  it("accepts the same list the product routes accept, collapsing jpeg to jpg", () => {
    expect(normaliseExtension("x.png")).toEqual({
      ext: "png",
      contentType: "image/png",
    });
    expect(normaliseExtension("x.JPEG")).toEqual({
      ext: "jpg",
      contentType: "image/jpeg",
    });
    expect(normaliseExtension("x.svg")).toEqual({
      ext: "svg",
      contentType: "image/svg+xml",
    });
  });

  it("rejects anything outside the accept list, and anything with no extension", () => {
    expect(normaliseExtension("x.gif")).toBeNull();
    expect(normaliseExtension("x.heic")).toBeNull();
    expect(normaliseExtension("noextension")).toBeNull();
    expect(normaliseExtension(".png")).toBeNull();
  });
});

describe("looksLikeCataloguePath", () => {
  it("recognises a <sha256>.<ext> key and nothing else", () => {
    expect(looksLikeCataloguePath(`${SHA_A}.png`)).toBe(true);
    expect(
      looksLikeCataloguePath("7a81f400-159b-40e5-8bcf-fc974dd190af.png"),
    ).toBe(false);
    expect(looksLikeCataloguePath(`${SHA_A.toUpperCase()}.png`)).toBe(false);
  });
});

describe("deriveLabel", () => {
  it("trims, and falls back to Image when there is no name", () => {
    expect(deriveLabel("  Minecraft Club  ")).toBe("Minecraft Club");
    expect(deriveLabel(null)).toBe("Image");
    expect(deriveLabel("   ")).toBe("Image");
  });

  it("caps at the column's 120-character CHECK without leaving a trailing space", () => {
    const label = deriveLabel(`${"x".repeat(119)} tail`);
    expect(label).toHaveLength(119);
    expect(label.endsWith("x")).toBe(true);
  });
});

describe("computeLinkPlan", () => {
  it("collapses two legacy paths with the same bytes into one entry", () => {
    const products = [
      product({ id: "p1", imagePath: "legacy-1.png", createdAt: "2026-01-01T00:00:00Z", name: "Older" }),
      product({ id: "p2", imagePath: "legacy-2.png", createdAt: "2026-02-01T00:00:00Z", name: "Newer" }),
    ];
    const resolutions = new Map<string, LegacyResolution>([
      ["legacy-1.png", hashed(SHA_A)],
      ["legacy-2.png", hashed(SHA_A)],
    ]);

    const plan = computeLinkPlan(products, [], resolutions);

    expect(plan.groups).toHaveLength(1);
    const group = plan.groups[0];
    expect(group.targetPath).toBe(`${SHA_A}.png`);
    // The earliest-created product lends the label.
    expect(group.label).toBe("Older");
    expect(group.legacyPaths).toEqual(["legacy-1.png", "legacy-2.png"]);

    // One path creates the row; the other reuses whatever it produced.
    expect(plan.paths.map((p) => p.action.kind)).toEqual([
      "create-entry",
      "reuse-entry",
    ]);
    expect(plan.summary.distinctPaths).toBe(2);
    expect(plan.summary.distinctHashes).toBe(1);
    expect(plan.summary.entriesToCreate).toBe(1);
    expect(plan.summary.productsToRelink).toBe(2);
    expect(plan.summary.nothingToDo).toBe(false);
  });

  it("reuses an existing row for bytes already in the catalogue, keeping its path and label", () => {
    const catalogue: CatalogueRow[] = [
      { id: "e1", sha256: SHA_A, path: `${SHA_A}.jpg`, label: "Hand-written" },
    ];
    const products = [product({ id: "p1", imagePath: "legacy-1.png" })];
    const resolutions = new Map<string, LegacyResolution>([
      ["legacy-1.png", hashed(SHA_A)],
    ]);

    const plan = computeLinkPlan(products, catalogue, resolutions);

    expect(plan.summary.entriesToCreate).toBe(0);
    expect(plan.summary.entriesReused).toBe(1);
    expect(plan.groups[0].targetPath).toBe(`${SHA_A}.jpg`);
    expect(plan.groups[0].label).toBe("Hand-written");
    expect(plan.paths[0].action).toEqual({
      kind: "reuse-entry",
      sha256: SHA_A,
      targetPath: `${SHA_A}.jpg`,
      entryId: "e1",
    });
  });

  it("says there is nothing to do once every product sits on a linked catalogue path", () => {
    const catalogue: CatalogueRow[] = [
      { id: "e1", sha256: SHA_A, path: `${SHA_A}.png`, label: "Done" },
    ];
    const products = [
      product({ id: "p1", imagePath: `${SHA_A}.png`, imageId: "e1" }),
      product({ id: "p2", imagePath: `${SHA_A}.png`, imageId: "e1" }),
    ];

    const plan = computeLinkPlan(products, catalogue, new Map());

    expect(plan.paths).toHaveLength(1);
    expect(plan.paths[0].action).toEqual({ kind: "already-linked", entryId: "e1" });
    expect(plan.summary.nothingToDo).toBe(true);
    expect(plan.summary.legacyPaths).toBe(0);
    expect(plan.summary.cataloguePaths).toBe(1);
  });

  it("relinks a product left on a catalogue path with no image_id", () => {
    const catalogue: CatalogueRow[] = [
      { id: "e1", sha256: SHA_A, path: `${SHA_A}.png`, label: "Done" },
    ];
    const products = [
      product({ id: "p1", imagePath: `${SHA_A}.png`, imageId: "e1" }),
      product({ id: "p2", imagePath: `${SHA_A}.png`, imageId: null }),
    ];

    const plan = computeLinkPlan(products, catalogue, new Map());

    expect(plan.paths[0].action).toEqual({ kind: "link-only", entryId: "e1" });
    expect(plan.paths[0].toLink.map((p) => p.id)).toEqual(["p2"]);
    expect(plan.summary.productsToRelink).toBe(1);
    expect(plan.summary.nothingToDo).toBe(false);
  });

  it("reports a legacy object that is gone and links nothing for it", () => {
    const products = [
      product({ id: "p1", imagePath: "legacy-1.png" }),
      product({ id: "p2", imagePath: "legacy-2.png" }),
    ];
    const resolutions = new Map<string, LegacyResolution>([
      ["legacy-1.png", hashed(SHA_B)],
      ["legacy-2.png", { kind: "missing" }],
    ]);

    const plan = computeLinkPlan(products, [], resolutions);

    expect(plan.missing.map((m) => m.path)).toEqual(["legacy-2.png"]);
    expect(plan.summary.missingLegacyObjects).toBe(1);
    expect(plan.summary.productsWithMissingObject).toBe(1);
    // Only the resolvable path contributes work.
    expect(plan.summary.productsToRelink).toBe(1);
    expect(plan.summary.nothingToDo).toBe(false);
  });

  it("is stable regardless of the order products arrive in", () => {
    const a = product({ id: "p1", imagePath: "legacy-2.png", createdAt: "2026-03-01T00:00:00Z", name: "Newer" });
    const b = product({ id: "p2", imagePath: "legacy-1.png", createdAt: "2026-01-01T00:00:00Z", name: "Older" });
    const resolutions = new Map<string, LegacyResolution>([
      ["legacy-1.png", hashed(SHA_A, "jpg")],
      ["legacy-2.png", hashed(SHA_A, "png")],
    ]);

    const forwards = computeLinkPlan([a, b], [], resolutions);
    const backwards = computeLinkPlan([b, a], [], resolutions);

    // The earliest-created product's own extension decides the catalogue key,
    // so two legacy copies of one picture cannot disagree about it.
    expect(forwards.groups[0].targetPath).toBe(`${SHA_A}.jpg`);
    expect(forwards.groups[0].label).toBe("Older");
    expect(backwards.groups).toEqual(forwards.groups);
    expect(backwards.paths.map((p) => p.path)).toEqual(
      forwards.paths.map((p) => p.path),
    );
  });
});

describe("verifyManifest", () => {
  const manifest = [
    { name: "a.png", bytes: 10 },
    { name: "b.png", bytes: 20 },
  ];

  it("is clean when the bucket still matches exactly", () => {
    const diff = verifyManifest(manifest, [
      { name: "b.png", bytes: 20 },
      { name: "a.png", bytes: 10 },
    ]);
    expect(manifestDiffIsClean(diff)).toBe(true);
  });

  it("flags an object that vanished, one that was never backed up, and a size change", () => {
    const diff = verifyManifest(manifest, [
      { name: "a.png", bytes: 11 },
      { name: "c.png", bytes: 30 },
    ]);
    expect(diff.missingFromBucket).toEqual(["b.png"]);
    expect(diff.missingFromManifest).toEqual(["c.png"]);
    expect(diff.sizeMismatch).toEqual([
      { name: "a.png", manifestBytes: 10, bucketBytes: 11 },
    ]);
    expect(manifestDiffIsClean(diff)).toBe(false);
  });
});

describe("planLegacyDeletion", () => {
  const now = new Date("2026-08-20T12:00:00Z");

  it("keeps referenced objects, skips young ones, removes the rest", () => {
    const objects = [
      { name: `${SHA_A}.png`, bytes: 1, createdAt: "2026-01-01T00:00:00Z" },
      { name: "legacy-old.png", bytes: 2, createdAt: "2026-01-01T00:00:00Z" },
      { name: "legacy-fresh.png", bytes: 3, createdAt: "2026-08-20T11:00:00Z" },
    ];

    const plan = planLegacyDeletion(objects, new Set([`${SHA_A}.png`]), now);

    expect(plan.referenced.map((o) => o.name)).toEqual([`${SHA_A}.png`]);
    expect(plan.tooNew.map((o) => o.name)).toEqual(["legacy-fresh.png"]);
    expect(plan.remove.map((o) => o.name)).toEqual(["legacy-old.png"]);
  });

  it("treats an object exactly at the cutoff as still too new", () => {
    const objects = [
      { name: "edge.png", bytes: 1, createdAt: "2026-08-19T12:00:01Z" },
    ];
    expect(planLegacyDeletion(objects, new Set(), now).tooNew).toHaveLength(1);
  });
});

describe("target resolution", () => {
  it("reads the project ref out of a Supabase URL", () => {
    expect(projectRefFromSupabaseUrl("https://abc123.supabase.co")).toBe("abc123");
    expect(projectRefFromSupabaseUrl("https://example.com")).toBeNull();
    expect(projectRefFromSupabaseUrl("not a url")).toBeNull();
  });

  it("demands --live for anything that is not the ref .env.local names", () => {
    expect(targetNeedsLiveFlag("staging", "staging", "prod")).toBe(false);
    expect(targetNeedsLiveFlag("prod", "staging", "prod")).toBe(true);
    expect(targetNeedsLiveFlag("somethingelse", "staging", "prod")).toBe(true);
    // A known production ref needs it even if the environment has been talked
    // into calling itself staging.
    expect(targetNeedsLiveFlag("prod", "prod", "prod")).toBe(true);
    // Nothing to compare against is not a reason to relax.
    expect(targetNeedsLiveFlag("staging", undefined, undefined)).toBe(true);
  });
});
