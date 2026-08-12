import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/feedback/route";
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

// The feedback WRITE now runs on the user-bound client (`submit_my_feedback`);
// the admin client survives only for the notification fan-out, which reads every
// admin's email and a gamer's parent's — neither in the submitter's RLS view.
const mockFrom = vi.fn();
const mockRpc = vi.fn();
const mockAdminClient = { from: mockFrom };

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => mockAdminClient,
}));


// --- Helpers ---

function createRequest(body: Record<string, unknown>, headers?: Record<string, string>): Request {
  return new Request("http://localhost:3000/api/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function mockUnauthenticated() {
  mockRequireRole.mockResolvedValue(
    NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  );
}

function mockAuthenticatedAs(role: string, overrides?: Record<string, unknown>) {
  mockRequireRole.mockResolvedValue({
    user: { id: "user-123" },
    profile: {
      role,
      email: `${role}@test.local`,
      first_name: `Test ${role}`,
      ...overrides,
    },
    supabase: { rpc: mockRpc },
  });
}

/** Sets up the admin client mock chain for the standard happy path. */
function setupHappyPath(accepted = true) {
  mockRpc.mockResolvedValue({ data: accepted, error: null });
  mockFrom.mockImplementation((table: string) => {
    if (table === "profiles") {
      return {
        select: () => ({
          eq: () => Promise.resolve({
            data: [{ email: "admin1@test.local" }, { email: "admin2@test.local" }],
            error: null,
          }),
        }),
      };
    }
    return {};
  });
}

function setupGamerParentLookup(parentEmail: string) {
  mockRpc.mockResolvedValue({ data: true, error: null });
  mockFrom.mockImplementation((table: string) => {
    if (table === "parent_gamer") {
      return {
        select: () => ({
          eq: () => ({
            limit: () => ({
              single: () => Promise.resolve({
                data: { parent_id: "parent-123" },
                error: null,
              }),
            }),
          }),
        }),
      };
    }
    if (table === "profiles") {
      return {
        select: () => ({
          eq: (_col: string, val: string) => {
            // Admin emails query (role = admin)
            if (val === "admin") {
              return Promise.resolve({
                data: [{ email: "admin1@test.local" }],
                error: null,
              });
            }
            // Parent profile lookup (id = parent-123)
            return {
              single: () => Promise.resolve({
                data: { email: parentEmail },
                error: null,
              }),
            };
          },
        }),
      };
    }
    return {};
  });
}

const validBody = { message: "This is a valid feedback message for testing." };

// --- Tests ---

describe("POST /api/feedback", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSendTransactionalEmail.mockResolvedValue({ messageId: "msg-123" });
  });

  // -- Auth --

  it("should return 401 when not authenticated", async () => {
    mockUnauthenticated();

    const response = await POST(createRequest(validBody));
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  // -- Validation --

  it("should return 400 for message too short", async () => {
    mockAuthenticatedAs("customer");

    const response = await POST(createRequest({ message: "short" }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("at least 10 characters");
  });

  it("should return 400 for message too long", async () => {
    mockAuthenticatedAs("customer");

    const response = await POST(createRequest({ message: "x".repeat(2001) }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("at most 2000 characters");
  });

  it("should return 400 for missing message", async () => {
    mockAuthenticatedAs("customer");

    const response = await POST(createRequest({}));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBeDefined();
  });

  // -- Rate limiting --

  it("should return 429 when rate limited", async () => {
    mockAuthenticatedAs("customer");
    setupHappyPath(false); // RPC returns false = rate limited

    const response = await POST(createRequest(validBody));
    const data = await response.json();

    expect(response.status).toBe(429);
    expect(data.error).toContain("Too many");

    // The whole point of the rate limit is the admin inbox, not the status
    // code: the RPC's per-hour cap is the only throttle on feedback mail, since
    // a caller can reach the RPC through PostgREST without this route at all.
    // Sending the mail before the accepted check — or ignoring it — would keep
    // every other assertion in this file green while unbounding the spam.
    expect(mockSendTransactionalEmail).not.toHaveBeenCalled();
  });

  // -- Happy path --

  it("should send feedback and return success for customer", async () => {
    mockAuthenticatedAs("customer");
    setupHappyPath();

    const response = await POST(createRequest(validBody));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(mockSendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        toEmail: ["admin1@test.local", "admin2@test.local"],
        replyToEmail: "customer@test.local",
        subject: expect.stringContaining("Test customer"),
      })
    );
  });

  it("should use profile email as replyTo for customer/gedu/admin", async () => {
    mockAuthenticatedAs("gedu");
    setupHappyPath();

    await POST(createRequest(validBody));

    expect(mockSendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        replyToEmail: "gedu@test.local",
      })
    );
  });

  it("should use parent email as replyTo for gamer", async () => {
    mockAuthenticatedAs("gamer", {
      email: "testgamer@gamer.sogverse.internal",
      first_name: "Test Gamer",
    });
    setupGamerParentLookup("parent@test.local");

    await POST(createRequest(validBody));

    expect(mockSendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        replyToEmail: "parent@test.local",
      })
    );
  });

  it("should HTML-escape message content", async () => {
    mockAuthenticatedAs("customer");
    setupHappyPath();

    await POST(
      createRequest({ message: '<script>alert("xss")</script> is bad' })
    );

    expect(mockSendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        htmlContent: expect.stringContaining("&lt;script&gt;"),
      })
    );
    expect(mockSendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        htmlContent: expect.not.stringContaining("<script>"),
      })
    );
  });

  // -- Accept-Language locale detection --

  // These assert on the subject line rather than the sender name: the sender is
  // one constant in every locale now, so it can no longer witness which
  // translation was chosen, and a test asserting it would pass whatever the
  // locale resolution did.

  it("should use Finnish copy when Accept-Language has fi as best supported match", async () => {
    mockAuthenticatedAs("customer");
    setupHappyPath();

    await POST(createRequest(
      validBody,
      { "Accept-Language": "de-DE,fi;q=0.9,en;q=0.8" },
    ));

    expect(mockSendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: expect.stringContaining("Palaute käyttäjältä"),
      })
    );
  });

  it("should use English copy when no Accept-Language language is supported", async () => {
    mockAuthenticatedAs("customer");
    setupHappyPath();

    await POST(createRequest(
      validBody,
      // None of these is a shipped locale (fr used to sit here, and is one now).
      { "Accept-Language": "de-DE,pl;q=0.9" },
    ));

    expect(mockSendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: expect.stringContaining("Feedback from"),
      })
    );
  });

  it("should prefer stored profile locale over Accept-Language header", async () => {
    mockAuthenticatedAs("customer", { locale: "fi" });
    setupHappyPath();

    await POST(createRequest(
      validBody,
      { "Accept-Language": "en-US,en;q=0.9" },
    ));

    expect(mockSendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        subject: expect.stringContaining("Palaute käyttäjältä"),
      })
    );
  });

  it("keeps one sender name whatever the locale", async () => {
    mockAuthenticatedAs("customer", { locale: "fi" });
    setupHappyPath();

    await POST(createRequest(validBody));

    expect(mockSendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        fromEmail: "sogverse@sog.gg",
        fromName: "School of Gaming – Sogverse",
      })
    );
  });

  // -- RPC --

  it("calls submit_my_feedback on the user client, with no user parameter", async () => {
    mockAuthenticatedAs("customer");
    setupHappyPath();

    await POST(createRequest(validBody));

    // The absence of a user id here is the point: the row is attributed by the
    // database from auth.uid(), so this handler cannot file feedback as anyone
    // else even if `user.id` were wrong.
    expect(mockRpc).toHaveBeenCalledWith("submit_my_feedback", {
      p_message: validBody.message,
    });
  });

  it("returns 400 and sends no mail when the RPC refuses the message", async () => {
    // The RPC re-checks the same length bounds the body schema enforces, so its
    // check violation is genuinely bad input. The route used to fold every RPC
    // failure into a 500; the shared table separates the two.
    mockAuthenticatedAs("customer");
    setupHappyPath();
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "23514", message: "feedback message must be between..." },
    });

    const response = await POST(createRequest(validBody));

    expect(response.status).toBe(400);
    expect(mockSendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("returns a generic 500 and sends no mail when the RPC fails unexpectedly", async () => {
    mockAuthenticatedAs("customer");
    setupHappyPath();
    mockRpc.mockResolvedValue({
      data: null,
      error: { code: "XX000", message: "connection reset" },
    });

    const response = await POST(createRequest(validBody));

    expect(response.status).toBe(500);
    expect((await response.json()).error).toBe("Internal server error");
    expect(mockSendTransactionalEmail).not.toHaveBeenCalled();
  });
});
