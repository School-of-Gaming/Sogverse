"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, User, Gamepad2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Identicon } from "@/components/ui/identicon";
import { MinecraftUsernameField } from "@/components/minecraft/minecraft-username-field";
import { useMyGamers, useUpdateGamer } from "@/services/gamers";
import { useMinecraftAccount } from "@/services/minecraft";
import { ROUTES, DISPLAY_NAME_MAX } from "@/lib/constants";

export default function GamerDetailsPage() {
  const t = useTranslations('parent');
  const c = useTranslations('common');
  const { id } = useParams<{ id: string }>();
  const { data: gamers, isLoading } = useMyGamers();
  const { data: mcAccount } = useMinecraftAccount(id);
  const updateGamer = useUpdateGamer();

  const gamer = gamers?.find((g) => g.id === id);

  // Profile form state
  const [firstName, setFirstName] = useState("");
  const [profileInitialized, setProfileInitialized] = useState(false);

  // Minecraft form state
  const [minecraftUsername, setMinecraftUsername] = useState("");
  const [mcInitialized, setMcInitialized] = useState(false);
  const [isSavingMc, setIsSavingMc] = useState(false);
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

  // Initialize minecraft username once account data loads
  if (mcAccount !== undefined && !mcInitialized) {
    setMinecraftUsername(mcAccount?.minecraft_username ?? "");
    setMcInitialized(true);
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

  const handleSaveMc = async () => {
    if (!gamer) return;

    setIsSavingMc(true);
    setMcSuccess(null);
    setMcError(null);

    try {
      const mcValue = minecraftUsername.trim() || null;
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
    } finally {
      setIsSavingMc(false);
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
              <p className="text-sm text-muted-foreground">
                @{gamer.username}
              </p>
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
            <div className="space-y-2">
              <Label htmlFor="gamerDisplayName">{c('firstName')}</Label>
              <Input
                id="gamerDisplayName"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder={c('firstName')}
                maxLength={DISPLAY_NAME_MAX}
              />
            </div>

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

          <form onSubmit={(e) => { e.preventDefault(); handleSaveMc(); }} className="space-y-6">
            <MinecraftUsernameField
              value={minecraftUsername}
              onChange={setMinecraftUsername}
              disabled={isSavingMc}
            />

            <Button
              type="submit"
              disabled={isSavingMc}
            >
              {isSavingMc ? c('saving') : t('gamerDetail.minecraft.save')}
            </Button>
          </form>
        </CardContent>
      </Card>

    </div>
  );
}
