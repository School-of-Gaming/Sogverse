import { vi } from "vitest";
import { NextResponse } from "next/server";

/**
 * Shared helpers for Stripe-related route tests.
 *
 * vi.mock / vi.hoisted calls must stay in each test file (Vitest hoists them
 * at the module level), but these helpers eliminate the duplicated auth and
 * profile setup used across subscription cancel, resume, etc.
 */

/** Configures mockRequireRole to return a 401 response (unauthenticated). */
export function mockUnauthenticated(mockRequireRole: ReturnType<typeof vi.fn>) {
  mockRequireRole.mockResolvedValue(
    NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  );
}

/**
 * Configures mockRequireRole for an authenticated user with a mock supabase
 * client that dispatches by table name (profiles → role, customer_profiles → Stripe fields).
 *
 * Default: customer role with an active stripe_subscription_id.
 */
export function mockAuthenticatedSubscriptionProfile(
  mockRequireRole: ReturnType<typeof vi.fn>,
  overrides: Record<string, unknown> = {},
) {
  const { role = "customer", stripe_subscription_id = "sub_active_123", ...rest } = overrides;

  const mockFrom = vi.fn().mockImplementation((table: string) => {
    if (table === "customer_profiles") {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: { stripe_subscription_id, ...rest },
              error: null,
            }),
          }),
        }),
      };
    }
    // profiles (shouldn't be called after requireRole, but just in case)
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { role },
            error: null,
          }),
        }),
      }),
    };
  });

  mockRequireRole.mockResolvedValue({
    user: { id: "user-123" },
    profile: { role },
    supabase: { from: mockFrom },
  });

  return mockFrom;
}
