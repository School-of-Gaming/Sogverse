"use client";

import { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import {
  BadgeCheck,
  ClipboardCheck,
  ClipboardX,
  Clock,
  FileCheck,
  FileWarning,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { CertifyWithWarningsDialog } from "@/components/admin/certify-with-warnings-dialog";
import { PersonChip } from "@/components/ui/person-chip";
import { ROUTES } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { UncertifiedGedu } from "./admin-dashboard-data";

/**
 * The gedu accounts not yet certified, and the one decision an admin makes about
 * them.
 *
 * **There is only Certify.** A deferral mechanism was drafted here — park a
 * registration in a counted, collapsed, reversible group so an obvious spam
 * account or a too-early one stops consuming attention without being forgotten
 * — and it was cut before it shipped, because the queue it was designed to
 * relieve does not exist yet. Building the relief first would have meant
 * carrying an interaction, a state and a piece of vocabulary for a pressure
 * nobody has felt; if the list ever grows a tail of rows nobody will decide
 * about, that is the moment to design for it, against the real shape of the
 * problem rather than a guess at it.
 *
 * **The write is the shell's, the ordering is this section's.** `onCertify`
 * resolves when the row has actually been certified; only then does the row
 * leave the list. That ordering is what lets a failure be shown *on the row that
 * failed* — a list that removed the row optimistically would have nowhere left
 * to put the error, and the admin would be told nothing at all.
 *
 * **A row leaves only when both halves agree: the promise resolves, and the
 * list stops offering that id.** The second half is the pruning below, and it is
 * a requirement on every shell rather than an implementation detail of one. Live
 * it is satisfied because the mutation awaits its own invalidation, so the
 * refetched snapshot has already dropped the id by the time the promise settles;
 * in the preview the scene holds the certified ids in React state and filters
 * them out of the list it hands down, which is the same shape with a `Set` where
 * the RPC is. A shell that resolved without dropping the id would leave the row
 * on screen with its button stuck at "Certifying…" for the rest of the sitting,
 * because that flag is deliberately never cleared on success.
 *
 * **The receipt lives here now, and that is a simplification.** It used to be
 * held by the attention panel a level up, for one reason: this section was
 * mortal — it was rendered only while it had rows or a receipt, so certifying
 * the last gedu unmounted it and took the confirmation away at the moment there
 * was most to confirm. That is over. Certification is its own permanent section
 * on the page whether or not anybody is waiting, so it cannot unmount out from
 * under its own receipt, and the state belongs beside the rows it describes.
 */
export function GeduCertificationQueue({
  gedus,
  onCertify,
}: {
  gedus: readonly UncertifiedGedu[];
  /** Certify one gedu. Resolves once the write landed; rejects if it did not. */
  onCertify: (geduId: string) => Promise<void>;
}) {
  const t = useTranslations("admin.dashboard.certification");
  const [certifiedIds, setCertifiedIds] = useState<ReadonlySet<string>>(
    new Set(),
  );

  /**
   * Who has been certified in this sitting, minus anybody the list is offering
   * again.
   *
   * A row enters the set only once its write has landed *and* the refetch behind
   * it has returned, so an id in both places is not a race — it is the source
   * saying this account is uncertified now, which happens when somebody
   * un-certifies them from the users list while this page is open. Left
   * unpruned, that row would be filtered out of the list by a receipt for a fact
   * that is no longer true, and still counted in the line above it: an admin
   * told "1 certified" about somebody who is not, with no row to act on. So the
   * source wins, the receipt gives up the id, and the row comes back.
   *
   * An id the source has stopped offering stays in the set for the rest of the
   * sitting, which is what keeps the confirmation on screen after the last
   * certification.
   */
  const waitingIds = new Set(gedus.map((gedu) => gedu.id));
  const certified = withoutWaiting(certifiedIds, waitingIds);
  if (certified !== certifiedIds) setCertifiedIds(certified);

  const waiting = gedus.filter((gedu) => !certified.has(gedu.id));

  return (
    <div className="space-y-3">
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
                    setCertifiedIds((current) => new Set(current).add(gedu.id));
                  })
                }
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * `certified` less every id in `waiting`, returning the original set unchanged
 * when there is nothing to drop — identity is what stops the state adjustment
 * above from looping.
 */
function withoutWaiting(
  certified: ReadonlySet<string>,
  waiting: ReadonlySet<string>,
): ReadonlySet<string> {
  const kept = [...certified].filter((id) => !waiting.has(id));
  return kept.length === certified.size ? certified : new Set(kept);
}

/**
 * One row. The person is a link to their admin page; the button beside them is
 * not, which is why the row is not itself a link — a row-wide link with a
 * control inside it is a click nobody can predict the result of.
 *
 * **`committing` is set synchronously before the write starts and is never
 * cleared on success**, because on success this row is about to disappear: the
 * list drops it the moment the promise resolves, and the refetch behind it drops
 * it again from the source list. Clearing the flag first would re-enable the
 * button for the frame between the write landing and the row unmounting, which
 * is exactly long enough for a second click to certify somebody twice. It is
 * cleared only where the admin has something left to do — a failed write, where
 * the row stays and has to be retried.
 *
 * **A candidate missing either standing is certified over a confirmation, and
 * the flag is set inside the confirm rather than at the first click.** Opening
 * a dialog promises nothing, so there is nothing to hold the button disabled
 * for while it is up; the click that *does* promise the write is the one in the
 * dialog, and `ConfirmDialog` runs `onConfirm` before it closes itself, so the
 * flag is live in the same tick the dialog goes away. Nothing is gated on the
 * answer — neither acceptance nor the record check blocks anybody — the admin
 * is only asked to say they meant it.
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
  const check = useTranslations("admin.geduCriminalRecordCheck");
  const [committing, setCommitting] = useState(false);
  const [failed, setFailed] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const acceptedOn = gedu.contractAcceptedOn;
  const checkedOn = gedu.criminalRecordCheckOn;

  function certify() {
    setCommitting(true);
    setFailed(false);
    void onCertify().catch(() => {
      setCommitting(false);
      setFailed(true);
    });
  }

  function handleCertify() {
    if (acceptedOn === null || checkedOn === null) {
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
        {/* The other two halves of what an admin is deciding on, at the density
            the rest of the row reads at: one glyph and a few words each. Each
            subject keeps its own glyph — a shield is certification, a mail
            check is a confirmed address, a document is a signature and a
            clipboard is the record check — and no glyph ever stands for two of
            them. Only the missing state is tinted, because it is the one worth
            catching an eye that is scanning a column of rows.

            They keep their full width and take a line of their own when the row
            runs out of room — the desk layout puts everything on one line, and
            at 360 in the longest locale the standings drop below the name
            rather than shrinking the row past the viewport. Truncating a
            standing to "Sopimusta ei…" would leave the admin reading half of a
            fact they are deciding on. */}
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
        <span
          className={cn(
            "flex shrink-0 items-center gap-1 text-xs",
            checkedOn === null ? "text-warning" : "text-muted-foreground",
          )}
        >
          {checkedOn === null ? (
            <ClipboardX className="h-3 w-3" aria-hidden />
          ) : (
            <ClipboardCheck className="h-3 w-3" aria-hidden />
          )}
          {checkedOn === null
            ? check("queueNotRecorded")
            : check("queueRecorded", { date: checkedOn })}
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

      <CertifyWithWarningsDialog
        open={confirming}
        onOpenChange={setConfirming}
        onConfirm={certify}
        contractMissing={acceptedOn === null}
        criminalRecordCheckMissing={checkedOn === null}
      />
    </div>
  );
}
