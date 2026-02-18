import { vi } from "vitest";
import { mockSupabaseSuccess } from "./supabase";

/**
 * Shared helpers for Stripe-related route tests.
 *
 * vi.mock / vi.hoisted calls must stay in each test file (Vitest hoists them
 * at the module level), but these helpers eliminate the duplicated auth and
 * profile setup used across subscription cancel, resume, etc.
 */

/** Configures mockGetUser to return no session (unauthenticated request). */
export function mockUnauthenticated(mockGetUser: ReturnType<typeof vi.fn>) {
  mockGetUser.mockResolvedValue({
    data: { user: null },
    error: { message: "No session" },
  });
}

/**
 * Configures mocks for an authenticated user with subscription profile fields.
 * Default: customer role with an active stripe_subscription_id.
 */
export function mockAuthenticatedSubscriptionProfile(
  mockGetUser: ReturnType<typeof vi.fn>,
  mockFromSelect: ReturnType<typeof vi.fn>,
  overrides: Record<string, unknown> = {},
) {
  mockGetUser.mockResolvedValue({
    data: { user: { id: "user-123" } },
    error: null,
  });

  mockFromSelect.mockReturnValue({
    eq: vi.fn().mockReturnValue({
      single: vi.fn().mockResolvedValue(
        mockSupabaseSuccess({
          role: "customer",
          stripe_subscription_id: "sub_active_123",
          ...overrides,
        })
      ),
    }),
  });
}
