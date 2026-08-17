/* eslint-disable i18next/no-literal-string -- design-mock phase; see the note on
   `product-attention-grid.tsx`. */
"use client";

import { useState } from "react";
import Link from "next/link";
import { BadgeCheck, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PersonChip } from "@/components/ui/person-chip";
import { ROUTES } from "@/lib/constants";
import type { UncertifiedGedu } from "./admin-dashboard-data";

/**
 * The gedu accounts waiting on a decision, and the one decision an admin makes
 * about them.
 *
 * It sits below the products grid rather than inside it because a gedu is not a
 * product's problem — the same person may be waiting whether or not any product
 * needs anything — and because it is the one part of this page where the admin
 * acts *here* instead of following a link somewhere to act.
 *
 * **There is only Certify.** A deferral mechanism was drafted here — park a
 * registration in a counted, collapsed, reversible group so an obvious spam
 * account or a too-early one stops consuming attention without being forgotten
 * — and it was cut before it shipped, because the queue it was designed to
 * relieve does not exist yet. Building the relief first would have meant
 * carrying an interaction, a state and a piece of vocabulary for a pressure
 * nobody has felt; if the queue ever grows a tail of rows nobody will decide
 * about, that is the moment to design for it, against the real shape of the
 * problem rather than a guess at it.
 *
 * In the preview the action is pure local state — nothing is written, and a
 * reload restores every row.
 */
export function GeduCertificationQueue({
  gedus,
}: {
  gedus: readonly UncertifiedGedu[];
}) {
  const [certified, setCertified] = useState<ReadonlySet<string>>(new Set());

  const waiting = gedus.filter((gedu) => !certified.has(gedu.id));

  return (
    <section aria-label="Gedus awaiting certification" className="space-y-3">
      <h3 className="flex items-baseline gap-2 text-sm font-semibold">
        Awaiting certification
        <span className="text-xs font-normal text-muted-foreground">
          {waiting.length}
        </span>
      </h3>

      {/* Only rendered once something has been certified, and it is the receipt
          for an action that otherwise leaves no trace: a row simply vanishing is
          indistinguishable from a row that was never there. */}
      {certified.size > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-success">
          <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
          {certified.size} certified just now
        </p>
      )}

      {waiting.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Nobody is waiting on a certification decision.
        </p>
      ) : (
        <ul className="space-y-1">
          {waiting.map((gedu) => (
            <li key={gedu.id}>
              <GeduRow
                gedu={gedu}
                onCertify={() =>
                  setCertified((current) => new Set(current).add(gedu.id))
                }
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * One row. The person is a link to their admin page; the button beside them is
 * not, which is why the row is not itself a link — a row-wide link with a
 * control inside it is a click nobody can predict the result of.
 */
function GeduRow({
  gedu,
  onCertify,
}: {
  gedu: UncertifiedGedu;
  onCertify: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-border px-3 py-2">
      <Link
        href={ROUTES.admin.user(gedu.id)}
        className="flex min-w-0 flex-1 items-center gap-2 rounded-md transition-opacity hover:opacity-80"
      >
        <PersonChip id={gedu.id} name={gedu.name} />
        <span className="truncate text-xs text-muted-foreground">
          <Clock className="mr-1 inline h-3 w-3 align-[-1px]" aria-hidden />
          {gedu.registered}
        </span>
      </Link>
      <Button type="button" size="sm" onClick={onCertify}>
        Certify
      </Button>
    </div>
  );
}
