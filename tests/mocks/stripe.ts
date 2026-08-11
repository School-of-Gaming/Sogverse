import { vi } from "vitest";

/**
 * Shared mock of the Stripe SDK.
 *
 * Every suite that touches Stripe mocks the same module, and each used to
 * hand-roll the same constructor wrapper around a different *subset* of
 * methods — so a call added to production code surfaced as "is not a function"
 * in whichever suite happened to omit it, rather than as a failing assertion.
 * One surface here means a newly-called method is added once.
 *
 * The surface is deliberately the whole set this codebase calls, not the set a
 * given suite exercises: an unused `vi.fn()` costs nothing, and a missing one
 * costs a confusing failure.
 */
export function createStripeMock() {
  return {
    checkout: { sessions: { create: vi.fn() } },
    prices: { create: vi.fn() },
    products: { search: vi.fn(), create: vi.fn(), update: vi.fn() },
    subscriptions: { retrieve: vi.fn(), cancel: vi.fn() },
    webhooks: { constructEvent: vi.fn() },
  };
}

export type StripeMock = ReturnType<typeof createStripeMock>;

/**
 * The module shape `vi.mock("stripe", …)` has to return: a default export the
 * code can `new`, handing back the mock, plus the `errors` namespace the
 * webhook route reads off the class itself.
 *
 * `vi.mock`'s factory runs before the test file's own imports, so the mock has
 * to be built inside an async `vi.hoisted` block that dynamically imports this
 * module — a plain top-level import is not in scope up there. The call sites
 * all use the same two-step shape:
 *
 * ```ts
 * const { stripeMock } = await vi.hoisted(async () => ({
 *   stripeMock: (await import("../../mocks/stripe")).createStripeMock(),
 * }));
 * vi.mock("stripe", async () =>
 *   (await import("../../mocks/stripe")).stripeModuleMock(stripeMock),
 * );
 * ```
 */
export function stripeModuleMock(mock: StripeMock) {
  return {
    default: Object.assign(
      vi.fn(function () {
        return mock;
      }),
      {
        errors: {
          StripeCardError: class StripeCardError extends Error {},
        },
      },
    ),
  };
}
