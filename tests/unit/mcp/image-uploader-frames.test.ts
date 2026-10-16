import { describe, expect, it } from "vitest";
import {
  RATIO_TOLERANCE,
  describeRatio,
  judgePicture,
  matchFrame,
  sourceRect,
  type Frame,
} from "../../../packages/mcp-image-uploader/src/frames";

/*
 * How the MCP picture uploader judges a picked picture against the frames its
 * opening offers: a picture within 1% of a frame's ratio is that frame's
 * shape and is only scaled; anything else is refused with a sentence the
 * model can relay. The view never crops.
 */

const HERO_RULE = "A hero section's picture must be wide 16:9.";

function frame(name: string, width: number, height: number, refusal: string | null = null): Frame {
  return { purpose: name, name, width, height, uploadTool: `upload_${name}`, refusal };
}

const WIDE = frame("wide 16:9", 1600, 900);
const SQUARE = frame("square 1:1", 1200, 1200);
const PORTRAIT = frame("portrait 4:5", 1200, 1500);
const LANDING = {
  frames: [WIDE, SQUARE, PORTRAIT],
  noFrame: "A landing page picture must be wide 16:9, square 1:1 or portrait 4:5.",
};

describe("matchFrame", () => {
  it.each([
    ["an exact wide picture", 1920, 1080, WIDE],
    ["a phone photo of a square", 3024, 3024, SQUARE],
    ["an Instagram portrait", 1080, 1350, PORTRAIT],
    ["a picture smaller than the frame", 640, 360, WIDE],
  ])("matches %s", (_, width, height, expected) => {
    expect(matchFrame(width, height, LANDING.frames)).toBe(expected);
  });

  it("matches a ratio just inside 1% and not one just outside", () => {
    const inside = Math.floor(1000 * (1 + RATIO_TOLERANCE) - 1);
    const outside = Math.ceil(1000 * (1 + RATIO_TOLERANCE) + 1);
    expect(matchFrame(inside, 1000, LANDING.frames)).toBe(SQUARE);
    expect(matchFrame(1000, inside, LANDING.frames)).toBe(SQUARE);
    expect(matchFrame(outside, 1000, LANDING.frames)).toBeNull();
    expect(matchFrame(1000, outside, LANDING.frames)).toBeNull();
  });

  it.each([
    ["3:2", 1500, 1000],
    ["4:3", 1600, 1200],
    ["a phone screenshot", 1170, 2532],
    ["9:16", 1080, 1920],
  ])("matches no frame for %s", (_, width, height) => {
    expect(matchFrame(width, height, LANDING.frames)).toBeNull();
  });
});

describe("describeRatio", () => {
  it.each([
    [1500, 1000, "3:2"],
    [4032, 3024, "4:3"],
    [1080, 1920, "9:16"],
    [1600, 925, "1.73:1"],
    [1170, 2532, "1:2.16"],
  ])("names %i × %i as %s", (width, height, expected) => {
    expect(describeRatio(width, height)).toBe(expected);
  });
});

describe("judgePicture", () => {
  it("takes a picture of a shape the destination takes, as that shape's frame", () => {
    expect(judgePicture(1080, 1350, LANDING)).toEqual({ kind: "fits", frame: PORTRAIT });
  });

  it("refuses a picture of no shape, naming its ratio and size and the shapes allowed", () => {
    expect(judgePicture(1500, 1000, LANDING)).toEqual({
      kind: "refused",
      reason:
        "This picture is 3:2 (1500 × 1000). A landing page picture must be wide 16:9, square 1:1 or portrait 4:5.",
    });
  });

  it("refuses a picture of a shape this destination does not take, naming the shape and the rule", () => {
    const hero = {
      frames: [WIDE, frame("square 1:1", 1200, 1200, HERO_RULE), frame("portrait 4:5", 1200, 1500, HERO_RULE)],
      noFrame: HERO_RULE,
    };
    expect(judgePicture(1200, 1200, hero)).toEqual({
      kind: "refused",
      reason: `This picture is square 1:1 (1200 × 1200). ${HERO_RULE}`,
    });
    expect(judgePicture(1500, 1000, hero)).toEqual({
      kind: "refused",
      reason: `This picture is 3:2 (1500 × 1000). ${HERO_RULE}`,
    });
  });

  it("takes a picture smaller than the frame: only its sharpness suffers, which the view warns of", () => {
    expect(judgePicture(400, 400, LANDING)).toEqual({ kind: "fits", frame: SQUARE });
  });
});

describe("sourceRect", () => {
  it("draws an exact picture whole", () => {
    expect(sourceRect(3200, 1800, WIDE)).toEqual({ sx: 0, sy: 0, sw: 3200, sh: 1800 });
  });

  it("trims only the sliver a nearly matching picture differs by, evenly from both ends", () => {
    // 1% wider than square: 10 px over a 1000 px height, 5 from each side.
    expect(sourceRect(1010, 1000, SQUARE)).toEqual({ sx: 5, sy: 0, sw: 1000, sh: 1000 });
    expect(sourceRect(1000, 1010, SQUARE)).toEqual({ sx: 0, sy: 5, sw: 1000, sh: 1000 });
  });
});
