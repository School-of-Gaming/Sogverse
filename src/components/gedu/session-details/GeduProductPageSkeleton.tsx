import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { SessionDetailsBackLink } from "./BackLink";

/**
 * The group workspace while its two reads are in the air.
 *
 * **Shown immediately, no delay and no fade.** The feed call is a known heavy
 * one — a club's entire history in a single document, behind an assignment
 * lookup that has to resolve first — so the affordance was chosen when the
 * query was written rather than discovered by a timer that would flash on a
 * fast connection and leave the page blank on a slow one.
 *
 * **Only the back link survives the swap, and it is the one thing here that is
 * knowable without a network call.** Everything else — the product's name, the
 * group's, the notes, the timeline, the rail — is data, so it is drawn as
 * ghosts in the shape it will take and replaced wholesale. Painting a real
 * masthead early was tempting and is exactly the trap: the material button
 * arrives with the *second* read and wraps onto its own line on a phone, so an
 * early masthead would have grown a row under the reader's thumb the moment the
 * feed landed.
 *
 * The container, its width and its padding are the body's own, so the back link
 * is on the pixel it will still be on afterwards.
 */
export function GeduProductPageSkeleton() {
  const t = useTranslations("gedu.sessionDetails");

  return (
    <div className="mx-auto max-w-7xl py-6 sm:py-10">
      <SessionDetailsBackLink />
      <p role="status" className="sr-only">
        {t("loadingWorkspace")}
      </p>

      <div aria-hidden>
        {/* Masthead: eyebrow, title, identity line — same three-row stack, same
            bottom rule. */}
        <header className="mt-5 space-y-2 border-b border-border pb-5">
          <div className="h-3 w-16 animate-pulse rounded bg-muted" />
          <div className="h-8 w-72 max-w-full animate-pulse rounded-md bg-muted" />
          <div className="h-4 w-48 animate-pulse rounded bg-muted" />
        </header>

        {/* The standing-notes row. */}
        <Card className="mt-6">
          <CardContent className="space-y-3 p-4 sm:p-5">
            <div className="h-3 w-32 animate-pulse rounded bg-muted" />
            <div className="h-4 w-full animate-pulse rounded bg-muted" />
            <div className="h-4 w-4/5 animate-pulse rounded bg-muted" />
          </CardContent>
        </Card>

        <div className="mt-6 grid items-start gap-6 lg:grid-cols-3 lg:gap-8">
          {/* The timeline, on its rail, with its markers — the shape a gedu is
              looking for before a word of it is readable. */}
          <div className="min-w-0 space-y-3 border-l border-border pl-6 lg:col-span-2">
            {[0, 1, 2, 3].map((index) => (
              <div key={index} className="relative">
                <span className="absolute -left-6 top-5 h-2.5 w-2.5 -translate-x-1/2 animate-pulse rounded-full bg-muted ring-4 ring-background" />
                <GhostEntry lines={index === 0 ? 3 : 2} />
              </div>
            ))}
          </div>

          <aside className="min-w-0 space-y-4">
            <GhostRailCard rows={4} />
            <GhostRailCard rows={2} />
          </aside>
        </div>
      </div>
    </div>
  );
}

/** One session card: the date pair, then a few lines of report. */
function GhostEntry({ lines }: { lines: number }) {
  return (
    <div className="space-y-3 rounded-lg border border-border p-4 sm:p-5">
      <div className="space-y-1.5">
        <div className="h-4 w-32 animate-pulse rounded bg-muted" />
        <div className="h-3 w-24 animate-pulse rounded bg-muted" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: lines }, (_, line) => (
          <div
            key={line}
            className="h-3 animate-pulse rounded bg-muted"
            style={{ width: `${100 - line * 12}%` }}
          />
        ))}
      </div>
    </div>
  );
}

/** One rail card: its small heading, then a run of rows. */
function GhostRailCard({ rows }: { rows: number }) {
  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div className="h-3 w-24 animate-pulse rounded bg-muted" />
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="h-12 animate-pulse rounded-md bg-muted/60" />
      ))}
    </div>
  );
}
