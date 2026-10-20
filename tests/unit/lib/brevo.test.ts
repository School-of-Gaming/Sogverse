import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendTransactionalEmail } from "@/lib/brevo";

// --- Mocks ---

const mockFetch = vi.fn();

beforeEach(() => {
  mockFetch.mockClear();
  vi.stubGlobal("fetch", mockFetch);
  vi.stubEnv("BREVO_API_KEY", "test-brevo-key");
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

// --- Tests ---

describe("sendTransactionalEmail", () => {
  const baseOptions = {
    fromEmail: "noreply@example.com",
    fromName: "Test Sender",
    toEmail: "recipient@example.com",
    subject: "Test Subject",
    htmlContent: "<p>Hello</p>",
  };

  it("should call Brevo API with correct payload", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ messageId: "msg-123" }),
    });

    const result = await sendTransactionalEmail(baseOptions);

    expect(result.messageId).toBe("msg-123");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.brevo.com/v3/smtp/email",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Content-Type": "application/json",
          "api-key": "test-brevo-key",
        }),
      })
    );

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body).toEqual({
      sender: { email: "noreply@example.com", name: "Test Sender" },
      to: [{ email: "recipient@example.com" }],
      subject: "Test Subject",
      htmlContent: "<p>Hello</p>",
    });
  });

  it("should include replyTo when replyToEmail is provided", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ messageId: "msg-456" }),
    });

    await sendTransactionalEmail({
      ...baseOptions,
      replyToEmail: "reply@example.com",
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.replyTo).toEqual({ email: "reply@example.com" });
  });

  it("should not include replyTo when replyToEmail is omitted", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ messageId: "msg-789" }),
    });

    await sendTransactionalEmail(baseOptions);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.replyTo).toBeUndefined();
  });

  it("should throw when API returns an error", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      statusText: "Bad Request",
      json: async () => ({ message: "Invalid sender" }),
    });

    await expect(sendTransactionalEmail(baseOptions)).rejects.toThrow(
      "Invalid sender"
    );
  });

  it("should throw a generic error when API returns non-JSON error", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
      json: async () => {
        throw new Error("not json");
      },
    });

    await expect(sendTransactionalEmail(baseOptions)).rejects.toThrow(
      "Brevo API error: 500 Internal Server Error"
    );
  });

  it("should include cc when provided", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ messageId: "msg-cc" }),
    });

    await sendTransactionalEmail({
      ...baseOptions,
      cc: ["cc1@example.com", "cc2@example.com"],
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.cc).toEqual([
      { email: "cc1@example.com" },
      { email: "cc2@example.com" },
    ]);
  });

  it("should include bcc when provided", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ messageId: "msg-bcc" }),
    });

    await sendTransactionalEmail({
      ...baseOptions,
      bcc: ["bcc@example.com"],
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.bcc).toEqual([{ email: "bcc@example.com" }]);
  });

  it("should not include cc/bcc when arrays are empty", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ messageId: "msg-empty" }),
    });

    await sendTransactionalEmail({
      ...baseOptions,
      cc: [],
      bcc: [],
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.cc).toBeUndefined();
    expect(body.bcc).toBeUndefined();
  });

  it("should not include cc/bcc when omitted", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ messageId: "msg-none" }),
    });

    await sendTransactionalEmail(baseOptions);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.cc).toBeUndefined();
    expect(body.bcc).toBeUndefined();
  });

  it("should throw when BREVO_API_KEY is missing", async () => {
    vi.unstubAllEnvs();
    // Ensure the env var is truly absent
    delete process.env.BREVO_API_KEY;

    await expect(sendTransactionalEmail(baseOptions)).rejects.toThrow(
      "Missing BREVO_API_KEY environment variable"
    );
  });
});
