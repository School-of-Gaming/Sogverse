import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/auth/forgot-password/route";

// The route builds the emailed reset link's redirectTo via getOrigin(), which
// falls back to NEXT_PUBLIC_SITE_URL when the request carries no trusted Host
// (these mock requests don't). A fake value keeps the suite hermetic and
// exercises the production-representative path (untrusted Host → canonical
// origin). getOrigin reads process.env at call time, so setting it here works
// despite import hoisting.
process.env.NEXT_PUBLIC_SITE_URL = "https://test.sogverse.local";

// --- Mocks ---

const mockGenerateLink = vi.fn();
let mockProfileLocale: string | null = null;

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
          single: () => Promise.resolve({
            data: { locale: mockProfileLocale },
            error: null,
          }),
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

function createRequest(body: Record<string, unknown>, headers?: Record<string, string>): Request {
  return new Request("http://localhost:3000/api/auth/forgot-password", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

// --- Tests ---

describe("POST /api/auth/forgot-password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProfileLocale = null;
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
        redirectTo: "https://test.sogverse.local/reset-password",
      },
    });
  });

  // Regression: the recovery link's redirectTo must be built off the trusted
  // origin (getOrigin → canonical NEXT_PUBLIC_SITE_URL here), never the
  // attacker-controllable Host header / request URL. This route is
  // unauthenticated and takes an arbitrary email, so a spoofed Host would mail
  // the victim a real recovery link pointing at the attacker's domain —
  // clicking it hands over the recovery token (account takeover).
  it("builds the reset link off the trusted origin, ignoring a spoofed Host", async () => {
    // Both the URL and the Host header carry the attacker value, as a genuinely
    // spoofed request would — so this fails if the route ever regresses to
    // either `new URL(request.url).origin` or a raw Host read.
    const spoofed = new Request("https://evil.com/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json", host: "evil.com" },
      body: JSON.stringify({ email: "victim@example.com" }),
    });
    await POST(spoofed);

    expect(mockGenerateLink).toHaveBeenCalledWith(
      expect.objectContaining({
        options: { redirectTo: "https://test.sogverse.local/reset-password" },
      }),
    );
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

  // -- Accept-Language locale detection --

  it("should send Finnish email when Accept-Language has fi as best supported match", async () => {
    await POST(createRequest(
      { email: "user@example.com" },
      { "Accept-Language": "de-DE,fi;q=0.9,en;q=0.8" },
    ));

    expect(mockSendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "Nollaa Sogverse-salasanasi",
      })
    );
  });

  it("should fall back to English when no Accept-Language language is supported", async () => {
    await POST(createRequest(
      { email: "user@example.com" },
      { "Accept-Language": "de-DE,fr;q=0.9,ja;q=0.8" },
    ));

    expect(mockSendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "Reset your Sogverse password",
      })
    );
  });

  it("should prefer stored profile locale over Accept-Language header", async () => {
    mockProfileLocale = "fi";

    await POST(createRequest(
      { email: "user@example.com" },
      { "Accept-Language": "en-US,en;q=0.9" },
    ));

    expect(mockSendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: "Nollaa Sogverse-salasanasi",
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
