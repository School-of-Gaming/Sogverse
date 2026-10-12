import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The notification sync route: the database's `pg_net` call and the `pg_cron`
 * retry drain the outbox through it. No session — the shared secret as a
 * bearer token is the gate, and an environment without one admits nobody.
 * Pinned here: the gate, that the drain runs after the answer rather than
 * before it, and that a drain failure never reaches the caller.
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
vi.mock("@/lib/substitution-notifications/sync.server", () => ({
  drainSubstitutionNotifications: (...args: unknown[]) => mockDrain(...args),
}));

import { POST } from "@/app/api/substitution-notifications/sync/route";

const SECRET = "sync-secret-for-tests";

function syncRequest(authorization?: string): Request {
  return new Request("http://localhost:3000/api/substitution-notifications/sync", {
    method: "POST",
    headers: authorization === undefined ? {} : { authorization },
    body: "{}",
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  deferred.length = 0;
  vi.stubEnv("SUBSTITUTION_SYNC_SECRET", SECRET);
  mockDrain.mockResolvedValue({ synced: 1, failed: 0, outOfTime: false });
});
afterAll(() => vi.unstubAllEnvs());

describe("POST /api/substitution-notifications/sync", () => {
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
    expect(deferred).toHaveLength(0);
    expect(mockDrain).not.toHaveBeenCalled();
  });

  it("refuses everyone where the environment has no secret", async () => {
    vi.stubEnv("SUBSTITUTION_SYNC_SECRET", "");

    for (const header of ["Bearer ", "Bearer undefined", `Bearer ${SECRET}`]) {
      const response = await POST(syncRequest(header));
      expect(response.status).toBe(401);
    }
    expect(mockDrain).not.toHaveBeenCalled();
  });

  it("answers 202 at once and drains the whole outbox afterwards", async () => {
    const response = await POST(syncRequest(`Bearer ${SECRET}`));

    expect(response.status).toBe(202);
    expect(deferred).toHaveLength(1);
    await Promise.all(deferred);
    // No narrowing: the route takes no input.
    expect(mockDrain).toHaveBeenCalledWith();
  });

  it("keeps a drain failure in the log", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    mockDrain.mockRejectedValue(new Error("claim failed"));

    const response = await POST(syncRequest(`Bearer ${SECRET}`));
    await Promise.all(deferred);

    expect(response.status).toBe(202);
    expect(error).toHaveBeenCalled();
    error.mockRestore();
  });
});
