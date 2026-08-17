"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
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
 *
 * **Who has been certified this sitting is remembered here, not in the queue.**
 * It is the receipt for the one write on this page, and the queue is exactly the
 * thing that stops existing when that write succeeds for the last time: certify
 * the final gedu and the list empties, the section it lived in unmounts, and the
 * panel collapses to the all-clear — taking the confirmation with it at the one
 * moment there is most to confirm. Holding the set a level up lets the section
 * outlive its own rows, so the last certification is acknowledged the same way
 * the first was.
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
  const t = useTranslations("admin.dashboard.attention");
  const [certifiedIds, setCertifiedIds] = useState<ReadonlySet<string>>(
    new Set(),
  );

  /**
   * The receipt, minus anybody the queue is offering again.
   *
   * A row enters the set only once its write has landed *and* the refetch behind
   * it has returned, so an id in both places is not a race — it is the queue
   * saying this account is uncertified now, which happens when somebody
   * un-certifies them from the users list while this page is open. Left
   * unpruned, that row would be filtered out of the list by a receipt for a fact
   * that is no longer true, and still counted in the line above it: an admin
   * told "1 certified" about somebody who is not, with no row to act on. So the
   * queue wins, the receipt gives up the id, and the row comes back.
   *
   * Everything else about the receipt is unchanged: an id the queue has stopped
   * offering stays in it for the rest of the sitting, which is what keeps the
   * section mounted after the last certification.
   */
  const waitingIds = new Set(uncertifiedGedus.map((gedu) => gedu.id));
  const certified = withoutWaiting(certifiedIds, waitingIds);
  if (certified !== certifiedIds) setCertifiedIds(certified);

  /** Outstanding work, which is what the badge counts — a receipt is not work. */
  const total = products.length + uncertifiedGedus.length;
  const showCertification = uncertifiedGedus.length > 0 || certified.size > 0;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-xl">{t("title")}</CardTitle>
        {total > 0 && (
          <span className="rounded-full bg-warning/15 px-3 py-1 text-sm font-semibold text-warning">
            {total}
          </span>
        )}
      </CardHeader>
      <CardContent>
        {total === 0 && !showCertification ? (
          <AllClear />
        ) : (
          <div className="space-y-8">
            {products.length > 0 && (
              <ProductAttentionGrid products={products} />
            )}
            {showCertification && (
              <GeduCertificationQueue
                gedus={uncertifiedGedus}
                certified={certified}
                onCertify={onCertifyGedu}
                onCertified={(geduId) =>
                  setCertifiedIds((current) => new Set(current).add(geduId))
                }
              />
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * `certified` less every id in `waiting`, returning the original set unchanged
 * when there is nothing to drop — identity is what stops the state adjustment
 * above from looping.
 */
function withoutWaiting(
  certified: ReadonlySet<string>,
  waiting: ReadonlySet<string>,
): ReadonlySet<string> {
  const kept = [...certified].filter((id) => !waiting.has(id));
  return kept.length === certified.size ? certified : new Set(kept);
}

function AllClear() {
  const t = useTranslations("admin.dashboard.attention");

  return (
    <div className="flex flex-col items-center gap-3 py-10 text-center">
      <CircleCheck className="h-10 w-10 text-success" aria-hidden />
      <p className="text-lg font-medium">{t("allClearTitle")}</p>
      <p className="max-w-md text-sm text-muted-foreground">
        {t("allClearBody")}
      </p>
    </div>
  );
}
