import { describe, it, expect, vi, beforeEach } from "vitest";
import { POST } from "@/app/api/admin/create-product/route";
import { NextResponse } from "next/server";
import { mockSupabaseSuccess, mockSupabaseError } from "../../mocks/supabase";

// --- Mocks ---

const mockRequireRole = vi.fn();
vi.mock("@/lib/auth", () => ({
  requireRole: (...args: unknown[]) => mockRequireRole(...args),
}));

const mockAdminFrom = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    from: mockAdminFrom,
  })),
}));

// --- Helpers ---

function mockUnauthenticated() {
  mockRequireRole.mockResolvedValue(
    NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  );
}

function mockAuthenticatedWithRole(role: string) {
  if (role !== "admin") {
    mockRequireRole.mockResolvedValue(
      NextResponse.json(
        { error: "Only admins can create products" },
        { status: 403 }
      )
    );
    return;
  }

  mockRequireRole.mockResolvedValue({
    user: { id: "admin-user-id" },
    profile: { role: "admin" },
    supabase: {},
  });
}

function createRequest(body: Record<string, unknown>): Request {
  return new Request("http://localhost:3000/api/admin/create-product", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const validBody = {
  name: "Test Product",
  description: "A test product",
  token_cost: 2,
  image_path: "test.jpg",
  game_id: "00000000-0000-0000-0000-000000000001",
  day_of_week: 2,
  start_time: "16:00",
  duration_minutes: 60,
  min_age: 7,
  max_age: 12,
  is_remote: true,
  spoken_language_code: "en",
};

// --- Tests ---

describe("POST /api/admin/create-product", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // Auth & authorization

  it("returns 401 when not authenticated", async () => {
    mockUnauthenticated();

    const response = await POST(createRequest(validBody));
    const data = await response.json();

    expect(response.status).toBe(401);
    expect(data.error).toBe("Unauthorized");
  });

  it("returns 403 for non-admin roles", async () => {
    mockAuthenticatedWithRole("customer");

    const response = await POST(createRequest(validBody));
    const data = await response.json();

    expect(response.status).toBe(403);
    expect(data.error).toBe("Only admins can create products");
  });

  it("returns 403 for gedu role", async () => {
    mockAuthenticatedWithRole("gedu");

    const response = await POST(createRequest(validBody));

    expect(response.status).toBe(403);
  });

  // Validation — required fields

  it("returns 400 when name is missing", async () => {
    mockAuthenticatedWithRole("admin");

    const response = await POST(createRequest({ ...validBody, name: "" }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Product name is required");
  });

  it("returns 400 when name is whitespace only", async () => {
    mockAuthenticatedWithRole("admin");

    const response = await POST(createRequest({ ...validBody, name: "   " }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Product name is required");
  });

  it("returns 400 when description is missing", async () => {
    mockAuthenticatedWithRole("admin");

    const response = await POST(createRequest({ ...validBody, description: "" }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Description is required");
  });

  it("returns 400 when token_cost is negative", async () => {
    mockAuthenticatedWithRole("admin");

    const response = await POST(createRequest({ ...validBody, token_cost: -5 }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Token cost is required (must be a positive integer)");
  });

  it("returns 400 when token_cost is zero", async () => {
    mockAuthenticatedWithRole("admin");

    const response = await POST(createRequest({ ...validBody, token_cost: 0 }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Token cost is required (must be a positive integer)");
  });

  it("returns 400 when token_cost is not a number", async () => {
    mockAuthenticatedWithRole("admin");

    const response = await POST(createRequest({ ...validBody, token_cost: "free" }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Token cost is required (must be a positive integer)");
  });

  it("returns 400 when token_cost is a decimal", async () => {
    mockAuthenticatedWithRole("admin");

    const response = await POST(createRequest({ ...validBody, token_cost: 2.5 }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Token cost is required (must be a positive integer)");
  });

  it("returns 400 when image_path is missing", async () => {
    mockAuthenticatedWithRole("admin");

    const response = await POST(createRequest({ ...validBody, image_path: "" }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Image is required");
  });

  it("returns 400 when game_id is missing", async () => {
    mockAuthenticatedWithRole("admin");

    const response = await POST(createRequest({ ...validBody, game_id: "" }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Game is required");
  });

  // Validation — day_of_week

  it("returns 400 when day_of_week is out of range (negative)", async () => {
    mockAuthenticatedWithRole("admin");

    const response = await POST(createRequest({ ...validBody, day_of_week: -1 }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Day of week must be 0-6");
  });

  it("returns 400 when day_of_week is out of range (too high)", async () => {
    mockAuthenticatedWithRole("admin");

    const response = await POST(createRequest({ ...validBody, day_of_week: 7 }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Day of week must be 0-6");
  });

  // Validation — start_time

  it("returns 400 for invalid start_time format", async () => {
    mockAuthenticatedWithRole("admin");

    const response = await POST(createRequest({ ...validBody, start_time: "4pm" }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Start time must be a valid time");
  });

  it("accepts HH:MM format for start_time", async () => {
    mockAuthenticatedWithRole("admin");
    mockAdminFrom.mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue(mockSupabaseSuccess({ id: "new-id" })),
        }),
      }),
    });

    const response = await POST(createRequest({ ...validBody, start_time: "16:00" }));

    expect(response.status).toBe(200);
  });

  it("accepts HH:MM:SS format for start_time", async () => {
    mockAuthenticatedWithRole("admin");
    mockAdminFrom.mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue(mockSupabaseSuccess({ id: "new-id" })),
        }),
      }),
    });

    const response = await POST(createRequest({ ...validBody, start_time: "16:00:00" }));

    expect(response.status).toBe(200);
  });

  // Validation — duration, age

  it("returns 400 when duration is zero", async () => {
    mockAuthenticatedWithRole("admin");

    const response = await POST(createRequest({ ...validBody, duration_minutes: 0 }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Duration must be greater than 0");
  });

  it("returns 400 when min_age is negative", async () => {
    mockAuthenticatedWithRole("admin");

    const response = await POST(createRequest({ ...validBody, min_age: -1 }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Min age must be 0 or greater");
  });

  it("returns 400 when max_age is less than min_age", async () => {
    mockAuthenticatedWithRole("admin");

    const response = await POST(createRequest({ ...validBody, min_age: 10, max_age: 5 }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Max age must be greater than or equal to min age");
  });

  // Successful creation

  it("creates product and sets created_by from authenticated user", async () => {
    mockAuthenticatedWithRole("admin");

    const insertedProduct = { id: "new-product-id", ...validBody, created_by: "admin-user-id" };
    const mockInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue(mockSupabaseSuccess(insertedProduct)),
      }),
    });
    mockAdminFrom.mockReturnValue({ insert: mockInsert });

    const response = await POST(createRequest(validBody));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.product).toEqual(insertedProduct);

    // Verify created_by is the authenticated user, not from the request body
    const insertCall = mockInsert.mock.calls[0][0];
    expect(insertCall.created_by).toBe("admin-user-id");
  });

  it("sets timezone to Europe/Helsinki", async () => {
    mockAuthenticatedWithRole("admin");

    const mockInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue(mockSupabaseSuccess({ id: "new-id" })),
      }),
    });
    mockAdminFrom.mockReturnValue({ insert: mockInsert });

    await POST(createRequest(validBody));

    const insertCall = mockInsert.mock.calls[0][0];
    expect(insertCall.timezone).toBe("Europe/Helsinki");
  });

  it("trims name and description", async () => {
    mockAuthenticatedWithRole("admin");

    const mockInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue(mockSupabaseSuccess({ id: "new-id" })),
      }),
    });
    mockAdminFrom.mockReturnValue({ insert: mockInsert });

    await POST(createRequest({
      ...validBody,
      name: "  Padded Name  ",
      description: "  Padded Desc  ",
    }));

    const insertCall = mockInsert.mock.calls[0][0];
    expect(insertCall.name).toBe("Padded Name");
    expect(insertCall.description).toBe("Padded Desc");
  });

  it("accepts token_cost of one", async () => {
    mockAuthenticatedWithRole("admin");

    const mockInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue(mockSupabaseSuccess({ id: "new-id" })),
      }),
    });
    mockAdminFrom.mockReturnValue({ insert: mockInsert });

    const response = await POST(createRequest({ ...validBody, token_cost: 1 }));

    expect(response.status).toBe(200);
  });

  // padlet_url handling

  it("includes padlet_url in insert when provided", async () => {
    mockAuthenticatedWithRole("admin");

    const mockInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue(mockSupabaseSuccess({ id: "new-id" })),
      }),
    });
    mockAdminFrom.mockReturnValue({ insert: mockInsert });

    await POST(createRequest({ ...validBody, padlet_url: "https://padlet.com/test" }));

    const insertCall = mockInsert.mock.calls[0][0];
    expect(insertCall.padlet_url).toBe("https://padlet.com/test");
  });

  it("sets padlet_url to null when omitted", async () => {
    mockAuthenticatedWithRole("admin");

    const mockInsert = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue(mockSupabaseSuccess({ id: "new-id" })),
      }),
    });
    mockAdminFrom.mockReturnValue({ insert: mockInsert });

    await POST(createRequest(validBody));

    const insertCall = mockInsert.mock.calls[0][0];
    expect(insertCall.padlet_url).toBeNull();
  });

  it("returns 400 for invalid padlet_url", async () => {
    mockAuthenticatedWithRole("admin");

    const response = await POST(createRequest({ ...validBody, padlet_url: "not-a-url" }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Padlet URL must be a valid URL");
  });

  // location / spoken_language validation (migration 00024)

  it("returns 400 when is_remote=false and location_id is missing", async () => {
    mockAuthenticatedWithRole("admin");

    const response = await POST(createRequest({
      ...validBody,
      is_remote: false,
      location_id: null,
    }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("In-person products must have a location");
  });

  it("returns 400 when is_remote=true and location_id is set", async () => {
    mockAuthenticatedWithRole("admin");

    const response = await POST(createRequest({
      ...validBody,
      is_remote: true,
      location_id: "00000000-0000-0000-0000-000000000203",
    }));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Remote products cannot have a location");
  });

  it("returns 400 when spoken_language_code is missing", async () => {
    mockAuthenticatedWithRole("admin");

    const { spoken_language_code: _drop, ...bodyWithoutLanguage } = validBody;
    const response = await POST(createRequest(bodyWithoutLanguage));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("Spoken language is required");
  });

  // DB error handling

  it("returns 400 when database insert fails", async () => {
    mockAuthenticatedWithRole("admin");

    mockAdminFrom.mockReturnValue({
      insert: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue(
            mockSupabaseError("duplicate key value violates unique constraint")
          ),
        }),
      }),
    });

    const response = await POST(createRequest(validBody));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe("duplicate key value violates unique constraint");
  });

  it("returns 500 for unexpected errors", async () => {
    mockAuthenticatedWithRole("admin");

    // Trigger catch block by making request.json() fail
    const badRequest = new Request("http://localhost:3000/api/admin/create-product", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not-json",
    });

    const response = await POST(badRequest);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe("Internal server error");
  });
});
