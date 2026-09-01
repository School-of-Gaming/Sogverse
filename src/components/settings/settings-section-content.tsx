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
import {
  GeduContractSettingsCard,
  type GeduContractSeed,
} from "@/components/gedu/contract/gedu-contract-settings-card";
import { HomeLocationField } from "@/components/locations/home-location-field";
import {
  MarketingPreferencesFields,
  MARKETING_CONSENT_ORDER,
} from "@/components/settings/marketing-preferences-fields";
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
  useMyMarketingConsents,
  useSetMarketingConsent,
} from "@/services/marketing-consents";
import {
  isGamerProfile,
  type MarketingConsent,
  type MarketingConsentType,
  type ProfileUpdate,
  type SpokenLanguageCode,
} from "@/types";

/**
 * The baseline a failed marketing-consent read falls back to: nothing granted.
 *
 * Module-level so it is one stable array rather than a fresh one per render —
 * the value is read during render and never mutated, and a new identity each
 * time is churn with no reader.
 */
const NO_MARKETING_CONSENTS: readonly MarketingConsent[] = [];

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
  geduContractSeed,
}: {
  /**
   * A gedu's contract acceptances as the route read them, with the moment it
   * read them. Threaded straight through to the card's data shell, which seeds
   * the very cache entry the hook reads.
   *
   * **Absent means "not a gedu", and nothing else.** The route reads only for a
   * gedu and fails rather than render this page without an answer, so there is
   * no failed-read value to carry and no third state for the card to be in.
   */
  geduContractSeed?: GeduContractSeed;
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

  // ---------------------------------------------------------------------
  // Marketing preferences
  //
  // A group inside this card rather than a card of its own, and therefore
  // saved by this card's button. Parents only: the consent is held by the adult
  // whose mailbox it is about, which is what the RPC's `assert_role('customer')`
  // guard enforces — for a gamer or a gedu the database would refuse the write,
  // so the group is not offered. The read is switched off for them for the same
  // reason: `useMyMarketingConsents` widens under an admin's own SELECT policy
  // and holds no grant for `anon`, so a caller that cannot promise a customer
  // session must not make it.
  // ---------------------------------------------------------------------
  const { data: marketingConsentRows, isError: marketingReadFailed } =
    useMyMarketingConsents({ enabled: isParent });
  const setMarketingConsent = useSetMarketingConsent();

  /**
   * The baseline the boxes render from and a save diffs against.
   *
   * **A failed read resolves to "nothing granted" rather than to "not known
   * yet".** The two states are the same `undefined` from the query's data, and
   * collapsing them left a parent staring at two boxes disabled forever with
   * nothing saying why — a dead control is a worse answer than a wrong-looking
   * one. So on an error the group renders unticked and *usable*, and the
   * ordinary change-only save logic runs against that empty baseline.
   *
   * **What makes an assumed-empty baseline safe is the change-only save.** An
   * untouched box equals the assumed baseline, so it is not written at all: a
   * parent who granted a consent months ago, hits a network blip today, and
   * saves an unrelated name change is not silently withdrawn — nothing about
   * their consents is sent. Only a box they actually moved is written, and it is
   * written as shown, because submitting the form is the parent saying the UI
   * state in front of them is what they want on file. Ticking something they
   * already held is then a no-op at the database, which the RPC handles by
   * appending no event.
   *
   * The loading path is untouched and still `undefined`: the boxes stay disabled
   * until the seed lands, which guards an edit/seed race rather than an error.
   */
  const marketingConsents = marketingReadFailed
    ? NO_MARKETING_CONSENTS
    : marketingConsentRows;

  /** What the baseline says is granted. A consent with no row at all is a no. */
  const savedMarketingGranted = (consentType: MarketingConsentType) =>
    marketingConsents?.some(
      (row) => row.consent_type === consentType && row.granted,
    ) ?? false;

  /**
   * Edits made on top of the saved answers, keyed by consent.
   *
   * The same wrapper-over-the-saved-value shape the home location above uses,
   * and for the same reason: `false` is a real edit — the parent unticked the
   * box — and a bare boolean map could not tell it from "not touched yet".
   * Untouched consents stay absent, which is what lets a save write only what
   * actually changed.
   */
  const [marketingEdits, setMarketingEdits] = useState<
    Partial<Record<MarketingConsentType, boolean>>
  >({});
  const marketingGranted = (consentType: MarketingConsentType) =>
    marketingEdits[consentType] ?? savedMarketingGranted(consentType);

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
        spoken_languages: spokenLanguages,
      };

      // A child's phone number is data we do not want to hold, so a gamer's
      // settings neither render the phone field nor write the key — omitting
      // it here is what guarantees a save can never store one.
      if (!isGamer) {
        updates.phone = toE164Digits(phone);
      }

      // Only when we know what the current value is. An unresolved read is
      // `undefined`, and writing `null` for it would clear a location the user
      // never touched and has not even been shown yet — omitting the key leaves
      // it alone. A cleared field is `null` and does have to be written.
      if (isParent && homeLocation !== undefined) {
        updates.home_location_id = homeLocation?.location.id ?? null;
      }

      await updateProfile.mutateAsync({ userId: user.id, updates });
      await refreshProfile();

      // Marketing consents are separate writes, because they are: each one is
      // an RPC that appends to the consent event log, not a profile column. So
      // they run after the profile update has landed, and **only for the
      // consents whose answer actually changed** — the RPC would no-op an
      // unchanged one, but a no-op still costs a round trip and still writes a
      // "source: settings" touch nobody made.
      //
      // Skipped entirely while the read is UNRESOLVED: the boxes were disabled,
      // so there are no edits, and comparing against a seed of `false` would
      // manufacture a write for a parent who is already opted in. A read that
      // FAILED is a different case and passes this gate deliberately — its
      // baseline is the empty one above, and the change-only comparison is what
      // keeps that safe: an untouched box matches the assumed baseline and is
      // never sent, so only a box the parent actually moved is written.
      //
      // **A refusal here throws into the catch below**, which is the deliberate
      // partial-failure shape: the profile half has already saved, so the
      // reader sees the error and no success line — the honest report of "some
      // of that did not land". The boxes keep showing what they chose (the
      // edits are local and a failed write leaves them untouched), so pressing
      // Save again re-attempts exactly the consents that still differ. The
      // profile update re-running with identical values is harmless.
      //
      // **The refusal is re-thrown as our own translated sentence**, and that is
      // the point of the inner catch. These are `.rpc()` calls, so a failure
      // arrives as a PostgrestError carrying raw Postgres English — a guard's
      // message, a constraint name — and the catch below prints an error's
      // `message` verbatim. Showing a parent "new row violates row-level
      // security policy" is worse than useless: it is untranslated, it means
      // nothing to them, and it leaks the shape of the schema. The original is
      // kept as `cause` so it still reaches a console or a report.
      if (isParent && marketingConsents !== undefined) {
        try {
          for (const consentType of MARKETING_CONSENT_ORDER) {
            const next = marketingGranted(consentType);
            if (next === savedMarketingGranted(consentType)) continue;
            await setMarketingConsent.mutateAsync({
              consentType,
              granted: next,
              source: "settings",
            });
          }
        } catch (consentError: unknown) {
          throw new Error(t('failedToUpdateProfile'), { cause: consentError });
        }
      }

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
        <h1 className="text-3xl font-semibold">{c('settings')}</h1>
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

          {/* No phone for gamers — a child's phone number is data we do not
              want to hold. The save path omits the key for gamers too. */}
          {!isGamer && (
            <Field label={c('phoneNumber')} htmlFor="phone" optional>
              <InternationalPhoneInput
                id="phone"
                value={phone || undefined}
                onChange={(value) => setPhone(value ?? "")}
              />
            </Field>
          )}

          <SpokenLanguageCheckboxes
            selected={spokenLanguages}
            onChange={setSpokenLanguages}
          />

          {/* Between the spoken languages and the location: the two questions
              about what we send a family and where they are, under the fields
              that say who they are. Parents only — see the block above. */}
          {isParent && (
            <MarketingPreferencesFields
              granted={marketingGranted}
              onChange={(consentType, next) =>
                setMarketingEdits((current) => ({
                  ...current,
                  [consentType]: next,
                }))
              }
              disabled={marketingConsents === undefined || isSaving}
            />
          )}

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

      {/* The seed's presence is the role test: the route reads these rows only
          for a gedu, so a viewer who is not one has nothing to hand down and no
          card to render. */}
      {user && geduContractSeed && (
        <GeduContractSettingsCard geduId={user.id} seed={geduContractSeed} />
      )}

      {/* Security is the last card on the page for every role — an owner
          ruling. The exit and the rarely-used credential actions come after the
          things people came to edit. */}
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
    </div>
  );
}

