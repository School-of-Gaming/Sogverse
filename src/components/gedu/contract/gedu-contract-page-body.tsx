"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  BadgeCheck,
  ClipboardCheck,
  ClipboardX,
  FileSignature,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ROUTES } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import { useTimezone } from "@/providers";
import type { GeduCriminalRecordCheck } from "@/services/gedu/gedu-profiles.service";
import type { GeduContractAcceptance } from "@/types";
import type { GeduContractDocument } from "./contract-document";
import { GeduContractDocumentView } from "./gedu-contract-document-view";
import { GeduContractSigningDialog } from "./gedu-contract-signing-dialog";

/**
 * The `/gedu/contract` page body — the terms, and the panel that turns reading
 * them into a record.
 *
 * Presentational end to end: it takes the document, the acceptance (or the
 * absence of one) and one action, so the live route and a preview scene render
 * the same page with the write wired in one case and inert in the other. The
 * committing flag and the failure flag are the host's, because the write is,
 * and both have to be live *before* the first render after the click.
 *
 * **Capped at the reading measure, not at the desk.** Gedu surfaces are
 * desktop-default and are told to use their width — but the thing on this page
 * is a contract, and a legal clause set across a monitor is a clause nobody
 * finishes. The document view caps itself at the same measure regardless, so a
 * wider page could only put the panel out of line with the text it is about.
 */
export function GeduContractPageBody({
  contract,
  acceptance,
  criminalRecordCheck,
  signerName,
  committing,
  acceptFailed,
  onSignOpen,
  onAccept,
}: {
  contract: GeduContractDocument;
  /**
   * This gedu's criminal record check standing, or `null` where the server read
   * failed and it is therefore unknown.
   *
   * It is a prop rather than a query because it has to be settled before the
   * first paint: the section sits above the terms, and one that arrived a
   * hydration later would push a document somebody had already started reading
   * down the page. `null` renders the explanation with no status line — the
   * process is worth stating either way, and a standing is not.
   */
  criminalRecordCheck: GeduCriminalRecordCheck | null;
  /**
   * This gedu's acceptance of the version on screen — of either of its equally
   * binding languages, which is why the host matches on the base version: the
   * row when they have signed it, `null` when they have not, and `undefined`
   * while the answer is still in flight — which happens only when the server
   * prefetch failed, since the ordinary visit paints with the answer already in
   * hand.
   */
  acceptance: GeduContractAcceptance | null | undefined;
  /** The signer's name, as the signature line will draw it. */
  signerName: string;
  committing: boolean;
  acceptFailed: boolean;
  /**
   * The ceremony is opening. The host's failure flag outlives the dialog that
   * raised it, so this is where it gets cleared — a reopened ceremony must not
   * start under the last attempt's error.
   */
  onSignOpen: () => void;
  onAccept: () => void;
}) {
  const t = useTranslations("gedu.contract");
  const locale = useLocale();
  const timeZone = useTimezone();
  const [signing, setSigning] = useState(false);

  return (
    <div className="mx-auto max-w-3xl space-y-8 pb-24">
      <Link
        href={ROUTES.gedu.dashboard}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t("back")}
      </Link>

      <header className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">{t("pageTitle")}</h1>
        <p className="text-muted-foreground">{t("intro")}</p>
      </header>

      {/* The second thing that has to happen before an educator is certified,
          and it is here rather than on a page of its own because there is
          nothing to *do* about it on the platform: the extract is obtained by
          the educator from the Legal Register Centre and shown to us in person.
          What this section is for is telling them that, and telling them where
          they stand.

          Above the terms rather than below the signing panel, because it is the
          one block on this page whose content is fully decided by the server:
          the panel beneath can still arrive a beat late when its prefetch
          failed, and anything under it would be pushed down when it does. */}
      <CriminalRecordCheckSection standing={criminalRecordCheck} />

      {/* The document draws its own h1 — the contract's own title, which is not
          this page's title and must not be reworded into one. */}
      <GeduContractDocumentView document={contract} />

      {/* The panel is the page's one action, so it sits under the text it is
          about rather than floating over it: a signature that can be given
          without scrolling past the terms is a signature given without reading
          them. */}
      <div className="pt-4">
        {acceptance === undefined ? (
          // The prefetch failed and the browser is asking again — a keyed read
          // of a bounded set, so it lands in a frame or two and gets no
          // affordance at all. Nothing below it can be pushed down: this is the
          // last thing on the page.
          <div />
        ) : acceptance === null ? (
          <Card>
            {/* Centred: the panel is a single invitation, and under a column of
                left-set legal text a centred close is what reads as "the
                document ends here; this is what you do about it". */}
            <CardContent className="space-y-4 p-6 text-center">
              <p className="text-sm text-muted-foreground">{t("acceptLead")}</p>
              <Button
                size="lg"
                onClick={() => {
                  onSignOpen();
                  setSigning(true);
                }}
              >
                <FileSignature className="h-4 w-4" />
                {t("acceptCta")}
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-success/40 bg-success/5">
            <CardContent className="space-y-4 p-6">
              <p className="flex items-center gap-2 font-medium text-success">
                <BadgeCheck className="h-5 w-5 shrink-0" aria-hidden />
                {t("acceptedTitle")}
              </p>
              {/* The name as it stood when it was signed — a snapshot on the
                  row, never today's profile name — drawn the way it was put on
                  the line. */}
              <p className="font-cursive text-3xl leading-none sm:text-4xl">
                {acceptance.signed_name}
              </p>
              {/* The version and the moment in one string, because which of
                  the two comes first and what separates them is a sentence a
                  translator has to be able to write. The version is the stored
                  one, verbatim — `2026-2027/fi` says which of the two equally
                  binding texts was signed, and trimming it back to the base
                  would delete half of what the record is for. */}
              <p className="text-sm text-muted-foreground">
                {t("acceptedMeta", {
                  version: acceptance.contract_version,
                  date: formatDate(acceptance.accepted_at, locale, {
                    dateStyle: "long",
                    timeZone,
                  }),
                })}
              </p>
              {/* The reader who just signed is at the foot of a long document;
                  the way back belongs where the errand ended, not only at the
                  top of the page they'd have to scroll to. Same key as the top
                  link — one phrase, one destination. */}
              <Link
                href={ROUTES.gedu.dashboard}
                className="inline-flex items-center gap-1.5 pt-1 text-sm font-medium transition-colors hover:text-success"
              >
                <ArrowLeft className="h-4 w-4" />
                {t("back")}
              </Link>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Only while open, so every opening starts from an unsigned line — and
          from a clean failure flag, which the host clears as this opens. The
          `acceptance === null` half is the success path's close: the write
          lands, the refetched row arrives, and the ceremony unmounts over the
          record card it produced. `signing` alone cannot do that — it is this
          component's own state and no success handler reaches it — which is
          also why the committing flag is never cleared on success: the unmount
          is what retires it. */}
      {signing && acceptance === null && (
        <GeduContractSigningDialog
          signerName={signerName}
          committing={committing}
          acceptFailed={acceptFailed}
          onAccept={onAccept}
          onClose={() => setSigning(false)}
        />
      )}
    </div>
  );
}

/**
 * The criminal record extract: what the educator has to do about it, and
 * whether it has been done.
 *
 * **The explanation is unconditional and the standing is not.** How the process
 * works — you obtain the extract yourself, it must be under six months old when
 * you present it, we keep no copy — is true whatever we happen to know about
 * this reader, and it is the part that answers the question somebody arriving
 * here actually has. The standing is a claim about *them*, so it is made only
 * when the read behind it landed: `null` prints no line rather than a
 * reassuring or an alarming guess.
 *
 * **"We keep no copy" is stated to the person it protects.** It is the reason
 * the platform has no upload button and no field to type a reference into, and
 * an educator handing over a document about their own criminal history is
 * exactly who is owed that sentence.
 */
function CriminalRecordCheckSection({
  standing,
}: {
  standing: GeduCriminalRecordCheck | null;
}) {
  const t = useTranslations("gedu.criminalRecordCheck");
  const locale = useLocale();
  const timeZone = useTimezone();

  return (
    <section className="space-y-3 rounded-lg border border-border p-5">
      <h2 className="text-lg font-semibold">{t("title")}</h2>
      <p className="text-sm text-muted-foreground">{t("howItWorks")}</p>
      <p className="text-sm text-muted-foreground">{t("noCopyKept")}</p>
      {standing === null ? null : standing.passed ? (
        <p className="flex items-center gap-2 text-sm font-medium text-success">
          <ClipboardCheck className="h-4 w-4 shrink-0" aria-hidden />
          {standing.recordedAt
            ? t("recordedOn", {
                date: formatDate(standing.recordedAt, locale, {
                  dateStyle: "long",
                  timeZone,
                }),
              })
            : t("recorded")}
        </p>
      ) : (
        // Informational rather than alarming: nothing is broken and nothing is
        // taken away — the check gates none of this account's access — it is a
        // thing still owed, which is the same register the dashboard's
        // next-step band uses for it.
        <p className="flex items-center gap-2 text-sm font-medium text-warning">
          <ClipboardX className="h-4 w-4 shrink-0" aria-hidden />
          {t("stillNeeded")}
        </p>
      )}
    </section>
  );
}
