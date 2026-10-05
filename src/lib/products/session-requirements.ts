import type {
  GeduQualification,
  ProductTag,
  ProductType,
  SpokenLanguageCode,
} from "@/types";

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
 * gedu's substitution pool and offers. A DB test enumerates every product type
 * and tag and holds the two in agreement, so a change to either fails until the
 * other matches.
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
 * What whoever runs a session of a product has to bring: the qualifications it
 * requires, and the language it is run in, which they must speak.
 *
 * The database holds a gedu to both on the paths they start themselves — the
 * substitution pool and offering — and the admin surfaces read them here to
 * warn before seating someone who falls short, a warning the admin may proceed
 * past.
 */
export interface SessionRequirements {
  qualifications: readonly GeduQualification[];
  language: SpokenLanguageCode;
}

/** A product's session requirements. */
export function sessionRequirements(product: {
  product_type: ProductType;
  tag: ProductTag | null;
  spoken_language_code: SpokenLanguageCode;
}): SessionRequirements {
  return {
    qualifications: productRequiredQualifications(product),
    language: product.spoken_language_code,
  };
}

/** One requirement a gedu falls short of. */
export type MissingRequirement =
  | { kind: "qualification"; qualification: GeduQualification }
  | { kind: "language"; language: SpokenLanguageCode };

/**
 * The requirements a gedu falls short of — each missing qualification in the
 * required order, then the language if they do not speak it. Empty when they
 * meet them all. A gedu who has listed no language never speaks the session's.
 */
export function missingRequirements(
  requirements: SessionRequirements,
  gedu: {
    qualifications: readonly GeduQualification[];
    spoken_languages: readonly SpokenLanguageCode[];
  },
): MissingRequirement[] {
  const missing: MissingRequirement[] = requirements.qualifications
    .filter((qualification) => !gedu.qualifications.includes(qualification))
    .map((qualification) => ({ kind: "qualification", qualification }));
  if (!gedu.spoken_languages.includes(requirements.language)) {
    missing.push({ kind: "language", language: requirements.language });
  }
  return missing;
}

/** A stable React key for a missing requirement. */
export function missingRequirementKey(requirement: MissingRequirement): string {
  return requirement.kind === "qualification"
    ? `qualification:${requirement.qualification}`
    : `language:${requirement.language}`;
}
