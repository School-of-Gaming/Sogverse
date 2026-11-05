"use client";

import { useTranslations } from "next-intl";
import { Heading } from "@sog/ui";
import type { AdminDashboardData } from "./admin-dashboard-data";
import { GeduTasksPanel } from "./gedu-tasks-panel";
import { NeedsAttentionPanel } from "./needs-attention-panel";
import { ProductTypeKeyRail } from "./product-type-key-rail";
import { SchedulePanel } from "./schedule-panel";

/**
 * The admin dashboard's **draft** page body — the redesign of `/admin`, built to
 * be judged from fixtures before anything is wired to a query.
 *
 * It replaces a placeholder: four tiles reading "0", "0", "$0", "0%" and a
 * Recent Activity card with nothing in it. The redesign starts from what an
 * admin actually opens this page to find out —
 *
 * 1. **What needs me?** The ops queue: one card per product that needs
 *    something, and nothing else.
 * 2. **What stands?** Who is not certified yet — kept next to the queue but
 *    deliberately outside it, because a gedu waiting on their own contract or
 *    background check is not work an admin can do today, and counting them as
 *    attention owed is how a count stops being believed.
 * 3. **What is running?** The week as seven rows, and what is lined up after it.
 *
 * **How the business is doing is not this page's question.** Families, revenue
 * and gedu capacity are read month by month on the business page, which is
 * read once a month; this page is the queue an admin starts the day in, so the
 * queue opens it.
 *
 * **The page is full-width bands, not a column layout.** A narrow column beside
 * the queue stood mostly empty, and the width it held was exactly what the
 * queue needed to stop truncating product names, so the queue takes the page
 * and its cards tile two and three across. The schedule stays at the bottom:
 * it is the reference you scroll to, not the thing you open the page for.
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
        <Heading level={1} step="section">{t("title")}</Heading>
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
          <NeedsAttentionPanel products={data.products} />

          {/* Directly under the queue, because the two are read together — what
              needs doing, then the Gedus waiting on an admin — and above the
              schedule, which is the reference you scroll to rather than the
              thing you opened the page for. */}
          <GeduTasksPanel gedus={data.geduTasks} onCertifyGedu={onCertifyGedu} />

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
