import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

/**
 * The observation route, called on mount by the admin Substitutions page and
 * the gedu's pool: it files the passed requests and kicks the sync when a row
 * is due. Which requests count as passed is the database's, and the DB tests
 * pin it; pinned here: the role gate, the order of the two calls, that the
 * separate kick is skipped when filing already kicked, and that a failed call
 * is an error rather than a quiet zero.
 */

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockAdminRpc = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: (...args: unknown[]) => mockAdminRpc(...args),
  }),
}));

import { POST } from "@/app/api/substitution-notifications/observe/route";

function request(): Request {
  return new Request("http://localhost:3000/api/substitution-notifications/observe", {
    method: "POST",
  });
}

function signedInAs(role: "admin" | "gedu") {
  mockRequireRole.mockResolvedValue({
    user: { id: `${role}-user-id` },
    profile: { role },
    supabase: {},
  });
}

/** Answers the two functions; `closedOut` is how many the close-out files. */
function database({ closedOut = 0, failing }: { closedOut?: number; failing?: string } = {}) {
  mockAdminRpc.mockImplementation(async (name: string) => {
    if (name === failing) return { data: null, error: { code: "XX000", message: "boom" } };
    if (name === "enqueue_passed_substitution_notifications") {
      return { data: closedOut, error: null };
    }
    return { data: null, error: null };
  });
}

describe("POST /api/substitution-notifications/observe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    database();
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireRole.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(mockAdminRpc).not.toHaveBeenCalled();
  });

  it("returns 403 for a family", async () => {
    mockRequireRole.mockResolvedValue(
      NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    );

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(mockAdminRpc).not.toHaveBeenCalled();
  });

  it("admits admins and gedus", async () => {
    signedInAs("gedu");
    await POST(request());
    expect(mockRequireRole).toHaveBeenCalledWith(
      ["admin", "gedu"],
      expect.anything(),
    );
  });

  /** The ordinary case: nothing has passed, so the due kick is asked for. */
  it("files nothing, then kicks the sync if a row is due", async () => {
    signedInAs("admin");

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ closedOut: 0 });
    expect(mockAdminRpc.mock.calls.map(([name]) => name)).toEqual([
      "enqueue_passed_substitution_notifications",
      "kick_substitution_notification_sync_if_due",
    ]);
  });

  /** Filing kicked once already, and that drain takes every due row. */
  it("skips the separate kick when it filed a passed request", async () => {
    signedInAs("gedu");
    database({ closedOut: 2 });

    const response = await POST(request());

    expect(await response.json()).toEqual({ closedOut: 2 });
    expect(mockAdminRpc.mock.calls.map(([name]) => name)).toEqual([
      "enqueue_passed_substitution_notifications",
    ]);
  });

  it("answers a 500 when the close-out fails, and kicks nothing", async () => {
    signedInAs("admin");
    database({ failing: "enqueue_passed_substitution_notifications" });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(mockAdminRpc).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("answers a 500 when the kick fails", async () => {
    signedInAs("admin");
    database({ failing: "kick_substitution_notification_sync_if_due" });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(request());

    expect(response.status).toBe(500);
    spy.mockRestore();
  });
});
