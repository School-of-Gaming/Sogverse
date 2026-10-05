import type {
  CallToolResult,
  ContentBlock,
  ImageContent,
} from "@modelcontextprotocol/server";
import sharp from "sharp";
import { catalogueImageUrl } from "@/lib/images/catalogue-image-url";

/*
 * Library covers as pictures the AI app's model can look at. A tool answer
 * carries a cover as MCP image content — base64 JPEG bytes — beside the text
 * that names it, so the model sees the picture and a client that drops images
 * still reads which entry it was.
 *
 * **Claude's clients refuse a whole tool result over 1 MB**, and a refused
 * result is a failed call, not a smaller one. So a picture is never the stored
 * original: each is re-encoded here at one of two sizes, a result carries at
 * most `MAX_IMAGES_PER_RESULT` of them, and the pictures together stop at
 * `IMAGE_BUDGET_CHARS` of base64. Anything past either limit is named in the
 * text instead, with its public URL.
 */

/** How a cover is shown: the box it is fitted inside, and its JPEG quality. */
export interface CoverImageSize {
  width: number;
  height: number;
  quality: number;
}

/** One article's cover, big enough to judge the picture itself. */
export const COVER_PREVIEW: CoverImageSize = { width: 800, height: 450, quality: 75 };

/** A cover among many, enough to tell them apart and pick one. */
export const COVER_THUMBNAIL: CoverImageSize = { width: 256, height: 144, quality: 60 };

/** The most pictures one tool result carries. */
export const MAX_IMAGES_PER_RESULT = 20;

/**
 * The base64 characters every picture in one result may add up to: well under
 * the 1 MB a client accepts, leaving the result's text its room. Twenty
 * thumbnails come to about a quarter of it; a preview to a tenth.
 */
export const IMAGE_BUDGET_CHARS = 600_000;

/** Far above any cover's size; keeps a hostile header from being taken at its word. */
const MAX_INPUT_PIXELS = 4096 * 4096;

/** Long enough for a large original over a slow link, short enough to fail a call rather than hang it. */
const FETCH_TIMEOUT_MS = 10_000;

/** A cover's public address, from its stored path in the `library-covers` bucket. */
export function coverUrl(path: string): string {
  return catalogueImageUrl("library_cover", path);
}

/**
 * A cover re-encoded as image content at `size`, or null when it could not be
 * read — a picture that fails to load must not fail the answer it sits in.
 * The original is fetched from the public bucket, where every reader's
 * browser gets it, and fitted inside the box whole: an entry from before
 * covers had an exact size keeps its own shape rather than being cut.
 */
export async function coverImage(
  path: string,
  size: CoverImageSize,
): Promise<ImageContent | null> {
  try {
    const response = await fetch(coverUrl(path), {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
      console.error(`[mcp] cover ${path} answered ${response.status}`);
      return null;
    }
    const resized = await sharp(Buffer.from(await response.arrayBuffer()), {
      limitInputPixels: MAX_INPUT_PIXELS,
    })
      .rotate()
      .resize({
        width: size.width,
        height: size.height,
        fit: "inside",
        withoutEnlargement: true,
      })
      .jpeg({ quality: size.quality })
      .toBuffer();
    return { type: "image", data: resized.toString("base64"), mimeType: "image/jpeg" };
  } catch (error) {
    console.error(`[mcp] cover ${path} could not be shown:`, error);
    return null;
  }
}

/** A picture to put in an answer: its stored path, and the line that names it. */
export interface CoverToShow {
  path: string;
  caption: string;
}

/**
 * `answer` with pictures: the structured value and its JSON text, then each
 * cover as its caption followed by its picture, in order, until the count or
 * the budget runs out. A cover past either limit, or one that could not be
 * read, keeps its caption and says why it has no picture, so the text alone
 * always names every cover.
 */
export async function answerWithCovers<T extends Record<string, unknown>>(
  value: T,
  covers: readonly CoverToShow[],
  size: CoverImageSize,
): Promise<CallToolResult> {
  const shown = covers.slice(0, MAX_IMAGES_PER_RESULT);
  const images = await Promise.all(shown.map(({ path }) => coverImage(path, size)));

  const content: ContentBlock[] = [{ type: "text", text: JSON.stringify(value, null, 2) }];
  let spent = 0;
  shown.forEach((cover, index) => {
    const image = images[index];
    if (image === null) {
      content.push({ type: "text", text: `${cover.caption} (the picture could not be loaded)` });
    } else if (spent + image.data.length > IMAGE_BUDGET_CHARS) {
      content.push({
        type: "text",
        text: `${cover.caption} (not shown: this answer's pictures reached their size limit)`,
      });
    } else {
      spent += image.data.length;
      content.push({ type: "text", text: cover.caption }, image);
    }
  });
  if (covers.length > shown.length) {
    content.push({
      type: "text",
      text: `${covers.length - shown.length} more cover(s) are not pictured: one answer shows at most ${MAX_IMAGES_PER_RESULT}.`,
    });
  }

  return { structuredContent: value, content };
}
