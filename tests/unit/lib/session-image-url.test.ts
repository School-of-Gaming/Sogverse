import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  SESSION_IMAGES_BUCKET,
  sessionImageObjectName,
  sessionImageUrl,
} from "@/lib/images/session-image-url";

const ID = "9f1d2c3b-4a5e-4f60-8b71-2c3d4e5f6a7b";

describe("sessionImageObjectName", () => {
  // The object name is derived from the row's primary key — there is no stored
  // path column — and the extension is unconditional because the ingestion
  // pipeline re-encodes every input to JPEG.
  it("names the object for the row id, always .jpg", () => {
    expect(sessionImageObjectName(ID)).toBe(`${ID}.jpg`);
  });
});

describe("sessionImageUrl", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://test.supabase.co");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("builds the public bucket URL from the row id", () => {
    expect(sessionImageUrl(ID)).toBe(
      `https://test.supabase.co/storage/v1/object/public/${SESSION_IMAGES_BUCKET}/${ID}.jpg`,
    );
  });

  it("throws when NEXT_PUBLIC_SUPABASE_URL is missing", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    expect(() => sessionImageUrl(ID)).toThrow(/NEXT_PUBLIC_SUPABASE_URL/);
  });

  // A root-relative value is already a servable URL — anything under `public/`
  // is served from the site's own origin — so prefixing it with the bucket
  // would point at an object that does not exist. This is what lets a preview
  // scene's fixture photos carry demo art in the same field the live document
  // uses, with no scene-only override on the gallery's API.
  it("passes a root-relative path straight through", () => {
    expect(sessionImageUrl("/preview-art/session-build.jpg")).toBe(
      "/preview-art/session-build.jpg",
    );
  });

  // The pass-through happens before the env is read, so demo art resolves even
  // where the bucket URL is absent.
  it("passes one through without NEXT_PUBLIC_SUPABASE_URL", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    expect(sessionImageUrl("/preview-art/session-build.jpg")).toBe(
      "/preview-art/session-build.jpg",
    );
  });

  // A fixture path keeps its own extension: the pass-through is a whole URL,
  // not an id the `.jpg` suffix gets appended to.
  it("does not append .jpg to a passed-through path", () => {
    expect(sessionImageUrl("/preview-art/session-build.png")).toBe(
      "/preview-art/session-build.png",
    );
  });
});
