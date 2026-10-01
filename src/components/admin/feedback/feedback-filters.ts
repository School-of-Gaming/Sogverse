/**
 * The drill-downs the feedback page can be narrowed by. They stack: a product
 * and a Gedu together is that Gedu's sessions on that product.
 */
export const FEEDBACK_FILTER_DIMENSIONS = [
  "product",
  "group",
  "gedu",
  "gamer",
] as const;

export type FeedbackFilterDimension =
  (typeof FEEDBACK_FILTER_DIMENSIONS)[number];

/** One id per dimension, or `null` where that dimension is not narrowed. */
export type FeedbackFilters = Record<FeedbackFilterDimension, string | null>;

export const NO_FEEDBACK_FILTERS: FeedbackFilters = {
  product: null,
  group: null,
  gedu: null,
  gamer: null,
};

/**
 * Each dimension's query parameter is its own name, so a narrowed URL reads as
 * what it is (`?gedu=…&product=…`).
 */
export function parseFeedbackFilters(
  params: Partial<Record<string, string | string[] | undefined>>,
): FeedbackFilters {
  const read = (key: FeedbackFilterDimension) => {
    const raw = params[key];
    const value = Array.isArray(raw) ? raw[0] : raw;
    return value === undefined || value === "" ? null : value;
  };
  return {
    product: read("product"),
    group: read("group"),
    gedu: read("gedu"),
    gamer: read("gamer"),
  };
}

export function hasFeedbackFilters(filters: FeedbackFilters): boolean {
  return FEEDBACK_FILTER_DIMENSIONS.some((dimension) => filters[dimension] !== null);
}

/** The filters as query entries, without the dimensions that are not set. */
export function feedbackFilterQuery(
  filters: FeedbackFilters,
): Partial<Record<FeedbackFilterDimension, string>> {
  const query: Partial<Record<FeedbackFilterDimension, string>> = {};
  for (const dimension of FEEDBACK_FILTER_DIMENSIONS) {
    const value = filters[dimension];
    if (value !== null) query[dimension] = value;
  }
  return query;
}
