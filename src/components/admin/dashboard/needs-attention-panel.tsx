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
 * document, which is not a shift at all.
 *
 * What can move it is a refetch. The snapshot is a React Query entry with a
 * one-minute `staleTime` and the library's defaults otherwise, so it comes back
 * on window focus once the entry is stale, on reconnect, and on the invalidation
 * the certification section's own write fires. If *another* admin cleared the
 * last product issue in between, this panel collapses and everything below it
 * rises under whoever is reading. **Reconnect is the path worth naming**, and
 * the one easy to miss when reasoning about this: a focus refetch lands as a
 * returning reader looks at the page again, but a laptop waking or a wifi blip
 * fires while they are sitting in front of it doing nothing.
 *
 * So it is a genuine shift on data's own schedule, it takes a second admin to
 * cause, and it is not particular to this state — the grid re-rendered on those
 * same refetches before the all-clear could collapse at all. It is accepted
 * rather than defended: the alternative is holding a queue's worth of empty
 * space open every clear morning against a cross-admin race, which spends the
 * entire point of this state to buy it.
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
            it is drawn in, and every class here is cancelling something
            `CardTitle` assumes about a normal title. `leading-relaxed` because
            Press Start 2P sets roughly one em per glyph and wants none of the
            tight leading; `tracking-normal` because the base class ships
            `tracking-tight`, which tailwind-merge has no reason to drop, and
            negative letter-spacing smudges pixel glyphs into their neighbours;
            `text-sm` because at the title's own size the longest locale would
            set this wider than a phone. The one diacritic any locale puts in
            this face is Swedish's ä (U+00E4), which is inside the `latin`
            subset the font is loaded with, so it renders in the pixel face
            rather than falling back mid-word. */}
        <CardTitle className="font-display text-sm leading-relaxed tracking-normal text-act sm:text-base">
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
