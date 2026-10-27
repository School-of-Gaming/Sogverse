import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The Klaviyo sync route: the database's `pg_net` call drains both outboxes
 * through it. No session — the shared secret as a bearer token is the gate,
 * and an environment without one admits nobody. Pinned here: the gate, that
 * the drain runs after the answer rather than before it, and that a drain
 * failure never reaches the caller. What the drain does is the unit suite's.
 */

const deferred: Promise<unknown>[] = [];
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: (work: Promise<unknown>) => {
      deferred.push(work);
    },
  };
});

const mockDrain = vi.fn();
vi.mock("@/lib/klaviyo-sync/sync.server", () => ({
  drainKlaviyoSync: (...args: unknown[]) => mockDrain(...args),
}));

import { POST } from "@/app/api/klaviyo-sync/sync/route";

const SECRET = "klaviyo-sync-secret-for-tests";

function syncRequest(authorization?: string): Request {
  return new Request("http://localhost:3000/api/klaviyo-sync/sync", {
    method: "POST",
    headers: authorization === undefined ? {} : { authorization },
    body: "{}",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  deferred.length = 0;
  vi.stubEnv("KLAVIYO_SYNC_SECRET", SECRET);
  mockDrain.mockResolvedValue({ failed: 0 });
});
afterAll(() => vi.unstubAllEnvs());

describe("POST /api/klaviyo-sync/sync", () => {
  it("refuses a request with no bearer token, and drains nothing", async () => {
    const response = await POST(syncRequest());

    expect(response.status).toBe(401);
    expect(deferred).toHaveLength(0);
  });

  it("refuses a wrong secret", async () => {
    for (const header of [`Bearer ${SECRET}x`, "Bearer nope", SECRET, `Basic ${SECRET}`]) {
      const response = await POST(syncRequest(header));
      expect(response.status).toBe(401);
    }
    expect(mockDrain).not.toHaveBeenCalled();
  });

  it("refuses everyone where the environment has no secret", async () => {
    vi.stubEnv("KLAVIYO_SYNC_SECRET", "");

    for (const header of ["Bearer ", "Bearer undefined", `Bearer ${SECRET}`]) {
      const response = await POST(syncRequest(header));
      expect(response.status).toBe(401);
    }
    expect(mockDrain).not.toHaveBeenCalled();
  });

  it("answers 202 at once and drains afterwards", async () => {
    const response = await POST(syncRequest(`Bearer ${SECRET}`));

    expect(response.status).toBe(202);
    expect(deferred).toHaveLength(1);
    await Promise.all(deferred);
    expect(mockDrain).toHaveBeenCalledWith();
  });

  it("keeps a failed drain to the log", async () => {
    mockDrain.mockRejectedValue(new Error("database down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(syncRequest(`Bearer ${SECRET}`));

    expect(response.status).toBe(202);
    await Promise.all(deferred);
    expect(spy).toHaveBeenCalledWith("Klaviyo sync drain failed:", expect.any(Error));
    spy.mockRestore();
  });
});
