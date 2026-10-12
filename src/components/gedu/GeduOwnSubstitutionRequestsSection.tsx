"use client";

import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { OwnSubstitutionRequestPanel } from "@/components/session-substitution/OwnSubstitutionRequestPanel";
import { SubstitutionSessionFacts } from "@/components/session-substitution/SubstitutionSessionFacts";
import type { OwnSubstitutionRequestRow } from "@/lib/gedu-own-substitution-requests";
import { useNow } from "@/providers";

/**
 * **Your requests** — the absences this gedu has filed that are still live, one
 * card each, above the pool *(owner, 2026-10)*.
 *
 * A gedu who has asked for a substitute comes back to this page to see whether
 * anybody is coming, and the answer was otherwise only on the session card in
 * the group's feed. So each card is the session, described by the shared
 * session facts, and **the very status panel the session card draws** — waiting
 * or who is substituting, how many have offered, and the Withdraw — rendered by
 * the same component, so the two surfaces cannot disagree about a request.
 *
 * **The topic and the language are left off**, as on a sub's own card: these
 * are the reader's own sessions, which they took knowing both. How soon is
 * stated plainly and never as a warning, because the panel below it already
 * wears the warning while the seat is open — two in one card would be the same
 * news shouted twice.
 *
 * The page decides whether there is a section at all and draws its heading;
 * this is the grid under it, in the same tiling as the pool beneath.
 */
export function GeduOwnSubstitutionRequestsSection({
  rows,
  onWithdraw,
}: {
  /** The live requests worth a card, soonest first. Never empty here. */
  rows: readonly OwnSubstitutionRequestRow[];
  /**
   * Take an open request back. **Resolves only once the page has been read
   * again**: the panel's confirm holds until then, and closes on a card that
   * is already gone.
   */
  onWithdraw: (requestId: string) => Promise<void>;
}) {
  const p = useTranslations("productType");
  const now = useNow();

  return (
    <div className="grid items-stretch gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {rows.map((row) => (
        <Card key={row.requestId} className="h-full">
          <CardContent className="flex h-full flex-col gap-3 p-5">
            <div className="min-w-0 space-y-1">
              <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                {p(row.session.productType)}
              </p>
              <p className="text-base font-semibold leading-tight">
                {row.session.productName}
              </p>
              <p className="text-sm text-muted-foreground">{row.groupName}</p>
            </div>

            <SubstitutionSessionFacts
              facts={row.session}
              variant="card"
              howSoon={{ now, urgent: false }}
              tags={false}
            />

            {/* At the foot, where the pool's cards carry their answer, so the
                two grids line their actions up. */}
            <div className="mt-auto pt-1">
              <OwnSubstitutionRequestPanel
                request={row.request}
                onWithdraw={onWithdraw}
              />
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
