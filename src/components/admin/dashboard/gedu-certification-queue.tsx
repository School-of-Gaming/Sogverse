"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { BadgeCheck, Clock, FileCheck, FileWarning } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { PersonChip } from "@/components/ui/person-chip";
import { ROUTES } from "@/lib/constants";
import { cn } from "@/lib/utils";
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
 * **The write is the shell's, the receipt is the panel's, and the ordering is
 * this section's.** `onCertify` resolves when the row has actually been
 * certified; only then is `onCertified` called, the row leaves the list and the
 * counted line above it moves. That ordering is what lets a failure be shown *on
 * the row that failed* — a queue that removed the row optimistically would have
 * nowhere left to put the error, and the admin would be told nothing at all. In
 * the preview the callback resolves immediately and writes nothing, so a reload
 * restores every row.
 *
 * The certified set is a *prop* rather than state here because this section is
 * mortal: it is unmounted the moment the queue it renders runs out of rows,
 * which is precisely when the receipt matters most. The panel above owns the
 * set and keeps this section mounted while it is non-empty.
 */
export function GeduCertificationQueue({
  gedus,
  certified,
  onCertify,
  onCertified,
}: {
  gedus: readonly UncertifiedGedu[];
  /** Who has been certified in this sitting — owned by the panel above. */
  certified: ReadonlySet<string>;
  /** Certify one gedu. Resolves once the write landed; rejects if it did not. */
  onCertify: (geduId: string) => Promise<void>;
  /** Called once a certification has actually landed. */
  onCertified: (geduId: string) => void;
}) {
  const t = useTranslations("admin.dashboard.certification");

  const waiting = gedus.filter((gedu) => !certified.has(gedu.id));

  return (
    <section aria-label={t("label")} className="space-y-3">
      <h3 className="flex items-baseline gap-2 text-sm font-semibold">
        {t("heading")}
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
          {t("justNow", { count: certified.size })}
        </p>
      )}

      {waiting.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="space-y-1">
          {waiting.map((gedu) => (
            <li key={gedu.id}>
              <GeduRow
                gedu={gedu}
                onCertify={() =>
                  onCertify(gedu.id).then(() => {
                    onCertified(gedu.id);
                  })
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
 *
 * **`committing` is set synchronously before the write starts and is never
 * cleared on success**, because on success this row is about to disappear: the
 * queue drops it the moment the promise resolves, and the refetch behind it
 * drops it again from the source list. Clearing the flag first would re-enable
 * the button for the frame between the write landing and the row unmounting,
 * which is exactly long enough for a second click to certify somebody twice. It
 * is cleared only where the admin has something left to do — a failed write,
 * where the row stays and has to be retried.
 *
 * **A candidate who has not accepted the contract in force is certified over a
 * confirmation, and the flag is set inside the confirm rather than at the first
 * click.** Opening a dialog promises nothing, so there is nothing to hold the
 * button disabled for while it is up; the click that *does* promise the write is
 * the one in the dialog, and `ConfirmDialog` runs `onConfirm` before it closes
 * itself, so the flag is live in the same tick the dialog goes away. Nothing is
 * gated on the answer — acceptance blocks nobody — the admin is only asked to
 * say they meant it.
 */
function GeduRow({
  gedu,
  onCertify,
}: {
  gedu: UncertifiedGedu;
  onCertify: () => Promise<void>;
}) {
  const t = useTranslations("admin.dashboard.certification");
  const contract = useTranslations("admin.geduContract");
  const [committing, setCommitting] = useState(false);
  const [failed, setFailed] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const acceptedOn = gedu.contractAcceptedOn;

  function certify() {
    setCommitting(true);
    setFailed(false);
    void onCertify().catch(() => {
      setCommitting(false);
      setFailed(true);
    });
  }

  function handleCertify() {
    if (acceptedOn === null) {
      setConfirming(true);
      return;
    }
    certify();
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-border px-3 py-2">
      <Link
        href={ROUTES.admin.user(gedu.id)}
        className="flex min-w-0 flex-1 flex-wrap items-center gap-2 rounded-md transition-opacity hover:opacity-80"
      >
        <PersonChip id={gedu.id} name={gedu.name ?? t("unnamed")} />
        <span className="truncate text-xs text-muted-foreground">
          <Clock className="mr-1 inline h-3 w-3 align-[-1px]" aria-hidden />
          {t("registered", { when: gedu.registeredAgo })}
        </span>
        {/* The other half of what an admin is deciding on, at the density the
            rest of the row reads at: one glyph and a few words. The document
            glyph is its own — a shield is certification and a mail check is a
            confirmed address, and neither may stand for a signature. Only the
            unsigned state is tinted, because it is the one worth catching an eye
            that is scanning a column of rows.

            It keeps its full width and takes a line of its own when the row runs
            out of room — the desk layout puts all three on one line, and at 360
            in the longest locale ("Sopimusta ei ole hyväksytty") the standing
            drops below the name rather than shrinking the row past the viewport.
            Truncating a contract standing to "Sopimusta ei…" would leave the
            admin reading half of the fact they are deciding on. */}
        <span
          className={cn(
            "flex shrink-0 items-center gap-1 text-xs",
            acceptedOn === null ? "text-warning" : "text-muted-foreground",
          )}
        >
          {acceptedOn === null ? (
            <FileWarning className="h-3 w-3" aria-hidden />
          ) : (
            <FileCheck className="h-3 w-3" aria-hidden />
          )}
          {acceptedOn === null
            ? contract("queueNotAccepted")
            : contract("queueAccepted", { date: acceptedOn })}
        </span>
      </Link>
      {/* Only rendered once a write has failed, and it takes the full row width
          so it lands under the button rather than squeezing the name beside it.
          Nothing reserves space for it: before the first failure there is
          nothing here to move, and the row it appears in is one the admin just
          acted on. */}
      {failed && (
        <p className="order-last w-full text-xs text-destructive">
          {t("failed")}
        </p>
      )}
      <Button
        type="button"
        size="sm"
        onClick={handleCertify}
        disabled={committing}
      >
        {committing ? t("certifying") : t("certify")}
      </Button>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={contract("confirmTitle")}
        description={contract("confirmBody")}
        confirmLabel={contract("confirmAction")}
        // Not destructive: certifying an unsigned educator is a supported
        // outcome the admin is being asked to register, not damage they are
        // being warned off. A red button would say the opposite of the copy.
        confirmVariant="default"
        onConfirm={certify}
      />
    </div>
  );
}
