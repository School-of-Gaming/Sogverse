import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/admin/products/[id]/groups/notify/route";
import { NextResponse } from "next/server";

// --- Mocks ---

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockSendTransactionalEmail = vi.fn();
vi.mock("@/lib/brevo", () => ({
  sendTransactionalEmail: (...args: unknown[]) => mockSendTransactionalEmail(...args),
}));

const mockFrom = vi.fn();
const mockRpc = vi.fn();
const mockAdminClient = {
  from: (...args: unknown[]) => mockFrom(...args),
  rpc: (...args: unknown[]) => mockRpc(...args),
};
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mockAdminClient,
}));

// --- Helpers ---

function mockUnauthenticated() {
  mockRequireRole.mockResolvedValue(
    NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  );
}

function mockAdmin() {
  mockRequireRole.mockResolvedValue({
    user: { id: "admin-id" },
    profile: { role: "admin" },
    supabase: {},
  });
}

function createRequest(productId: string, body: Record<string, unknown>): [Request, { params: Promise<{ id: string }> }] {
  return [
    new Request(`http://localhost:3000/api/admin/products/${productId}/groups/notify`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: productId }) },
  ];
}

const emptyPayload = {
  addedGroups: [],
  updatedGroups: [],
  deletedGroups: [],
  enrollmentMoves: [],
};

// Chainable mock for Supabase query builder
function chainable(result: { data: unknown; error?: unknown }) {
  const chain: Record<string, unknown> = {};
  const methods = ["select", "eq", "in", "single", "not"];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  // Terminal: make it thenable so `await` resolves to the result
  chain.then = (resolve: (v: unknown) => void) => resolve(result);
  return chain;
}

function setupMockFrom() {
  mockFrom.mockImplementation((table: string) => {
    if (table === "products") {
      return chainable({ data: { name: "Minecraft 101" } });
    }
    if (table === "profiles") {
      return chainable({ data: [] });
    }
    if (table === "group_enrollments") {
      return chainable({ data: [] });
    }
    return chainable({ data: [] });
  });
}

async function readStream(response: Response): Promise<string[]> {
  const text = await response.text();
  return text
    .split("\n")
    .filter((line) => line.startsWith("data: "))
    .map((line) => line.slice(6));
}

// --- Tests ---

describe("POST /api/admin/products/[id]/groups/notify", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendTransactionalEmail.mockResolvedValue({ messageId: "msg-123" });
    setupMockFrom();
  });

  it("returns 401 when not authenticated", async () => {
    mockUnauthenticated();

    const [req, ctx] = createRequest("product-1", emptyPayload);
    const response = await POST(req, ctx);
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 404 when product not found", async () => {
    mockAdmin();
    mockFrom.mockImplementation((table: string) => {
      if (table === "products") {
        return chainable({ data: null });
      }
      return chainable({ data: [] });
    });

    const [req, ctx] = createRequest("nonexistent", emptyPayload);
    const response = await POST(req, ctx);
    const data = await response.json();

    expect(response.status).toBe(404);
    expect(data.error).toBe("Product not found");
  });

  it("returns complete SSE event with 0 sent for empty payload", async () => {
    mockAdmin();

    const [req, ctx] = createRequest("product-1", emptyPayload);
    const response = await POST(req, ctx);

    expect(response.headers.get("Content-Type")).toBe("text/event-stream");

    const events = await readStream(response);
    expect(events).toHaveLength(1);

    const complete = JSON.parse(events[0]);
    expect(complete.type).toBe("complete");
    expect(complete.sent).toBe(0);
    expect(complete.failed).toBe(0);
  });

  it("sends emails and streams progress for added groups", async () => {
    mockAdmin();

    // Track which table queries happen
    const profileCalls: unknown[][] = [];
    mockFrom.mockImplementation((table: string) => {
      if (table === "products") {
        return chainable({ data: { name: "Minecraft 101" } });
      }
      if (table === "profiles") {
        // Return different results based on the call
        const call = chainable({
          data: [
            { id: "gedu-1", display_name: "Alice", email: "alice@test.com", role: "gedu" },
          ],
        });
        profileCalls.push([table]);
        return call;
      }
      return chainable({ data: [] });
    });

    const payload = {
      addedGroups: [{ geduId: "gedu-1" }],
      updatedGroups: [],
      deletedGroups: [],
      enrollmentMoves: [],
    };

    const [req, ctx] = createRequest("product-1", payload);
    const response = await POST(req, ctx);

    expect(response.headers.get("Content-Type")).toBe("text/event-stream");

    const events = await readStream(response);
    const parsed = events.map((e) => JSON.parse(e));

    // Should have progress, sent, and complete events
    const progressEvents = parsed.filter((e) => e.type === "progress");
    const completeEvent = parsed.find((e) => e.type === "complete");

    expect(progressEvents.length).toBeGreaterThanOrEqual(1);
    expect(completeEvent).toBeDefined();
    expect(completeEvent.sent).toBeGreaterThanOrEqual(0);
  });

  it("continues sending when individual emails fail", async () => {
    mockAdmin();

    mockFrom.mockImplementation((table: string) => {
      if (table === "products") {
        return chainable({ data: { name: "Test" } });
      }
      if (table === "profiles") {
        return chainable({
          data: [
            { id: "gedu-1", display_name: "Alice", email: "alice@test.com", role: "gedu" },
            { id: "gedu-2", display_name: "Bob", email: "bob@test.com", role: "gedu" },
          ],
        });
      }
      return chainable({ data: [] });
    });

    // First call fails, second succeeds
    mockSendTransactionalEmail
      .mockRejectedValueOnce(new Error("SMTP error"))
      .mockResolvedValue({ messageId: "msg-ok" });

    const payload = {
      addedGroups: [{ geduId: "gedu-1" }, { geduId: "gedu-2" }],
      updatedGroups: [],
      deletedGroups: [],
      enrollmentMoves: [],
    };

    const [req, ctx] = createRequest("product-1", payload);
    const response = await POST(req, ctx);
    const events = await readStream(response);
    const complete = JSON.parse(events[events.length - 1]);

    expect(complete.type).toBe("complete");
    expect(complete.failed).toBeGreaterThanOrEqual(1);
    expect(complete.errors.length).toBeGreaterThanOrEqual(1);
    expect(complete.errors[0]).toContain("SMTP error");
  });
});
