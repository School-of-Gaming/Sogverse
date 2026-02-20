import { vi } from "vitest";
import type { Profile, Product, UserRole } from "@/types";

// Mock data generators
export function createMockProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: "test-user-id",
    email: "test@example.com",
    username: null,
    role: "customer" as UserRole,
    display_name: "Test User",
    avatar_url: null,
    currency: null,
    stripe_customer_id: null,
    stripe_subscription_id: null,
    subscription_status: null,
    token_balance: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
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
    avatar_url: null,
    currency: null,
    stripe_customer_id: null,
    stripe_subscription_id: null,
    subscription_status: null,
    token_balance: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

export function createMockProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: "test-product-id",
    name: "Test Product",
    description: "A test product description",
    price: 29.99,
    currency: "USD",
    image_url: "https://example.com/image.png",
    stripe_product_id: null,
    stripe_price_id: null,
    is_active: true,
    created_by: "test-admin-id",
    game_id: "00000000-0000-0000-0000-000000000001",
    day_of_week: 0,
    start_time: "16:00",
    timezone: "Europe/Helsinki",
    duration_minutes: 60,
    min_age: 7,
    max_age: 12,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
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

// Reset all mocks
export function resetSupabaseMocks(mockClient: ReturnType<typeof vi.fn>) {
  vi.clearAllMocks();
}
