import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/gamers/create/route";
import { NextResponse } from "next/server";

// --- Mocks ---

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({})),
}));

vi.mock("@/lib/mojang", () => ({
  lookupMinecraftUser: vi.fn(),
  isValidMinecraftUsername: vi.fn(() => true),
}));

// --- Helpers ---

function mockAuthenticated(userId = "customer-123") {
  mockRequireRole.mockResolvedValue({
    user: { id: userId },
    profile: { role: "customer" },
    supabase: {},
  });
}

function createRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost:3000/api/gamers/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = {
  username: "newgamer",
  password: "password123",
  displayName: "New Gamer",
  dateOfBirth: "2015-06-15",
  gender: "boy",
};

// --- Tests ---

describe("POST /api/gamers/create — DOB validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return 400 when dateOfBirth is missing", async () => {
    mockAuthenticated();

    const { dateOfBirth: _, ...body } = validBody;
    const response = await POST(createRequest(body));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("Date of birth is required");
  });

  it("should return 400 when dateOfBirth is in the future", async () => {
    mockAuthenticated();

    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1);
    const futureDateStr = futureDate.toISOString().split("T")[0];

    const response = await POST(
      createRequest({ ...validBody, dateOfBirth: futureDateStr }),
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("future");
  });

  it("should return 400 when dateOfBirth is not a valid date", async () => {
    mockAuthenticated();

    const response = await POST(
      createRequest({ ...validBody, dateOfBirth: "not-a-date" }),
    );
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toContain("future");
  });

  it("should return 401 when unauthenticated", async () => {
    mockRequireRole.mockResolvedValue(
      NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    );

    const response = await POST(createRequest(validBody));
    expect(response.status).toBe(401);
  });

  it("should return 403 for non-customer roles", async () => {
    mockRequireRole.mockResolvedValue(
      NextResponse.json(
        { error: "Only customers can create gamer accounts" },
        { status: 403 },
      ),
    );

    const response = await POST(createRequest(validBody));
    expect(response.status).toBe(403);
  });
});
