"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import {
  BadgeCheck,
  Clock,
  FileCheck,
  FileWarning,
  IdCard,
  Scale,
} from "lucide-react";
import { StatusLine } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CertifyWithWarningsDialog } from "@/components/admin/certify-with-warnings-dialog";
import { PersonChip } from "@/components/ui/person-chip";
import { ROUTES } from "@/lib/constants/routes";
import { cn } from "@/lib/cn";
import type { GeduCertification, GeduTask } from "./admin-dashboard-data";

/**
 * The Gedus with something open for an admin, one row each, and the one
 * decision an admin makes from here.
 *
 * **There is only Certify.** A team profile waiting to be made public is said
 * on the row and decided on the Gedu's admin page, which the row already links
 * to: making a profile public means reading it first, and that page is where it
 * can be read. A Make public button here would publish what nobody looked at.
 *
 * A deferral mechanism was drafted here too — park a registration in a
 * counted, collapsed, reversible group so an obvious spam account or a
 * too-early one stops consuming attention without being forgotten — and it was
 * cut before it shipped, because the queue it was designed to relieve does not
 * exist yet. Building the relief first would have meant carrying an
 * interaction, a state and a piece of vocabulary for a pressure nobody has
 * felt; if the list ever grows a tail of rows nobody will decide about, that is
 * the moment to design for it, against the real shape of the problem rather
 * than a guess at it.
 *
 * **The write is the shell's, the ordering is this section's.** `onCertify`
 * resolves when the Gedu has actually been certified; only then does the
 * Certify leave the row. That ordering is what lets a failure be shown *on the
 * row that failed* — a list that dropped it optimistically would have nowhere
 * left to put the error, and the admin would be told nothing at all.
 *
 * **What the row shows is the source's, always.** Certifying takes the
 * certification off the Gedu's entry; the row then leaves the list when nothing
 * else is open for them, and stays with only its team profile marker when that
 * is still waiting. Neither is decided here: the list renders exactly the
 * entries it is handed, and the entry's own `certification` decides whether a
 * Certify is on it. That is a requirement on every shell rather than an
 * implementation detail of one. Live it is satisfied because the mutation
 * awaits its own invalidation, so the refetched snapshot has already dropped
 * the certification by the time the promise settles; in the preview the scene
 * holds the certified ids in React state and reshapes the entries it hands
 * down the same way, which is the same shape with a `Set` where the RPC is. A
 * shell that resolved without dropping the certification would leave the
 * button stuck at "Certifying…" for the rest of the sitting, because that flag
 * is deliberately never cleared on success.
 *
 * **The receipt lives here, beside the rows it describes.** It used to be held
 * by the attention panel a level up, for one reason: this section was mortal —
 * it was rendered only while it had rows or a receipt, so certifying the last
 * Gedu unmounted it and took the confirmation away at the moment there was most
 * to confirm. That is over. The Gedu section is permanent on the page whether
 * or not anybody is listed, so it cannot unmount out from under its own
 * receipt.
 */
export function GeduTasksList({
  gedus,
  onCertify,
}: {
  gedus: readonly GeduTask[];
  /** Certify one Gedu. Resolves once the write landed; rejects if it did not. */
  onCertify: (geduId: string) => Promise<void>;
}) {
  const t = useTranslations("admin.dashboard.gedus");
  const [certifiedIds, setCertifiedIds] = useState<ReadonlySet<string>>(
    new Set(),
  );

  /**
   * Who has been certified in this sitting, minus anybody the list is offering
   * a certification for again.
   *
   * A Gedu enters the set only once its write has landed *and* the refetch
   * behind it has returned, so an id the source still lists as uncertified is
   * not a race — it is the source saying this account is uncertified now, which
   * happens when somebody un-certifies them from the users list while this page
   * is open. Left unpruned, the receipt would go on counting them: an admin told
   * "1 certified" about somebody whose row is offering Certify again. So the
   * source wins and the receipt gives up the id.
   *
   * Only an uncertified entry prunes. A Gedu certified here whose team profile
   * is still waiting stays listed — with no certification on the entry — and
   * that is the source agreeing with the receipt, not contradicting it. An id
   * the source lists with no certification, or has stopped listing at all,
   * stays in the set for the rest of the sitting, which is what keeps the
   * confirmation on screen after the last certification.
   */
  const uncertifiedIds = new Set(
    gedus.filter((gedu) => gedu.certification !== null).map((gedu) => gedu.id),
  );
  const certified = withoutUncertified(certifiedIds, uncertifiedIds);
  if (certified !== certifiedIds) setCertifiedIds(certified);

  return (
    <div className="space-y-3">
      {/* Only rendered once something has been certified, and it is the receipt
          for an action that otherwise leaves little trace: a row simply
          vanishing, or losing its button, is easy to miss. */}
      {certified.size > 0 && (
        <p className="flex items-center gap-1.5 text-xs text-success">
          <BadgeCheck className="h-3.5 w-3.5" aria-hidden />
          {t("justNow", { count: certified.size })}
        </p>
      )}

      {gedus.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="space-y-1">
          {gedus.map((gedu) => (
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
 * `certified` less every id in `uncertified`, returning the original set
 * unchanged when there is nothing to drop — identity is what stops the state
 * adjustment above from looping.
 */
function withoutUncertified(
  certified: ReadonlySet<string>,
  uncertified: ReadonlySet<string>,
): ReadonlySet<string> {
  const kept = [...certified].filter((id) => !uncertified.has(id));
  return kept.length === certified.size ? certified : new Set(kept);
}

/**
 * One Gedu. The person is a link to their admin page; the button beside them
 * is not, which is why the row is not itself a link — a row-wide link with a
 * control inside it is a click nobody can predict the result of. The team
 * profile marker sits inside that link, because their admin page is where the
 * profile is read and made public.
 */
function GeduRow({
  gedu,
  onCertify,
}: {
  gedu: GeduTask;
  onCertify: () => Promise<void>;
}) {
  const t = useTranslations("admin.dashboard.gedus");
  const { certification } = gedu;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-border px-3 py-2">
      <Link
        href={ROUTES.admin.user(gedu.id)}
        className="-mx-1.5 -my-1 flex min-w-0 flex-1 flex-wrap items-center gap-2 rounded-md px-1.5 py-1 transition-colors hover:bg-hover"
      >
        <PersonChip id={gedu.id} name={gedu.name} />
        <span className="truncate text-xs text-muted-foreground">
          <Clock className="mr-1 inline h-3 w-3 align-[-1px]" aria-hidden />
          {t("registered", { when: gedu.registeredAgo })}
        </span>
        {certification !== null && (
          <CertificationStandings certification={certification} />
        )}
        {/* Info, the status that asks for attention without saying anything is
            wrong: a profile waiting to go public is something to get to, not a
            problem, and the warning colour on this row belongs to the standings
            an admin is certifying against. The profile's own status panel on
            the user page shows the same waiting state in info. */}
        {gedu.teamProfileAwaitingReview && (
          <span className="flex shrink-0 items-center gap-1 text-xs text-info">
            <IdCard className="h-3 w-3" aria-hidden />
            {t("profileReady")}
          </span>
        )}
      </Link>
      {certification !== null && (
        <CertifyControl certification={certification} onCertify={onCertify} />
      )}
    </div>
  );
}

/**
 * The other two halves of what an admin is deciding on, at the density the
 * rest of the row reads at: one glyph and a few words each. Each subject keeps
 * its own glyph — a shield is certification, a mail check is a confirmed
 * address, a document is a signature, a pair of scales is the record check and
 * an ID card is the team profile — and no glyph ever stands for two of them.
 * The scales replaced a clipboard pair that was too close to the document at
 * this size to tell apart in a scanned column; they are a different shape
 * family and read "law" cold. One glyph covers both states here, as it does on
 * every other surface — the colour and the words carry the standing. Only the
 * missing state is tinted, because it is the one worth catching an eye that is
 * scanning a column of rows.
 *
 * They keep their full width and take a line of their own when the row runs
 * out of room — the desk layout puts everything on one line, and at 360 in the
 * longest locale the standings drop below the name rather than shrinking the
 * row past the viewport. Truncating a standing to "Sopimusta ei…" would leave
 * the admin reading half of a fact they are deciding on.
 */
function CertificationStandings({
  certification,
}: {
  certification: GeduCertification;
}) {
  const contract = useTranslations("admin.geduContract");
  const check = useTranslations("admin.geduCriminalRecordCheck");
  const acceptedOn = certification.contractAcceptedOn;
  const checkedOn = certification.criminalRecordCheckOn;

  return (
    <>
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
        <Scale className="h-3 w-3" aria-hidden />
        {checkedOn === null
          ? check("queueNotRecorded")
          : check("queueRecorded", { date: checkedOn })}
      </span>
    </>
  );
}

/**
 * The Certify button, its failure line and its confirmation — mounted only
 * while the Gedu's entry carries a certification.
 *
 * **`committing` is set synchronously before the write starts and is never
 * cleared on success**, because on success this control is about to go: the
 * refetch behind the resolved promise drops the certification from the entry,
 * and with it this control, whether the row leaves the list or stays for a
 * waiting team profile. Clearing the flag first would re-enable the button for
 * the frame between the write landing and the control unmounting, which is
 * exactly long enough for a second click to certify somebody twice. It is
 * cleared only where the admin has something left to do — a failed write,
 * where the button stays and has to be retried.
 *
 * The state lives here rather than on the row because the row can outlive a
 * certification. Held on the row, a Gedu certified here and then un-certified
 * from the users list while the page is open would get their Certify back
 * still reading "Certifying…"; held here, it unmounts with the certification
 * and comes back fresh.
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
function CertifyControl({
  certification,
  onCertify,
}: {
  certification: GeduCertification;
  onCertify: () => Promise<void>;
}) {
  const t = useTranslations("admin.dashboard.gedus");
  const [committing, setCommitting] = useState(false);
  const [failed, setFailed] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const contractMissing = certification.contractAcceptedOn === null;
  const checkMissing = certification.criminalRecordCheckOn === null;

  function certify() {
    setCommitting(true);
    setFailed(false);
    void onCertify().catch(() => {
      setCommitting(false);
      setFailed(true);
    });
  }

  function handleCertify() {
    if (contractMissing || checkMissing) {
      setConfirming(true);
      return;
    }
    certify();
  }

  return (
    <>
      {/* Only rendered once a write has failed, and it takes the full row width
          so it lands under the button rather than squeezing the name beside it.
          Nothing reserves space for it: before the first failure there is
          nothing here to move, and the row it appears in is one the admin just
          acted on. */}
      {failed && (
        <StatusLine status="destructive" size="xs" className="order-last w-full">
          {t("failed")}
        </StatusLine>
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
        contractMissing={contractMissing}
        criminalRecordCheckMissing={checkMissing}
      />
    </>
  );
}
