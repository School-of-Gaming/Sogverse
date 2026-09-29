import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  catalogueImageSrc,
  catalogueImageUrl,
} from "@/lib/images/catalogue-image-url";

describe("catalogueImageUrl", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("builds a product picture's URL in the product-images bucket", () => {
    expect(catalogueImageUrl("product", "abc.jpg")).toBe(
      "https://test.supabase.co/storage/v1/object/public/product-images/abc.jpg"
    );
  });

  it("builds a Library cover's URL in the library-covers bucket", () => {
    expect(catalogueImageUrl("library_cover", "abc.jpg")).toBe(
      "https://test.supabase.co/storage/v1/object/public/library-covers/abc.jpg"
    );
  });

  it("throws when NEXT_PUBLIC_SUPABASE_URL is missing", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    expect(() => catalogueImageUrl("product", "abc.jpg")).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL/
    );
  });

  // A root-relative path is already a servable URL — anything under `public/`
  // is served from the site's own origin — so prefixing it with the bucket
  // would point at an object that does not exist. This is what lets a preview
  // scene's fixture rows carry demo art in `image_path` and flow through
  // ordinary image resolution, with no scene-only override on the live API.
  it("passes a root-relative path straight through", () => {
    expect(catalogueImageUrl("product", "/preview-art/card-park.svg")).toBe(
      "/preview-art/card-park.svg"
    );
  });

  // The pass-through happens before the env is read, so demo art resolves even
  // where the bucket URL is absent.
  it("passes one through without NEXT_PUBLIC_SUPABASE_URL", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    expect(catalogueImageUrl("library_cover", "/preview-art/card-park.svg")).toBe(
      "/preview-art/card-park.svg"
    );
  });
});

describe("catalogueImageSrc", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("answers null for no path, and for the empty string", () => {
    expect(catalogueImageSrc("product", null)).toBeNull();
    expect(catalogueImageSrc("library_cover", "")).toBeNull();
  });

  it("resolves a path against its purpose's bucket", () => {
    expect(catalogueImageSrc("library_cover", "abc.jpg")).toBe(
      "https://test.supabase.co/storage/v1/object/public/library-covers/abc.jpg"
    );
  });
});
