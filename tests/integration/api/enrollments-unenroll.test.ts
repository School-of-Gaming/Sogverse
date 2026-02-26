import { describe, it, expect, vi, beforeEach } from "vitest";
import { DELETE } from "@/app/api/enrollments/[id]/route";
import { NextResponse } from "next/server";

// --- Mocks ---

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockAdminFrom = vi.fn();
const mockAdminRpc = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: (...args: unknown[]) => mockAdminFrom(...args),
    rpc: mockAdminRpc,
  })),
}));

const mockGetRefundEligibility = vi.fn();
vi.mock("@/lib/enrollment", () => ({
  getRefundEligibility: (...args: unknown[]) => mockGetRefundEligibility(...args),
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
      { error: "Only customers can unenroll gamers" },
      { status: 403 },
    ),
  );
}

function mockAuthenticated(userId = "customer-123") {
  mockRequireRole.mockResolvedValue({
    user: { id: userId },
    profile: { role: "customer" },
    supabase: {},
  });
}

function createRequest(enrollmentId: string): [Request, { params: Promise<{ id: string }> }] {
  const request = new Request(
    `http://localhost:3000/api/enrollments/${enrollmentId}`,
    { method: "DELETE" },
  );
  const context = { params: Promise.resolve({ id: enrollmentId }) };
  return [request, context];
}

const MOCK_PRODUCT = {
  token_cost: 5,
  day_of_week: 2, // Wednesday
  start_time: "15:00",
  timezone: "Europe/Helsinki",
};

/** Build a mock chain for enrollment_charges query */
function buildChargeChain(sessionDate: string | null) {
  const maybeSingleMock = vi.fn().mockResolvedValue({
    data: sessionDate ? { session_date: sessionDate } : null,
    error: null,
  });
  const limitMock = vi.fn().mockReturnValue({ maybeSingle: maybeSingleMock });
  const orderMock = vi.fn().mockReturnValue({ limit: limitMock });
  const eqMock = vi.fn().mockReturnValue({ order: orderMock });
  const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
  return { select: selectMock };
}

/** Build a mock chain for group_enrollments query */
function buildEnrollmentChain(enrollment?: {
  id: string;
  enrolled_by: string;
  status: string;
  product_groups: { products: typeof MOCK_PRODUCT };
}) {
  const singleMock = vi.fn().mockResolvedValue(
    enrollment
      ? { data: enrollment, error: null }
      : { data: null, error: { message: "Not found" } },
  );
  const eqMock = vi.fn().mockReturnValue({ single: singleMock });
  const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
  return { select: selectMock };
}

/**
 * Sets up mockAdminFrom to handle both from("group_enrollments") and
 * from("enrollment_charges") calls in sequence.
 */
function mockEnrollmentLookup(
  enrollment?: {
    id: string;
    enrolled_by: string;
    status: string;
    product_groups: { products: typeof MOCK_PRODUCT };
  },
  sessionDate: string | null = "2026-03-04",
) {
  const enrollmentChain = buildEnrollmentChain(enrollment);
  const chargeChain = buildChargeChain(sessionDate);

  mockAdminFrom.mockImplementation((table: string) => {
    if (table === "group_enrollments") return enrollmentChain;
    if (table === "enrollment_charges") return chargeChain;
    return {};
  });
}

function mockActiveEnrollment(enrolledBy = "customer-123", sessionDate: string | null = "2026-03-04") {
  mockEnrollmentLookup(
    {
      id: "enr-1",
      enrolled_by: enrolledBy,
      status: "active",
      product_groups: { products: MOCK_PRODUCT },
    },
    sessionDate,
  );
}

// --- Tests ---

describe("DELETE /api/enrollments/[id]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -- Auth --

  it("should return 401 when not authenticated", async () => {
    mockUnauthenticated();

    const [req, ctx] = createRequest("enr-1");
    const response = await DELETE(req, ctx);
    expect(response.status).toBe(401);
  });

  it("should return 403 for non-customer role", async () => {
    mockForbidden();

    const [req, ctx] = createRequest("enr-1");
    const response = await DELETE(req, ctx);
    expect(response.status).toBe(403);
  });

  // -- Enrollment lookup --

  it("should return 404 when enrollment not found", async () => {
    mockAuthenticated();
    mockEnrollmentLookup(); // no enrollment

    const [req, ctx] = createRequest("nonexistent-id");
    const response = await DELETE(req, ctx);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Enrollment not found");
  });

  // -- Authorization --

  it("should return 403 when customer is not the enrolled_by", async () => {
    mockAuthenticated("customer-123");
    mockActiveEnrollment("customer-other"); // different customer

    const [req, ctx] = createRequest("enr-1");
    const response = await DELETE(req, ctx);
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe("Not authorized");
  });

  // -- Status check --

  it("should return 400 when enrollment is not active", async () => {
    mockAuthenticated();
    mockEnrollmentLookup({
      id: "enr-1",
      enrolled_by: "customer-123",
      status: "unenrolled",
      product_groups: { products: MOCK_PRODUCT },
    });

    const [req, ctx] = createRequest("enr-1");
    const response = await DELETE(req, ctx);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Enrollment is not active");
  });

  // -- Successful unenroll with refund --

  it("should unenroll with refund when outside charge window", async () => {
    mockAuthenticated();
    mockActiveEnrollment();
    mockGetRefundEligibility.mockReturnValue({
      eligible: true,
      refundAmount: 5,
      nextSession: new Date("2026-03-04T13:00:00Z"),
    });
    mockAdminRpc.mockResolvedValue({
      data: [{ new_balance: 15, refund_transaction_id: "tx-refund-1" }],
      error: null,
    });

    const [req, ctx] = createRequest("enr-1");
    const response = await DELETE(req, ctx);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.refunded).toBe(true);
    expect(data.refundAmount).toBe(5);
    expect(data.newBalance).toBe(15);
    expect(mockAdminRpc).toHaveBeenCalledWith("unenroll_gamer", {
      p_customer_id: "customer-123",
      p_enrollment_id: "enr-1",
      p_refund_amount: 5,
    });
  });

  // -- Successful unenroll without refund --

  it("should unenroll without refund when inside charge window", async () => {
    mockAuthenticated();
    mockActiveEnrollment();
    mockGetRefundEligibility.mockReturnValue({
      eligible: false,
      refundAmount: 0,
      nextSession: new Date("2026-03-03T13:00:00Z"),
    });
    mockAdminRpc.mockResolvedValue({
      data: [{ new_balance: 10, refund_transaction_id: null }],
      error: null,
    });

    const [req, ctx] = createRequest("enr-1");
    const response = await DELETE(req, ctx);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.refunded).toBe(false);
    expect(data.refundAmount).toBe(0);
    expect(data.newBalance).toBe(10);
    expect(mockAdminRpc).toHaveBeenCalledWith("unenroll_gamer", {
      p_customer_id: "customer-123",
      p_enrollment_id: "enr-1",
      p_refund_amount: 0,
    });
  });

  // -- RPC error --

  it("should return 400 when unenroll RPC fails", async () => {
    mockAuthenticated();
    mockActiveEnrollment();
    mockGetRefundEligibility.mockReturnValue({
      eligible: true,
      refundAmount: 5,
      nextSession: new Date("2026-03-04T13:00:00Z"),
    });
    mockAdminRpc.mockResolvedValue({
      data: null,
      error: { message: "Enrollment not found or not active" },
    });

    const [req, ctx] = createRequest("enr-1");
    const response = await DELETE(req, ctx);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Enrollment not found or not active");
  });

  // -- Charge-aware refund logic --

  it("should deny refund when latest charge session has already passed", async () => {
    mockAuthenticated();
    // Last charge was for a session date in the past
    mockActiveEnrollment("customer-123", "2026-02-25");
    mockGetRefundEligibility.mockReturnValue({
      eligible: false,
      refundAmount: 0,
      reason: "not_yet_charged",
      nextSession: new Date("2026-03-04T13:00:00Z"),
    });
    mockAdminRpc.mockResolvedValue({
      data: [{ new_balance: 10, refund_transaction_id: null }],
      error: null,
    });

    const [req, ctx] = createRequest("enr-1");
    const response = await DELETE(req, ctx);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.refunded).toBe(false);
    expect(data.refundAmount).toBe(0);
    // Verify the charge session_date was passed to getRefundEligibility
    expect(mockGetRefundEligibility).toHaveBeenCalledWith(
      MOCK_PRODUCT,
      expect.any(Number),
      expect.any(Date),
      "2026-02-25",
    );
  });

  it("should handle no charges found", async () => {
    mockAuthenticated();
    // No charges exist for this enrollment
    mockActiveEnrollment("customer-123", null);
    mockGetRefundEligibility.mockReturnValue({
      eligible: false,
      refundAmount: 0,
      reason: "not_yet_charged",
      nextSession: new Date("2026-03-04T13:00:00Z"),
    });
    mockAdminRpc.mockResolvedValue({
      data: [{ new_balance: 10, refund_transaction_id: null }],
      error: null,
    });

    const [req, ctx] = createRequest("enr-1");
    const response = await DELETE(req, ctx);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.refunded).toBe(false);
    // Verify null session_date was passed
    expect(mockGetRefundEligibility).toHaveBeenCalledWith(
      MOCK_PRODUCT,
      expect.any(Number),
      expect.any(Date),
      null,
    );
  });
});
