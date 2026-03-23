import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/admin/adjust-tokens/route";
import { NextResponse } from "next/server";

// --- Mocks ---

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockAdminRpc = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    rpc: mockAdminRpc,
  })),
}));

// --- Helpers ---

function mockUnauthenticated() {
  mockRequireRole.mockResolvedValue(
    NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  );
}

function mockAuthenticatedWithRole(role: string) {
  if (role !== "admin") {
    mockRequireRole.mockResolvedValue(
      NextResponse.json(
        { error: "Only admins can adjust token balances" },
        { status: 403 }
      )
    );
    return;
  }

  mockRequireRole.mockResolvedValue({
    user: { id: "admin-user-id" },
    profile: { role: "admin" },
    supabase: {},
  });
}

function createRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost:3000/api/admin/adjust-tokens", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// --- Tests ---

describe("POST /api/admin/adjust-tokens", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAdminRpc.mockResolvedValue({
      data: [{ new_balance: 15, transaction_id: "tx-123" }],
      error: null,
    });
  });

  // -- Auth & Authorization --

  it("should return 401 when not authenticated", async () => {
    mockUnauthenticated();

    const response = await POST(
      createRequest({ userId: "target-id", amount: 10, description: "test" })
    );
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("should return 403 for customer role", async () => {
    mockAuthenticatedWithRole("customer");

    const response = await POST(
      createRequest({ userId: "target-id", amount: 10, description: "test" })
    );
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe("Only admins can adjust token balances");
  });

  it("should return 403 for gamer role", async () => {
    mockAuthenticatedWithRole("gamer");

    const response = await POST(
      createRequest({ userId: "target-id", amount: 10, description: "test" })
    );

    expect(response.status).toBe(403);
  });

  it("should return 403 for gedu role", async () => {
    mockAuthenticatedWithRole("gedu");

    const response = await POST(
      createRequest({ userId: "target-id", amount: 10, description: "test" })
    );

    expect(response.status).toBe(403);
  });

  // -- Validation --

  it("should return 400 when userId is missing", async () => {
    mockAuthenticatedWithRole("admin");

    const response = await POST(
      createRequest({ amount: 10, description: "test" })
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("userId is required");
  });

  it("should return 400 when userId is not a string", async () => {
    mockAuthenticatedWithRole("admin");

    const response = await POST(
      createRequest({ userId: 123, amount: 10, description: "test" })
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("userId is required");
  });

  it("should return 400 when amount is missing", async () => {
    mockAuthenticatedWithRole("admin");

    const response = await POST(
      createRequest({ userId: "target-id", description: "test" })
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("amount must be a non-zero number");
  });

  it("should return 400 when amount is zero", async () => {
    mockAuthenticatedWithRole("admin");

    const response = await POST(
      createRequest({ userId: "target-id", amount: 0, description: "test" })
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("amount must be a non-zero number");
  });

  it("should return 400 when amount is not a number", async () => {
    mockAuthenticatedWithRole("admin");

    const response = await POST(
      createRequest({ userId: "target-id", amount: "ten", description: "test" })
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("amount must be a non-zero number");
  });

  it("should return 400 when description is missing", async () => {
    mockAuthenticatedWithRole("admin");

    const response = await POST(
      createRequest({ userId: "target-id", amount: 10 })
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("description is required");
  });

  it("should return 400 when description is not a string", async () => {
    mockAuthenticatedWithRole("admin");

    const response = await POST(
      createRequest({ userId: "target-id", amount: 10, description: 42 })
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("description is required");
  });

  // -- Happy path --

  it("should add tokens and return new balance", async () => {
    mockAuthenticatedWithRole("admin");

    const response = await POST(
      createRequest({ userId: "target-id", amount: 10, description: "Bonus reward" })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.newBalance).toBe(15);
    expect(data.transactionId).toBe("tx-123");
    expect(mockAdminRpc).toHaveBeenCalledWith("adjust_token_balance", {
      p_user_id: "target-id",
      p_amount: 10,
      p_type: "admin_adjustment",
      p_description: "Bonus reward",
      p_admin_id: "admin-user-id",
    });
  });

  it("should remove tokens with negative amount", async () => {
    mockAuthenticatedWithRole("admin");
    mockAdminRpc.mockResolvedValue({
      data: [{ new_balance: 5, transaction_id: "tx-456" }],
      error: null,
    });

    const response = await POST(
      createRequest({ userId: "target-id", amount: -5, description: "Refund correction" })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.newBalance).toBe(5);
    expect(mockAdminRpc).toHaveBeenCalledWith("adjust_token_balance", {
      p_user_id: "target-id",
      p_amount: -5,
      p_type: "admin_adjustment",
      p_description: "Refund correction",
      p_admin_id: "admin-user-id",
    });
  });

  // -- Error handling --

  it("should return 400 when RPC fails", async () => {
    mockAuthenticatedWithRole("admin");
    mockAdminRpc.mockResolvedValue({
      data: null,
      error: { message: "User not found" },
    });

    const response = await POST(
      createRequest({ userId: "nonexistent-id", amount: 10, description: "test" })
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("User not found");
  });
});
