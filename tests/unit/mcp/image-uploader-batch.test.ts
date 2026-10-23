import { describe, expect, it } from "vitest";
import { batchReport, type FileOutcome } from "../../../packages/mcp-image-uploader/src/batch";

/*
 * How the MCP picture uploader tells the model about a batch: every file in
 * pick order, with its new catalogue entry or the sentence it was refused
 * with, in one report that ends with the opening's next step.
 */

const NO_FRAME = "A landing page picture must be wide 16:9, square 1:1 or portrait 4:5.";
const NEXT_STEP = "Then place them with set_landing_section_image.";
const NO_MORE_PICKS =
  "This uploader takes no more pictures: to upload a re-cropped or failed picture, open the uploader again.";

const CASTLE = "10000000-0000-4000-8000-000000000001";
const FIELD = "10000000-0000-4000-8000-000000000002";
const castle: FileOutcome = {
  kind: "uploaded",
  fileName: "castle.png",
  catalogueId: CASTLE,
  label: "castle",
  shape: "wide 16:9",
  soft: false,
};
const beach: FileOutcome = {
  kind: "refused",
  fileName: "beach.jpg",
  reason: `This picture is 3:2 (1500 × 1000). ${NO_FRAME}`,
};
const field: FileOutcome = {
  kind: "uploaded",
  fileName: "field.jpg",
  catalogueId: FIELD,
  label: "Field day",
  shape: "square 1:1",
  soft: true,
};
const tree: FileOutcome = { kind: "failed", fileName: "tree.jpg", reason: "The connection failed: timeout." };

describe("batchReport", () => {
  it("lists every file in pick order with its entry, label, shape and file name, or its sentence, then the next step", () => {
    expect(batchReport([castle, beach, field, tree], NEXT_STEP).split("\n")).toEqual([
      "The admin picked 4 pictures in the uploader: 2 uploaded, 1 refused, 1 failed, in the order picked:",
      `1. "castle.png": uploaded as catalogue entry ${CASTLE} ("castle"), wide 16:9.`,
      `2. "beach.jpg": refused, nothing uploaded. This picture is 3:2 (1500 × 1000). ${NO_FRAME}`,
      `3. "field.jpg": uploaded as catalogue entry ${FIELD} ("Field day"), square 1:1; it is smaller than that shape's size, so it will look soft.`,
      `4. "tree.jpg": could not be uploaded. The connection failed: timeout.`,
      `The uploaded pictures are in the catalogue, placed nowhere yet. ${NEXT_STEP} ${NO_MORE_PICKS}`,
    ]);
  });

  it("sends a failed picture to a new opening when the rest of the batch was stored", () => {
    expect(batchReport([castle, tree], NEXT_STEP).split("\n").at(-1)).toBe(
      `The uploaded pictures are in the catalogue, placed nowhere yet. ${NEXT_STEP} ${NO_MORE_PICKS}`,
    );
  });

  it("ends a batch of one with the next step", () => {
    expect(batchReport([castle], NEXT_STEP).split("\n")).toEqual([
      "The admin picked 1 picture in the uploader: 1 uploaded, in the order picked:",
      `1. "castle.png": uploaded as catalogue entry ${CASTLE} ("castle"), wide 16:9.`,
      `The uploaded pictures are in the catalogue, placed nowhere yet. ${NEXT_STEP}`,
    ]);
  });

  it("says nothing was uploaded, and leaves the next step out, when nothing was stored", () => {
    const report = batchReport([beach, tree], NEXT_STEP);
    expect(report.split("\n")).toEqual([
      "The admin picked 2 pictures in the uploader: 0 uploaded, 1 refused, 1 failed, in the order picked:",
      `1. "beach.jpg": refused, nothing uploaded. This picture is 3:2 (1500 × 1000). ${NO_FRAME}`,
      `2. "tree.jpg": could not be uploaded. The connection failed: timeout.`,
      "Nothing was uploaded; the admin can pick again in the same uploader.",
    ]);
    expect(report).not.toContain(NEXT_STEP);
  });
});
