import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

// The config builds its image patterns from this at load; nothing here reads it.
vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
afterAll(() => vi.unstubAllEnvs());
afterEach(() => vi.stubEnv("VERCEL_ENV", undefined));

const { default: nextConfig } = await import("@/../next.config");

/** The `X-Robots-Tag` blocks the config emits, with the paths they cover. */
async function robotsTagRules() {
  const rules = (await nextConfig.headers?.()) ?? [];
  return rules.flatMap((rule) =>
    rule.headers
      .filter((header) => header.key.toLowerCase() === "x-robots-tag")
      .map((header) => ({ source: rule.source, value: header.value })),
  );
}

describe("the X-Robots-Tag header", () => {
  // Off production every response — pages, images, API, files — is kept out
  // of search and AI use, so the header is on the catch-all source and
  // nowhere narrower.
  for (const vercelEnv of ["preview", undefined]) {
    it(`covers every path with VERCEL_ENV ${vercelEnv ?? "unset"}`, async () => {
      vi.stubEnv("VERCEL_ENV", vercelEnv);

      expect(await robotsTagRules()).toEqual([
        { source: "/:path*", value: "noindex, nofollow" },
      ]);
    });
  }

  it("is absent in production", async () => {
    vi.stubEnv("VERCEL_ENV", "production");

    expect(await robotsTagRules()).toEqual([]);
  });
});
