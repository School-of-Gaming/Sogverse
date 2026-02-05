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
    image_url: null,
    stripe_product_id: null,
    stripe_price_id: null,
    is_active: true,
    metadata: {},
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
