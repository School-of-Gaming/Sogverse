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
 * requires, the language it is run in, which they must speak, and — for an
 * in-person product only — a coverage area reaching its site.
 *
 * The database holds a gedu to all three on the paths they start themselves —
 * the substitution pool and offering — and the admin surfaces read them here
 * to warn before seating someone who falls short, a warning the admin may
 * proceed past.
 */
export interface SessionRequirements {
  qualifications: readonly GeduQualification[];
  language: SpokenLanguageCode;
  /**
   * The site an in-person product runs at, which one of the gedu's coverage
   * ticks has to reach; `null` for an online product, which requires no
   * coverage at all — an online municipality club's location included.
   *
   * Only the product's id and the site's name: whether a gedu's ticks reach
   * the site is a walk up the location tree, which the database answers for
   * the picker (it asks for the set of gedus covering the product) rather
   * than this module repeating it.
   */
  site: { productId: string; name: string | null } | null;
}

/**
 * A product's session requirements. `siteName` is the name of the product's
 * location, which on an in-person product is its site; it is ignored on an
 * online one.
 */
export function sessionRequirements(
  product: {
    id: string;
    product_type: ProductType;
    tag: ProductTag | null;
    spoken_language_code: SpokenLanguageCode;
    is_remote: boolean;
  },
  siteName: string | null,
): SessionRequirements {
  return {
    qualifications: productRequiredQualifications(product),
    language: product.spoken_language_code,
    site: product.is_remote ? null : { productId: product.id, name: siteName },
  };
}

/** One requirement a gedu falls short of. */
export type MissingRequirement =
  | { kind: "qualification"; qualification: GeduQualification }
  | { kind: "language"; language: SpokenLanguageCode }
  | { kind: "coverage"; site: string | null };

/**
 * The requirements a gedu falls short of — each missing qualification in the
 * required order, then the language if they do not speak it, then the site if
 * the session is in person and their coverage areas do not reach it. Empty
 * when they meet them all. A gedu who has listed no language never speaks the
 * session's.
 *
 * `coversSite` is the database's answer for this gedu and this product, and is
 * ignored when the session has no site.
 */
export function missingRequirements(
  requirements: SessionRequirements,
  gedu: {
    qualifications: readonly GeduQualification[];
    spoken_languages: readonly SpokenLanguageCode[];
  },
  coversSite: boolean,
): MissingRequirement[] {
  const missing: MissingRequirement[] = requirements.qualifications
    .filter((qualification) => !gedu.qualifications.includes(qualification))
    .map((qualification) => ({ kind: "qualification", qualification }));
  if (!gedu.spoken_languages.includes(requirements.language)) {
    missing.push({ kind: "language", language: requirements.language });
  }
  if (requirements.site !== null && !coversSite) {
    missing.push({ kind: "coverage", site: requirements.site.name });
  }
  return missing;
}

/** A stable React key for a missing requirement. */
export function missingRequirementKey(requirement: MissingRequirement): string {
  switch (requirement.kind) {
    case "qualification":
      return `qualification:${requirement.qualification}`;
    case "language":
      return `language:${requirement.language}`;
    case "coverage":
      return "coverage";
  }
}
