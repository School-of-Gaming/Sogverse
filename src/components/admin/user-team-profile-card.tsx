"use client";

import { useState } from "react";
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
  useSetGeduTeamProfileApproval,
  useTeamProfile,
  type TeamProfileRecord,
} from "@/services/team-profiles";

/**
 * The team profile on an admin's or a Gedu's `/admin/users/[id]` page: where
 * it stands publicly, a compact read of what it says, and — for a Gedu — the
 * admin's two levers, the approval and an edit of the content.
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
 * **Only the valid moves are offered.** A profile goes pending → approved,
 * approved → withdrawn and withdrawn → approved, never back to pending, so
 * the card shows exactly one decision button for a Gedu. Taking a profile down
 * is the one that asks first: it removes something from the public website.
 * Approving does not: it puts up nothing the Gedu has not already asked for,
 * and it is undone with the other button.
 */
export function UserTeamProfileCard({
  userId,
  initial,
}: {
  userId: string;
  /** The page's server read — `null` where that read failed. */
  initial: TeamProfileRecord | null;
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
        {record.role === "gedu" && (
          <GeduProfileActions
            geduId={userId}
            name={name}
            approval={record.approval}
            canDecide={written}
          />
        )}
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
            sizes="80px"
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
 * Edit, and the one approval decision valid from where the profile stands.
 * The decision is last, on the right, as the row's primary action.
 */
function GeduProfileActions({
  geduId,
  name,
  approval,
  canDecide,
}: {
  geduId: string;
  name: string;
  approval: Extract<TeamProfileRecord, { role: "gedu" }>["approval"];
  /** Nothing to decide about while the Gedu has written nothing. */
  canDecide: boolean;
}) {
  const t = useTranslations("team.admin.userPage");
  const setApproval = useSetGeduTeamProfileApproval();
  // Set before the write and cleared once it settles: the card stays, and the
  // re-read that the write waits for is what swaps the button.
  const [approving, setApproving] = useState(false);
  const [approveFailed, setApproveFailed] = useState(false);
  const [confirmingTakeOff, setConfirmingTakeOff] = useState(false);

  function approve() {
    setApproving(true);
    setApproveFailed(false);
    void setApproval
      .mutateAsync({ geduId, approval: "approved" })
      .catch((error: unknown) => {
        console.error("[team-profile] approval failed:", error);
        setApproveFailed(true);
      })
      .finally(() => setApproving(false));
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap justify-end gap-2">
        <Link
          href={ROUTES.admin.userTeamProfile(geduId)}
          className={buttonVariants({ variant: "outline" })}
        >
          <Pencil aria-hidden />
          {t("edit")}
        </Link>
        {canDecide &&
          (approval === "approved" ? (
            <Button variant="outline" onClick={() => setConfirmingTakeOff(true)}>
              {t("takeOff")}
            </Button>
          ) : (
            <Button onClick={approve} disabled={approving}>
              {approving && <Loader2 className="animate-spin" aria-hidden />}
              {approval === "withdrawn" ? t("approveAgain") : t("approve")}
            </Button>
          ))}
      </div>
      {approveFailed && (
        <StatusLine status="destructive" role="alert">
          {t("approvalError")}
        </StatusLine>
      )}
      <ConfirmDialog
        open={confirmingTakeOff}
        onOpenChange={setConfirmingTakeOff}
        title={t("takeOffConfirm.title", { name })}
        description={t("takeOffConfirm.body", { name })}
        confirmLabel={t("takeOff")}
        confirmVariant="destructive"
        holdWhileCommitting
        onConfirm={() =>
          setApproval.mutateAsync({ geduId, approval: "withdrawn" })
        }
        describeError={() => t("approvalError")}
      />
    </div>
  );
}
