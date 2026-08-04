"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, User, Gamepad2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Identicon } from "@/components/ui/identicon";
import {
  GAME_PLATFORMS,
  GameUsernameEditableRow,
  robloxAccountId,
  type GameAccountExternalId,
  type GamePlatform,
} from "@/components/game-account";
import {
  useMyGamers,
  useUpdateGamer,
  useGamerProfile,
  type GamerUpdate,
} from "@/services/gamers";
import { useMinecraftAccount } from "@/services/minecraft";
import { useRobloxAccount, useRobloxRender } from "@/services/roblox";
import { ROUTES, DISPLAY_NAME_MAX } from "@/lib/constants";
import { computeAge } from "@/lib/utils";
import { useTimezone } from "@/providers";

export default function GamerDetailsPage() {
  const t = useTranslations('parent');
  const c = useTranslations('common');
  const { id } = useParams<{ id: string }>();
  const timeZone = useTimezone();
  const { data: gamers, isLoading } = useMyGamers();
  const { data: mcAccount } = useMinecraftAccount(id);
  const { data: robloxAccount } = useRobloxAccount(id);
  const { data: gamerProfile } = useGamerProfile(id);
  const updateGamer = useUpdateGamer();

  const gamer = gamers?.find((g) => g.id === id);

  // Profile form state
  const [firstName, setFirstName] = useState("");
  const [profileInitialized, setProfileInitialized] = useState(false);

  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileSuccess, setProfileSuccess] = useState<string | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  // Initialize display name once gamer data loads
  if (gamer && !profileInitialized) {
    setFirstName(gamer.first_name);
    setProfileInitialized(true);
  }

  const handleSaveProfile = async () => {
    if (!gamer) return;

    setIsSavingProfile(true);
    setProfileSuccess(null);
    setProfileError(null);

    try {
      await updateGamer.mutateAsync({
        gamerId: gamer.id,
        updates: { firstName: firstName.trim() },
      });
      setProfileSuccess(t('gamerDetail.profileUpdated'));
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "object" && error !== null && "message" in error
            ? String((error as { message: unknown }).message)
            : t('gamerDetail.failedUpdateDisplayName');
      setProfileError(message);
    } finally {
      setIsSavingProfile(false);
    }
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <div className="h-8 w-32 animate-pulse rounded bg-muted" />
        <Card className="animate-pulse">
          <CardHeader>
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-md bg-muted" />
              <div className="space-y-2">
                <div className="h-5 w-32 rounded bg-muted" />
                <div className="h-4 w-24 rounded bg-muted" />
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="h-10 w-full rounded bg-muted" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!gamer) {
    return (
      <div className="mx-auto max-w-2xl space-y-6">
        <Link
          href={ROUTES.customer.dashboard}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          {t('gamerDetail.backToMySog')}
        </Link>
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <h3 className="text-lg font-medium">{t('gamerDetail.notFound.title')}</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {t('gamerDetail.notFound.description')}
            </p>
            <Link
              href={ROUTES.customer.dashboard}
              className={buttonVariants({ variant: "outline", className: "mt-4" })}
            >
              {t('gamerDetail.backToMySog')}
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <Link
        href={ROUTES.customer.dashboard}
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        {t('gamerDetail.backToMySog')}
      </Link>

      <div>
        <h1 className="text-3xl font-bold">{t('gamerDetail.title')}</h1>
        <p className="text-muted-foreground">
          {t('gamerDetail.subtitle', { name: gamer.first_name })}
        </p>
      </div>

      {/* Profile Settings */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <User className="h-5 w-5" />
            <CardTitle>{c('profile')}</CardTitle>
          </div>
          <CardDescription>
            {t('gamerDetail.profileDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <Identicon id={gamer.id} size={64} />
            </Avatar>
            <div>
              <p className="font-medium">{gamer.first_name}</p>
              {gamerProfile && (
                <p className="text-sm text-muted-foreground">
                  <span>{t('gamerDetail.ageYears', { age: computeAge(gamerProfile.date_of_birth, timeZone) })}</span>
                  {gamerProfile.gender && (
                    <>
                      {/* eslint-disable-next-line i18next/no-literal-string -- visual separator between two i18n strings, not user-facing copy */}
                      <span aria-hidden="true"> · </span>
                      <span>{t(`gamerDetail.gender.${gamerProfile.gender}`)}</span>
                    </>
                  )}
                </p>
              )}
            </div>
          </div>

          {profileSuccess && (
            <div className="rounded-md bg-success/10 p-3 text-sm text-success">
              {profileSuccess}
            </div>
          )}

          {profileError && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {profileError}
            </div>
          )}

          <form onSubmit={(e) => { e.preventDefault(); handleSaveProfile(); }} className="space-y-6">
            <Field label={c('firstName')} htmlFor="gamerDisplayName">
              <Input
                id="gamerDisplayName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder={c('firstName')}
                maxLength={DISPLAY_NAME_MAX}
              />
            </Field>

            <Button
              type="submit"
              disabled={isSavingProfile || firstName.trim().length < 2}
            >
              {isSavingProfile ? c('saving') : c('saveChanges')}
            </Button>
          </form>
        </CardContent>
      </Card>

      <GameAccountCard
        platform="minecraft"
        title={t('gamerDetail.minecraft.title')}
        description={t('gamerDetail.minecraft.description')}
        personName={gamer.first_name}
        username={mcAccount?.minecraft_username ?? null}
        externalId={mcAccount?.minecraft_uuid ?? null}
        onSave={(minecraftUsername) =>
          updateGamer.mutateAsync({
            gamerId: gamer.id,
            updates: { minecraftUsername },
          })
        }
      />

      <GameAccountCard
        platform="roblox"
        title={t('gamerDetail.roblox.title')}
        description={t('gamerDetail.roblox.description')}
        personName={gamer.first_name}
        username={robloxAccount?.roblox_username ?? null}
        externalId={robloxAccount?.roblox_user_id ?? null}
        onSave={(robloxUsername) =>
          updateGamer.mutateAsync({
            gamerId: gamer.id,
            updates: { robloxUsername },
          })
        }
      />

    </div>
  );
}

/**
 * One platform's card on a child's page. The two platforms render the identical
 * thing, so they are the identical component: the only per-platform inputs are
 * the copy, the two stored columns, and which field of the gamer update to send.
 *
 * `onSave` is a prop rather than a hook so the card stays presentational and the
 * two instances cannot drift into two slightly different save behaviours.
 */
function GameAccountCard({
  platform,
  title,
  description,
  personName,
  username,
  externalId,
  onSave,
}: {
  platform: GamePlatform;
  title: string;
  description: string;
  /** Whose account this is, for the pencil's accessible name. */
  personName: string;
  username: string | null;
  externalId: GameAccountExternalId | null;
  onSave: (username: GamerUpdate["minecraftUsername"]) => Promise<unknown>;
}) {
  const g = useTranslations('gameAccount');
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const name = GAME_PLATFORMS[platform].name;
  // `null` for Minecraft (the row derives its skin from the name) and for an
  // unverified Roblox handle — no stored id to resolve, and looking the *name*
  // up instead could draw whichever stranger happens to own it.
  const { data: render } = useRobloxRender(robloxAccountId(platform, externalId));

  /**
   * Committing the row *is* saving it — the row has already checked the name
   * against the platform, so what arrives is the canonical casing. The mutation
   * invalidates the gamer and account queries, which feed the row its new props.
   */
  const handleCommit = async (value: string | null) => {
    setSuccess(null);
    setError(null);

    try {
      await onSave(value);
      setSuccess(
        value ? g('saved', { platform: name }) : g('cleared', { platform: name }),
      );
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null && "message" in err
            ? String((err as { message: unknown }).message)
            : g('saveFailed', { platform: name });
      setError(message);
      // Rethrown after the banner is set: the row is awaiting this, and a
      // silent resolve would leave it showing a name nothing stored.
      throw err;
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Gamepad2 className="h-5 w-5" />
          <CardTitle>{title}</CardTitle>
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <GameUsernameEditableRow
          platform={platform}
          username={username}
          externalId={externalId}
          personName={personName}
          // Minecraft omits it and derives its skin from the name. Roblox hands
          // in what the by-id lookup resolved — or `null` while it is in flight,
          // which draws the silhouette in a box already at its final size, so
          // the picture lands without moving anything.
          avatarUrl={platform === "roblox" ? (render?.avatarUrl ?? null) : undefined}
          // Returned, not voided: the row waits on the write before it lets
          // go of the name it is showing.
          onCommit={({ username: committed }) => handleCommit(committed)}
          className="max-w-sm"
        />

        {/* Below the row, not above it. The outcome of a save arrives after the
            save, so a banner above the row would push the row — the very thing
            the person just used, and is still looking at — down the page as it
            lands. What it does push is the card below, and only ever because
            this person just committed something in this card. */}
        {success && (
          <div className="rounded-md bg-success/10 p-3 text-sm text-success">
            {success}
          </div>
        )}

        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
