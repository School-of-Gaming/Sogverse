import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { productImageUrl } from "@/lib/images/product-image-url";

describe("productImageUrl", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("builds the public URL from the bucket path", () => {
    expect(productImageUrl("abc.jpg")).toBe(
      "https://test.supabase.co/storage/v1/object/public/product-images/abc.jpg"
    );
  });

  it("throws when NEXT_PUBLIC_SUPABASE_URL is missing", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    expect(() => productImageUrl("abc.jpg")).toThrow(
      /NEXT_PUBLIC_SUPABASE_URL/
    );
  });

  // A root-relative path is already a servable URL — anything under `public/`
  // is served from the site's own origin — so prefixing it with the bucket
  // would point at an object that does not exist. This is what lets a preview
  // scene's fixture rows carry demo art in `image_path` and flow through
  // ordinary image resolution, with no scene-only override on the live API.
  it("passes a root-relative path straight through", () => {
    expect(productImageUrl("/preview-art/card-park.svg")).toBe(
      "/preview-art/card-park.svg"
    );
  });

  // The pass-through happens before the env is read, so demo art resolves even
  // where the bucket URL is absent.
  it("passes one through without NEXT_PUBLIC_SUPABASE_URL", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    expect(productImageUrl("/preview-art/card-park.svg")).toBe(
      "/preview-art/card-park.svg"
    );
  });
});
