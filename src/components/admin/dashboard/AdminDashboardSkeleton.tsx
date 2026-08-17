"use client";

import { useTranslations } from "next-intl";

/**
 * The admin dashboard while its one read is still in the air.
 *
 * **Shown immediately, with no delay and no fade**, because the call behind it
 * is known to be a slow one before it is made: four platform-wide aggregates,
 * one of them counting participations and groups across every live product.
 * There is nothing to discover at runtime about how long that takes — a timer
 * waiting to find out would flash on the fast path and leave dead air on the
 * slow one.
 *
 * **The page's own chrome is real here, not ghosted.** The heading and its
 * sub-line are bundled with the route and wait on nothing, so they are rendered
 * as themselves and the admin can read them before anything lands — and because
 * they are the same words in the same place in the loaded page, they do not move
 * when it does. Everything below them is a ghost of a shape whose *content* the
 * page cannot know yet: how many products need attention, who is waiting, what
 * is on this week.
 *
 * Each band keeps the size it will have, so the swap is a change of content
 * rather than of layout: four tiles on the users grid, six cards on the queue's
 * own two-and-three-across grid, seven weekday rows under a schedule header, and
 * the key rail beside them at its eleven-rem width.
 */
export function AdminDashboardSkeleton() {
  const t = useTranslations("admin.dashboard");

  return (
    <div className="space-y-6 pb-12">
      <div>
        <h1 className="text-3xl font-bold">{t("title")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
      </div>

      <p role="status" className="sr-only">
        {t("loading")}
      </p>

      <div
        aria-hidden
        className="xl:grid xl:grid-cols-[minmax(0,1fr)_11rem] xl:items-start xl:gap-6"
      >
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((index) => (
              <div
                key={index}
                className="h-[4.5rem] animate-pulse rounded-lg border border-border bg-muted/40"
              />
            ))}
          </div>

          <div className="space-y-4 rounded-lg border border-border bg-card p-6">
            <div className="h-6 w-40 animate-pulse rounded bg-muted" />
            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {[0, 1, 2, 3, 4, 5].map((index) => (
                <GhostProductCard key={index} />
              ))}
            </div>
          </div>

          <div className="space-y-4 rounded-lg border border-border bg-card p-6">
            <div className="h-6 w-28 animate-pulse rounded bg-muted" />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="h-8 w-56 animate-pulse rounded-md bg-muted" />
              <div className="h-8 w-72 animate-pulse rounded-full bg-muted" />
            </div>
            <div className="space-y-1.5">
              {[0, 1, 2, 3, 4, 5, 6].map((index) => (
                <div
                  key={index}
                  className="h-12 animate-pulse rounded-lg border border-border bg-muted/40"
                />
              ))}
            </div>
          </div>
        </div>

        <div className="mt-6 h-56 animate-pulse rounded-lg border border-border bg-muted/40 xl:mt-0" />
      </div>
    </div>
  );
}

/** One queue card's shape: the type glyph, the product name, two issue lines. */
function GhostProductCard() {
  return (
    <div className="space-y-2 rounded-lg border border-border bg-card p-3">
      <div className="flex items-start gap-2">
        <div className="mt-0.5 h-4 w-4 shrink-0 animate-pulse rounded bg-muted" />
        <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
      </div>
      <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
      <div className="h-3 w-2/5 animate-pulse rounded bg-muted" />
    </div>
  );
}
