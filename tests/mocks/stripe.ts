import { vi } from "vitest";
import { NextResponse } from "next/server";

/**
 * Shared helpers for Stripe-related route tests.
 */

/** Configures mockRequireRole to return a 401 response (unauthenticated). */
export function mockUnauthenticated(mockRequireRole: ReturnType<typeof vi.fn>) {
  mockRequireRole.mockResolvedValue(
    NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  );
}
