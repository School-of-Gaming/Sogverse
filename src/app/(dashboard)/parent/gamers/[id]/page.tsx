"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, User } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Identicon } from "@/components/ui/identicon";
import { GameAccountCard } from "@/components/game-account";
import { useMyGamers, useUpdateGamer, useGamerProfile } from "@/services/gamers";
import { useMinecraftAccount } from "@/services/minecraft";
import { useRobloxAccount } from "@/services/roblox";
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
        <h1 className="text-3xl font-semibold">{t('gamerDetail.title')}</h1>
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
