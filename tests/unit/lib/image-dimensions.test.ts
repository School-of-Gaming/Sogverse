import { describe, it, expect } from "vitest";
import { fitWithinMaxEdge } from "@/lib/images/image-dimensions";

const MAX_EDGE = 2048;

describe("fitWithinMaxEdge", () => {
  it("leaves an image already inside the cap untouched", () => {
    expect(fitWithinMaxEdge({ width: 1280, height: 720 }, MAX_EDGE)).toEqual({
      width: 1280,
      height: 720,
    });
  });

  it("leaves an image sitting exactly on the cap untouched", () => {
    expect(fitWithinMaxEdge({ width: 2048, height: 1152 }, MAX_EDGE)).toEqual({
      width: 2048,
      height: 1152,
    });
  });

  // The 4K landscape screenshot this pipeline exists for.
  it("scales a wide image so its width lands exactly on the cap", () => {
    expect(fitWithinMaxEdge({ width: 3840, height: 2160 }, MAX_EDGE)).toEqual({
      width: 2048,
      height: 1152,
    });
  });

  // A phone photo held upright: the *height* is the long edge, and the cap has
  // to bind on it rather than on the width.
  it("scales a tall image so its height lands exactly on the cap", () => {
    expect(fitWithinMaxEdge({ width: 3024, height: 4032 }, MAX_EDGE)).toEqual({
      width: 1536,
      height: 2048,
    });
  });

  it("keeps a square square", () => {
    expect(fitWithinMaxEdge({ width: 3000, height: 3000 }, MAX_EDGE)).toEqual({
      width: 2048,
      height: 2048,
    });
  });

  it("rounds the short edge to a whole pixel", () => {
    // 4000 → 2048 is ×0.512; 2251 × 0.512 = 1152.512, which rounds up.
    expect(fitWithinMaxEdge({ width: 4000, height: 2251 }, MAX_EDGE)).toEqual({
      width: 2048,
      height: 1153,
    });
  });

  // An absurd ratio would otherwise round the short edge to zero, and a
  // zero-height canvas throws at draw time instead of producing a thin image.
  it("never rounds an edge down to zero", () => {
    const fitted = fitWithinMaxEdge({ width: 8000, height: 1 }, MAX_EDGE);
    expect(fitted).toEqual({ width: 2048, height: 1 });
  });

  it("honours a cap other than the default", () => {
    expect(fitWithinMaxEdge({ width: 4000, height: 2000 }, 500)).toEqual({
      width: 500,
      height: 250,
    });
  });

  // A decoded bitmap always reports positive integers, so these inputs mean a
  // bug upstream — answering with a drawable size keeps that bug from becoming
  // an exception three frames later.
  it("clamps non-positive and non-finite source dimensions", () => {
    expect(fitWithinMaxEdge({ width: 0, height: 0 }, MAX_EDGE)).toEqual({
      width: 2048,
      height: 2048,
    });
    expect(
      fitWithinMaxEdge({ width: Number.NaN, height: 100 }, MAX_EDGE),
    ).toEqual({ width: 2048, height: 100 });
    expect(
      fitWithinMaxEdge({ width: Number.POSITIVE_INFINITY, height: 100 }, 512),
    ).toEqual({ width: 512, height: 100 });
  });

  it("clamps a nonsensical cap rather than returning a zero-size canvas", () => {
    expect(fitWithinMaxEdge({ width: 800, height: 600 }, 0)).toEqual({
      width: 1,
      height: 1,
    });
  });
});
