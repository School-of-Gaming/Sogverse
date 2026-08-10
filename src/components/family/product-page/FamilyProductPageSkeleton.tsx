"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import type { SessionAudience } from "@/types";
import { FamilyProductBackLink } from "./BackLink";

/**
 * The family product page while its read is in the air.
 *
 * **Immediate, with no delay and no fade.** The affordance was picked when the
 * query was written rather than discovered at runtime: the feed RPC returns a
 * club's entire history — a term of session rows plus every write-up on them —
 * in one document, which is a perceptibly slow call by construction and
 * therefore the case that gets a structured skeleton. A timer would have been
 * wrong in both directions here, flashing on a fast connection and leaving the
 * page blank on a slow one.
 *
 * **On a direct load nobody ever sees this.** The route's server half runs the
 * same read and hydrates the answer under the hook's own key, so the first
 * frame the browser paints is the finished page. What still lands here is a
 * client-side navigation from a dashboard card, a refetch, and a prefetch that
 * failed — all three real, none of them worth leaving blank.
 *
 * **Only the back link survives the swap, and it is the one thing on the page
 * knowable without a network call.** Everything else — the product's name, the
 * child's, the schedule, the notes, every session — is data, so it is drawn as
 * ghosts in the shape it will take and replaced wholesale. Nothing here is a
 * promise about what the page will contain: a remote club will grow a Join
 * where the button ghost is and an in-person one an address instead, and
 * because neither ghost outlives the swap, neither can move anything the reader
 * was pointing at. The container, its width and its padding are the body's own,
 * so the link is on the pixel it will still be on afterwards.
 */
export function FamilyProductPageSkeleton({
  audience,
}: {
  audience: SessionAudience;
}) {
  const t = useTranslations("familyProduct");

  return (
    <div className="mx-auto max-w-3xl py-6 sm:py-10">
      <FamilyProductBackLink audience={audience} />
      <p role="status" className="sr-only">
        {t("loadingPage")}
      </p>

      <div aria-hidden>
        {/* Masthead: type eyebrow, product name, the identity lines, the
            schedule, and the affordance under them — the same stack, the same
            bottom rule. */}
        <header className="mt-5 border-b border-border pb-5">
          <div className="h-3 w-16 animate-pulse rounded bg-muted" />
          <div className="mt-2 h-8 w-80 max-w-full animate-pulse rounded-md bg-muted" />
          <div className="mt-3 h-4 w-40 animate-pulse rounded bg-muted" />
          <div className="mt-2 h-4 w-32 animate-pulse rounded bg-muted" />
          <div className="mt-4 h-4 w-56 max-w-full animate-pulse rounded bg-muted" />
          <div className="mt-4 h-10 w-44 animate-pulse rounded-md bg-muted" />
        </header>

        {/* The gedu chips. */}
        <div className="mt-5 flex items-center gap-3">
          <div className="h-3 w-14 animate-pulse rounded bg-muted" />
          <div className="h-7 w-28 animate-pulse rounded-full bg-muted" />
          <div className="h-7 w-24 animate-pulse rounded-full bg-muted" />
        </div>

        {/* The standing-notes card. */}
        <Card className="mt-5">
          <CardContent className="space-y-3 p-4 sm:p-5">
            <div className="h-3 w-32 animate-pulse rounded bg-muted" />
            <div className="h-4 w-full animate-pulse rounded bg-muted" />
            <div className="h-4 w-11/12 animate-pulse rounded bg-muted" />
            <div className="h-4 w-3/5 animate-pulse rounded bg-muted" />
          </CardContent>
        </Card>

        {/* The feed, on its rail, with its markers — the shape a family is
            scrolling towards before a word of it is readable. The first entry
            is drawn taller because the head of the past is where the report
            worth reading almost always is. */}
        <section className="mt-6">
          <div className="mb-3 h-3 w-20 animate-pulse rounded bg-muted" />
          <div className="relative space-y-3 border-l border-border pl-6">
            {[0, 1, 2, 3].map((index) => (
              <div key={index} className="relative">
                <span className="absolute -left-6 top-5 h-2.5 w-2.5 -translate-x-1/2 animate-pulse rounded-full bg-muted ring-4 ring-background" />
                <GhostEntry lines={index === 0 ? 4 : 2} />
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

/** One session card: the date pair, then a few lines of report under it. */
function GhostEntry({ lines }: { lines: number }) {
  return (
    <div className="space-y-3 rounded-lg border border-border p-4 sm:p-5">
      <div className="space-y-1.5">
        <div className="h-4 w-36 animate-pulse rounded bg-muted" />
        <div className="h-3 w-28 animate-pulse rounded bg-muted" />
      </div>
      <div className="space-y-2">
        {Array.from({ length: lines }, (_, line) => (
          <div
            key={line}
            className="h-3 animate-pulse rounded bg-muted"
            style={{ width: `${100 - line * 11}%` }}
          />
        ))}
      </div>
    </div>
  );
}
