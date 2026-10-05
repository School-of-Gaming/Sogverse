import type { GeduQualification, ProductTag, ProductType } from "@/types";

/**
 * Whether each product type is one families pay for themselves, which is what
 * `consumer_products` clears a gedu to run.
 *
 * A record rather than a list so a new product type fails to compile here
 * until somebody decides whether it requires the qualification.
 */
const REQUIRES_CONSUMER_PRODUCTS = {
  consumer_club: true,
  camp: true,
  event: true,
  municipality_club: false,
} as const satisfies Record<ProductType, boolean>;

/**
 * The gedu qualifications a product requires of whoever runs a session of it,
 * in the `gedu_qualification` enum's declared order: `neuroinclusive` when the
 * product is tagged neuroinclusive, `consumer_products` when it is a type
 * families pay for. Empty when it requires nothing.
 *
 * **A mirror of the database's own statement of the rule**, which gates the
 * gedu's substitution pool and offers. The admin surfaces read it here to warn
 * before seating someone who lacks a qualification — a warning the admin may
 * proceed past. A DB test enumerates every product type and tag and holds the
 * two in agreement, so a change to either fails until the other matches.
 */
export function productRequiredQualifications(product: {
  product_type: ProductType;
  tag: ProductTag | null;
}): GeduQualification[] {
  const required: GeduQualification[] = [];
  if (product.tag === "neuroinclusive") required.push("neuroinclusive");
  if (REQUIRES_CONSUMER_PRODUCTS[product.product_type]) {
    required.push("consumer_products");
  }
  return required;
}

/**
 * The qualifications a product requires that the gedu does not hold, in the
 * same order — empty when the gedu holds them all.
 */
export function missingQualifications(
  required: readonly GeduQualification[],
  held: readonly GeduQualification[],
): GeduQualification[] {
  return required.filter((qualification) => !held.includes(qualification));
}
