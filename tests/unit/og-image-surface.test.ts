import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * **Every image a link preview fetches from us goes through the preview
 * budget.**
 *
 * WhatsApp drops a preview image over roughly 300 KB without a word, and a
 * drawn card with a photo in it, or a stored product picture served as itself,
 * crosses that line. The guarantee lives in one place —
 * `encodeWithinBudget` — and this is the completeness check that keeps every
 * way an image reaches a preview going through it. The surface is enumerated
 * from disk on every run, so a route or an emitter written tomorrow is checked
 * the same way as the ones here today.
 *
 * Two halves, because a preview image has two ends:
 *
 * 1. **What serves it.** Every route under `src/app/opengraph-images/` is
 *    either a drawn card, which returns through `ogCardResponse`, or a stored
 *    picture's rendition, which encodes through `encodeWithinBudget` itself.
 *    The check wants the call, not just the import: an import left behind by a
 *    refactor proves nothing about what the handler returns. And a route that
 *    builds an `ImageResponse` must also call `ogCardResponse`, because an
 *    `ImageResponse` handed back by any path — returned directly, assigned
 *    first, returned from a helper — is the unencoded one: a PNG of whatever
 *    size the drawing came to.
 * 2. **What points at it.** Every file declaring an `openGraph` or `twitter`
 *    metadata block takes its image from `src/lib/og/`, whose URLs all lead to
 *    a route of the first half — and never names a storage URL builder, which
 *    would hand the preview the stored file as it is, at whatever size it was
 *    uploaded. Next's file convention is the other way to emit an `og:image`:
 *    an `opengraph-image.*` or `twitter-image.*` file anywhere under `src/app/`
 *    becomes the tag with no metadata block at all, so none may exist.
 */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Every file under a directory, as repo-relative POSIX paths. */
function filesUnder(path: string): string[] {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- a fixed in-repo path from this file, walked directory by directory; nothing here comes from outside the repo
  return readdirSync(join(repoRoot, path), { withFileTypes: true }).flatMap((entry) => {
    const child = relative(repoRoot, join(repoRoot, path, entry.name)).split(sep).join("/");
    return entry.isDirectory() ? filesUnder(child) : [child];
  });
}

function read(file: string): string {
  // eslint-disable-next-line security/detect-non-literal-fs-filename -- reads a file discovered by the fixed in-repo walk above
  return readFileSync(join(repoRoot, file), "utf8");
}

/** The module specifiers `source` imports from. */
function importsOf(source: string): string[] {
  return [...source.matchAll(/from\s+["']([^"']+)["']/g)].map(([, specifier]) => specifier);
}

describe("every Open Graph image route encodes within the preview budget", () => {
  const routes = filesUnder("src/app/opengraph-images").filter((file) =>
    /\/route\.tsx?$/.test(file),
  );

  it("finds the routes it is checking", () => {
    // An empty or mis-rooted walk would pass every case below by having none.
    expect(routes).toEqual(
      expect.arrayContaining([
        "src/app/opengraph-images/site/route.tsx",
        "src/app/opengraph-images/roblox/route.tsx",
        "src/app/opengraph-images/team/[userId]/route.tsx",
        "src/app/opengraph-images/picture/[purpose]/[path]/route.ts",
      ]),
    );
  });

  it.each(routes)("%s returns through the budget", (route) => {
    const source = read(route);
    const drawnCard = source.includes("ogCardResponse(");
    const storedRendition = source.includes("encodeWithinBudget(");

    expect(
      drawnCard || storedRendition,
      `${route} serves an image without encoding it within the preview budget. A drawn card returns through ogCardResponse (@/lib/og/card-response.server); a stored picture encodes through encodeWithinBudget (@/lib/images/encode-within-budget.server).`,
    ).toBe(true);
    expect(
      source.includes("new ImageResponse(") && !drawnCard,
      `${route} draws an ImageResponse without passing it through ogCardResponse, so it serves a PNG of whatever size the drawing came to. Build it, then return ogCardResponse(image, { cacheControl }).`,
    ).toBe(false);
  });
});

/**
 * The names that hand a preview a stored file as it is: the catalogue and
 * session image URL builders, and the bucket's public path itself.
 */
const STORAGE_URL_TOKENS = [
  "catalogueImageSrc",
  "catalogueImageUrl",
  "getPublicUrl",
  "storage/v1/object",
  "sessionImageUrl",
] as const;

/**
 * An `openGraph` or `twitter` metadata block, as an object key: `openGraph:`,
 * and also the shorthand `{ openGraph, twitter }` and a block declaring only
 * `twitter`, either of which emits an image tag as surely as the long form.
 */
const PREVIEW_BLOCK_KEY = /\b(openGraph|twitter)\b\s*[:,}]/;

describe("every og:image emitter takes its image from src/lib/og/", () => {
  const emitters = filesUnder("src")
    .filter((file) => /\.tsx?$/.test(file) && !file.startsWith("src/lib/og/"))
    .filter((file) => PREVIEW_BLOCK_KEY.test(read(file)));

  it("finds no opengraph-image or twitter-image file under src/app/", () => {
    // Next turns either file into the page's image tag by convention, with no
    // metadata block for the check below to find and no route of the first
    // half behind it.
    expect(
      filesUnder("src/app").filter((file) =>
        /\/(opengraph|twitter)-image\.[^/]+$/.test(file),
      ),
    ).toEqual([]);
  });

  /**
   * The specifier each emitter is imported by. A page that spreads another
   * emitter's `openGraph` block — the sign-in pages extend the shared page
   * metadata — takes its image from that emitter, which this same check
   * holds to `src/lib/og/`, so importing it counts as routing through it.
   */
  const emitterSpecifiers = new Set(
    emitters.map((file) => `@/${file.replace(/^src\//, "").replace(/\.tsx?$/, "")}`),
  );

  it("finds the emitters it is checking", () => {
    expect(emitters).toEqual(
      expect.arrayContaining([
        "src/app/[locale]/layout.tsx",
        "src/app/[locale]/(public)/roblox/card-metadata.ts",
        "src/lib/products/product-metadata.ts",
        "src/components/library/article/article-metadata.ts",
        "src/components/team/public/team-member-metadata.ts",
        "src/lib/metadata/localized-page.ts",
      ]),
    );
    expect(emitters.length).toBeGreaterThanOrEqual(8);
  });

  it.each(emitters)("%s takes its og:image from src/lib/og/", (file) => {
    const source = read(file);
    const routed = importsOf(source).some(
      (specifier) => specifier.startsWith("@/lib/og/") || emitterSpecifiers.has(specifier),
    );

    expect(
      routed,
      `${file} declares an openGraph or twitter block without importing from @/lib/og/ (or extending an emitter that does). A preview image's URL comes from there, so it leads to a route that encodes within the preview budget.`,
    ).toBe(true);
    expect(
      STORAGE_URL_TOKENS.filter((token) => source.includes(token)).map(
        (token) => `${file}: ${token}`,
      ),
      "This emitter names a storage URL builder, which hands a link preview the stored file at whatever size it was uploaded. Point og:image at the picture route through ogPictureImage (@/lib/og/picture) instead.",
    ).toEqual([]);
  });
});
