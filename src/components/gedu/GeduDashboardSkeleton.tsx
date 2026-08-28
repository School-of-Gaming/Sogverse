import { useTranslations } from "next-intl";
import {
  GeduContractNotice,
  GeduCriminalRecordCheckNotice,
} from "./gedu-next-step-notice";

/**
 * The gedu dashboard while its assignment summaries are still in the air.
 *
 * **It is shown immediately, with no delay and no fade**, because the call
 * behind it is known to be a perceptibly slow one: the summary RPC counts every
 * assignment's outstanding sessions by expanding that product's whole schedule
 * server-side. There is nothing to discover at runtime about how long that
 * takes — a timer waiting to find out would flash on the fast path and leave
 * dead air on the slow one.
 *
 * **In practice almost nobody sees it.** The route prefetches the same read, so
 * the ordinary visit paints the real cards on the first frame; this is what a
 * gedu gets when that prefetch failed and the browser is asking again.
 *
 * **Nothing here outlives the swap.** Every ghost is replaced by the thing it
 * stands for, and the two headings it draws are ghosts rather than words
 * precisely because the real ones are not knowable yet — how many sections
 * there are and what they are called is derived from the data. Guessing at
 * "Clubs" and then rewriting it to "Camps" would be the one shift the layout
 * rules forbid: text a reader could already be reading, moving on the data's
 * own schedule.
 */
export function GeduDashboardSkeleton({
  /**
   * The things on this page that are *not* waiting on a network call, so the
   * band they decide is drawn for real rather than ghosted — the reader can
   * read it and click through while the summaries are still in the air. It is
   * first in both this and the loaded body, and the same one of the three
   * branches is taken in each, so it lands in the same place across the swap
   * and moves nothing.
   */
  contractAccepted,
  criminalRecordCheckPassed,
  certified,
}: {
  contractAccepted: boolean;
  criminalRecordCheckPassed: boolean;
  certified: boolean;
}) {
  const t = useTranslations("dashboardSections");

  return (
    <>
      <h1 className="sr-only">{t("pageTitle")}</h1>
      <p role="status" className="sr-only">
        {t("loadingAssignments")}
      </p>

      {!contractAccepted ? (
        <GeduContractNotice />
      ) : !criminalRecordCheckPassed && !certified ? (
        <GeduCriminalRecordCheckNotice />
      ) : null}

      {/* The section pill's bar, at the height the real one occupies. */}
      <div
        aria-hidden
        className="mx-auto mb-8 h-10 w-64 animate-pulse rounded-full bg-muted"
      />

      <div aria-hidden className="space-y-24 pb-24">
        <section className="mx-auto max-w-5xl space-y-6">
          <div className="h-9 w-40 animate-pulse rounded-md bg-muted" />
          {/* Three ghost cards on the same grid the real ones tile on, so the
              column count and the gutters are already right when they land. */}
          <div className="grid items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((index) => (
              <GhostCard key={index} />
            ))}
          </div>
        </section>

        <section className="mx-auto max-w-5xl space-y-6">
          <div className="h-9 w-56 animate-pulse rounded-md bg-muted" />
          <div className="h-40 animate-pulse rounded-lg border border-border bg-muted/40" />
        </section>
      </div>
    </>
  );
}

/**
 * One assignment card's shape: the eyebrow, the product name, the group line,
 * the next-session line, the cadence, and the footer the Join or the venue
 * lands in. Bars where rows will be, rather than one solid block — the point of
 * a skeleton is that the page is already recognisable before it is readable.
 */
function GhostCard() {
  return (
    <div className="h-full space-y-4 rounded-lg border border-border p-5">
      <div className="space-y-2">
        <div className="h-3 w-16 animate-pulse rounded bg-muted" />
        <div className="h-5 w-3/4 animate-pulse rounded bg-muted" />
        <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
      </div>
      <div className="h-4 w-2/3 animate-pulse rounded bg-muted" />
      <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
      <div className="flex justify-center pt-2">
        <div className="h-8 w-28 animate-pulse rounded-md bg-muted" />
      </div>
    </div>
  );
}
