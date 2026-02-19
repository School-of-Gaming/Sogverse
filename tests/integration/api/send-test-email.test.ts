import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/admin/send-test-email/route";
import { mockSupabaseSuccess } from "../../mocks/supabase";

// --- Mocks ---

const mockGetUser = vi.fn();
const mockFromSelect = vi.fn();

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser },
    from: vi.fn(() => ({
      select: mockFromSelect,
    })),
  })),
}));

const mockSendTransactionalEmail = vi.fn();
vi.mock("@/lib/brevo", () => ({
  sendTransactionalEmail: (...args: unknown[]) => mockSendTransactionalEmail(...args),
}));

// --- Helpers ---

function mockUnauthenticated() {
  mockGetUser.mockResolvedValue({
    data: { user: null },
    error: { message: "No session" },
  });
}

function mockAuthenticatedWithRole(role: string) {
  mockGetUser.mockResolvedValue({
    data: { user: { id: "admin-user-id" } },
    error: null,
  });

  mockFromSelect.mockReturnValue({
    eq: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue(
        mockSupabaseSuccess({ role })
      ),
    }),
  });
}

function createRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost:3000/api/admin/send-test-email", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = {
  provider: "brevo",
  fromEmail: "noreply@example.com",
  fromName: "Sogverse",
  toEmail: "test@example.com",
  subject: "Test Subject",
  body: "Hello world",
};

// --- Tests ---

describe("POST /api/admin/send-test-email", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendTransactionalEmail.mockResolvedValue({ messageId: "msg-123" });
  });

  // -- Auth & Authorization --

  it("should return 401 when not authenticated", async () => {
    mockUnauthenticated();

    const response = await POST(createRequest(validBody));
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("should return 403 for customer role", async () => {
    mockAuthenticatedWithRole("customer");

    const response = await POST(createRequest(validBody));
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe("Only admins can send test emails");
  });

  it("should return 403 for gamer role", async () => {
    mockAuthenticatedWithRole("gamer");

    const response = await POST(createRequest(validBody));

    expect(response.status).toBe(403);
  });

  it("should return 403 for gedu role", async () => {
    mockAuthenticatedWithRole("gedu");

    const response = await POST(createRequest(validBody));

    expect(response.status).toBe(403);
  });

  // -- Validation --

  it("should return 400 for invalid provider", async () => {
    mockAuthenticatedWithRole("admin");

    const response = await POST(
      createRequest({ ...validBody, provider: "mailgun" })
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("provider");
  });

  it("should return 400 for invalid fromEmail", async () => {
    mockAuthenticatedWithRole("admin");

    const response = await POST(
      createRequest({ ...validBody, fromEmail: "not-an-email" })
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("fromEmail");
  });

  it("should return 400 for missing toEmail", async () => {
    mockAuthenticatedWithRole("admin");

    const { toEmail: _, ...withoutTo } = validBody;
    const response = await POST(createRequest(withoutTo));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("toEmail");
  });

  it("should return 400 for empty subject", async () => {
    mockAuthenticatedWithRole("admin");

    const response = await POST(
      createRequest({ ...validBody, subject: "" })
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("subject");
  });

  it("should return 400 for empty body", async () => {
    mockAuthenticatedWithRole("admin");

    const response = await POST(
      createRequest({ ...validBody, body: "" })
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("body");
  });

  it("should return 400 for invalid replyToEmail", async () => {
    mockAuthenticatedWithRole("admin");

    const response = await POST(
      createRequest({ ...validBody, replyToEmail: "not-an-email" })
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("replyToEmail");
  });

  // -- Happy path --

  it("should send email and return messageId", async () => {
    mockAuthenticatedWithRole("admin");

    const response = await POST(createRequest(validBody));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.messageId).toBe("msg-123");
    expect(mockSendTransactionalEmail).toHaveBeenCalledWith({
      fromEmail: "noreply@example.com",
      fromName: "Sogverse",
      toEmail: "test@example.com",
      subject: "Test Subject",
      htmlContent: "Hello world",
      replyToEmail: undefined,
    });
  });

  it("should convert newlines to <br/> in body", async () => {
    mockAuthenticatedWithRole("admin");

    await POST(
      createRequest({ ...validBody, body: "Line 1\nLine 2\nLine 3" })
    );

    expect(mockSendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        htmlContent: "Line 1<br/>Line 2<br/>Line 3",
      })
    );
  });

  it("should escape HTML entities in body", async () => {
    mockAuthenticatedWithRole("admin");

    await POST(
      createRequest({ ...validBody, body: "<script>alert('xss')</script>" })
    );

    expect(mockSendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        htmlContent: "&lt;script&gt;alert('xss')&lt;/script&gt;",
      })
    );
  });

  it("should pass replyToEmail when provided", async () => {
    mockAuthenticatedWithRole("admin");

    await POST(
      createRequest({ ...validBody, replyToEmail: "reply@example.com" })
    );

    expect(mockSendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        replyToEmail: "reply@example.com",
      })
    );
  });

  // -- Error handling --

  it("should return 500 when Brevo API fails", async () => {
    mockAuthenticatedWithRole("admin");
    mockSendTransactionalEmail.mockRejectedValue(new Error("Brevo API error: 500 Internal Server Error"));

    const response = await POST(createRequest(validBody));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Brevo API error: 500 Internal Server Error");
  });
});
