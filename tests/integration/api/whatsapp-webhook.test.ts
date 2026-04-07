import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import crypto from "crypto";

const TEST_VERIFY_TOKEN = "test-verify-token";
const TEST_APP_SECRET = "test-app-secret";

// Env vars must be set before the route module loads (top-level const reads)
vi.stubEnv("WHATSAPP_VERIFY_TOKEN", TEST_VERIFY_TOKEN);
vi.stubEnv("WHATSAPP_APP_SECRET", TEST_APP_SECRET);

// Import after env is stubbed
const { GET, POST } = await import("@/app/api/webhooks/whatsapp/route");

// --- Mocks ---

const mockUpsert = vi.fn().mockResolvedValue({ error: null });
const mockInsert = vi.fn().mockResolvedValue({ error: null });
const mockUpdate = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: (table: string) => {
      if (table === "whatsapp_contacts") {
        return { upsert: mockUpsert };
      }
      if (table === "whatsapp_messages") {
        return {
          insert: mockInsert,
          update: (data: Record<string, unknown>) => {
            mockUpdate(data);
            return {
              eq: vi.fn().mockResolvedValue({ error: null }),
            };
          },
        };
      }
      return {};
    },
  })),
}));

// --- Helpers ---

function sign(body: string): string {
  return (
    "sha256=" +
    crypto.createHmac("sha256", TEST_APP_SECRET).update(body).digest("hex")
  );
}

function createWebhookRequest(
  payload: Record<string, unknown>,
  { validSignature = true }: { validSignature?: boolean } = {}
): Request {
  const body = JSON.stringify(payload);
  const signature = validSignature ? sign(body) : "sha256=invalid";

  return new Request("http://localhost:3000/api/webhooks/whatsapp", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-hub-signature-256": signature,
    },
    body,
  });
}

function inboundMessagePayload(overrides?: {
  from?: string;
  id?: string;
  text?: string;
  type?: string;
  contactName?: string;
}) {
  const from = overrides?.from ?? "358401234567";
  const id = overrides?.id ?? "wamid.test123";
  const text = overrides?.text ?? "Hello";
  const type = overrides?.type ?? "text";
  const contactName = overrides?.contactName ?? "Test User";

  const message: Record<string, unknown> = {
    from,
    id,
    type,
    timestamp: "1234567890",
  };
  if (type === "text") {
    message.text = { body: text };
  }

  return {
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              contacts: [{ wa_id: from, profile: { name: contactName } }],
              messages: [message],
            },
          },
        ],
      },
    ],
  };
}

function statusPayload(
  msgId: string,
  status: string,
  errors?: { code: number; title: string }[]
) {
  return {
    entry: [
      {
        changes: [
          {
            field: "messages",
            value: {
              statuses: [
                {
                  id: msgId,
                  status,
                  ...(errors && { errors }),
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

// --- Tests ---

describe("WhatsApp Webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -- GET: Verification challenge --

  describe("GET /api/webhooks/whatsapp", () => {
    it("should return challenge when token matches", async () => {
      const url =
        "http://localhost:3000/api/webhooks/whatsapp" +
        `?hub.mode=subscribe&hub.verify_token=${TEST_VERIFY_TOKEN}&hub.challenge=test-challenge-123`;
      const response = await GET(new Request(url));

      expect(response.status).toBe(200);
      expect(await response.text()).toBe("test-challenge-123");
    });

    it("should return 403 when token does not match", async () => {
      const url =
        "http://localhost:3000/api/webhooks/whatsapp" +
        "?hub.mode=subscribe&hub.verify_token=wrong-token&hub.challenge=test";
      const response = await GET(new Request(url));

      expect(response.status).toBe(403);
    });

    it("should return 403 when mode is not subscribe", async () => {
      const url =
        "http://localhost:3000/api/webhooks/whatsapp" +
        `?hub.mode=unsubscribe&hub.verify_token=${TEST_VERIFY_TOKEN}&hub.challenge=test`;
      const response = await GET(new Request(url));

      expect(response.status).toBe(403);
    });
  });

  // -- POST: Signature verification --

  describe("POST signature verification", () => {
    it("should reject requests with invalid signature", async () => {
      const payload = inboundMessagePayload();
      const request = createWebhookRequest(payload, { validSignature: false });
      const response = await POST(request);

      expect(response.status).toBe(401);
      expect(mockUpsert).not.toHaveBeenCalled();
      expect(mockInsert).not.toHaveBeenCalled();
    });

    it("should reject requests with no signature header", async () => {
      const body = JSON.stringify(inboundMessagePayload());
      const request = new Request("http://localhost:3000/api/webhooks/whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
      const response = await POST(request);

      expect(response.status).toBe(401);
    });
  });

  // -- POST: Inbound messages --

  describe("POST inbound messages", () => {
    it("should upsert contact and insert message for text", async () => {
      const payload = inboundMessagePayload({
        from: "358501234567",
        id: "wamid.abc",
        text: "Hi there",
        contactName: "Matti",
      });
      const request = createWebhookRequest(payload);
      const response = await POST(request);

      expect(response.status).toBe(200);

      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          phone: "358501234567",
          wa_name: "Matti",
        }),
        { onConflict: "phone" }
      );

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          id: "wamid.abc",
          phone: "358501234567",
          direction: "inbound",
          body: "Hi there",
          message_type: "text",
        })
      );
    });

    it("should handle image messages", async () => {
      const payload = inboundMessagePayload({ type: "image" });
      const request = createWebhookRequest(payload);
      await POST(request);

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          body: "[Image]",
          message_type: "image",
        })
      );
    });

    it("should handle sticker messages", async () => {
      const payload = inboundMessagePayload({ type: "sticker" });
      const request = createWebhookRequest(payload);
      await POST(request);

      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          body: "[Sticker]",
          message_type: "sticker",
        })
      );
    });

    it("should ignore non-message webhook fields", async () => {
      const payload = {
        entry: [{ changes: [{ field: "account_alerts", value: {} }] }],
      };
      const request = createWebhookRequest(payload);
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(mockUpsert).not.toHaveBeenCalled();
      expect(mockInsert).not.toHaveBeenCalled();
    });
  });

  // -- POST: Status updates --

  describe("POST status updates", () => {
    it("should update message status to delivered", async () => {
      const payload = statusPayload("wamid.msg1", "delivered");
      const request = createWebhookRequest(payload);
      const response = await POST(request);

      expect(response.status).toBe(200);
      expect(mockUpdate).toHaveBeenCalledWith({ status: "delivered" });
    });

    it("should update message status to read", async () => {
      const payload = statusPayload("wamid.msg1", "read");
      const request = createWebhookRequest(payload);
      await POST(request);

      expect(mockUpdate).toHaveBeenCalledWith({ status: "read" });
    });

    it("should set friendly error for 24-hour window failure", async () => {
      const payload = statusPayload("wamid.msg1", "failed", [
        { code: 131047, title: "Re-engagement message" },
      ]);
      const request = createWebhookRequest(payload);
      await POST(request);

      expect(mockUpdate).toHaveBeenCalledWith({
        status: "failed",
        status_error: expect.stringContaining("24 hours"),
      });
    });

    it("should pass through unknown error titles", async () => {
      const payload = statusPayload("wamid.msg1", "failed", [
        { code: 999, title: "Something unexpected" },
      ]);
      const request = createWebhookRequest(payload);
      await POST(request);

      expect(mockUpdate).toHaveBeenCalledWith({
        status: "failed",
        status_error: "Something unexpected",
      });
    });

    it("should ignore untracked status values", async () => {
      const payload = statusPayload("wamid.msg1", "queued");
      const request = createWebhookRequest(payload);
      await POST(request);

      expect(mockUpdate).not.toHaveBeenCalled();
    });
  });
});
