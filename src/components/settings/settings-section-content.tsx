"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { User, Lock, Gamepad2, LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Identicon } from "@/components/ui/identicon";
import { GameUsernameEditableRow } from "@/components/game-account";
import { InternationalPhoneInput } from "@/components/ui/phone-input";
import { SpokenLanguageCheckboxes } from "@/components/ui/spoken-language-checkboxes";
import { GeduCoverageEditor } from "@/components/gedu/gedu-coverage-editor";
import { HomeLocationField } from "@/components/locations/home-location-field";
import type { LocationPick } from "@/components/locations/location-picker-panel";
import { DISPLAY_NAME_MIN, DISPLAY_NAME_MAX, ROUTES } from "@/lib/constants";
import { useAuth } from "@/providers";
import { isValidPhoneNumber } from "react-phone-number-input";
import { useUpdateProfile, useSpokenLanguages } from "@/services/users";
import { useLocationsByIds, type LocationWithChain } from "@/services/locations";
import { toE164Digits } from "@/lib/utils";
import { useMyMinecraftAccount, useUpdateMyMinecraft } from "@/services/minecraft";
import { isGamerProfile, type ProfileUpdate, type SpokenLanguage } from "@/types";

/**
 * A keyed location read, as the picker's own value shape. The two are already
 * the same information — a row plus its ancestors, nearest first — so this only
 * renames the row half; there is nothing to look up and nothing to reconcile.
 */
function toLocationPick(row: LocationWithChain | undefined): LocationPick | null {
  if (!row) return null;
  return { location: row, ancestors: row.ancestors };
}

export function SettingsSectionContent({
  initialSpokenLanguages,
}: {
  initialSpokenLanguages: SpokenLanguage[];
}) {
  const t = useTranslations('settings');
  const c = useTranslations('common');
  const { user, profile, refreshProfile } = useAuth();
  const updateProfile = useUpdateProfile();
  const router = useRouter();
  const showMinecraft = profile?.role === "gamer" || profile?.role === "gedu";
  const isGedu = profile?.role === "gedu";
  const isGamer = isGamerProfile(profile);
  const isParent = profile?.role === "customer";
  const { data: mcAccount } = useMyMinecraftAccount();
  const updateMyMc = useUpdateMyMinecraft();
  const { data: availableLanguages } = useSpokenLanguages({
    initialData: initialSpokenLanguages,
  });

  const [firstName, setFirstName] = useState(profile?.first_name ?? "");
  const [lastName, setLastName] = useState(profile?.last_name ?? "");
  const [phone, setPhone] = useState(profile?.phone ? `+${profile.phone}` : "");
  const [spokenLanguages, setSpokenLanguages] = useState<string[]>(profile?.spoken_languages ?? []);
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // ---------------------------------------------------------------------
  // The parent's own location
  //
  // Stored as a single `locations` id on the profile. The row behind it —
  // and the ancestor chain that renders its path — comes from one keyed read,
  // which is exactly the shape the picker hands back, so a place restored from
  // the database and a place just chosen are the same value to the field.
  // ---------------------------------------------------------------------
  // `isParent` is `profile?.role === "customer"`, which narrows `profile` to
  // non-null here — the field is only ever mounted for a parent anyway.
  const savedHomeLocationId = isParent ? profile.home_location_id : null;
  const { data: savedHomeLocationRows } = useLocationsByIds(
    savedHomeLocationId ? [savedHomeLocationId] : [],
  );

  /**
   * The saved value: `undefined` until the row lands, `null` once we know there
   * is none. With no id stored there is nothing to wait for, so that case
   * resolves synchronously and the field never blinks through an empty box on
   * its way to the prompt.
   *
   * A stored id that matches no row also lands here as `null` — a keyed read is
   * a lookup, not an assertion, and `ON DELETE SET NULL` means this should not
   * happen. Rendering it as "not chosen" is the honest answer either way.
   */
  const savedHomeLocation: LocationPick | null | undefined =
    savedHomeLocationId === null
      ? null
      : savedHomeLocationRows === undefined
        ? undefined
        : toLocationPick(savedHomeLocationRows[0]);

  /**
   * Any edit made on top of the saved value. Wrapped rather than held as a bare
   * `LocationPick | null`, because `null` is a real edit — the user cleared the
   * field — and would otherwise be indistinguishable from "no edit yet".
   */
  const [homeLocationEdit, setHomeLocationEdit] = useState<{
    pick: LocationPick | null;
  } | null>(null);
  const homeLocation = homeLocationEdit
    ? homeLocationEdit.pick
    : savedHomeLocation;

  const [mcSuccess, setMcSuccess] = useState<string | null>(null);
  const [mcError, setMcError] = useState<string | null>(null);

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

      // Last name is required for non-gamers (gamers don't render the field and
      // keep their inherited name). This also gradually backfills legacy rows
      // that hold an empty last name from before it was required.
      if (!isGamer && lastName.trim().length < DISPLAY_NAME_MIN) {
        setErrorMessage(t('lastNameRequired', { min: DISPLAY_NAME_MIN }));
        setIsSaving(false);
        return;
      }

      const updates: ProfileUpdate = {
        first_name: firstName,
        last_name: lastName.trim(),
        phone: toE164Digits(phone),
        spoken_languages: spokenLanguages,
      };

      // Only when we know what the current value is. An unresolved read is
      // `undefined`, and writing `null` for it would clear a location the user
      // never touched and has not even been shown yet — omitting the key leaves
      // it alone. A cleared field is `null` and does have to be written.
      if (isParent && homeLocation !== undefined) {
        updates.home_location_id = homeLocation?.location.id ?? null;
      }

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

  /**
   * Committing the row *is* saving it — there is no separate Save button, because
   * the row's own commit already asked the question one would have answered.
   *
   * The row has verified the name against Mojang by the time this runs, so what
   * arrives is the canonical casing; the route re-runs the lookup server-side
   * anyway, because a client-verified name is not evidence. The mutation
   * invalidates the account query, which feeds the row its new props — the loop
   * that keeps this component from holding a second copy of the username.
   */
  const handleSaveMc = async (mcValue: string | null) => {
    setMcSuccess(null);
    setMcError(null);

    try {
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
              {!isGamer && (
                <p className="text-sm text-muted-foreground">
                  {profile?.email}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {t('roleAccount', { role: profile?.role ?? 'unknown' })}
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

          <Field label={c('firstName')} htmlFor="firstName">
            <Input
              id="firstName"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              placeholder={t('firstNamePlaceholder')}
              maxLength={DISPLAY_NAME_MAX}
              autoComplete="given-name"
            />
          </Field>

          {!isGamer && (
            <Field label={c('lastName')} htmlFor="lastName">
              <Input
                id="lastName"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder={t('lastNamePlaceholder')}
                maxLength={DISPLAY_NAME_MAX}
                autoComplete="family-name"
              />
            </Field>
          )}

          <Field label={c('phoneNumber')} htmlFor="phone" optional>
            <InternationalPhoneInput
              id="phone"
              value={phone || undefined}
              onChange={(value) => setPhone(value ?? "")}
            />
          </Field>

          <SpokenLanguageCheckboxes
            spokenLanguages={availableLanguages ?? []}
            selected={spokenLanguages}
            onChange={setSpokenLanguages}
          />

          {isParent && (
            <Field
              label={t('location')}
              htmlFor="homeLocation"
              optional
            >
              <HomeLocationField
                id="homeLocation"
                value={homeLocation}
                onChange={(pick) => setHomeLocationEdit({ pick })}
                disabled={isSaving}
              />
            </Field>
          )}

          {!isGamer && (
            <Field label={c('email')}>
              <Input
                value={profile?.email || ""}
                disabled
                className="bg-muted"
              />
            </Field>
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
          {profile?.role === "customer" && (
            <Button
              variant="outline"
              onClick={() => router.push(ROUTES.customer.changePin)}
            >
              {t('changePin')}
            </Button>
          )}
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
            <GameUsernameEditableRow
              platform="minecraft"
              username={mcAccount?.minecraft_username ?? null}
              externalId={mcAccount?.minecraft_uuid ?? null}
              onCommit={({ username }) => void handleSaveMc(username)}
              className="max-w-sm"
            />

            {/* Below the row, not above it. The outcome of a save arrives after
                the save, so a banner above the row would push the row — the very
                thing the person just used, and is still looking at — down the
                page as it lands. Last thing in the last card on the page, so it
                grows into empty space and moves nothing. */}
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
      )}
    </div>
  );
}
