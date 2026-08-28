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
 * **The contract standing and the criminal record check live in this card
 * rather than beside it**, because neither is a second subject — they are the
 * other half of the one decision this card exists for. An admin certifying an
 * educator wants to know whether that educator has signed the terms they will
 * be working under and whether anybody has looked at their background, and a
 * fact that informs an action belongs above the button rather than in a card
 * the reader has to go and find. Both gate nothing (see
 * `services/gedu/CLAUDE.md`): certification stays the platform's only blocking
 * lever, and an educator missing either is certifiable — over a confirmation
 * that names whichever is missing.
 *
 * **The criminal record check sits between the verdict and the contract, and
 * the order is load-bearing.** Each standing has a heading that is always
 * drawn and a body that only appears once its own read has answered, so a body
 * that lands late pushes everything below it down. Only one of the two can be
 * last, and the one that must not move is the one carrying a *control*: the
 * check's checkbox is a target an admin puts a cursor on, while the contract's
 * standing is text to read. So the check goes above and the contract below,
 * and a late contract read grows the card downward past nothing anybody was
 * about to click. Both are seeded by the page's own server reads, so this is
 * the shape of a rare failure rather than of an ordinary visit.
 */

import { useState } from "react";
import {
  FileCheck,
  FileWarning,
  Scale,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { CertifyWithWarningsDialog } from "@/components/admin/certify-with-warnings-dialog";
import {
  findGeduContractAcceptance,
  GEDU_CONTRACT_CURRENT_VERSION,
} from "@/components/gedu/contract/documents";
import {
  useGeduContractAcceptances,
  useGeduProfile,
  useSetGeduCertified,
  useSetGeduCriminalRecordCheck,
  type GeduCertificationDetail,
} from "@/services/gedu";
import { useTimezone } from "@/providers";
import type { GeduContractAcceptance } from "@/types";
import { formatDate } from "@/lib/utils";

interface GeduCertificationCardProps {
  geduId: string;
  initial: GeduCertificationDetail | null;
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
  const rt = useTranslations("admin.geduCriminalRecordCheck");
  const locale = useLocale();
  const timeZone = useTimezone();
  const { data } = useGeduProfile(geduId, { initialData: initial });
  const { data: acceptances } = useGeduContractAcceptances(geduId, {
    initialData: initialAcceptances ?? undefined,
  });
  const setCertified = useSetGeduCertified();
  const setCriminalRecordCheck = useSetGeduCriminalRecordCheck();
  const [committing, setCommitting] = useState(false);
  const [checkCommitting, setCheckCommitting] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const certified = data?.certified ?? false;

  /**
   * Has an admin recorded seeing an acceptable criminal record extract?
   *
   * `undefined` is "not answered yet" — with the server seed in place that only
   * arises when the page's own read failed — and it is kept distinct from
   * `false` for the reason every mark on these surfaces is: the section states
   * a fact about a person, and it must not state one on the strength of a read
   * that did not land. The column is NOT NULL, so `false` covers both "nothing
   * recorded yet" and "recorded as not acceptable"; those are one operational
   * state and the copy names it as one.
   */
  const checkPassed =
    data == null ? undefined : data.criminal_record_check_passed;
  const certifierName = personName(data?.certifier);
  /**
   * The admin who recorded the extract, when there is one to name.
   *
   * `null` covers two different things and the copy treats them as one: nothing
   * recorded, and a recorder whose account has since been deleted — the FK is
   * `ON DELETE SET NULL`, so losing an admin leaves the check standing without
   * the name. Either way the line falls back to the date alone, which is the
   * same shape certification uses one field up.
   */
  const recorderName = personName(data?.recorder);
  /**
   * The moment the check was recorded, formatted once. Since 00214 a CHECK
   * constraint makes it non-null exactly when the flag is true, so `null` here
   * alongside a true flag is a row the database would refuse — the copy still
   * has a line for it, because a claim printed with no date is better than a
   * crash.
   */
  const recordedDate = data?.criminal_record_check_at
    ? formatDate(data.criminal_record_check_at, locale, {
        dateStyle: "long",
        timeZone,
      })
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
   *
   * **`current` is matched on the base version.** A stored version names the
   * language of the text that was signed, and the two languages of one version
   * are the same agreement published twice — so either signature makes an
   * educator current, and an educator who signed both is current on the
   * *earliest* of them, the same row the dashboard queue's standing read
   * reports. `previous` is deliberately matched on nothing: it is the newest
   * signature of *any* version, and it may only be read where `current` is
   * null — the "what they signed instead" line — because next to a current
   * signature it could name the same agreement twice. Below, every version
   * that names a *signature* is rendered from the row verbatim, encoded
   * language and all; the one that names the terms in force is the base alone,
   * because that is what "in force" is a property of.
   */
  const current =
    acceptances === undefined
      ? undefined
      : findGeduContractAcceptance(acceptances, GEDU_CONTRACT_CURRENT_VERSION);
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

  /**
   * Record or withdraw the criminal record check.
   *
   * The flag is live before any render after the click and is cleared once the
   * write settles either way, exactly like `certify` above and for the same
   * reason: this checkbox stays on the page through both outcomes, so there is
   * no unmount to hand the flag off to. Withdrawing asks nothing — it mirrors
   * de-certifying, and the fact it removes is one an admin can put back with
   * the same click.
   */
  function recordCheck(next: boolean) {
    setCheckCommitting(true);
    void setCriminalRecordCheck
      .mutateAsync({ geduId, passed: next })
      // Already on screen as `setCriminalRecordCheck.isError`; catching here
      // only stops the rejection escaping as an unhandled one.
      .catch(() => {})
      .finally(() => setCheckCommitting(false));
  }

  function handleToggle() {
    // De-certifying never asks, and neither does certifying somebody whose
    // standing is complete. An unanswered read does not ask either: the dialog
    // states as fact that this educator has not signed or has presented
    // nothing, and it must not say either on the strength of a read that did
    // not land — which is why both tests are against a literal rather than
    // against falsiness.
    if (!certified && (current === null || checkPassed === false)) {
      setConfirming(true);
      return;
    }
    certify(!certified);
  }

  const busy = committing || setCertified.isPending;
  const checkBusy = checkCommitting || setCriminalRecordCheck.isPending;

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

        {/* The criminal record check: the standing, and the one control that
            changes it. The document itself is never here and there is nowhere
            to put it — Finnish law 504/2002 has the educator obtain the
            extract from the Legal Register Centre and present it, and lets us
            record only that an acceptable one was shown and when. So this
            section is a statement by whoever ticked the box, not a file
            viewer, and the copy says so.

            **Exactly one line changes when the box is ticked.** The process
            paragraph under the status line is state-neutral on purpose: it
            describes how the extract is obtained and presented, which is as
            true after the tick as before it. Written as the *absence* of a
            record it could only be shown in one of the two states, and its
            appearing and disappearing moved the checkbox out from under the
            cursor that had just clicked it. */}
        <div className="space-y-2 border-t border-border pt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {rt("heading")}
          </p>
          {checkPassed === undefined ? null : (
            <>
              {/* One glyph for the check on every surface, and the scales are
                  it. The pair this replaces was `ClipboardCheck` /
                  `ClipboardX`, which lost to the contract's `FileCheck` /
                  `FileWarning`: a clipboard and a document are the same
                  rectangle-with-lines at 16px, and admins could not tell the
                  two subjects apart in a scanned column. Scales are a
                  different shape family and read "law" cold. State is carried
                  by colour and words, as it already is here. */}
              {checkPassed ? (
                <p className="flex items-center gap-2 text-sm font-medium text-success">
                  <Scale className="h-4 w-4 shrink-0" aria-hidden />
                  {/* The recording admin beside the date, exactly as the
                      verdict above names the certifying one — and the date
                      alone where there is no name to give, which is what a
                      departed admin leaves behind (`ON DELETE SET NULL`). */}
                  {recordedDate === null
                    ? rt("recorded")
                    : recorderName
                      ? rt("recordedByOn", {
                          name: recorderName,
                          date: recordedDate,
                        })
                      : rt("recordedOn", { date: recordedDate })}
                </p>
              ) : (
                <p className="flex items-center gap-2 text-sm font-medium text-warning">
                  <Scale className="h-4 w-4 shrink-0" aria-hidden />
                  {rt("notRecorded")}
                </p>
              )}
              <p className="text-sm text-muted-foreground">
                {rt("processDetail")}
              </p>
              {/* A checkbox rather than a button, because what an admin is
                  doing is recording a standing fact about a person — the same
                  kind of thing the tick means everywhere else — and because
                  taking it back has to be as plain as setting it. */}
              <label className="flex cursor-pointer items-start gap-2 pt-1 text-sm">
                <Checkbox
                  className="mt-0.5"
                  checked={checkPassed}
                  disabled={checkBusy}
                  onChange={(event) => recordCheck(event.target.checked)}
                />
                <span>{rt("recordLabel")}</span>
              </label>
              {setCriminalRecordCheck.isError && (
                <p className="text-sm text-destructive">
                  {setCriminalRecordCheck.error instanceof Error
                    ? setCriminalRecordCheck.error.message
                    : rt("error")}
                </p>
              )}
            </>
          )}
        </div>

        {/* The standing, under a rule that separates it from the verdict above
            without making it a second card. It is last in the card, and every
            control an admin came here to use is above it, so the one state that
            arrives late — a failed server read answering from the browser
            instead — grows the card downward past nothing anybody was about to
            click. (What follows the card on the page is more cards; they move
            down with it, and none of them is what the reader is looking at
            while this one finishes loading.) Nothing is reserved for it: with
            the seed in place it is never absent, and a slot held open for an
            anomaly is a hole in every ordinary visit. */}
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
          missing the terms in force, a recorded extract, or both — the dialog
          names whichever it is. The dialog runs `onConfirm` and then closes
          itself, so `committing` is set in the same tick the dialog goes away
          and the button underneath is disabled by the time it is reachable
          again. */}
      <CertifyWithWarningsDialog
        open={confirming}
        onOpenChange={setConfirming}
        onConfirm={() => certify(true)}
        contractMissing={current === null}
        criminalRecordCheckMissing={checkPassed === false}
      />
    </Card>
  );
}

/**
 * An embedded profile's display name, or `null` where there is no profile to
 * name — an absent embed, or one whose row is all blanks.
 *
 * Both audit names on this card go through it, so the certifying admin and the
 * recording admin are written the same way and neither can drift into printing
 * a lone space for a half-filled profile.
 */
function personName(
  person: { first_name: string | null; last_name: string | null } | null | undefined,
): string | null {
  if (!person) return null;
  const name = [person.first_name, person.last_name].filter(Boolean).join(" ");
  return name === "" ? null : name;
}
