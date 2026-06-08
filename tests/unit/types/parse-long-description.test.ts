import { describe, it, expect } from "vitest";
import { parseLongDescription } from "@/types";
import type { Json } from "@/types";

/**
 * Unit coverage for parseLongDescription — the runtime narrowing from a raw
 * `product_translations.long_description` value (`Json | null`) into the
 * structured block array. The DB CHECK guarantees the shape on write, but the
 * parser still has to defend the renderer against a null/legacy/garbage value.
 */
describe("parseLongDescription", () => {
  it("returns [] for null and undefined", () => {
    expect(parseLongDescription(null)).toEqual([]);
    expect(parseLongDescription(undefined)).toEqual([]);
  });

  it("returns [] for non-array JSON (string, number, object, bool)", () => {
    expect(parseLongDescription("text" as Json)).toEqual([]);
    expect(parseLongDescription(42 as Json)).toEqual([]);
    expect(parseLongDescription(true as Json)).toEqual([]);
    expect(parseLongDescription({ type: "heading", text: "x" } as Json)).toEqual(
      [],
    );
  });

  it("passes a well-formed block array through unchanged", () => {
    const blocks: Json = [
      { type: "heading", text: "What you'll learn" },
      { type: "paragraph", text: "Kids build their first redstone door." },
    ];
    expect(parseLongDescription(blocks)).toEqual([
      { type: "heading", text: "What you'll learn" },
      { type: "paragraph", text: "Kids build their first redstone door." },
    ]);
  });

  it("drops elements with an unknown type, missing/non-string text, or wrong shape", () => {
    const blocks: Json = [
      { type: "heading", text: "Keep me" },
      { type: "quote", text: "wrong type" },
      { type: "paragraph" },
      { type: "paragraph", text: 5 },
      "not an object",
      null,
      ["nested"],
      { type: "paragraph", text: "Keep me too" },
    ];
    expect(parseLongDescription(blocks)).toEqual([
      { type: "heading", text: "Keep me" },
      { type: "paragraph", text: "Keep me too" },
    ]);
  });
});
