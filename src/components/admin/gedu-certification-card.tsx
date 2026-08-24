"use client";

/**
 * Admin control to certify / de-certify a gedu, shown on the gedu's
 * /admin/users/[id] page. A self-registered gedu starts uncertified and can't be
 * assigned to a product group until an admin certifies them here (the assignment
 * picker greys out uncertified gedus).
 *
 * Seeded with a server-fetched `initial` row so it paints complete on first
 * frame; the mutation invalidates the query so the stamped certified_at / admin
 * refresh after a toggle.
 *
 * **"Certified", never "verified".** The two words name different things on this
 * platform: certification is an admin's judgement about a person, and
 * verification is a claim about an email address that its own recipient
 * confirmed. They can appear on the same account and mean nothing about each
 * other.
 *
 * **The contract standing lives in this card rather than beside it**, because it
 * is not a second subject — it is the other half of the one decision this card
 * exists for. An admin certifying an educator wants to know whether that
 * educator has signed the terms they will be working under, and a fact that
 * informs an action belongs above the button rather than in a card the reader
 * has to go and find. It gates nothing (see `services/gedu/CLAUDE.md`):
 * certification stays the platform's only blocking lever, and an unsigned gedu
 * is certifiable — over a confirmation.
 */

import { useState } from "react";
import {
  FileCheck,
  FileWarning,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CertifyWithoutContractDialog } from "@/components/admin/certify-without-contract-dialog";
import { GEDU_CONTRACT_CURRENT_VERSION } from "@/components/gedu/contract/documents";
import {
  useGeduContractAcceptances,
  useGeduProfile,
  useSetGeduCertified,
  type GeduCertification,
} from "@/services/gedu";
import { useTimezone } from "@/providers";
import type { GeduContractAcceptance } from "@/types";
import { formatDate } from "@/lib/utils";

interface GeduCertificationCardProps {
  geduId: string;
  initial: GeduCertification | null;
  /**
   * The gedu's acceptances, newest first, fetched alongside `initial` — or
   * `null` where that read failed. It seeds the very cache entry the hook reads,
   * so the standing below is on screen in the first frame rather than a
   * hydration later.
   */
  initialAcceptances: GeduContractAcceptance[] | null;
}

export function GeduCertificationCard({
  geduId,
  initial,
  initialAcceptances,
}: GeduCertificationCardProps) {
  const t = useTranslations("admin.users.certification");
  const ct = useTranslations("admin.geduContract");
  const locale = useLocale();
  const timeZone = useTimezone();
  const { data } = useGeduProfile(geduId, { initialData: initial });
  const { data: acceptances } = useGeduContractAcceptances(geduId, {
    initialData: initialAcceptances ?? undefined,
  });
  const setCertified = useSetGeduCertified();
  const [committing, setCommitting] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const certified = data?.certified ?? false;
  const certifierName = data?.certifier
    ? [data.certifier.first_name, data.certifier.last_name].filter(Boolean).join(" ")
    : null;

  /**
   * The acceptance of the version in force, and the newest acceptance of any
   * version. They are the same row in the ordinary case and differ in exactly
   * one: an educator who signed last year's terms and has not signed this
   * year's. That case reads as *not accepted* — the question is standing under
   * the terms in force today — while still showing what they did sign, because a
   * signature is not made untrue by a new version being published.
   *
   * `undefined` is "not answered yet", which with the server seed above only
   * arises when that fetch failed.
   */
  const current =
    acceptances === undefined
      ? undefined
      : (acceptances.find(
          (row) => row.contract_version === GEDU_CONTRACT_CURRENT_VERSION,
        ) ?? null);
  const previous =
    acceptances === undefined
      ? undefined
      : acceptances.length > 0
        ? acceptances[0]
        : null;

  function certify(next: boolean) {
    // Live before any render after the click, and cleared only once the write
    // has settled: this button stays on the page through both outcomes, so
    // there is no unmount to hand the flag off to.
    setCommitting(true);
    void setCertified
      .mutateAsync({ geduId, certified: next })
      // The failure is already on screen as `setCertified.isError`; catching it
      // here only stops the rejection escaping as an unhandled one.
      .catch(() => {})
      .finally(() => setCommitting(false));
  }

  function handleToggle() {
    // De-certifying never asks, and neither does certifying somebody who has
    // signed. An unanswered read does not ask either: the dialog states as fact
    // that this educator has not accepted the terms, and it must not say that on
    // the strength of a read that did not land.
    if (!certified && current === null) {
      setConfirming(true);
      return;
    }
    certify(!certified);
  }

  const busy = committing || setCertified.isPending;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          {/* The same mark the users list puts on a certified gedu, so one
              concept has one glyph across the admin surfaces — and pointedly not
              the green check, which now belongs to email verification. */}
          {certified ? (
            <ShieldCheck className="h-5 w-5 text-success" />
          ) : (
            <ShieldAlert className="h-5 w-5 text-warning" />
          )}
          {t("title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-1">
            {certified ? (
              <Badge className="bg-success text-success-foreground">{t("certified")}</Badge>
            ) : (
              <Badge variant="destructive">{t("notCertified")}</Badge>
            )}
            {certified && data?.certified_at ? (
              <p className="text-sm text-muted-foreground">
                {certifierName
                  ? t("certifiedByOn", {
                      name: certifierName,
                      date: formatDate(data.certified_at, locale, { dateStyle: "medium", timeZone }),
                    })
                  : t("certifiedOn", {
                      date: formatDate(data.certified_at, locale, { dateStyle: "medium", timeZone }),
                    })}
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">{t("notCertifiedNote")}</p>
            )}
          </div>
          <Button
            variant={certified ? "outline" : "default"}
            onClick={handleToggle}
            disabled={busy}
          >
            {busy ? t("saving") : certified ? t("uncertifyAction") : t("certifyAction")}
          </Button>
        </div>
        {setCertified.isError && (
          <p className="text-sm text-destructive">
            {setCertified.error instanceof Error ? setCertified.error.message : t("error")}
          </p>
        )}

        {/* The standing, under a rule that separates it from the verdict above
            without making it a second card. It is last in the card and the card
            is followed by the coverage editor, so the one state that arrives
            late — a failed server read answering from the browser instead —
            grows the card downward rather than moving anything the admin was
            pointing at. Nothing is reserved for it: with the seed in place it is
            never absent, and a slot held open for an anomaly is a hole in every
            ordinary visit. */}
        <div className="space-y-2 border-t border-border pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {ct("heading")}
          </p>
          {current === undefined || previous === undefined ? null : current !== null ? (
            <>
              <p className="flex items-center gap-2 text-sm font-medium text-success">
                <FileCheck className="h-4 w-4 shrink-0" aria-hidden />
                {ct("accepted")}
              </p>
              {/* The name as it was signed — a snapshot taken at that moment,
                  not this person's name today — in the handwriting the signing
                  dialog drew it in. */}
              <p className="font-cursive text-2xl leading-none">
                {current.signed_name}
              </p>
              <p className="text-sm text-muted-foreground">
                {ct("acceptedDetail", {
                  version: current.contract_version,
                  date: formatDate(current.accepted_at, locale, {
                    dateStyle: "long",
                    timeZone,
                  }),
                })}
              </p>
            </>
          ) : (
            <>
              <p className="flex items-center gap-2 text-sm font-medium text-warning">
                <FileWarning className="h-4 w-4 shrink-0" aria-hidden />
                {previous === null
                  ? ct("notAccepted")
                  : ct("notCurrentVersion", {
                      version: GEDU_CONTRACT_CURRENT_VERSION,
                    })}
              </p>
              {previous !== null && (
                <p className="text-sm text-muted-foreground">
                  {ct("previousVersion", {
                    version: previous.contract_version,
                    date: formatDate(previous.accepted_at, locale, {
                      dateStyle: "long",
                      timeZone,
                    }),
                  })}
                </p>
              )}
            </>
          )}
        </div>
      </CardContent>

      {/* Asked only on the way *in* to certification, and only of an educator
          who has not signed the terms in force. The dialog runs `onConfirm`
          and then closes itself, so `committing` is set in the same tick the
          dialog goes away and the button underneath is disabled by the time it
          is reachable again. */}
      <CertifyWithoutContractDialog
        open={confirming}
        onOpenChange={setConfirming}
        onConfirm={() => certify(true)}
      />
    </Card>
  );
}
