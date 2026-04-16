import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/admin/create-gedu/route";
import { NextResponse } from "next/server";

// --- Mocks ---

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockGenerateLink = vi.fn();
const mockDeleteUser = vi.fn();
const mockUpdateProfile = vi.fn();
const mockDeleteCustomerProfile = vi.fn();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    auth: {
      admin: {
        generateLink: (...args: unknown[]) => mockGenerateLink(...args),
        deleteUser: (...args: unknown[]) => mockDeleteUser(...args),
      },
    },
    from: (table: string) => {
      if (table === "profiles") {
        return {
          update: (data: unknown) => ({
            eq: () => mockUpdateProfile(data),
          }),
        };
      }
      if (table === "customer_profiles") {
        return {
          delete: () => ({
            eq: () => mockDeleteCustomerProfile(),
          }),
        };
      }
      return {};
    },
  })),
}));

const mockSendTransactionalEmail = vi.fn();
vi.mock("@/lib/brevo", () => ({
  sendTransactionalEmail: (...args: unknown[]) => mockSendTransactionalEmail(...args),
}));

// --- Helpers ---

function mockUnauthenticated() {
  mockRequireRole.mockResolvedValue(
    NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  );
}

function mockNonAdmin(role: string) {
  mockRequireRole.mockResolvedValue(
    NextResponse.json(
      { error: "Only admins can create gedu accounts" },
      { status: 403 }
    )
  );
  // Suppress unused variable — role documents which role was tested
  void role;
}

function mockAdmin() {
  mockRequireRole.mockResolvedValue({
    user: { id: "admin-user-id" },
    profile: { role: "admin" },
    supabase: {},
  });
}

function createRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost:3000/api/admin/create-gedu", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const fakeUser = { id: "new-gedu-id", email: "gedu@example.com" };

// --- Tests ---

describe("POST /api/admin/create-gedu", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateLink.mockResolvedValue({
      data: {
        user: fakeUser,
        properties: { action_link: "https://supabase.co/verify?token=abc" },
      },
      error: null,
    });
    mockUpdateProfile.mockResolvedValue({ error: null });
    mockDeleteCustomerProfile.mockResolvedValue({ error: null });
    mockSendTransactionalEmail.mockResolvedValue({ messageId: "msg-123" });
  });

  // -- Auth & Authorization --

  it("should return 401 when not authenticated", async () => {
    mockUnauthenticated();

    const response = await POST(createRequest({ email: "gedu@example.com", displayName: "Jane Smith" }));

    expect(response.status).toBe(401);
  });

  it("should return 403 for customer role", async () => {
    mockNonAdmin("customer");

    const response = await POST(createRequest({ email: "gedu@example.com", displayName: "Jane Smith" }));

    expect(response.status).toBe(403);
  });

  it("should return 403 for gedu role", async () => {
    mockNonAdmin("gedu");

    const response = await POST(createRequest({ email: "gedu@example.com", displayName: "Jane Smith" }));

    expect(response.status).toBe(403);
  });

  it("should return 403 for gamer role", async () => {
    mockNonAdmin("gamer");

    const response = await POST(createRequest({ email: "gedu@example.com", displayName: "Jane Smith" }));

    expect(response.status).toBe(403);
  });

  // -- Validation --

  it("should return 400 when email is missing", async () => {
    mockAdmin();

    const response = await POST(createRequest({}));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Email is required");
  });

  it("should return 400 when email is not a string", async () => {
    mockAdmin();

    const response = await POST(createRequest({ email: 123 }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Email is required");
  });

  it("should return 400 when displayName is missing", async () => {
    mockAdmin();

    const response = await POST(createRequest({ email: "gedu@example.com" }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("Display name");
  });

  it("should return 400 when displayName is too short", async () => {
    mockAdmin();

    const response = await POST(createRequest({ email: "gedu@example.com", displayName: "A" }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("Display name");
  });

  // -- Happy path --

  it("should create user via generateLink, promote to gedu, and send invite email", async () => {
    mockAdmin();

    const response = await POST(createRequest({ email: "gedu@example.com", displayName: "Jane Smith" }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.user).toEqual(fakeUser);

    // Single atomic operation: creates user + generates invite link.
    // display_name goes into raw_user_meta_data via options.data, where the
    // handle_new_user trigger picks it up to populate profiles.display_name.
    expect(mockGenerateLink).toHaveBeenCalledWith({
      type: "invite",
      email: "gedu@example.com",
      options: {
        redirectTo: "http://localhost:3000/setup-account",
        data: { display_name: "Jane Smith" },
      },
    });

    // Promoted to gedu
    expect(mockUpdateProfile).toHaveBeenCalledWith({ role: "gedu", locale: "en" });

    // Customer profile cleaned up
    expect(mockDeleteCustomerProfile).toHaveBeenCalledOnce();

    // Email sent
    expect(mockSendTransactionalEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        toEmail: "gedu@example.com",
        subject: "You\u2019re invited to the Sogverse",
      })
    );
  });

  // -- Error handling --

  it("should return 400 when generateLink fails (e.g. user already exists)", async () => {
    mockAdmin();
    mockGenerateLink.mockResolvedValue({
      data: null,
      error: { message: "A user with this email address has already been registered" },
    });

    const response = await POST(createRequest({ email: "existing@example.com", displayName: "Jane Smith" }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("A user with this email address has already been registered");
    expect(mockUpdateProfile).not.toHaveBeenCalled();
    expect(mockSendTransactionalEmail).not.toHaveBeenCalled();
  });

  it("should return 500 when role promotion fails", async () => {
    mockAdmin();
    mockUpdateProfile.mockResolvedValue({ error: { message: "DB error" } });

    const response = await POST(createRequest({ email: "gedu@example.com", displayName: "Jane Smith" }));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("DB error");
  });

  it("should roll back user when invite email fails to send", async () => {
    mockAdmin();
    mockSendTransactionalEmail.mockRejectedValue(new Error("Brevo API error"));
    mockDeleteUser.mockResolvedValue({ error: null });

    const response = await POST(createRequest({ email: "gedu@example.com", displayName: "Jane Smith" }));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toContain("Failed to send invite email");
    expect(mockDeleteUser).toHaveBeenCalledWith("new-gedu-id");
  });
});
