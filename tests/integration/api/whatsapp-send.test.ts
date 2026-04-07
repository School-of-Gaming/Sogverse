import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST } from "@/app/api/admin/whatsapp/send/route";
import { NextResponse } from "next/server";

// --- Mocks ---

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockSendWhatsAppMessage = vi.fn();
vi.mock("@/lib/whatsapp", () => ({
  sendWhatsAppMessage: (...args: unknown[]) => mockSendWhatsAppMessage(...args),
}));

const mockUpsert = vi.fn().mockResolvedValue({ error: null });
const mockInsert = vi.fn().mockResolvedValue({ error: null });
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: () => ({
      upsert: mockUpsert,
      insert: mockInsert,
    }),
  })),
}));

// --- Helpers ---

function mockAdmin() {
  mockRequireRole.mockResolvedValue({
    user: { id: "admin-user-id" },
    profile: { role: "admin" },
    supabase: {},
  });
}

function mockUnauthenticated() {
  mockRequireRole.mockResolvedValue(
    NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  );
}

function mockForbidden() {
  mockRequireRole.mockResolvedValue(
    NextResponse.json(
      { error: "Only admins can send WhatsApp messages" },
      { status: 403 }
    )
  );
}

function createRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost:3000/api/admin/whatsapp/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// --- Tests ---

describe("POST /api/admin/whatsapp/send", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendWhatsAppMessage.mockResolvedValue({ messageId: "wamid.test123" });
  });

  // -- Auth --

  it("should return 401 when not authenticated", async () => {
    mockUnauthenticated();
    const response = await POST(createRequest({ to: "358401234567", body: "Hi" }));
    expect(response.status).toBe(401);
  });

  it("should return 403 for non-admin roles", async () => {
    mockForbidden();
    const response = await POST(createRequest({ to: "358401234567", body: "Hi" }));
    expect(response.status).toBe(403);
  });

  // -- Validation --

  it("should return 400 when 'to' is missing", async () => {
    mockAdmin();
    const response = await POST(createRequest({ body: "Hi" }));
    expect(response.status).toBe(400);
  });

  it("should return 400 when 'body' is missing", async () => {
    mockAdmin();
    const response = await POST(createRequest({ to: "358401234567" }));
    expect(response.status).toBe(400);
  });

  it("should return 400 when 'body' is empty", async () => {
    mockAdmin();
    const response = await POST(createRequest({ to: "358401234567", body: "" }));
    expect(response.status).toBe(400);
  });

  // -- Happy path --

  it("should send message and store in database with pending status", async () => {
    mockAdmin();
    const response = await POST(
      createRequest({ to: "358401234567", body: "Hello!" })
    );
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.messageId).toBe("wamid.test123");

    // Verify Meta API was called
    expect(mockSendWhatsAppMessage).toHaveBeenCalledWith("358401234567", {
      type: "text",
      body: "Hello!",
    });

    // Verify message is stored with 'pending' status — webhooks will
    // promote to sent/delivered/read or failed. If this is missing,
    // the DB default ('sent') skips the pending state entirely.
    expect(mockInsert).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "wamid.test123",
        phone: "358401234567",
        direction: "outbound",
        body: "Hello!",
        status: "pending",
      })
    );
  });

  it("should not store message in DB when Meta API fails", async () => {
    mockAdmin();
    mockSendWhatsAppMessage.mockRejectedValue(new Error("API error"));

    const response = await POST(
      createRequest({ to: "358401234567", body: "Hello!" })
    );

    expect(response.status).toBe(500);
    expect(mockUpsert).not.toHaveBeenCalled();
    expect(mockInsert).not.toHaveBeenCalled();
  });

  // -- Error handling --

  it("should surface 24-hour window error with friendly message", async () => {
    mockAdmin();
    mockSendWhatsAppMessage.mockRejectedValue(
      new Error("(#131047) Re-engage the user")
    );

    const response = await POST(
      createRequest({ to: "358401234567", body: "Hello!" })
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("24-hour conversation window");
  });
});
