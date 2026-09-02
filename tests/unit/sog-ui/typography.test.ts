import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  FACES,
  TYPE_RULES,
  TYPE_SCALE,
} from "../../../packages/sog-ui/src/tokens/typography";

/**
 * The face contract and the scale, held to their own shape.
 *
 * The last check here is the load-bearing one: the contract is only real if some
 * consumer honours it, and the demo's layout is the reference implementation.
 * next/font reads its options statically and so cannot import the variable names
 * from the token source, which leaves exactly one way for the two halves to
 * drift — and this is it.
 */

// Anchored on the Vitest project root rather than on `import.meta.url`, which a
// test runner does not have to expose as a file: URL.
const DEMO_LAYOUT = join(
  process.cwd(),
  "packages",
  "sog-ui",
  "demo",
  "app",
  "layout.tsx",
);

describe("faces", () => {
  // Vitest's `it.each([])` registers nothing and the suite passes green, so both
  // tables here are floored: an emptied list must fail rather than vanish.
  it("has every face to check", () => {
    expect(Object.keys(FACES).length).toBeGreaterThanOrEqual(4);
  });

  it.each(Object.entries(FACES))(
    "%s names a --font- token and a --font- variable",
    (_id, face) => {
      expect(face.token.startsWith("--font-")).toBe(true);
      expect(face.variable.startsWith("--font-")).toBe(true);
      expect(face.token).not.toBe(face.variable);
    },
  );

  it("gives every face a real fallback stack and at least one weight", () => {
    for (const [id, face] of Object.entries(FACES)) {
      expect(face.fallback.length, `${id} has no fallback`).toBeGreaterThan(0);
      expect(face.weights.length, `${id} loads no weight`).toBeGreaterThan(0);
    }
  });

  it("is honoured by the demo layout, which is the contract's reference implementation", () => {
    const layout = readFileSync(DEMO_LAYOUT, "utf8");
    for (const [id, face] of Object.entries(FACES)) {
      expect(
        layout.includes(`"${face.variable}"`),
        `the demo layout does not define ${face.variable} for ${id}`,
      ).toBe(true);
    }
  });
});

describe("the type scale", () => {
  // The Guidebook's table is seven rows and the scale ships all seven, so this is
  // an equality rather than a floor: a step added or dropped is a change to the
  // scale itself and has to be decided here as well as in the source.
  it("ships the Guidebook's seven steps", () => {
    expect(TYPE_SCALE).toHaveLength(7);
  });

  it.each(TYPE_SCALE.map((step) => [step.id, step] as const))(
    "%s has a positive size and a weight its face actually loads",
    (_id, step) => {
      expect(step.px).toBeGreaterThan(0);
      expect(FACES[step.face].weights).toContain(step.weight);
      expect(step.lineHeight).toBeGreaterThan(0);
      expect(step.cssName.startsWith("--text-")).toBe(true);
    },
  );

  it("gives a mobile step a smaller size and a recorded source", () => {
    for (const step of TYPE_SCALE) {
      if (step.mobilePx === null) {
        expect(step.mobileSource).toBeNull();
        continue;
      }
      expect(step.mobilePx).toBeGreaterThan(0);
      expect(step.mobilePx).toBeLessThan(step.px);
      expect(step.mobileSource).not.toBeNull();
    }
  });

  it("ships each step under its own name", () => {
    const names = TYPE_SCALE.map((step) => step.cssName);
    expect(new Set(names).size).toBe(names.length);
  });

  it("keeps a Guidebook range around the size it ships", () => {
    for (const step of TYPE_SCALE) {
      if (step.range === null) continue;
      const [min, max] = step.range;
      expect(step.px).toBeGreaterThanOrEqual(min);
      expect(step.px).toBeLessThanOrEqual(max);
    }
  });
});

describe("type rules", () => {
  it("records where every rule came from", () => {
    for (const [id, rule] of Object.entries(TYPE_RULES)) {
      expect(rule.statement.length, `${id} has no statement`).toBeGreaterThan(0);
      expect(["Guidebook", "design pass", "owner ruling"]).toContain(rule.source);
    }
  });
});
