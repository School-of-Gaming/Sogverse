import { describe, expect, it } from "vitest";
import {
  batchReport,
  judgeInBatch,
  placeCalls,
  type BatchOpening,
  type FileOutcome,
} from "../../../packages/mcp-image-uploader/src/batch";
import type { Frame } from "../../../packages/mcp-image-uploader/src/frames";

/*
 * How the MCP picture uploader takes several pictures at once: each file is
 * judged on its own by the frame rules, then against what the batch has
 * already taken — the destination's room and, where it needs one, its one
 * shape — and the model is told the whole batch in one report.
 */

function frame(name: string, width: number, height: number, refusal: string | null = null): Frame {
  return { purpose: name, name, width, height, refusal };
}

const WIDE = frame("wide 16:9", 1600, 900);
const SQUARE = frame("square 1:1", 1200, 1200);
const PORTRAIT = frame("portrait 4:5", 1200, 1500);
const NO_FRAME = "A landing page picture must be wide 16:9, square 1:1 or portrait 4:5.";
const ONE_SHAPE = "An image section's pictures must all be one shape, so its grid lines up.";
const FULL = "An image section shows at most four pictures, and this one has room for 2 more.";

const CATALOGUE: BatchOpening = {
  frames: [WIDE, SQUARE, PORTRAIT],
  noFrame: NO_FRAME,
  room: null,
  oneShape: null,
};
const IMAGE_SECTION: BatchOpening = { ...CATALOGUE, room: { pictures: 2, full: FULL }, oneShape: ONE_SHAPE };
const HERO_RULE = "A hero section's picture must be wide 16:9.";
const HERO: BatchOpening = {
  frames: [WIDE, frame("square 1:1", 1200, 1200, HERO_RULE), frame("portrait 4:5", 1200, 1500, HERO_RULE)],
  noFrame: HERO_RULE,
  room: { pictures: 1, full: "A hero section shows one picture: only the first that fits is taken." },
  oneShape: null,
};

/** Judge a batch of picture sizes in pick order, as the view does: each accepted frame joins `taken`. */
function judgeAll(opening: BatchOpening, sizes: readonly [number, number][]) {
  const taken: Frame[] = [];
  return sizes.map(([width, height]) => {
    const verdict = judgeInBatch(width, height, opening, taken);
    if (verdict.kind === "fits") taken.push(verdict.frame);
    return verdict;
  });
}

describe("judgeInBatch", () => {
  it("judges each file of a mixed batch on its own, so a bad one holds back none of the others", () => {
    expect(judgeAll(CATALOGUE, [[1920, 1080], [1500, 1000], [3024, 3024], [1080, 1350]])).toEqual([
      { kind: "fits", frame: WIDE },
      { kind: "refused", reason: `This picture is 3:2 (1500 × 1000). ${NO_FRAME}` },
      { kind: "fits", frame: SQUARE },
      { kind: "fits", frame: PORTRAIT },
    ]);
  });

  it("takes any number, of any shape, for the catalogue alone", () => {
    const verdicts = judgeAll(CATALOGUE, Array.from({ length: 12 }, (_, n) => (n % 2 ? [1200, 1200] : [1600, 900])));
    expect(verdicts.every((verdict) => verdict.kind === "fits")).toBe(true);
  });

  it("takes an image section's room in pick order and refuses the pictures past it", () => {
    expect(judgeAll(IMAGE_SECTION, [[1600, 900], [1920, 1080], [3200, 1800]])).toEqual([
      { kind: "fits", frame: WIDE },
      { kind: "fits", frame: WIDE },
      { kind: "refused", reason: FULL },
    ]);
  });

  it("counts only pictures that pass against the room, so a refused one uses up no place", () => {
    expect(judgeAll(IMAGE_SECTION, [[1500, 1000], [1600, 900], [1600, 900]]).map((v) => v.kind)).toEqual([
      "refused",
      "fits",
      "fits",
    ]);
  });

  it("lets the first picture taken fix a one-shape batch, refusing another shape with the rule", () => {
    expect(judgeAll(IMAGE_SECTION, [[1500, 1000], [1200, 1200], [1600, 900], [1000, 1000]])).toEqual([
      { kind: "refused", reason: `This picture is 3:2 (1500 × 1000). ${NO_FRAME}` },
      { kind: "fits", frame: SQUARE },
      {
        kind: "refused",
        reason: `This picture is wide 16:9 (1600 × 900), and the first picture taken is square 1:1. ${ONE_SHAPE}`,
      },
      { kind: "fits", frame: SQUARE },
    ]);
  });

  it("tells a picture of the wrong shape that, rather than that the room is full", () => {
    const full = judgeAll(IMAGE_SECTION, [[1600, 900], [1600, 900], [1200, 1200]]);
    expect(full[2]).toEqual({
      kind: "refused",
      reason: `This picture is square 1:1 (1200 × 1200), and the first picture taken is wide 16:9. ${ONE_SHAPE}`,
    });
  });

  it("takes one picture for a single-picture destination: the first that fits", () => {
    expect(judgeAll(HERO, [[1200, 1200], [1600, 900], [1920, 1080]])).toEqual([
      { kind: "refused", reason: `This picture is square 1:1 (1200 × 1200). ${HERO_RULE}` },
      { kind: "fits", frame: WIDE },
      { kind: "refused", reason: HERO.room?.full },
    ]);
  });
});

describe("placeCalls", () => {
  const where = { pageId: "page", sectionId: "section" };

  it("places a batch in one call carrying every id in pick order, where the tool takes a list", () => {
    expect(placeCalls(["a", "b", "c"], { arguments: where, imageArgument: "imageIds", list: true })).toEqual([
      { ...where, imageIds: ["a", "b", "c"] },
    ]);
  });

  it("places one id per call where the tool takes one", () => {
    expect(placeCalls(["a"], { arguments: { articleId: "x" }, imageArgument: "coverImageId", list: false })).toEqual([
      { articleId: "x", coverImageId: "a" },
    ]);
  });
});

describe("batchReport", () => {
  const CASTLE = "10000000-0000-4000-8000-000000000001";
  const castle: FileOutcome = {
    kind: "uploaded",
    fileName: "castle.png",
    catalogueId: CASTLE,
    label: "castle",
    shape: "wide 16:9",
    soft: false,
  };
  const beach: FileOutcome = { kind: "refused", fileName: "beach.jpg", reason: `This picture is 3:2 (1500 × 1000). ${NO_FRAME}` };
  const field: FileOutcome = {
    kind: "uploaded",
    fileName: "field.jpg",
    catalogueId: "10000000-0000-4000-8000-000000000002",
    label: "Field day",
    shape: "wide 16:9",
    soft: true,
  };
  const tree: FileOutcome = { kind: "failed", fileName: "tree.jpg", reason: "The connection failed: timeout." };

  it("lists every file in pick order with its entry, shape and file name, or its sentence, then where they went", () => {
    expect(batchReport([castle, beach, field, tree], { kind: "placed", outcome: "They are in the section." })).toBe(
      [
        "The admin picked 4 pictures in the uploader: 2 uploaded, 1 refused, 1 failed, in the order picked:",
        `1. "castle.png": uploaded as catalogue entry ${CASTLE} ("castle"), wide 16:9.`,
        `2. "beach.jpg": refused, nothing uploaded. This picture is 3:2 (1500 × 1000). ${NO_FRAME}`,
        `3. "field.jpg": uploaded as catalogue entry 10000000-0000-4000-8000-000000000002 ("Field day"), wide 16:9; it is smaller than that shape's size, so it will look soft.`,
        `4. "tree.jpg": could not be uploaded. The connection failed: timeout.`,
        "They are in the section.",
      ].join("\n"),
    );
  });

  it("says the pictures are in the catalogue alone when the opening places nothing", () => {
    expect(batchReport([castle], { kind: "none" })).toBe(
      [
        "The admin picked 1 picture in the uploader: 1 uploaded, in the order picked:",
        `1. "castle.png": uploaded as catalogue entry 10000000-0000-4000-8000-000000000001 ("castle"), wide 16:9.`,
        "The uploaded pictures are in the catalogue and placed nowhere yet.",
      ].join("\n"),
    );
  });

  it("names the place tool's refusal, keeping the stored entries", () => {
    const report = batchReport([castle, field], { kind: "refused", reason: "Mixed shapes." });
    expect(report).toContain(CASTLE);
    expect(report.split("\n").at(-1)).toBe(
      "The uploaded pictures are in the catalogue, but they could not be placed: Mixed shapes.",
    );
  });

  it("says nothing was uploaded when every file was refused", () => {
    expect(batchReport([beach], { kind: "none" }).split("\n")).toEqual([
      "The admin picked 1 picture in the uploader: 0 uploaded, 1 refused, in the order picked:",
      `1. "beach.jpg": refused, nothing uploaded. This picture is 3:2 (1500 × 1000). ${NO_FRAME}`,
      "Nothing was uploaded, so nothing was placed.",
    ]);
  });
});
