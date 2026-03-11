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
interface Chain {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  in: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  not: ReturnType<typeof vi.fn>;
  then: (resolve: (v: unknown) => void) => void;
  [key: string]: unknown;
}

function chainable(result: { data: unknown; error?: unknown }): Chain {
  const chain = {} as Chain;
  const methods = ["select", "eq", "in", "single", "not"] as const;
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

  it("returns plan and complete SSE events with 0 sent for empty payload", async () => {
    mockAdmin();

    const [req, ctx] = createRequest("product-1", emptyPayload);
    const response = await POST(req, ctx);

    expect(response.headers.get("Content-Type")).toBe("text/event-stream");

    const events = await readStream(response);
    const parsed = events.map((e) => JSON.parse(e));

    const planEvent = parsed.find((e) => e.type === "plan");
    const complete = parsed.find((e) => e.type === "complete");

    expect(planEvent).toBeDefined();
    expect(planEvent.jobs).toHaveLength(0);
    expect(complete).toBeDefined();
    expect(complete.sent).toBe(0);
    expect(complete.failed).toBe(0);
  });

  it("sends plan event then sent events for added groups", async () => {
    mockAdmin();

    mockFrom.mockImplementation((table: string) => {
      if (table === "products") {
        return chainable({ data: { name: "Minecraft 101" } });
      }
      if (table === "profiles") {
        return chainable({
          data: [
            { id: "gedu-1", display_name: "Alice", email: "alice@test.com", role: "gedu" },
          ],
        });
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

    // Should have plan, sent, and complete events
    const planEvent = parsed.find((e) => e.type === "plan");
    const sentEvents = parsed.filter((e) => e.type === "sent");
    const completeEvent = parsed.find((e) => e.type === "complete");

    expect(planEvent).toBeDefined();
    expect(planEvent.jobs.length).toBeGreaterThanOrEqual(1);
    expect(planEvent.jobs[0].recipient).toBe("alice@test.com");
    expect(sentEvents.length).toBeGreaterThanOrEqual(1);
    expect(sentEvents[0].index).toBe(0);
    expect(completeEvent).toBeDefined();
    expect(completeEvent.sent).toBeGreaterThanOrEqual(1);
  });

  it("only notifies parents of actively enrolled gamers in reassigned groups", async () => {
    mockAdmin();

    const enrollmentChains: Chain[] = [];

    mockFrom.mockImplementation((table: string) => {
      if (table === "products") {
        return chainable({ data: { name: "Minecraft 101" } });
      }
      if (table === "profiles") {
        return chainable({
          data: [
            { id: "old-gedu", display_name: "Alice", email: "alice@test.com" },
            { id: "new-gedu", display_name: "Bob", email: "bob@test.com" },
            { id: "parent-1", display_name: "Parent One", email: "parent1@test.com" },
          ],
        });
      }
      if (table === "group_enrollments") {
        // Return one active enrollment — the route should filter by status
        const c = chainable({
          data: [
            { gamer_id: "gamer-1", enrolled_by: "parent-1", group_id: "group-1" },
          ],
        });
        enrollmentChains.push(c);
        return c;
      }
      return chainable({ data: [] });
    });

    const payload = {
      addedGroups: [],
      updatedGroups: [{ groupId: "group-1", oldGeduId: "old-gedu", newGeduId: "new-gedu" }],
      deletedGroups: [],
      enrollmentMoves: [],
    };

    const [req, ctx] = createRequest("product-1", payload);
    const response = await POST(req, ctx);
    await readStream(response);

    // Verify every group_enrollments query included status = 'active' filter
    for (const chain of enrollmentChains) {
      const eqCalls = chain.eq.mock.calls;
      const hasStatusFilter = eqCalls.some(
        (args: unknown[]) => args[0] === "status" && args[1] === "active"
      );
      expect(hasStatusFilter, "group_enrollments query must filter by status = 'active'").toBe(true);
    }
  });

  it("only notifies parents of actively enrolled moved gamers", async () => {
    mockAdmin();

    const enrollmentChains: Chain[] = [];

    mockFrom.mockImplementation((table: string) => {
      if (table === "products") {
        return chainable({ data: { name: "Minecraft 101" } });
      }
      if (table === "profiles") {
        return chainable({
          data: [
            { id: "old-gedu", display_name: "Alice", email: "alice@test.com" },
            { id: "new-gedu", display_name: "Bob", email: "bob@test.com" },
            { id: "gamer-1", display_name: "Kid" },
            { id: "parent-1", display_name: "Parent One", email: "parent1@test.com" },
          ],
        });
      }
      if (table === "group_enrollments") {
        const c = chainable({
          data: [
            { gamer_id: "gamer-1", enrolled_by: "parent-1" },
          ],
        });
        enrollmentChains.push(c);
        return c;
      }
      return chainable({ data: [] });
    });

    const payload = {
      addedGroups: [],
      updatedGroups: [],
      deletedGroups: [],
      enrollmentMoves: [{ gamerId: "gamer-1", fromGeduId: "old-gedu", toGeduId: "new-gedu" }],
    };

    const [req, ctx] = createRequest("product-1", payload);
    const response = await POST(req, ctx);
    await readStream(response);

    // Verify every group_enrollments query included status = 'active' filter
    for (const chain of enrollmentChains) {
      const eqCalls = chain.eq.mock.calls;
      const hasStatusFilter = eqCalls.some(
        (args: unknown[]) => args[0] === "status" && args[1] === "active"
      );
      expect(hasStatusFilter, "group_enrollments query must filter by status = 'active'").toBe(true);
    }
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
