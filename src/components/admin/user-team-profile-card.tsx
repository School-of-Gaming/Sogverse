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
 * profile (checkbox included) and — for a Gedu — whether it is public.
 *
 * Seeded with the page's server read, so it paints complete; making public or
 * hiding re-reads the record, so the status and the button follow it.
 *
 * **A compact summary rather than the public page.** The editor frames the
 * whole public body beside its form because that is where it is being
 * written; here an admin needs to recognise the profile and decide, and the
 * full page is one click away on the edit route. The photo is framed content,
 * so its edge is not a card inside this card.
 *
 * **Admins decide visibility, the Gedu readiness, so an admin has exactly two
 * actions, one button**: Make public while the profile is not public, Hide
 * while it is. Hide is the one that asks first: it removes something from the
 * public website. Make public does not: it is undone with the other button.
 *
 * **Make public waits for ready.** An admin makes public what has been marked
 * ready and never ahead of it, which the database enforces; until then the
 * button is there but disabled, with the way to ready written under it. A
 * public profile is always ready — unticking ready hides it — so Hide never
 * needs that caveat.
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
          visibility={
            record.role === "gedu"
              ? { isPublic: record.approved, ready: record.ready }
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
 * Edit, and for a Gedu the one visibility button. It is last, on the right, as
 * the row's primary action.
 */
function ProfileActions({
  userId,
  name,
  isViewer,
  visibility,
}: {
  userId: string;
  name: string;
  isViewer: boolean;
  /**
   * Whether a Gedu's profile is public and whether it is marked ready, or
   * `null` for an admin's profile, whose own checkbox decides. A profile with
   * nothing written is never ready, so there is nothing to make public yet.
   */
  visibility: { isPublic: boolean; ready: boolean } | null;
}) {
  const t = useTranslations("team.admin.userPage");
  const hintId = useId();
  const setVisibility = useSetGeduTeamProfileApproval();
  // Set before the write and cleared once it settles: the card stays, and the
  // re-read that the write waits for is what swaps the button.
  const [makingPublic, setMakingPublic] = useState(false);
  const [makePublicError, setMakePublicError] = useState<
    "notReady" | "failed" | null
  >(null);
  const [confirmingHide, setConfirmingHide] = useState(false);
  const awaitingReady =
    visibility !== null && !visibility.isPublic && !visibility.ready;

  function makePublic() {
    setMakingPublic(true);
    setMakePublicError(null);
    void setVisibility
      .mutateAsync({ geduId: userId, approved: true })
      .catch((error: unknown) => {
        // Someone unticked ready after this page was read; the hook has
        // re-read the profile, so the button is already disabled with its hint.
        if (isTeamProfileNotReadyError(error)) {
          setMakePublicError("notReady");
          return;
        }
        console.error("[team-profile] make public failed:", error);
        setMakePublicError("failed");
      })
      .finally(() => setMakingPublic(false));
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
        {visibility &&
          (visibility.isPublic ? (
            <Button variant="outline" onClick={() => setConfirmingHide(true)}>
              {t("hide")}
            </Button>
          ) : (
            <Button
              onClick={makePublic}
              disabled={makingPublic || awaitingReady}
              aria-describedby={awaitingReady ? hintId : undefined}
            >
              {makingPublic && <Loader2 className="animate-spin" aria-hidden />}
              {t("makePublic")}
            </Button>
          ))}
      </div>
      {/* Why Make public is disabled, for as long as it is: a greyed button
          with no reason beside it reads as broken. Not an alert — it describes
          the profile as it stands, not an answer to a click. */}
      {awaitingReady && (
        <p id={hintId} className="text-right text-xs text-muted-foreground">
          {t("makePublicNeedsReady")}
        </p>
      )}
      {makePublicError !== null && (
        <StatusLine status="destructive" role="alert">
          {makePublicError === "notReady"
            ? t("makePublicNotReady", { name })
            : t("visibilityError")}
        </StatusLine>
      )}
      {visibility && (
        <ConfirmDialog
          open={confirmingHide}
          onOpenChange={setConfirmingHide}
          title={t("hideConfirm.title", { name })}
          description={t("hideConfirm.body")}
          confirmLabel={t("hide")}
          confirmVariant="destructive"
          holdWhileCommitting
          onConfirm={() =>
            setVisibility.mutateAsync({ geduId: userId, approved: false })
          }
          describeError={() => t("visibilityError")}
        />
      )}
    </div>
  );
}
