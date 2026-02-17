import type { User, Session } from "@supabase/supabase-js";

export function createMockUser(overrides: Partial<User> = {}): User {
  return {
    id: "test-user-id",
    email: "test@example.com",
    aud: "authenticated",
    role: "authenticated",
    app_metadata: {},
    user_metadata: {},
    identities: [],
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  } as User;
}

export function createMockSession(overrides: Partial<Session> = {}): Session {
  const user = createMockUser(overrides.user ? overrides.user : undefined);
  return {
    access_token: "mock-access-token",
    refresh_token: "mock-refresh-token",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user,
    ...overrides,
  } as Session;
}
