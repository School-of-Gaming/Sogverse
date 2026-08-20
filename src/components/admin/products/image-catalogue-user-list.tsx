"use client";

import Link from "next/link";
import { useTranslations } from "next-intl";
import { Circle, CircleDot } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProductImageUser } from "@/services/product-images";
import { PRODUCT_TYPE_CONFIG } from "./product-type-config";

/**
 * **Which products a catalogue entry reaches**, in the one shape both places
 * that ask the question use: the reference column, where it is information, and
 * the confirm dialogs, where it is the thing the admin is being asked to weigh.
 * One component so the two cannot drift into showing different facts about the
 * same entry.
 *
 * Each row is a link to the product's own admin page, because "which products"
 * is rarely the end of the question — the next one is "and what are they", and
 * a name with no way through to the product makes the admin go and find it by
 * hand. The rows carry the product's type and whether it is live in the shop,
 * the two facts that decide how much a picture change matters: a hidden draft
 * and a club families are looking at right now are not the same stake.
 *
 * The list is **bounded and scrolls**, in both hosts. An entry can reach 22
 * products, and a list that simply grows pushes whatever is under it — the
 * column's own buttons, or the confirm's count-bearing footer — off the screen.
 */
export function ProductImageUserList({
  products,
  className,
}: {
  products: readonly ProductImageUser[];
  className?: string;
}) {
  const t = useTranslations("admin.products");

  return (
    <ul
      className={cn(
        "max-h-48 divide-y divide-border overflow-y-auto rounded-md border border-border",
        className,
      )}
    >
      {products.map((product) => {
        const config = PRODUCT_TYPE_CONFIG[product.product_type];
        const LiveIcon = product.is_visible ? CircleDot : Circle;
        return (
          <li key={product.id}>
            <Link
              href={`/admin/${config.routeSlug}/${product.id}`}
              className="flex items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-accent"
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">
                  {product.name || t("list.untitled")}
                </span>
                <span className="block truncate text-xs text-muted-foreground">
                  {t(`types.${config.i18nKey}.label`)}
                </span>
              </span>
              <span
                className={cn(
                  "flex shrink-0 items-center gap-1 text-xs",
                  product.is_visible ? "text-success" : "text-muted-foreground",
                )}
              >
                <LiveIcon className="h-3 w-3" aria-hidden />
                {product.is_visible
                  ? t("imageCatalogue.live")
                  : t("imageCatalogue.hidden")}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
