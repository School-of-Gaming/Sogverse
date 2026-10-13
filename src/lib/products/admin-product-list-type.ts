import { Constants, type ProductType } from "@/types";

/**
 * The query param the admin product list narrows to one product type with, and
 * the value each type is spelled as in it.
 *
 * One module for both directions, because two readers must agree: the route
 * builder that writes `/admin/products?type=camps` into every back link and
 * redirect, and the list page that reads it back. No param means every type.
 *
 * The values are the plural slugs each type's admin pages already live under
 * (`/admin/camps/[id]`), so the list a link lands on reads as the same place
 * its product pages hang off.
 */
export const PRODUCT_LIST_TYPE_PARAM = "type";

const TYPE_PARAM_VALUES = {
  consumer_club: "consumer-clubs",
  municipality_club: "municipality-clubs",
  camp: "camps",
  event: "events",
} as const satisfies Record<ProductType, string>;

export type ProductListTypeParam = (typeof TYPE_PARAM_VALUES)[ProductType];

/** How a product type is spelled in the list's `type` param. */
export function productListTypeParam(type: ProductType): ProductListTypeParam {
  return TYPE_PARAM_VALUES[type];
}

/**
 * The product type a `type` param names, or `null` for every type.
 *
 * A value naming no type — a hand-edited URL, a typo — reads as every type
 * rather than as a list narrowed to nothing, the same answer a missing param
 * gives.
 */
export function parseProductListType(
  value: string | null | undefined,
): ProductType | null {
  if (!value) return null;
  return (
    Constants.public.Enums.product_type.find(
      (type) => TYPE_PARAM_VALUES[type] === value,
    ) ?? null
  );
}
