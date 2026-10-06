import { describe, expect, it } from "vitest";
import {
  CATALOGUE_OBJECT_KEY,
  ogPictureImage,
  ogPicturePath,
  ogPictureSize,
} from "@/lib/og/picture";

/**
 * The address and declared size a page puts in its `og:image` for a stored
 * catalogue picture. The size is what the picture route will serve — the
 * purpose's stored size narrowed to preview width — so a consumer that trusts
 * `og:image:width`/`height` reserves the frame the picture actually fills.
 */

const KEY = "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855.jpg";

describe("ogPicturePath", () => {
  it("is the picture route, keyed by purpose and object key, relative to the site", () => {
    expect(ogPicturePath("product", KEY)).toBe(`/opengraph-images/picture/product/${KEY}`);
    expect(ogPicturePath("library_cover", KEY)).toBe(
      `/opengraph-images/picture/library_cover/${KEY}`,
    );
  });
});

describe("ogPictureSize", () => {
  it("is a product picture's stored 1200×800, already preview width", () => {
    expect(ogPictureSize("product")).toEqual({ width: 1200, height: 800 });
  });

  it("is a Library cover's 1600×900 narrowed to 1200×675", () => {
    expect(ogPictureSize("library_cover")).toEqual({ width: 1200, height: 675 });
  });
});

describe("ogPictureImage", () => {
  it("declares a product picture at its stored 1200×800, already preview width", () => {
    expect(ogPictureImage("product", KEY, "Minecraft club")).toEqual({
      url: `/opengraph-images/picture/product/${KEY}`,
      alt: "Minecraft club",
      width: 1200,
      height: 800,
    });
  });

  it("declares a Library cover narrowed from 1600×900 to 1200×675", () => {
    expect(ogPictureImage("library_cover", KEY, "A family agreement")).toEqual({
      url: `/opengraph-images/picture/library_cover/${KEY}`,
      alt: "A family agreement",
      width: 1200,
      height: 675,
    });
  });
});

describe("CATALOGUE_OBJECT_KEY", () => {
  it("accepts a sha256 key with each extension the catalogue stores", () => {
    const hash = KEY.slice(0, 64);
    for (const extension of ["jpg", "png", "webp", "avif"]) {
      expect(CATALOGUE_OBJECT_KEY.test(`${hash}.${extension}`)).toBe(true);
    }
  });

  it("refuses anything else", () => {
    for (const path of [
      "products/minecraft.jpg",
      KEY.toUpperCase(),
      `${KEY.slice(0, 63)}.jpg`,
      `${KEY.slice(0, 64)}.svg`,
      `${KEY.slice(0, 64)}.jpeg`,
      `../${KEY}`,
      `${KEY}\n`,
    ]) {
      expect(CATALOGUE_OBJECT_KEY.test(path)).toBe(false);
    }
  });
});
