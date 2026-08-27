"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { User, Lock, LogOut, MailCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Identicon } from "@/components/ui/identicon";
import { GameAccountCard } from "@/components/game-account";
import { InternationalPhoneInput } from "@/components/ui/phone-input";
import { SpokenLanguageCheckboxes } from "@/components/ui/spoken-language-checkboxes";
import { GeduCoverageEditor } from "@/components/gedu/gedu-coverage-editor";
import { GeduContractSettingsCard } from "@/components/gedu/contract/gedu-contract-settings-card";
import { HomeLocationField } from "@/components/locations/home-location-field";
import type { LocationPick } from "@/components/locations/location-picker-panel";
import { DISPLAY_NAME_MIN, DISPLAY_NAME_MAX, ROUTES } from "@/lib/constants";
import { useAuth } from "@/providers";
import { isValidPhoneNumber } from "react-phone-number-input";
import { useUpdateProfile, useSendVerificationEmail } from "@/services/users";
import { useLocationsByIds, type LocationWithChain } from "@/services/locations";
import { toE164Digits } from "@/lib/utils";
import { useMyMinecraftAccount, useUpdateMyMinecraft } from "@/services/minecraft";
import { useMyRobloxAccount, useUpdateMyRoblox } from "@/services/roblox";
import {
  isGamerProfile,
  type GeduContractAcceptance,
  type ProfileUpdate,
  type SpokenLanguageCode,
} from "@/types";

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
  initialGeduContractAcceptances = null,
}: {
  /**
   * A gedu's contract acceptances, prefetched by the route — or `null` when
   * that read failed *or* the viewer is not a gedu, in which case the card this
   * seeds is never rendered. It is threaded straight through to the card's data
   * shell, which seeds the very cache entry the hook reads; `null` means do not
   * seed, so the hook fetches on mount rather than settling on a wrong answer.
   */
  initialGeduContractAcceptances?: GeduContractAcceptance[] | null;
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

  const [firstName, setFirstName] = useState(profile?.first_name ?? "");
  const [lastName, setLastName] = useState(profile?.last_name ?? "");
  const [phone, setPhone] = useState(profile?.phone ? `+${profile.phone}` : "");
  const [spokenLanguages, setSpokenLanguages] = useState<SpokenLanguageCode[]>(
    profile?.spoken_languages ?? [],
  );
  const [isSaving, setIsSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // ---------------------------------------------------------------------
  // Email verification
  //
  // The profile is seeded server-side in the root layout, so the verified /
  // unverified line is decided before the first paint and never arrives late —
  // nothing under it moves once the page is up. Gamers have no line at all:
  // their address is the synthetic `@gamer.sogverse.internal` one their account
  // was created with, which is why the whole Email field is already
  // non-gamer-only.
  // ---------------------------------------------------------------------
  const isEmailVerified = profile?.email_verified_at !== null && profile?.email_verified_at !== undefined;
  const sendVerification = useSendVerificationEmail();
  // Local, and deliberately not a shared hook (see the loading-state rule in
  // CLAUDE.md — the extraction was tried and rejected). `sending` is what the
  // button reads, because React Query's `isPending` flips false a render before
  // the outcome handlers run.
  const [sendingVerification, setSendingVerification] = useState(false);
  // Three outcomes rather than two: `rate_limited` is the per-hour limit the
  // send route enforces in the database, and it needs its own sentence because
  // "try again" — the advice a generic failure gives — is exactly the wrong
  // thing to tell someone who has already tried six times.
  const [verificationOutcome, setVerificationOutcome] = useState<
    "sent" | "rate_limited" | "failed" | null
  >(null);

  const handleSendVerificationEmail = () => {
    // Live before any render after the click. Every outcome clears it, because
    // the user stays on this page in all of them and a second send — after a
    // mail that never arrived, or to a second device — is a legitimate thing to
    // want. That includes the rate-limited one: the button has to come back for
    // the next attempt an hour later to be possible at all.
    setSendingVerification(true);
    setVerificationOutcome(null);
    sendVerification.mutate(undefined, {
      onSuccess: (outcome) => {
        setVerificationOutcome(outcome);
        setSendingVerification(false);
      },
      onError: () => {
        setVerificationOutcome("failed");
        setSendingVerification(false);
      },
    });
  };

  // ---------------------------------------------------------------------
  // Password reset
  //
  // The button sends the ordinary password-reset mail — the same route the
  // public forgot-password form posts to — and says so inline. It navigates
  // nowhere: the reset itself happens on /reset-password, which only works
  // with the single-use token the mail carries, so walking someone there
  // without one is a dead end (that was the bug this replaced).
  //
  // Gamers get no button at all. They sign in by account-switch from their
  // parent, where the server mints the credential; they never type a password,
  // their `@gamer.sogverse.internal` address is synthetic and reaches no
  // inbox, so the mail could not arrive — and a child holding a password of
  // their own would be a way into the account that does not pass through the
  // parent. That is why this is gated on `isGamer` rather than on whether a
  // deliverable address happens to exist.
  // ---------------------------------------------------------------------
  // Local and set synchronously before the request, for the same reason
  // `sendingVerification` above is. Every outcome clears it: the user stays on
  // this page, and asking for a second link — after a mail that never arrived,
  // or once the first has expired — is a legitimate thing to want.
  const [sendingPasswordReset, setSendingPasswordReset] = useState(false);
  // Two outcomes, not three. The forgot-password route enforces no rate limit
  // and answers 200 whatever it finds — that uniform answer is its enumeration
  // defence — so a server-side failure is indistinguishable from success here
  // and reads as "sent". `failed` therefore only fires on a network or
  // HTTP-level error, which is the accepted trade for not leaking which
  // addresses have accounts.
  const [passwordResetOutcome, setPasswordResetOutcome] = useState<
    "sent" | "failed" | null
  >(null);

  const handleSendPasswordReset = async (email: string) => {
    // Live before any render after the click — everything up to the first
    // `await` runs synchronously inside the event handler.
    setSendingPasswordReset(true);
    setPasswordResetOutcome(null);
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setPasswordResetOutcome(response.ok ? "sent" : "failed");
    } catch {
      setPasswordResetOutcome("failed");
    } finally {
      setSendingPasswordReset(false);
    }
  };

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

      // Both names trimmed on the way out. This write goes straight to Supabase
      // from the browser — no route, no contract — so nothing downstream will
      // strip whitespace the field picked up.
      const updates: ProfileUpdate = {
        first_name: firstName.trim(),
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
              {isEmailVerified ? (
                <p className="flex items-center gap-1.5 text-sm text-success">
                  <MailCheck className="h-4 w-4 shrink-0" aria-hidden />
                  {t('emailVerified')}
                </p>
              ) : (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="text-sm text-muted-foreground">
                      {t('emailNotVerified')}
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleSendVerificationEmail}
                      disabled={sendingVerification}
                    >
                      {sendingVerification
                        ? c('sending')
                        : t('sendVerificationEmail')}
                    </Button>
                  </div>
                  {verificationOutcome === "sent" && (
                    <p className="text-sm text-success">
                      {t('verificationEmailSent')}
                    </p>
                  )}
                  {/* Warning rather than destructive: nothing broke, and the
                      wait is short — but no mail went out, so it cannot read as
                      success either. */}
                  {verificationOutcome === "rate_limited" && (
                    <p className="text-sm text-warning">
                      {t('verificationEmailRateLimited')}
                    </p>
                  )}
                  {verificationOutcome === "failed" && (
                    <p className="text-sm text-destructive">
                      {t('verificationEmailFailed')}
                    </p>
                  )}
                </div>
              )}
            </Field>
          )}

          <Button onClick={handleSaveProfile} disabled={isSaving}>
            {isSaving ? c('saving') : c('saveChanges')}
          </Button>
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

      {/* Security sits at the foot of the page for every role — the exit and
          the rarely-used credential actions come after the things people came
          to edit. The one card allowed below it is the gedu contract card,
          which keeps the last slot for the reason its own comment gives, so
          this ordering is load-bearing, not aesthetic. */}
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
        <CardContent className="space-y-3">
          <div className="flex flex-wrap gap-3">
            {/* See the password-reset block above for why gamers have none. */}
            {profile && !isGamer && (
              <Button
                variant="outline"
                onClick={() => handleSendPasswordReset(profile.email)}
                disabled={sendingPasswordReset}
              >
                {sendingPasswordReset ? c('sending') : t('resetPassword')}
              </Button>
            )}
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
          </div>
          {passwordResetOutcome === "sent" && (
            <p className="text-sm text-success">
              {t('resetPasswordEmailSent', { email: profile?.email ?? "" })}
            </p>
          )}
          {passwordResetOutcome === "failed" && (
            <p className="text-sm text-destructive">
              {t('resetPasswordEmailFailed')}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Last on the page, and still a layout decision rather than a ranking
          one — but the thing it now guards against is rare. The route seeds
          this card's read, so on the ordinary visit it is born in its real
          state and paints at its final height like every other card here.
          What is left is the degraded path: when that server read fails the
          seed is withheld, the browser asks again, and the card grows when the
          answer lands. Last is where that growth pushes nothing. Anywhere
          higher it would have to hold a slot open at the taller of its two
          states for a case that almost never happens, leaving a visible hole
          in the shorter one on every ordinary visit. */}
      {isGedu && user && (
        <GeduContractSettingsCard
          geduId={user.id}
          initialAcceptances={initialGeduContractAcceptances}
        />
      )}
    </div>
  );
}

