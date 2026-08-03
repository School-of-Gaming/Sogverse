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
import { GameUsernameEditableRow } from "@/components/game-account";
import { useMyGamers, useUpdateGamer, useGamerProfile } from "@/services/gamers";
import { useMinecraftAccount } from "@/services/minecraft";
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
  const { data: gamerProfile } = useGamerProfile(id);
  const updateGamer = useUpdateGamer();

  const gamer = gamers?.find((g) => g.id === id);

  // Profile form state
  const [firstName, setFirstName] = useState("");
  const [profileInitialized, setProfileInitialized] = useState(false);

  // Minecraft feedback state. The username itself is not held here — the row is
  // fed straight from the account query and reports its commits back.
  const [mcSuccess, setMcSuccess] = useState<string | null>(null);
  const [mcError, setMcError] = useState<string | null>(null);
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

  /**
   * Committing the row *is* saving it — the row has already checked the name
   * against Mojang, so what arrives is the canonical casing. The mutation
   * invalidates the gamer and account queries, which feed the row its new props.
   */
  const handleSaveMc = async (mcValue: string | null) => {
    if (!gamer) return;

    setMcSuccess(null);
    setMcError(null);

    try {
      await updateGamer.mutateAsync({
        gamerId: gamer.id,
        updates: { minecraftUsername: mcValue },
      });
      setMcSuccess(
        mcValue
          ? t('gamerDetail.mcSaved')
          : t('gamerDetail.mcCleared'),
      );
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "object" && error !== null && "message" in error
            ? String((error as { message: unknown }).message)
            : t('gamerDetail.failedUpdateMc');
      setMcError(message);
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

      {/* Minecraft Account */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Gamepad2 className="h-5 w-5" />
            <CardTitle>{t('gamerDetail.minecraft.title')}</CardTitle>
          </div>
          <CardDescription>
            {t('gamerDetail.minecraft.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <GameUsernameEditableRow
            platform="minecraft"
            username={mcAccount?.minecraft_username ?? null}
            externalId={mcAccount?.minecraft_uuid ?? null}
            personName={gamer.first_name}
            onCommit={({ username }) => void handleSaveMc(username)}
            className="max-w-sm"
          />

          {/* Below the row, not above it. The outcome of a save arrives after the
              save, so a banner above the row would push the row — the very thing
              the person just used, and is still looking at — down the page as it
              lands. Last thing in the last card on the page, so it grows into
              empty space and moves nothing. */}
          {mcSuccess && (
            <div className="rounded-md bg-success/10 p-3 text-sm text-success">
              {mcSuccess}
            </div>
          )}

          {mcError && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {mcError}
            </div>
          )}
        </CardContent>
      </Card>

    </div>
  );
}
