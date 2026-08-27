"use client";

import { useTranslations } from "next-intl";
import { CircleCheck } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { ProductAttention } from "./admin-dashboard-data";
import { PixelSprite, TROPHY_CUP } from "./pixel-art";
import { ProductAttentionGrid } from "./product-attention-grid";

/**
 * The ops queue an admin starts their day in — the reason to open this page at
 * all, and therefore the top of it, at the full width of the page.
 *
 * **It is products, and only products.** Gedu certification used to be its
 * second section and has moved out to a section of its own below. The two were
 * never the same kind of fact: a product missing a fee is work an admin can do
 * something about right now, while a gedu who has not accepted the contract in
 * force — or, once we run them, not cleared a background check — is waiting on
 * somebody who is not in this building. Counting that person as attention owed
 * tells an admin they are behind on something they cannot act on, which is the
 * one thing a queue must never do: a queue that lies about being actionable
 * teaches its reader to stop trusting the count, and then the count stops
 * working for the rows that *are* real.
 *
 * Everything in it is complete — nothing capped, folded or hidden behind a "show
 * all", because an admin who does not see a row does not do the work and the
 * goal here is an empty panel.
 *
 * **Empty is now reachable, which it was not before.** The all-clear used to
 * wait on three conditions at once — no products, no queue, and nobody certified
 * this sitting — and that third one meant certifying the last gedu kept the
 * panel open for the rest of the sitting, at the one moment it had earned the
 * right to collapse. One condition is left: no products need anything.
 */
export function NeedsAttentionPanel({
  products,
}: {
  products: readonly ProductAttention[];
}) {
  const t = useTranslations("admin.dashboard.attention");

  if (products.length === 0) return <AllClearPanel />;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-xl">{t("title")}</CardTitle>
        <span className="rounded-full bg-warning/15 px-3 py-1 text-sm font-semibold text-warning">
          {products.length}
        </span>
      </CardHeader>
      <CardContent>
        <ProductAttentionGrid products={products} />
      </CardContent>
    </Card>
  );
}

/**
 * **The reward is the collapse.** Not a celebration standing where the queue
 * stood — the satisfaction of this state is opening `/admin` and finding that
 * the thing which was eating half the page is a single row. A card the size of
 * the queue, however handsomely decorated, spends the reader's screen to tell
 * them there is nothing to spend it on; the panel giving the space back *is* the
 * good news, and everything below rising to meet it is the reader seeing it.
 *
 * So there is no body at all. The card is its own header: the wordmark takes the
 * slot the title held — replacing "Needs attention" rather than sitting beside
 * it, since a heading and its own denial on one line reads as a contradiction —
 * and the copy, the cup and the check ride in one right-packed group opposite,
 * where the header's slack already sits. The count badge is simply absent, as it
 * is at zero everywhere else.
 *
 * **On the layout rule, and what this state can and cannot do to the page.**
 * Nothing on this page resolves a product issue: every card in the grid is a
 * link out to the product that owns the problem, so the panel cannot collapse in
 * response to anything the reader does here. It changes shape on a fresh
 * document, which is not a shift at all. The one exception is honest and worth
 * naming rather than papering over: the dashboard's snapshot is a React Query
 * entry, so a window-focus refetch or the certification section's own
 * invalidation can bring back a document in which *another* admin fixed the last
 * product issue, and the panel would collapse under a reader who is looking at
 * the section below it. That is rare by construction — it needs a second admin
 * finishing the last issue inside the same minute — and it is the only path to
 * it. Reserving a queue's worth of space against that possibility would cost
 * every clear morning the whole point of this state.
 */
function AllClearPanel() {
  const t = useTranslations("admin.dashboard.attention");

  return (
    <Card>
      {/* Wrapping is what keeps this honest at 360px, where the line alone is
          wider than the viewport in every locale: the group drops below the
          wordmark and wraps within itself rather than pushing the card sideways.
          `justify-end` keeps it packed right wherever it lands. */}
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-x-6 gap-y-3 space-y-0">
        {/* The wordmark is the card's heading, in the pixel face the cup beside
            it is drawn in. `leading-relaxed` because Press Start 2P sets roughly
            one em per glyph and inherits none of the tight leading a normal
            title wants; `text-sm` because at the title's own size the longest
            locale would set this wider than a phone. */}
        <CardTitle className="font-display text-sm leading-relaxed text-primary sm:text-base">
          {t("allClearTitle")}
        </CardTitle>
        <div className="flex min-w-0 flex-wrap items-center justify-end gap-x-3 gap-y-2">
          <p className="text-sm text-muted-foreground">{t("allClearLine")}</p>
          <PixelSprite art={TROPHY_CUP} />
          <CircleCheck className="h-5 w-5 shrink-0 text-success" aria-hidden />
        </div>
      </CardHeader>
    </Card>
  );
}
