"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { AdminListShowingLine } from "@/components/admin/admin-list-narrowing";
import { useKeysetSentinel } from "@/hooks/use-keyset-infinite-query";
import { ProductRows } from "./product-rows";
import type { useAdminProductList } from "@/services/products";

/**
 * How far below the last row counts as reached. A page is a screenful, so
 * asking one viewport early is what makes a continuous scroll continuous rather
 * than a stutter at every page boundary.
 */
const SENTINEL_ROOT_MARGIN = "800px 0px";

interface ProductListResultsProps {
  /** The paged, server-filtered read the filters above drive. */
  list: ReturnType<typeof useAdminProductList>;
  /** How many of the selected type there are before any filter — the denominator of the count line. */
  total: number;
  /** What the list says when no row is left: none exist yet, or none match. */
  emptyMessage: string;
  /** Whether each row names its type — true while the list mixes the types. */
  showType: boolean;
  /** True while anything — the search box or a filter — is narrowing the list. */
  narrowed: boolean;
  /** Reset every narrowing control, search included. */
  onClear: () => void;
}

/**
 * The tail of the admin product list: how many of how many are showing, a way
 * back to all of them, and either the rows or the reason there are none — then
 * the sentinel that reveals the next page as the reader reaches the bottom.
 *
 * Renders a fragment rather than a wrapper: the caller's `space-y` owns the
 * spacing, and a second nesting level here would double it.
 */
export function ProductListResults({
  list,
  total,
  emptyMessage,
  showType,
  narrowed,
  onClear,
}: ProductListResultsProps) {
  const t = useTranslations("admin.products");

  const rows = list.data?.rows ?? [];

  // Reveal the next page as the reader reaches the bottom of this one.
  const sentinelRef = useKeysetSentinel(list, {
    rootMargin: SENTINEL_ROOT_MARGIN,
  });

  // The first page lands in a frame or two — the catalogue is small, so
  // ordering and filtering all of it is near-instant even without an index —
  // and so nothing is painted in its place. What must not appear in the meantime is the count line or the empty
  // line, which would claim an answer before anyone has been asked; both
  // arrive with the rows, below everything already on screen.
  const showing = list.data?.total;
  if (showing === undefined || showing === null) return null;

  return (
    <>
      <AdminListShowingLine
        showing={t("filters.showing", { count: showing, total })}
        clearLabel={t("filters.clear")}
        narrowed={narrowed}
        onClear={onClear}
      />

      {rows.length === 0 ? (
        <Card>
          <CardContent className="py-8 text-center text-muted-foreground">
            {emptyMessage}
          </CardContent>
        </Card>
      ) : (
        <ProductRows products={rows} showType={showType} />
      )}

      {/* Below every row, so a revealed page lands where the page's slack
          already is and nothing painted moves. Unmounted once there is nothing
          left to reach for. */}
      {list.hasNextPage && <div ref={sentinelRef} aria-hidden className="h-px" />}
    </>
  );
}
