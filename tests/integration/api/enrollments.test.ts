import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/enrollments/route";
import { NextResponse } from "next/server";

// --- Mocks ---

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: vi.fn((cb: () => void) => cb()) };
});

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockAdminFrom = vi.fn();
const mockAdminRpc = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: mockAdminFrom,
    rpc: mockAdminRpc,
  })),
}));

vi.mock("@/lib/enrollment", () => ({
  getNextSessionStart: vi.fn(() => new Date("2026-03-01T15:00:00Z")),
}));

const mockSendEnrollmentNotifications = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/enrollment-notifications", () => ({
  sendEnrollmentNotifications: (...args: unknown[]) => mockSendEnrollmentNotifications(...args),
}));

// --- Helpers ---

function mockUnauthenticated() {
  mockRequireRole.mockResolvedValue(
    NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
  );
}

function mockForbidden() {
  mockRequireRole.mockResolvedValue(
    NextResponse.json(
      { error: "Only customers can enroll gamers" },
      { status: 403 },
    ),
  );
}

function mockAuthenticated() {
  mockRequireRole.mockResolvedValue({
    user: { id: "customer-123" },
    profile: { role: "customer" },
    supabase: {},
  });
}

function createRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost:3000/api/enrollments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function mockGroupLookup(product?: {
  day_of_week: number;
  start_time: string;
  timezone: string;
}) {
  const selectMock = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue(
        product
          ? { data: { product_id: "prod-1", products: product }, error: null }
          : { data: null, error: { message: "Not found" } },
      ),
    }),
  });
  mockAdminFrom.mockReturnValue({ select: selectMock });
}

// --- Tests ---

describe("POST /api/enrollments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -- Auth --

  it("should return 401 when not authenticated", async () => {
    mockUnauthenticated();

    const response = await POST(createRequest({ gamerId: "g-1", groupId: "gr-1" }));
    expect(response.status).toBe(401);
  });

  it("should return 403 for non-customer role", async () => {
    mockForbidden();

    const response = await POST(createRequest({ gamerId: "g-1", groupId: "gr-1" }));
    expect(response.status).toBe(403);
  });

  // -- Validation --

  it("should return 400 when gamerId is missing", async () => {
    mockAuthenticated();

    const response = await POST(createRequest({ groupId: "gr-1" }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("gamerId is required");
  });

  it("should return 400 when groupId is missing", async () => {
    mockAuthenticated();

    const response = await POST(createRequest({ gamerId: "g-1" }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("groupId is required");
  });

  // -- Group lookup failure --

  it("should return 404 when group not found", async () => {
    mockAuthenticated();
    mockGroupLookup(); // no product → not found

    const response = await POST(createRequest({ gamerId: "g-1", groupId: "gr-1" }));
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Group not found");
  });

  // -- Successful enrollment --

  it("should enroll gamer and return enrollment details", async () => {
    mockAuthenticated();
    mockGroupLookup({
      day_of_week: 4,
      start_time: "15:00",
      timezone: "UTC",
    });
    mockAdminRpc.mockResolvedValue({
      data: [{ enrollment_id: "enr-1", new_balance: 7, transaction_id: "tx-1" }],
      error: null,
    });

    const response = await POST(createRequest({ gamerId: "g-1", groupId: "gr-1" }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.enrollmentId).toBe("enr-1");
    expect(data.newBalance).toBe(7);
    expect(mockAdminRpc).toHaveBeenCalledWith("enroll_gamer_in_group", {
      p_customer_id: "customer-123",
      p_gamer_id: "g-1",
      p_group_id: "gr-1",
      p_session_date: "2026-03-01",
    });
    expect(mockSendEnrollmentNotifications).toHaveBeenCalledWith({
      customerId: "customer-123",
      gamerId: "g-1",
      groupId: "gr-1",
    });
  });

  // -- Insufficient balance --

  it("should return 400 for insufficient balance (CHECK constraint violation)", async () => {
    mockAuthenticated();
    mockGroupLookup({
      day_of_week: 4,
      start_time: "15:00",
      timezone: "UTC",
    });
    mockAdminRpc.mockResolvedValue({
      data: null,
      error: { code: "23514", message: "check constraint violation" },
    });

    const response = await POST(createRequest({ gamerId: "g-1", groupId: "gr-1" }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Insufficient token balance");
  });

  // -- Duplicate enrollment --

  it("should return 400 for duplicate enrollment", async () => {
    mockAuthenticated();
    mockGroupLookup({
      day_of_week: 4,
      start_time: "15:00",
      timezone: "UTC",
    });
    mockAdminRpc.mockResolvedValue({
      data: null,
      error: { code: "23505", message: "Gamer is already enrolled in this product" },
    });

    const response = await POST(createRequest({ gamerId: "g-1", groupId: "gr-1" }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Gamer is already enrolled in this product");
  });
});
