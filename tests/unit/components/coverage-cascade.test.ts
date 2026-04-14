import { describe, it, expect } from "vitest";
import {
  buildCoverageRelations,
  toggleCoverage,
} from "@/components/gedu/coverage-cascade";
import type { Location } from "@/types";

/**
 * The cascade semantics in gedu-coverage-editor are the trickiest logic
 * in this feature and the one most likely to break in a refactor:
 *   - Ticking a parent adds parent + whole subtree.
 *   - Unticking any descendant removes that descendant, its subtree, AND
 *     every selected ancestor up the chain (sibling branches unaffected).
 *
 * These tests lock both directions against real-shaped trees.
 */

// Helper — build a flat location list with explicit ids and parents.
// Using short strings instead of UUIDs to keep assertions readable.
function loc(id: string, parent_id: string | null): Location {
  return {
    id,
    name: id,
    type: "site",
    parent_id,
    country_code: "FI",
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
  };
}

// Finland → Uusimaa → Helsinki → {SchoolA, SchoolB}
//                  → Espoo    → {SchoolC}
//                  → Vantaa
// Pirkanmaa → Tampere
const LOCATIONS: Location[] = [
  loc("finland", null),
  loc("uusimaa", "finland"),
  loc("helsinki", "uusimaa"),
  loc("schoolA", "helsinki"),
  loc("schoolB", "helsinki"),
  loc("espoo", "uusimaa"),
  loc("schoolC", "espoo"),
  loc("vantaa", "uusimaa"),
  loc("pirkanmaa", "finland"),
  loc("tampere", "pirkanmaa"),
];

const R = buildCoverageRelations(LOCATIONS);

describe("buildCoverageRelations", () => {
  it("resolves transitive descendants", () => {
    const uusimaaDescendants = new Set(R.descendantsOf.get("uusimaa") ?? []);
    expect(uusimaaDescendants).toEqual(
      new Set(["helsinki", "schoolA", "schoolB", "espoo", "schoolC", "vantaa"]),
    );
  });

  it("stores direct parent only", () => {
    expect(R.parentOf.get("schoolA")).toBe("helsinki");
    expect(R.parentOf.get("helsinki")).toBe("uusimaa");
    expect(R.parentOf.get("finland")).toBeUndefined();
  });
});

describe("toggleCoverage — ticking", () => {
  it("ticking a leaf adds only that leaf", () => {
    const result = toggleCoverage(new Set(), "schoolA", R);
    expect(result).toEqual(new Set(["schoolA"]));
  });

  it("ticking a parent adds the whole subtree", () => {
    const result = toggleCoverage(new Set(), "uusimaa", R);
    expect(result).toEqual(
      new Set(["uusimaa", "helsinki", "schoolA", "schoolB", "espoo", "schoolC", "vantaa"]),
    );
  });

  it("ticking does not affect sibling branches", () => {
    const result = toggleCoverage(new Set(), "uusimaa", R);
    expect(result.has("pirkanmaa")).toBe(false);
    expect(result.has("tampere")).toBe(false);
  });
});

describe("toggleCoverage — unticking", () => {
  it("unticking a descendant of a ticked parent removes parent + subtree of that descendant, keeping siblings", () => {
    // User ticked Uusimaa (subtree selected), then unticks Helsinki.
    // Expected: Uusimaa gone (no longer full coverage), Helsinki + its
    // schools gone, Espoo/Vantaa and their schools remain.
    const after1 = toggleCoverage(new Set(), "uusimaa", R);
    const after2 = toggleCoverage(after1, "helsinki", R);

    expect(after2).toEqual(new Set(["espoo", "schoolC", "vantaa"]));
  });

  it("unticking a deeply nested leaf unselects every selected ancestor up to the root", () => {
    // User ticks Finland (the whole tree), then unticks a single school.
    // Finland, Uusimaa, and Helsinki all drop (each was claiming full
    // coverage of its subtree). Everything else stays.
    const after1 = toggleCoverage(new Set(), "finland", R);
    const after2 = toggleCoverage(after1, "schoolA", R);

    expect(after2.has("finland")).toBe(false);
    expect(after2.has("uusimaa")).toBe(false);
    expect(after2.has("helsinki")).toBe(false);
    expect(after2.has("schoolA")).toBe(false);

    // Sibling branches under the unticked ancestors still stand.
    expect(after2.has("schoolB")).toBe(true);
    expect(after2.has("espoo")).toBe(true);
    expect(after2.has("schoolC")).toBe(true);
    expect(after2.has("vantaa")).toBe(true);
    expect(after2.has("pirkanmaa")).toBe(true);
    expect(after2.has("tampere")).toBe(true);
  });

  it("unticking a node removes its subtree even when ancestors weren't selected", () => {
    // Directly tick a mid-level node, then untick it — subtree goes,
    // nothing else is touched.
    const after1 = toggleCoverage(new Set(), "helsinki", R);
    expect(after1).toEqual(new Set(["helsinki", "schoolA", "schoolB"]));

    const after2 = toggleCoverage(after1, "helsinki", R);
    expect(after2).toEqual(new Set());
  });

  it("unticking a leaf leaves unrelated selections untouched", () => {
    const start = new Set(["pirkanmaa", "tampere", "schoolA"]);
    const result = toggleCoverage(start, "schoolA", R);

    expect(result).toEqual(new Set(["pirkanmaa", "tampere"]));
  });
});

describe("toggleCoverage — immutability", () => {
  it("does not mutate the input set", () => {
    const start = new Set(["schoolA"]);
    toggleCoverage(start, "uusimaa", R);
    expect(start).toEqual(new Set(["schoolA"]));
  });
});
