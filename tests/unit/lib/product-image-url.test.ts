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
});
