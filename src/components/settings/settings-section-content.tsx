"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { User, Lock, Gamepad2, LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Identicon } from "@/components/ui/identicon";
import { MinecraftUsernameField } from "@/components/minecraft/minecraft-username-field";
import { InternationalPhoneInput } from "@/components/ui/phone-input";
import { SpokenLanguageCheckboxes } from "@/components/ui/spoken-language-checkboxes";
import { GeduCoverageEditor } from "@/components/gedu/gedu-coverage-editor";
import { DISPLAY_NAME_MAX } from "@/lib/constants";
import { useAuth } from "@/providers";
import { isValidPhoneNumber } from "react-phone-number-input";
import { useUpdateProfile, useSpokenLanguages } from "@/services/users";
import { toE164Digits } from "@/lib/utils";
import { useMyMinecraftAccount, useUpdateMyMinecraft } from "@/services/minecraft";
import { isGamerProfile, type ProfileUpdate } from "@/types";

export function SettingsSectionContent() {
  const t = useTranslations('settings');
  const c = useTranslations('common');
  const { user, profile, refreshProfile } = useAuth();
  const updateProfile = useUpdateProfile();
  const router = useRouter();
  const showMinecraft = profile?.role === "gamer" || profile?.role === "gedu";
  const isGedu = profile?.role === "gedu";
  const gamerProfile = isGamerProfile(profile) ? profile : null;
  const isGamer = gamerProfile !== null;
  const { data: mcAccount } = useMyMinecraftAccount();
  const updateMyMc = useUpdateMyMinecraft();
  const { data: availableLanguages } = useSpokenLanguages();

  const [firstName, setFirstName] = useState(profile?.first_name ?? "");
  const [lastName, setLastName] = useState(profile?.last_name ?? "");
  const [phone, setPhone] = useState(profile?.phone ? `+${profile.phone}` : "");
  const [spokenLanguages, setSpokenLanguages] = useState<string[]>(profile?.spoken_languages ?? []);
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [minecraftUsername, setMinecraftUsername] = useState("");
  const [mcInitialized, setMcInitialized] = useState(false);
  const [isSavingMc, setIsSavingMc] = useState(false);
  const [mcSuccess, setMcSuccess] = useState<string | null>(null);
  const [mcError, setMcError] = useState<string | null>(null);

  if (mcAccount !== undefined && !mcInitialized) {
    setMinecraftUsername(mcAccount?.minecraft_username ?? "");
    setMcInitialized(true);
  }

  const handleSaveProfile = async () => {
    if (!user) return;

    setIsSaving(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      if (phone && !isValidPhoneNumber(phone)) {
        setErrorMessage(t('invalidPhone'));
        setIsSaving(false);
        return;
      }

      const updates: ProfileUpdate = {
        first_name: firstName,
        last_name: lastName.trim() || null,
        phone: toE164Digits(phone),
        spoken_languages: spokenLanguages,
      };
      await updateProfile.mutateAsync({ userId: user.id, updates });
      await refreshProfile();
      setSuccessMessage(t('profileUpdated'));
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "object" && error !== null && "message" in error
            ? String((error as { message: unknown }).message)
            : t('failedToUpdateProfile');
      setErrorMessage(message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleChangePassword = () => {
    router.push("/reset-password");
  };

  const handleSaveMc = async () => {
    setIsSavingMc(true);
    setMcSuccess(null);
    setMcError(null);

    try {
      const mcValue = minecraftUsername.trim() || null;
      await updateMyMc.mutateAsync(mcValue);
      setMcSuccess(
        mcValue
          ? t('minecraftSaved')
          : t('minecraftCleared'),
      );
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === "object" && error !== null && "message" in error
            ? String((error as { message: unknown }).message)
            : t('failedToUpdateMinecraft');
      setMcError(message);
    } finally {
      setIsSavingMc(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold">{c('settings')}</h1>
        <p className="text-muted-foreground">
          {t('subtitle')}
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <User className="h-5 w-5" />
            <CardTitle>{c('profile')}</CardTitle>
          </div>
          <CardDescription>
            {t('profileDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              <Identicon id={profile?.id || user?.id || ""} size={64} />
            </Avatar>
            <div>
              <p className="font-medium">
                {[profile?.first_name, !isGamer && profile?.last_name].filter(Boolean).join(" ")}
              </p>
              <p className="text-sm text-muted-foreground">
                {gamerProfile ? `@${gamerProfile.username}` : profile?.email || `@${profile?.username}`}
              </p>
              <p className="text-xs text-muted-foreground capitalize">
                {t('roleAccount', { role: profile?.role ?? '' })}
              </p>
            </div>
          </div>

          {successMessage && (
            <div className="rounded-md bg-success/10 p-3 text-sm text-success">
              {successMessage}
            </div>
          )}

          {errorMessage && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {errorMessage}
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="firstName">{c('firstName')}</Label>
            <Input
              id="firstName"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder={t('firstNamePlaceholder')}
              maxLength={DISPLAY_NAME_MAX}
              autoComplete="given-name"
            />
          </div>

          {!isGamer && (
            <div className="space-y-2">
              <Label htmlFor="lastName">{c('lastName')}</Label>
              <Input
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder={t('lastNamePlaceholder')}
                maxLength={DISPLAY_NAME_MAX}
                autoComplete="family-name"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="phone">{c('phoneNumber')}</Label>
            <InternationalPhoneInput
              id="phone"
              value={phone || undefined}
              onChange={(value) => setPhone(value ?? "")}
            />
          </div>

          <SpokenLanguageCheckboxes
            spokenLanguages={availableLanguages ?? []}
            selected={spokenLanguages}
            onChange={setSpokenLanguages}
          />

          {!isGamer && (
            <div className="space-y-2">
              <Label>{c('email')}</Label>
              <Input
                value={profile?.email || ""}
                disabled
                className="bg-muted"
              />
            </div>
          )}

          {profile?.username && (
            <div className="space-y-2">
              <Label>{c('username')}</Label>
              <Input
                value={profile.username}
                disabled
                className="bg-muted"
              />
            </div>
          )}

          <Button onClick={handleSaveProfile} disabled={isSaving}>
            {isSaving ? c('saving') : c('saveChanges')}
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            <CardTitle>{c('security')}</CardTitle>
          </div>
          <CardDescription>
            {t('securityDescription')}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <Button
            variant="outline"
            onClick={handleChangePassword}
          >
            {t('changePassword')}
          </Button>
          <form action="/api/auth/signout" method="post">
            <Button type="submit" variant="destructive">
              <LogOut className="h-4 w-4" />
              {c('signOut')}
            </Button>
          </form>
        </CardContent>
      </Card>

      {isGedu && user && <GeduCoverageEditor geduId={user.id} />}

      {showMinecraft && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Gamepad2 className="h-5 w-5" />
              <CardTitle>{t('minecraftAccount')}</CardTitle>
            </div>
            <CardDescription>
              {t('minecraftDescription')}
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
                {isSavingMc ? c('saving') : t('saveMinecraft')}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
