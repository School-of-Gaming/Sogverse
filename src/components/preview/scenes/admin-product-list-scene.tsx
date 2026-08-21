"use client";

import { useMemo, useState } from "react";
import { AdminProductListPageBody } from "@/components/admin/products/list/admin-product-list-page-body";
import {
  EMPTY_PRODUCT_FILTERS,
  type AdminProductListFilters,
} from "@/components/admin/products/list/admin-product-list-data";
import {
  buildAdminProductListFixture,
  type AdminProductListScenario,
} from "@/components/admin/products/mock-product-list-fixtures";

/**
 * The unified admin product catalogue, over fixtures.
 *
 * It renders the **draft** body that is going to replace the four per-type list
 * pages — not the live one — because the whole point of the redesign is that
 * there stop being four of them. Promotion means this body becomes
 * `/admin/products`'s body with a query in place of the fixture; the layout does
 * not change in that step.
 *
 * Every row links at the real admin details route for its type, so clicking one
 * leaves the preview. That is the honest behaviour for a link whose entire job
 * is to be the way out of a list.
 *
 * **Filter state is local here, deliberately not mirrored into the URL.** On the
 * live page it will be, through `replaceState`, so that Back restores a narrowed
 * list rather than dropping the reader at the top of two hundred rows — but the
 * preview route's own path already carries the scenario, and a scene rewriting
 * its query string would make the address bar disagree with the registry that
 * resolved it. The body takes the filters as a prop precisely so the two shells
 * can differ on this one point and nothing else.
 */
export function AdminProductListScene({
  scenario,
}: {
  scenario: AdminProductListScenario;
}) {
  const rows = useMemo(() => buildAdminProductListFixture(scenario), [scenario]);
  const [filters, setFilters] = useState<AdminProductListFilters>(
    EMPTY_PRODUCT_FILTERS,
  );

  return (
    <AdminProductListPageBody
      rows={rows}
      filters={filters}
      onFiltersChange={setFilters}
    />
  );
}
