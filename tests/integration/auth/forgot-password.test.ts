import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/auth/forgot-password/route";

// --- Mocks ---

const mockGenerateLink = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    auth: {
      admin: {
        generateLink: (...args: unknown[]) => mockGenerateLink(...args),
      },
    },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: () => Promise.resolve({ data: { language_preference: null }, error: null }),
        }),
      }),
    }),
  })),
}));

const mockSendTransactionalEmail = vi.fn();
vi.mock("@/lib/brevo", () => ({
  sendTransactionalEmail: (...args: unknown[]) => mockSendTransactionalEmail(...args),
}));


// --- Helpers ---

function createRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost:3000/api/auth/forgot-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

// --- Tests ---

describe("POST /api/auth/forgot-password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateLink.mockResolvedValue({
      data: { properties: { action_link: "https://supabase.co/verify?token=abc" } },
      error: null,
    });
    mockSendTransactionalEmail.mockResolvedValue({ messageId: "msg-123" });
  });

  // -- User enumeration prevention --

  it("should return success for valid email", async () => {
    const response = await POST(createRequest({ email: "user@example.com" }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });

  it("should return success even when email does not exist (prevents enumeration)", async () => {
    mockGenerateLink.mockResolvedValue({
      data: null,
      error: { message: "User not found" },
    });

    const response = await POST(createRequest({ email: "nonexistent@example.com" }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockSendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("should return success for invalid email format (prevents enumeration)", async () => {
    const response = await POST(createRequest({ email: "not-an-email" }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockGenerateLink).not.toHaveBeenCalled();
    expect(mockSendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("should return success for missing email field (prevents enumeration)", async () => {
    const response = await POST(createRequest({}));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockGenerateLink).not.toHaveBeenCalled();
  });

  // -- Happy path --

  it("should call generateLink with recovery type and correct redirectTo", async () => {
    await POST(createRequest({ email: "user@example.com" }));

    expect(mockGenerateLink).toHaveBeenCalledWith({
      type: "recovery",
      email: "user@example.com",
      options: {
        redirectTo: "http://localhost:3000/reset-password",
      },
    });
  });

  it("should send email via Brevo with the action link", async () => {
    await POST(createRequest({ email: "user@example.com" }));

    expect(mockSendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        toEmail: "user@example.com",
        subject: "Reset your Sogverse password",
        htmlContent: expect.stringContaining("Reset"),
      })
    );
  });

  // -- Error handling --

  it("should return success even when Brevo fails (prevents enumeration)", async () => {
    mockSendTransactionalEmail.mockRejectedValue(new Error("Brevo API error"));

    const response = await POST(createRequest({ email: "user@example.com" }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
  });
});
