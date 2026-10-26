import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";

/**
 * The Klaviyo sync's observation route, called on mount by the admin Users
 * list: it kicks the sync when an outbox row is due and answers how many rows
 * of each outbox are parked. Pinned here: the admin gate, the kick, the parked
 * filter, and that a failed call is an error rather than a quiet zero.
 */

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

interface CountQuery {
  table: string;
  selected: string;
  column?: string;
  value?: string;
}
const counted: CountQuery[] = [];
const mockAdminRpc = vi.fn();
let counts: Record<string, { count: number | null; error: unknown }> = {};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    rpc: (...args: unknown[]) => mockAdminRpc(...args),
    from: (table: string) => ({
      select: (selected: string) => ({
        eq: (column: string, value: string) => {
          counted.push({ table, selected, column, value });
          return Promise.resolve(counts[table]);
        },
      }),
    }),
  }),
}));

import { POST } from "@/app/api/klaviyo-sync/observe/route";

function request(): Request {
  return new Request("http://localhost:3000/api/klaviyo-sync/observe", { method: "POST" });
}

function signedInAsAdmin() {
  mockRequireRole.mockResolvedValue({
    user: { id: "admin-user-id" },
    profile: { role: "admin" },
    supabase: {},
  });
}

describe("POST /api/klaviyo-sync/observe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    counted.length = 0;
    mockAdminRpc.mockResolvedValue({ data: null, error: null });
    counts = {
      klaviyo_profile_outbox: { count: 2, error: null },
      klaviyo_event_outbox: { count: 1, error: null },
    };
  });

  it("returns 401 when not authenticated", async () => {
    mockRequireRole.mockResolvedValue(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(mockAdminRpc).not.toHaveBeenCalled();
  });

  it("returns 403 for anybody but an admin", async () => {
    mockRequireRole.mockResolvedValue(NextResponse.json({ error: "Forbidden" }, { status: 403 }));

    const response = await POST(request());

    expect(response.status).toBe(403);
    expect(mockAdminRpc).not.toHaveBeenCalled();
  });

  it("kicks the sync if due and answers the parked counts", async () => {
    signedInAsAdmin();

    const response = await POST(request());

    expect(mockRequireRole).toHaveBeenCalledWith(["admin"], expect.anything());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ parkedProfiles: 2, parkedEvents: 1 });
    expect(mockAdminRpc).toHaveBeenCalledWith("kick_klaviyo_sync_if_due");
    expect(counted).toEqual([
      { table: "klaviyo_profile_outbox", selected: "customer_id", column: "next_attempt_at", value: "infinity" },
      { table: "klaviyo_event_outbox", selected: "id", column: "next_attempt_at", value: "infinity" },
    ]);
  });

  it("answers a 500 when the kick fails", async () => {
    signedInAsAdmin();
    mockAdminRpc.mockResolvedValue({ data: null, error: { code: "XX000", message: "boom" } });
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(counted).toHaveLength(0);
    spy.mockRestore();
  });

  it("answers a 500 when a count fails", async () => {
    signedInAsAdmin();
    counts.klaviyo_event_outbox = { count: null, error: { code: "XX000", message: "boom" } };
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await POST(request());

    expect(response.status).toBe(500);
    spy.mockRestore();
  });
});
