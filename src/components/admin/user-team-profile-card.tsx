"use client";

import { useId, useState } from "react";
import { IdCard, Loader2, Pencil } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { StatusLine } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TeamProfilePreviewFrame } from "@/components/team/team-profile-preview-frame";
import {
  TeamProfileStatusPanel,
  teamProfileStatus,
} from "@/components/team/team-profile-status";
import { Link } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants";
import {
  LOCALE_CONFIG,
  SUPPORTED_LOCALES,
  resolveLocale,
  type SupportedLocale,
} from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { cn } from "@/lib/utils";
import {
  isTeamProfileNotReadyError,
  useSetTeamProfileApproval,
  useTeamProfile,
  type TeamProfile,
  type TeamProfileRecord,
} from "@/services/team-profiles";

/**
 * The team profile on an admin's or a Gedu's `/admin/users/[id]` page: where
 * it stands publicly, the profile as the public will see it, an edit of the
 * whole profile (checkbox included) and whether it is public — the viewing
 * admin's own included.
 *
 * Seeded with the page's server read, so it paints complete; making public or
 * hiding re-reads the record, so the status and the button follow it.
 *
 * **What the public will see, not a summary of it.** The section reads the
 * saved profile through the public page's own body, framed as in the editor,
 * so an admin reads every word before making it public without opening the
 * editor. The section stays a card like its siblings on the page: the frame is
 * framed content, the status panel a state message, and neither is a card
 * inside it.
 *
 * **The decision comes after the reading**: where the profile stands, then
 * the profile, then Edit and Make public or Hide, so the button is where the
 * reader finishes.
 *
 * **Admins decide visibility, whoever edits the profile readiness, so an admin
 * has exactly two actions, one button**: Make public while the profile is not public, Hide
 * while it is. Neither asks first: each is undone with the other.
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
            <ProfilePreview profile={record.profile} />
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
          isPublic={record.approved}
          ready={record.ready}
        />
      </CardContent>
    </Card>
  );
}

/**
 * The saved profile exactly as the public page will show it, in the same
 * frame as the editor's live preview.
 *
 * **Every written language can be read.** A profile written in more than one
 * gets the editor's language tabs, read-only, over the frame; it opens on the
 * one the public page would show this admin (`resolveTranslation`: their UI
 * locale, then English, then the first written). A tab only swaps the text
 * inside the frame: the row itself holds its place, and nothing above moves.
 *
 * **No height cap.** The editor bounds its preview because it stays in view
 * beside a form; here nothing sits beside it, so a long "About me" lets the
 * page scroll rather than nesting a scroll area in it.
 */
function ProfilePreview({ profile }: { profile: TeamProfile }) {
  const t = useTranslations("team.admin.userPage");
  const tabsLabelId = useId();
  const uiLocale = resolveLocale(useLocale());
  const written = SUPPORTED_LOCALES.filter((l) =>
    profile.translations.some((row) => row.locale === l),
  );
  const [chosen, setChosen] = useState<SupportedLocale | null>(null);
  const active =
    chosen !== null && written.includes(chosen)
      ? chosen
      : (resolveTranslation(profile.translations, uiLocale)?.locale ?? uiLocale);

  return (
    <div className="space-y-3">
      {written.length > 1 && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-border">
          <span id={tabsLabelId} className="text-sm text-muted-foreground">
            {t("writtenIn")}
          </span>
          <div
            role="group"
            aria-labelledby={tabsLabelId}
            className="flex flex-wrap items-center gap-1"
          >
            {written.map((l) => (
              <button
                key={l}
                type="button"
                aria-pressed={active === l}
                onClick={() => setChosen(l)}
                className={cn(
                  "rounded-t-md border-b-2 border-border px-3 py-1.5 text-sm transition-colors",
                  active === l
                    ? "text-act"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {LOCALE_CONFIG[l].nativeLabel}
              </button>
            ))}
          </div>
        </div>
      )}
      <TeamProfilePreviewFrame profile={profile} readerLocale={active} />
    </div>
  );
}

/**
 * Edit, and the one visibility button. It is last, on the right, as the row's
 * primary action. An admin's own profile has it too: admins are trusted, so
 * making their own public needs no second admin.
 */
function ProfileActions({
  userId,
  name,
  isViewer,
  isPublic,
  ready,
}: {
  userId: string;
  name: string;
  isViewer: boolean;
  /** An admin has made the profile public. */
  isPublic: boolean;
  /**
   * The profile is marked ready. A profile with nothing written is never
   * ready, so there is nothing to make public yet.
   */
  ready: boolean;
}) {
  const t = useTranslations("team.admin.userPage");
  const hintId = useId();
  const setVisibility = useSetTeamProfileApproval();
  // Set before the write and cleared once it settles: the card stays, and the
  // re-read that the write waits for is what swaps the button.
  const [committing, setCommitting] = useState(false);
  const [visibilityError, setVisibilityError] = useState<
    "notReady" | "failed" | null
  >(null);
  const awaitingReady = !isPublic && !ready;

  function setPublic(approved: boolean) {
    setCommitting(true);
    setVisibilityError(null);
    void setVisibility
      .mutateAsync({ userId, approved })
      .catch((error: unknown) => {
        // Someone unticked ready after this page was read; the hook has
        // re-read the profile, so the button is already disabled with its hint.
        if (approved && isTeamProfileNotReadyError(error)) {
          setVisibilityError("notReady");
          return;
        }
        console.error(
          `[team-profile] ${approved ? "make public" : "hide"} failed:`,
          error,
        );
        setVisibilityError("failed");
      })
      .finally(() => setCommitting(false));
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
        {isPublic ? (
          <Button
            variant="outline"
            onClick={() => setPublic(false)}
            disabled={committing}
          >
            {committing && <Loader2 className="animate-spin" aria-hidden />}
            {t("hide")}
          </Button>
        ) : (
          <Button
            onClick={() => setPublic(true)}
            disabled={committing || awaitingReady}
            aria-describedby={awaitingReady ? hintId : undefined}
          >
            {committing && <Loader2 className="animate-spin" aria-hidden />}
            {t("makePublic")}
          </Button>
        )}
      </div>
      {/* Why Make public is disabled, for as long as it is: a greyed button
          with no reason beside it reads as broken. Not an alert — it describes
          the profile as it stands, not an answer to a click. */}
      {awaitingReady && (
        <p id={hintId} className="text-right text-xs text-muted-foreground">
          {t("makePublicNeedsReady")}
        </p>
      )}
      {visibilityError !== null && (
        <StatusLine status="destructive" role="alert">
          {visibilityError === "notReady"
            ? t("makePublicNotReady", { name })
            : t("visibilityError")}
        </StatusLine>
      )}
    </div>
  );
}
