import { afterEach, describe, expect, it, vi } from "vitest";
import { GET } from "@/app/api/indexnow/key/route";

// The IndexNow key file: the key as plain text when one is configured, and no
// file at all otherwise. Served at the site root by a rewrite, which the smoke
// build would be the place to check; here the handler itself is.

afterEach(() => vi.unstubAllEnvs());

describe("GET /api/indexnow/key", () => {
  it("serves the configured key as plain text", async () => {
    vi.stubEnv("INDEXNOW_KEY", "0123456789abcdef0123456789abcdef");

    const response = GET();

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(await response.text()).toBe("0123456789abcdef0123456789abcdef");
  });

  it("is a 404 with no key configured", () => {
    vi.stubEnv("INDEXNOW_KEY", "");

    expect(GET().status).toBe(404);
  });

  it("is a 404 for a key the protocol would refuse", () => {
    vi.stubEnv("INDEXNOW_KEY", "short");

    expect(GET().status).toBe(404);
  });
});
