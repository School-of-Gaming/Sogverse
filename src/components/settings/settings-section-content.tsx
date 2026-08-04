"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { User, Lock, Gamepad2, LogOut } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
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
import { useMyRobloxAccount, useRobloxRender, useUpdateMyRoblox } from "@/services/roblox";
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
  // Game identities belong to the people who play: a child and the educator
  // running the session. A parent's own account has none.
  const showGameAccounts = profile?.role === "gamer" || profile?.role === "gedu";
  const isGedu = profile?.role === "gedu";
  const isGamer = isGamerProfile(profile);
  const isParent = profile?.role === "customer";
  const { data: mcAccount } = useMyMinecraftAccount();
  const updateMyMc = useUpdateMyMinecraft();
  const { data: robloxAccount } = useMyRobloxAccount();
  const updateMyRoblox = useUpdateMyRoblox();
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

      {showGameAccounts && (
        <>
          <GameAccountCard
            platform="minecraft"
            title={t('minecraftAccount')}
            description={t('minecraftDescription')}
            username={mcAccount?.minecraft_username ?? null}
            externalId={mcAccount?.minecraft_uuid ?? null}
            onSave={(value) => updateMyMc.mutateAsync(value)}
            note={
              /* A courtesy credit, not a licence condition — mc-heads asks for
                 nothing and encourages this. One home is enough for a thank-you,
                 and this is the page where a person is looking at their own skin,
                 so it is the one that earns it. An anchor is fine here: the
                 no-off-site-links rule governs staff-authored copy shown to
                 families, not the app's own chrome. */
              <p className="text-xs text-muted-foreground">
                {t.rich('mcHeadsAttribution', {
                  link: (chunks) => (
                    <a
                      href="https://mc-heads.net"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline hover:text-foreground"
                    >
                      {chunks}
                    </a>
                  ),
                })}
              </p>
            }
          />

          <GameAccountCard
            platform="roblox"
            title={t('robloxAccount')}
            description={t('robloxDescription')}
            username={robloxAccount?.roblox_username ?? null}
            externalId={robloxAccount?.roblox_user_id ?? null}
            onSave={(value) => updateMyRoblox.mutateAsync(value)}
          />
        </>
      )}
    </div>
  );
}

/**
 * One platform's card: the row, and the sentence that follows a save.
 *
 * Both platforms render the identical thing, so they are the identical
 * component — the only per-platform inputs are the copy, the two stored columns
 * and which mutation to call. `onSave` is a prop rather than a hook so this
 * stays a presentational card, and so the two cards cannot drift into two
 * slightly different save behaviours.
 */
function GameAccountCard({
  platform,
  title,
  description,
  note,
  username,
  externalId,
  onSave,
}: {
  platform: GamePlatform;
  title: string;
  description: string;
  /** Optional extra line under the description (the mc-heads credit). */
  note?: ReactNode;
  username: string | null;
  externalId: GameAccountExternalId | null;
  onSave: (username: string | null) => Promise<unknown>;
}) {
  const g = useTranslations('gameAccount');
  const [error, setError] = useState<string | null>(null);
  const name = GAME_PLATFORMS[platform].name;
  // `null` for Minecraft (the row derives its skin from the name) and for an
  // unverified Roblox handle — no stored id to resolve, and looking the *name*
  // up instead could draw whichever stranger happens to own it.
  const { data: render } = useRobloxRender(robloxAccountId(platform, externalId));

  /**
   * Committing the row *is* saving it — there is no separate Save button, because
   * the row's own commit already asked the question one would have answered.
   *
   * The row has verified the name against the platform by the time this runs, so
   * what arrives is the canonical casing; the route re-runs the lookup
   * server-side anyway, because a client-verified name is not evidence. The
   * mutation invalidates the account query, which feeds the row its new props —
   * the loop that keeps this card from holding a second copy of the username.
   *
   * **A success sentence is not part of that loop, and there is none.** The row
   * itself is the receipt: the new name is on screen, the tick lands beside it,
   * the skin arrives in the box. A banner underneath saying the same thing in
   * words is a second announcement of something already visible — and it makes
   * the ordinary path the noisy one. Only a failure gets a sentence, because a
   * failure is the case the row cannot show on its own.
   */
  const handleCommit = async (value: string | null) => {
    // Cleared first, so a retry after a failure does not leave the old reason
    // sitting under a row that has since succeeded.
    setError(null);

    try {
      await onSave(value);
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
        {note}
      </CardHeader>
      <CardContent className="space-y-6">
        <GameUsernameEditableRow
          platform={platform}
          username={username}
          externalId={externalId}
          // Minecraft omits it and derives its skin from the name. Roblox hands
          // in what the by-id lookup resolved — or `null` while it is in flight,
          // which draws the silhouette in a box already at its final size, so
          // the picture lands without moving anything.
          avatarUrl={platform === "roblox" ? (render?.avatarUrl ?? null) : undefined}
          // Returned, not voided: the row waits on the write before it lets go
          // of the name it is showing.
          onCommit={({ username: committed }) => handleCommit(committed)}
          className="max-w-sm"
        />

        {/* Failures only, and below the row rather than above it. A banner above
            would push the row — the very thing the person just used, and is
            still looking at — down the page as it lands. What it does push is
            the card below, and only ever because this person just committed
            something here and it did not take. On the ordinary path nothing
            appears at all and nothing moves. */}
        {error && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
