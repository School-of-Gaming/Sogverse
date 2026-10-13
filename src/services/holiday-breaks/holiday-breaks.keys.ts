/**
 * The holiday break cache keys. In a file of their own so the shared
 * plan-reader invalidation can name them without pulling in the query hooks.
 */
export const holidayBreakKeys = {
  all: ["holiday-breaks"] as const,
  byProduct: (productId: string) =>
    [...holidayBreakKeys.all, "product", productId] as const,
  forSpan: (productId: string, from: string, to: string) =>
    [...holidayBreakKeys.byProduct(productId), from, to] as const,
};
