import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/admin/products/[id]/groups/apply/route";
import { NextResponse } from "next/server";
import { mockSupabaseSuccess, mockSupabaseError } from "../../mocks/supabase";

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
    rpc: (...args: unknown[]) => mockAdminRpc(...args),
  })),
}));

const mockCreateDailyRoom = vi.fn();
const mockDeleteDailyRoom = vi.fn();
vi.mock("@/lib/daily", () => ({
  createDailyRoom: (...args: unknown[]) => mockCreateDailyRoom(...args),
  deleteDailyRoom: (...args: unknown[]) => mockDeleteDailyRoom(...args),
}));

const mockSendTransactionalEmail = vi.fn();
vi.mock("@/lib/brevo", () => ({
  sendTransactionalEmail: (...args: unknown[]) => mockSendTransactionalEmail(...args),
}));

vi.mock("@/lib/constants", () => ({
  SENDER_EMAIL: "noreply@test.com",
}));

vi.mock("@/lib/email-templates/group-changes", () => ({
  buildGroupAddedEmail: () => "<html>added</html>",
  buildGroupDeletedEmail: () => "<html>deleted</html>",
  buildGroupReassignedOldGeduEmail: () => "<html>reassigned-old</html>",
  buildGroupReassignedNewGeduEmail: () => "<html>reassigned-new</html>",
  buildGroupReassignedParentEmail: () => "<html>reassigned-parent</html>",
  buildGamerMovedParentEmail: () => "<html>moved-parent</html>",
  buildGamerMovedOldGeduEmail: () => "<html>moved-old</html>",
  buildGamerMovedNewGeduEmail: () => "<html>moved-new</html>",
}));


// --- Helpers ---

const PRODUCT_ID = "product-123";

function mockAdmin() {
  mockRequireRole.mockResolvedValue({
    user: { id: "admin-user-id" },
    profile: { role: "admin" },
    supabase: {},
  });
}

function mockNonAdmin() {
  mockRequireRole.mockResolvedValue(
    NextResponse.json({ error: "Forbidden" }, { status: 403 }),
  );
}

const emptyNotify = {
  addedGroups: [],
  updatedGroups: [],
  deletedGroups: [],
  enrollmentMoves: [],
};

const emptyBatch = {
  addedGroups: [],
  updatedGroups: [],
  deletedGroupIds: [],
  enrollmentMoves: [],
};

function createRequest(body: Record<string, unknown>): Request {
  return new Request(`http://localhost:3000/api/admin/products/${PRODUCT_ID}/groups/apply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function createParams() {
  return { params: Promise.resolve({ id: PRODUCT_ID }) };
}

/** Read an SSE response and return parsed events. */
async function readSSEEvents(response: Response): Promise<Record<string, unknown>[]> {
  const text = await response.text();
  return text
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => JSON.parse(line.slice(6)));
}

// --- Supabase chaining helpers ---

function chainSelect(data: unknown) {
  const eqChain = {
    eq: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        in: vi.fn().mockResolvedValue(mockSupabaseSuccess(data)),
      }),
      single: vi.fn().mockResolvedValue(mockSupabaseSuccess(data)),
      in: vi.fn().mockResolvedValue(mockSupabaseSuccess(data)),
    }),
    in: vi.fn().mockResolvedValue(mockSupabaseSuccess(data)),
    single: vi.fn().mockResolvedValue(mockSupabaseSuccess(data)),
  };
  return { select: vi.fn().mockReturnValue(eqChain) };
}

// --- Tests ---

describe("POST /api/admin/products/[id]/groups/apply", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockCreateDailyRoom.mockResolvedValue({});
    mockDeleteDailyRoom.mockResolvedValue({});
    mockSendTransactionalEmail.mockResolvedValue({});
  });

  it("returns 403 for non-admin users", async () => {
    mockNonAdmin();

    const response = await POST(
      createRequest({ batch: emptyBatch, notify: emptyNotify }),
      createParams(),
    );

    expect(response.status).toBe(403);
  });

  it("returns 404 when product not found", async () => {
    mockAdmin();
    mockAdminFrom.mockReturnValue(chainSelect(null));

    const response = await POST(
      createRequest({ batch: emptyBatch, notify: emptyNotify }),
      createParams(),
    );

    expect(response.status).toBe(404);
  });

  it("streams plan with DB save step when no notifications needed", async () => {
    mockAdmin();
    mockAdminFrom.mockReturnValue(
      chainSelect({ id: PRODUCT_ID, name: "Test Product" }),
    );
    mockAdminRpc.mockResolvedValue(mockSupabaseSuccess({ tempMap: {} }));

    const response = await POST(
      createRequest({ batch: emptyBatch, notify: emptyNotify }),
      createParams(),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/event-stream");

    const events = await readSSEEvents(response);

    const plan = events.find((e) => e.type === "plan");
    expect(plan).toBeDefined();
    expect(plan!.steps).toHaveLength(1);
    expect((plan!.steps as { description: string }[])[0].description).toBe("Save group changes");

    const stepDone = events.find((e) => e.type === "step_done");
    expect(stepDone).toEqual({ type: "step_done", index: 0 });

    const complete = events.find((e) => e.type === "complete");
    expect(complete).toMatchObject({ type: "complete", success: true });
  });

  it("streams step_error when RPC fails", async () => {
    mockAdmin();
    mockAdminFrom.mockReturnValue(
      chainSelect({ id: PRODUCT_ID, name: "Test Product" }),
    );
    mockAdminRpc.mockResolvedValue(mockSupabaseError("constraint violation"));

    const response = await POST(
      createRequest({ batch: emptyBatch, notify: emptyNotify }),
      createParams(),
    );

    const events = await readSSEEvents(response);

    const stepError = events.find((e) => e.type === "step_error");
    expect(stepError).toMatchObject({ type: "step_error", index: 0, error: "constraint violation" });

    const complete = events.find((e) => e.type === "complete");
    expect(complete).toMatchObject({ type: "complete", success: false });
  });

  it("includes email jobs in plan for added groups", async () => {
    mockAdmin();

    // Product lookup
    mockAdminFrom.mockReturnValue(
      chainSelect({ id: PRODUCT_ID, name: "Test Product" }),
    );

    // Gedu profile lookup + admin emails
    const geduData = [{ id: "gedu-1", first_name: "Alice", email: "alice@test.com" }];
    const adminData = [{ email: "admin@test.com" }];
    let fromCallCount = 0;
    mockAdminFrom.mockImplementation((table: string) => {
      if (table === "products") {
        return chainSelect({ id: PRODUCT_ID, name: "Test Product" });
      }
      if (table === "profiles") {
        fromCallCount++;
        // First call = gedu profiles, later calls = admin profiles
        if (fromCallCount === 1) return chainSelect(geduData);
        return chainSelect(adminData);
      }
      return chainSelect([]);
    });

    mockAdminRpc.mockResolvedValue(mockSupabaseSuccess({ tempMap: {} }));

    const notify = {
      addedGroups: [{ geduId: "gedu-1" }],
      updatedGroups: [],
      deletedGroups: [],
      enrollmentMoves: [],
    };

    const response = await POST(
      createRequest({ batch: emptyBatch, notify }),
      createParams(),
    );

    const events = await readSSEEvents(response);
    const plan = events.find((e) => e.type === "plan");

    // Should have DB save + 1 email step
    expect((plan!.steps as unknown[]).length).toBe(2);

    // Email should have been sent
    const emailStepDone = events.filter((e) => e.type === "step_done" && e.index === 1);
    expect(emailStepDone).toHaveLength(1);
    expect(mockSendTransactionalEmail).toHaveBeenCalledTimes(1);
  });
});
