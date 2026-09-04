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
// The module, not the family barrel: the barrel would drag the profile
// selector, the add-gamer form and the switch dialogs into this route's bundle
// for the sake of one card, and none of the three is reachable from this page.
import { GamerSignInCard } from "@/components/family/gamer-sign-in-card";
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
  const { data: gamers, isLoading: gamersLoading } = useMyGamers();
  const { data: mcAccount } = useMinecraftAccount(id);
  const { data: robloxAccount } = useRobloxAccount(id);
  // The child's own row: their age, their gender, and how they sign in. Two of
  // the three decide what this page *contains* — the Sign-in card's whole body
  // follows from the mode — so the page waits for it rather than letting a card
  // insert itself into the middle of the page a beat after the rest has
  // painted (root `CLAUDE.md`, "Layout & Scrolling"). It is a primary-key read
  // of one row, issued in the same render as the list, so the wait is the
  // longer of two round trips rather than two in sequence.
  const { data: gamerProfile, isPending: profilePending } = useGamerProfile(id);
  const updateGamer = useUpdateGamer();

  const isLoading = gamersLoading || profilePending;

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

      {/* Between the profile and the game identities: who this account is comes
          first, how they get into it second, and what they are called in a game
          after both. The card is absent only when the row it describes could not
          be read — a mode nobody can see is better than a mode we guessed. */}
      {gamerProfile && (
        <GamerSignInCard
          gamerId={gamer.id}
          firstName={gamer.first_name}
          signIn={gamerProfile.sign_in}
          email={gamer.email}
          emailVerifiedAt={gamer.email_verified_at}
        />
      )}

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
