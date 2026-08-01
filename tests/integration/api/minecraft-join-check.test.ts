import { describe, it, expect, beforeEach, vi } from "vitest";

import { GET } from "@/app/api/minecraft/join-check/route";

// --- Constants ---

const API_KEY = "test-api-key-32chars-minimum-here";
const MC_UUID_DASHED = "069a79f4-44e9-4726-a5be-fca90e38aaf5";
const MC_UUID_UNDASHED = "069a79f444e94726a5befca90e38aaf5";

// --- Helpers ---

function createRequest(uuid?: string, apiKey?: string | null): Request {
  const url = uuid
    ? `http://localhost:3000/api/minecraft/join-check?uuid=${uuid}`
    : "http://localhost:3000/api/minecraft/join-check";
  const headers: Record<string, string> = {};
  // eslint-disable-next-line security/detect-possible-timing-attacks -- test helper, not an auth comparison; `apiKey !== null` just distinguishes "omit header" (null) from "use this value" (string)
  if (apiKey !== null) {
    headers["Authorization"] = apiKey ?? `Bearer ${API_KEY}`;
  }
  return new Request(url, { method: "GET", headers });
}

// --- Tests ---
//
// The endpoint is a shell: its session gating queried the dropped v1 product
// tables and has to be rebuilt against participations / product_groups, so it
// answers 501 to every request it cannot reject outright. What is worth testing
// is exactly what still exists — that it refuses an unauthenticated or
// malformed call, and that a good call gets 501 rather than a denial. There is
// deliberately no database access left to mock.

describe("GET /api/minecraft/join-check", () => {
  beforeEach(() => {
    vi.stubEnv("MINECRAFT_SERVER_API_KEY", API_KEY);
  });

  // --- Auth ---

  it("returns 401 for missing Authorization header", () => {
    const response = GET(createRequest(MC_UUID_DASHED, null));
    expect(response.status).toBe(401);
  });

  it("returns 401 for non-Bearer format", () => {
    const response = GET(createRequest(MC_UUID_DASHED, `Basic ${API_KEY}`));
    expect(response.status).toBe(401);
  });

  it("returns 401 for wrong API key", () => {
    const response = GET(createRequest(MC_UUID_DASHED, "Bearer wrong-key"));
    expect(response.status).toBe(401);
  });

  it("returns 401 for a key that is a prefix of the real one", () => {
    // The length check guards timingSafeEqual, which throws on unequal buffers.
    const response = GET(
      createRequest(MC_UUID_DASHED, `Bearer ${API_KEY.slice(0, 8)}`),
    );
    expect(response.status).toBe(401);
  });

  it("returns 500 when MINECRAFT_SERVER_API_KEY is not set", async () => {
    vi.stubEnv("MINECRAFT_SERVER_API_KEY", "");
    const response = GET(createRequest(MC_UUID_DASHED));
    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.error).toBe("Server misconfigured");
  });

  it("rejects an unauthenticated caller before looking at the uuid", () => {
    // Auth precedes validation, so a bad key with a malformed uuid is a 401 — a
    // caller without the key cannot probe the input handling.
    const response = GET(createRequest("not-a-uuid", "Bearer wrong-key"));
    expect(response.status).toBe(401);
  });

  // --- Validation ---

  it("returns 400 for missing uuid param", async () => {
    const response = GET(createRequest(undefined));
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("uuid");
  });

  it("returns 400 for malformed uuid", async () => {
    const response = GET(createRequest("not-a-uuid"));
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain("Invalid");
  });

  // --- Not implemented ---

  it("returns 501 for a well-formed authenticated request", async () => {
    const response = GET(createRequest(MC_UUID_DASHED));
    const data = await response.json();

    // 501 and not `allowed: false` — the server has to be able to tell "cannot
    // answer yet" from "this player is denied".
    expect(response.status).toBe(501);
    expect(data.error).toMatch(/pending migration/i);
    expect(data.allowed).toBeUndefined();
  });

  it("accepts an undashed uuid as well-formed", () => {
    const response = GET(createRequest(MC_UUID_UNDASHED));
    expect(response.status).toBe(501);
  });
});
