import { Constants, type ProductType } from "@/types";

/**
 * How each product type is spelled in the admin's URLs, and the query param
 * the admin product list narrows to one type with.
 *
 * **This table is the only place the spelling is kept.** It is both the path
 * segment each type's admin pages live under (`/admin/camps/[id]`) and the
 * value the list's `type` param takes (`/admin/products?type=camps`), so the
 * list a back link lands on reads as the same place its product pages hang
 * off. Every reader derives from it: the route builders that write the
 * segments and the param, and the list page that reads the param back. No
 * param means every type.
 */
export const PRODUCT_LIST_TYPE_PARAM = "type";

const ADMIN_PRODUCT_SLUGS = {
  consumer_club: "consumer-clubs",
  municipality_club: "municipality-clubs",
  camp: "camps",
  event: "events",
} as const satisfies Record<ProductType, string>;

export type AdminProductSlug = (typeof ADMIN_PRODUCT_SLUGS)[ProductType];

/**
 * How a product type is spelled in the admin's URLs: its pages' path segment,
 * and its value in the list's `type` param.
 */
export function adminProductSlug<T extends ProductType>(
  type: T,
): (typeof ADMIN_PRODUCT_SLUGS)[T] {
  return ADMIN_PRODUCT_SLUGS[type];
}

/**
 * The product type a slug names, or `null` for every type.
 *
 * A value naming no type — a hand-edited URL, a typo — reads as every type
 * rather than as a list narrowed to nothing, the same answer a missing param
 * gives.
 */
export function parseAdminProductSlug(
  value: string | null | undefined,
): ProductType | null {
  if (!value) return null;
  return (
    Constants.public.Enums.product_type.find(
      (type) => ADMIN_PRODUCT_SLUGS[type] === value,
    ) ?? null
  );
}
