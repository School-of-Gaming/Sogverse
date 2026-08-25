"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, BadgeCheck, FileSignature } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ROUTES } from "@/lib/constants";
import { formatDate } from "@/lib/utils";
import { useTimezone } from "@/providers";
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
  signerName,
  committing,
  acceptFailed,
  onSignOpen,
  onAccept,
}: {
  contract: GeduContractDocument;
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
