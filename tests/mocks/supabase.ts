import type { Profile, CustomerProfile, GamerProfile, MinecraftAccount, UserRole } from "@/types";

// Mock data generators
export function createMockProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    id: "test-user-id",
    email: "test@example.com",
    username: null,
    role: "customer" as UserRole,
    first_name: "Test",
    last_name: "User",
    currency: null,
    locale: null,
    phone: null,
    spoken_languages: [],
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
    first_name: "Test",
    last_name: "Gamer",
    currency: null,
    locale: null,
    phone: null,
    spoken_languages: [],
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
    stripe_customer_id: null,
    pin_hash: null,
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
    ...overrides,
  };
}

export function createMockMinecraftAccount(
  overrides: Partial<MinecraftAccount> = {}
): MinecraftAccount {
  return {
    user_id: "test-gamer-id",
    minecraft_username: null,
    minecraft_uuid: null,
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
