import type { Profile, CustomerProfile, GamerProfile, Product, UserRole } from "@/types";

// Mock data generators
export function createMockProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: "test-user-id",
    email: "test@example.com",
    username: null,
    role: "customer" as UserRole,
    display_name: "Test User",
    currency: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

export function createMockGamerProfile(
  overrides: Partial<Profile> = {}
): Profile {
  return {
    id: "test-gamer-id",
    email: null,
    username: "testgamer",
    role: "gamer" as UserRole,
    display_name: "Test Gamer",
    currency: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

export function createMockCustomerProfile(
  overrides: Partial<CustomerProfile> = {}
): CustomerProfile {
  return {
    user_id: "test-user-id",
    token_balance: 0,
    stripe_customer_id: null,
    stripe_subscription_id: null,
    subscription_status: null,
    ...overrides,
  };
}

export function createMockGamerExtProfile(
  overrides: Partial<GamerProfile> = {}
): GamerProfile {
  return {
    user_id: "test-gamer-id",
    date_of_birth: "2015-01-01",
    gender: "boy",
    minecraft_username: null,
    minecraft_uuid: null,
    ...overrides,
  };
}

export function createMockProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "test-product-id",
    name: "Test Product",
    description: "A test product description",
    token_cost: 2,
    image_url: "https://example.com/image.png",
    is_visible: true,
    created_by: "test-admin-id",
    game_id: "00000000-0000-0000-0000-000000000001",
    day_of_week: 0,
    start_time: "16:00",
    timezone: "Europe/Helsinki",
    duration_minutes: 60,
    min_age: 7,
    max_age: 12,
    padlet_url: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

// Mock Supabase response helpers
export function mockSupabaseSuccess<T>(data: T) {
  return { data, error: null };
}

export function mockSupabaseError(message: string, code?: string) {
  return {
    data: null,
    error: { message, code: code || "ERROR", details: null, hint: null },
  };
}

