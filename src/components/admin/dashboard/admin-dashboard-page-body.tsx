"use client";

import { useTranslations } from "next-intl";
import type { AdminDashboardData } from "./admin-dashboard-data";
import { NeedsAttentionPanel } from "./needs-attention-panel";
import { ProductTypeKeyRail } from "./product-type-key-rail";
import { SchedulePanel } from "./schedule-panel";
import { UsersStrip } from "./users-strip";

/**
 * The admin dashboard's **draft** page body — the redesign of `/admin`, built to
 * be judged from fixtures before anything is wired to a query.
 *
 * It replaces a placeholder: four tiles reading "0", "0", "$0", "0%" and a
 * Recent Activity card with nothing in it. The redesign starts from what an
 * admin actually opens this page to find out —
 *
 * 1. **Who is here?** Four numbers, each with the sub-stat its role has.
 * 2. **What needs me?** The ops queue, product-first: one card per product that
 *    needs something, then the people waiting on a certification decision.
 * 3. **What is running?** The week as seven rows, and what is lined up after it.
 *
 * **Revenue and growth are deliberately gone.** They were the two tiles that
 * could never be right — money lives in Stripe, which owns the reporting an
 * accountant actually uses, and a growth percentage on a platform this size is
 * noise with a decimal point. A dashboard that shows a number nobody trusts
 * teaches its reader to skim, and everything below the skimmed number pays for
 * it.
 *
 * **The page is three full-width bands, not a column layout.** It was a two-thirds
 * / one-third band over a full-width one, and the narrow column was wrong in both
 * directions at once: four short user stats cannot fill a column whose height is
 * set by however much is wrong with the platform that morning, so it stood mostly
 * empty — and the width it was holding was exactly what the queue needed to stop
 * truncating product names. Users became a slim strip of tiles, the queue took
 * the page, and the queue's cards now tile two and three across.
 *
 * **The strip goes first, and it is not the most urgent thing on the page.** It
 * is a pulse — four numbers that say what the platform *is* before the queue
 * says what is wrong with it — and it earns the top by being small enough to
 * cost the queue almost nothing. One row of tiles is what a reader takes in
 * without stopping, so the queue is still on the fold behind it; a section that
 * pushed the queue below the screen would have to be more urgent than the queue
 * to deserve the position, and this one is not. The schedule stays at the
 * bottom: it is the reference you scroll to, not the thing you open the page
 * for.
 *
 * The body is presentational end to end: every count, join and resolution
 * arrives in `data`, and nothing here queries, mutates or reads a clock. The one
 * action on the page arrives the same way — as a callback the caller owns — so
 * the preview scene can render the identical body with a callback that writes
 * nothing. That is what lets the scene render it over fixtures and the route
 * render it over a live snapshot without either owning a layout. It takes no
 * loading state, and there is none above it either: the route awaits the
 * snapshot before this renders at all, so the first paint is the finished page,
 * and a read that never landed is answered by the route with a failure band in
 * place of this body.
 */
export function AdminDashboardPageBody({
  data,
  onCertifyGedu,
}: {
  data: AdminDashboardData;
  /** Certify one gedu. Resolves once the write landed; rejects if it did not. */
  onCertifyGedu: (geduId: string) => Promise<void>;
}) {
  const t = useTranslations("admin.dashboard");

  return (
    <div className="space-y-6 pb-12">
      <div>
        {/* "Dashboard", not "My SOG": the admin surface is genuinely an admin
            panel and is called one, which is the single exception to the
            product-wide naming rule. */}
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
      </div>

      {/* The key is a page-level rail, not a section's legend, because the
          tinted type glyph is spoken by three of the bands below it. Eleven rem
          is the whole budget it takes from the content column — narrow enough
          that the card grid keeps its three columns at `2xl` and a week row
          loses roughly one wrapped line. Below `xl` the grid collapses and the
          rail, which comes last in the DOM, falls to the bottom of the page as a
          wrapping row: a key you consult belongs at the end when there is no
          margin to put it in, and putting it first would push the queue — the
          reason the page exists — below the fold on a phone.

          `items-start` is what makes the rail's own `sticky` work: a stretched
          grid item is already as tall as its row and has nothing to stick
          within. */}
      <div className="xl:grid xl:grid-cols-[minmax(0,1fr)_11rem] xl:items-start xl:gap-6">
        <div className="space-y-6">
          <UsersStrip stats={data.users} />

          <NeedsAttentionPanel
            products={data.products}
            uncertifiedGedus={data.uncertifiedGedus}
            onCertifyGedu={onCertifyGedu}
          />

          <SchedulePanel
            weeks={data.weeks}
            currentWeekIndex={data.currentWeekIndex}
            comingUp={data.comingUp}
            now={data.now}
            timeZone={data.timeZone}
            timeZoneAbbrev={data.timeZoneAbbrev}
          />
        </div>

        <ProductTypeKeyRail />
      </div>
    </div>
  );
}
