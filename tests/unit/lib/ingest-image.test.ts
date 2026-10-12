import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { reencodeForPurpose } from "@/lib/images/ingest-image.server";
import { IMAGE_PURPOSES } from "@/lib/images/image-purposes";
import { MAX_IMAGE_EDGE } from "@/lib/images/reencode-jpeg.server";

/**
 * The size half of the shared ingest step, which no route test reaches: a
 * picture kept as uploaded must not exceed the maximum edge even when its
 * pixel count is far inside the decoder's bound, and a fixed-size purpose
 * takes its exact stored size and nothing else.
 */

async function jpeg(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 40, g: 90, b: 160 } },
  })
    .jpeg()
    .toBuffer();
}

describe("reencodeForPurpose", () => {
  it("refuses an as-uploaded strip past the maximum edge", async () => {
    const result = await reencodeForPurpose(await jpeg(MAX_IMAGE_EDGE + 1, 1), "chat_image");
    expect(result).toMatchObject({ ok: false, reason: "tooBig", status: 400 });
  });

  it("keeps an as-uploaded picture at the maximum edge", async () => {
    const result = await reencodeForPurpose(await jpeg(MAX_IMAGE_EDGE, 1), "session_photo");
    expect(result).toMatchObject({ ok: true, value: { width: MAX_IMAGE_EDGE, height: 1 } });
  });

  it("holds a fixed-size purpose to exactly its stored size", async () => {
    const { storedSize } = IMAGE_PURPOSES.team_photo;
    const exact = await reencodeForPurpose(
      await jpeg(storedSize.width, storedSize.height),
      "team_photo",
    );
    expect(exact).toMatchObject({ ok: true, value: storedSize });

    const off = await reencodeForPurpose(
      await jpeg(storedSize.width, storedSize.height - 1),
      "team_photo",
    );
    expect(off).toMatchObject({ ok: false, reason: "wrongSize", status: 422 });
  });
});
