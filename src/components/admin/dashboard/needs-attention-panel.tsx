/* eslint-disable i18next/no-literal-string -- design-mock phase; see the note on
   `product-attention-grid.tsx`. */
import { CircleCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  ProductAttention,
  UncertifiedGedu,
} from "./admin-dashboard-data";
import { GeduCertificationQueue } from "./gedu-certification-queue";
import { ProductAttentionGrid } from "./product-attention-grid";

/**
 * The ops queue an admin starts their day in — the reason to open this page at
 * all, and therefore the top of it, at the full width of the page.
 *
 * Two sub-sections, in the order an admin works: **the products** that need
 * something, then **the people** waiting on a decision. Both are complete —
 * nothing is capped, folded or hidden behind a "show all", because an admin who
 * does not see a row does not do the work and the goal here is an empty panel.
 *
 * When both are empty the whole thing collapses to a single all-clear line. That
 * is the only place on the page that says "nothing to do", and it is deliberately
 * quiet: a success banner every morning is a banner nobody reads by Wednesday.
 */
export function NeedsAttentionPanel({
  products,
  uncertifiedGedus,
  onCertifyGedu,
}: {
  products: readonly ProductAttention[];
  uncertifiedGedus: readonly UncertifiedGedu[];
  /** Certify one gedu. Resolves once the write landed; rejects if it did not. */
  onCertifyGedu: (geduId: string) => Promise<void>;
}) {
  const total = products.length + uncertifiedGedus.length;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-xl">Needs attention</CardTitle>
        {total > 0 && (
          <span className="rounded-full bg-warning/15 px-3 py-1 text-sm font-semibold text-warning">
            {total}
          </span>
        )}
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <AllClear />
        ) : (
          <div className="space-y-8">
            {products.length > 0 && (
              <ProductAttentionGrid products={products} />
            )}
            {uncertifiedGedus.length > 0 && (
              <GeduCertificationQueue
                gedus={uncertifiedGedus}
                onCertify={onCertifyGedu}
              />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function AllClear() {
  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <CircleCheck className="h-10 w-10 text-success" aria-hidden />
      <p className="text-lg font-medium">All clear</p>
      <p className="max-w-md text-sm text-muted-foreground">
        Every gamer is placed, every group has a gedu, no product is missing a
        fee, and nobody is waiting on a certification decision.
      </p>
    </div>
  );
}
