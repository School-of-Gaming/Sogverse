"use client";

import { useId, useState } from "react";
import Image from "next/image";
import { IdCard, Loader2, Pencil } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { StatusLine } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TeamPhotoPlaceholder } from "@/components/team/team-photo-placeholder";
import {
  TeamProfileStatusPanel,
  teamProfileStatus,
} from "@/components/team/team-profile-status";
import { useLanguageNames } from "@/hooks/use-language-names";
import { Link } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";
import { LOCALE_CONFIG, resolveLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import {
  isTeamProfileNotReadyError,
  useSetGeduTeamProfileApproval,
  useTeamProfile,
  type TeamProfileRecord,
} from "@/services/team-profiles";

/**
 * The team profile on an admin's or a Gedu's `/admin/users/[id]` page: where
 * it stands publicly, a compact read of what it says, an edit of the whole
 * profile (checkbox included) and — for a Gedu — the approval.
 *
 * Seeded with the page's server read, so it paints complete; the approval
 * write re-reads the record, so the status and the buttons follow it.
 *
 * **A compact summary rather than the public page.** The editor frames the
 * whole public body beside its form because that is where it is being
 * written; here an admin needs to recognise the profile and decide, and the
 * full page is one click away on the edit route. The photo is framed content,
 * so its edge is not a card inside this card.
 *
 * **The approval is one yes or no, so it is one button**: Approve while it is
 * no, Take off while it is yes. Taking off is the one that asks first: it can
 * remove something from the public website. Approving does not: it is undone
 * with the other button.
 *
 * **Approve waits for ready.** An admin approves what has been marked ready
 * and never ahead of it, which the database enforces; until then Approve is
 * there but disabled, with the way to ready written under it. Take off stays
 * open whenever the profile is approved, ready or not.
 */
export function UserTeamProfileCard({
  userId,
  initial,
  isViewer,
}: {
  userId: string;
  /** The page's server read — `null` where that read failed. */
  initial: TeamProfileRecord | null;
  /** The page is the viewer's own, whose profile is edited from settings. */
  isViewer: boolean;
}) {
  const t = useTranslations("team.admin");
  const { data: record } = useTeamProfile(userId, { initialData: initial });
  if (!record) return null;

  const name = record.profile.firstName;
  const written =
    record.photoPath !== null || record.profile.translations.length > 0;
  const status = teamProfileStatus(record);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <IdCard className="h-5 w-5 text-act" />
          {t("userPage.heading")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {written ? (
          <>
            <TeamProfileStatusPanel
              status={status}
              title={t(`status.${status}Title`)}
              body={t(`status.${status}Body`, { name })}
            />
            <ProfileSummary record={record} />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            {t("userPage.nothingSaved", { name })}
          </p>
        )}
        <ProfileActions
          userId={userId}
          name={name}
          isViewer={isViewer}
          approval={
            record.role === "gedu"
              ? { approved: record.approved, ready: record.ready }
              : null
          }
        />
      </CardContent>
    </Card>
  );
}

/** The photo, the name, the person's own opening line and the languages written. */
function ProfileSummary({ record }: { record: TeamProfileRecord }) {
  const t = useTranslations("team.admin.userPage");
  const locale = useLocale();
  const languageName = useLanguageNames();
  const { profile } = record;
  const row = resolveTranslation(profile.translations, resolveLocale(locale));
  const languages = new Intl.ListFormat(locale, { type: "conjunction" }).format(
    profile.translations.map((r) =>
      languageName(r.locale, LOCALE_CONFIG[r.locale].label),
    ),
  );

  return (
    <div className="flex items-start gap-4">
      <div className="relative aspect-[4/5] w-20 shrink-0 overflow-hidden rounded-xl border border-border bg-card">
        {profile.photo ? (
          <Image
            src={profile.photo.src}
            width={profile.photo.width}
            height={profile.photo.height}
            alt={t("photoAlt", { name: profile.firstName })}
            // A private photo behind a short-lived signed URL: the optimiser
            // would cache it for a year under an unauthenticated address.
            unoptimized
            className="h-full w-full object-cover"
          />
        ) : (
          <TeamPhotoPlaceholder className="h-full w-full" />
        )}
      </div>
      <div className="min-w-0 space-y-1">
        <p className="font-medium">
          {profile.kind === "admin"
            ? `${profile.firstName} ${profile.lastName}`
            : profile.firstName}
          {profile.nickname && (
            <span className="font-normal text-muted-foreground">
              {" "}
              {t("nickname", { nickname: profile.nickname })}
            </span>
          )}
        </p>
        {profile.kind === "admin" && profile.title && (
          <p className="text-sm text-muted-foreground">{profile.title}</p>
        )}
        {row?.shortDescription && (
          <p className="text-sm" lang={row.locale}>
            {row.shortDescription}
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          {profile.translations.length > 0
            ? t("writtenIn", { languages })
            : t("nothingWritten")}
        </p>
      </div>
    </div>
  );
}

/**
 * Edit, and for a Gedu the approval's one button. The approval is last, on
 * the right, as the row's primary action.
 */
function ProfileActions({
  userId,
  name,
  isViewer,
  approval,
}: {
  userId: string;
  name: string;
  isViewer: boolean;
  /**
   * A Gedu's approval and whether the profile is marked ready, or `null` for
   * an admin's profile, which has no approval. A profile with nothing written
   * is never ready, so there is nothing to approve yet.
   */
  approval: { approved: boolean; ready: boolean } | null;
}) {
  const t = useTranslations("team.admin.userPage");
  const hintId = useId();
  const setApproval = useSetGeduTeamProfileApproval();
  // Set before the write and cleared once it settles: the card stays, and the
  // re-read that the write waits for is what swaps the button.
  const [approving, setApproving] = useState(false);
  const [approveError, setApproveError] = useState<
    "notReady" | "failed" | null
  >(null);
  const [confirmingTakeOff, setConfirmingTakeOff] = useState(false);
  const awaitingReady = approval !== null && !approval.approved && !approval.ready;

  function approve() {
    setApproving(true);
    setApproveError(null);
    void setApproval
      .mutateAsync({ geduId: userId, approved: true })
      .catch((error: unknown) => {
        // Someone unticked ready after this page was read; the hook has
        // re-read the profile, so the button is already disabled with its hint.
        if (isTeamProfileNotReadyError(error)) {
          setApproveError("notReady");
          return;
        }
        console.error("[team-profile] approval failed:", error);
        setApproveError("failed");
      })
      .finally(() => setApproving(false));
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap justify-end gap-2">
        {/* An admin's own profile is edited from settings, where the page
            speaks to them rather than about them. */}
        <Link
          href={
            isViewer
              ? ROUTES.settingsTeamProfile
              : ROUTES.admin.userTeamProfile(userId)
          }
          className={buttonVariants({ variant: "outline" })}
        >
          <Pencil aria-hidden />
          {t("edit")}
        </Link>
        {approval &&
          (approval.approved ? (
            <Button variant="outline" onClick={() => setConfirmingTakeOff(true)}>
              {t("takeOff")}
            </Button>
          ) : (
            <Button
              onClick={approve}
              disabled={approving || awaitingReady}
              aria-describedby={awaitingReady ? hintId : undefined}
            >
              {approving && <Loader2 className="animate-spin" aria-hidden />}
              {t("approve")}
            </Button>
          ))}
      </div>
      {/* Why Approve is disabled, for as long as it is: a greyed button with
          no reason beside it reads as broken. Not an alert — it describes the
          profile as it stands, not an answer to a click. */}
      {awaitingReady && (
        <p id={hintId} className="text-right text-xs text-muted-foreground">
          {t("approveNeedsReady")}
        </p>
      )}
      {approveError !== null && (
        <StatusLine status="destructive" role="alert">
          {approveError === "notReady"
            ? t("approveNotReady", { name })
            : t("approvalError")}
        </StatusLine>
      )}
      {approval && (
        <ConfirmDialog
          open={confirmingTakeOff}
          onOpenChange={setConfirmingTakeOff}
          title={t("takeOffConfirm.title", { name })}
          description={t("takeOffConfirm.body", { name })}
          confirmLabel={t("takeOff")}
          confirmVariant="destructive"
          holdWhileCommitting
          onConfirm={() =>
            setApproval.mutateAsync({ geduId: userId, approved: false })
          }
          describeError={() => t("approvalError")}
        />
      )}
    </div>
  );
}
