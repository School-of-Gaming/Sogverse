"use client";

import { useTranslations } from "next-intl";
import type { GeduQualification } from "@/types";

/**
 * Each gedu qualification's name, as every admin surface states it.
 *
 * The name is the wording the thing it qualifies for already carries — the
 * product tag's label, and the consumer club type's plural — so a
 * qualification and what it clears a gedu to run are never called two
 * different things. A record keyed by the enum, so a qualification added by
 * migration fails to compile here until it is given a name.
 */
export function useQualificationNames(): Record<GeduQualification, string> {
  const tagT = useTranslations("productTag");
  const typeT = useTranslations("admin.products.types");
  return {
    neuroinclusive: tagT("neuroinclusive"),
    consumer_products: typeT("consumerClub.plural"),
  };
}
