"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { useVerifyRoblox } from "@/services/roblox";
import {
  RobloxUsernameRow,
  type RobloxCheckStatus,
} from "./roblox-username-row";
import { isValidRobloxUsername } from "@/lib/roblox";

interface RobloxUsernameFieldProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  optional?: boolean;
}

/**
 * Enter a Roblox username and check it against Roblox.
 *
 * **The identity row underneath is always there.** It is drawn from first paint,
 * at its final size, showing the placeholder figure and whatever has been typed
 * — so the avatar that lands after a check lands *into a slot that was already
 * holding its space*, and nothing on the page moves. This is the deliberate
 * departure from the Minecraft field, which reveals its skin by animating a grid
 * row from `0fr` to `1fr`: that is a re-layout of everything below it, on an
 * async schedule, and it is what this pattern exists to avoid.
 *
 * **The loading affordance is the row's status slot, not the button.** The check
 * is two external hops behind one route and lands in a few hundred milliseconds,
 * and the row already owns a fixed square for exactly this — a spinner there
 * costs no layout at all. Putting a second spinner inside the button would say
 * the same thing twice. The button is still disabled for the whole flight, held
 * by a flag set synchronously before the call rather than by the mutation's own
 * pending state, so it cannot flicker back to enabled in the frame between the
 * request resolving and the result rendering.
 */
export function RobloxUsernameField({
  value,
  onChange,
  disabled,
  optional,
}: RobloxUsernameFieldProps) {
  const t = useTranslations("roblox.account");
  const verify = useVerifyRoblox();
  const [checking, setChecking] = useState(false);
  const [verified, setVerified] = useState<{
    username: string;
    displayName: string;
    avatarUrl: string | null;
  } | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  /**
   * The live value, readable from an async continuation.
   *
   * `handleVerify` closes over `value` as it was at the moment of the click, and
   * the input stays editable for the whole flight — so by the time a result
   * lands, that captured string may be several keystrokes out of date. Comparing
   * against it is what let a lookup write its answer over what someone was in the
   * middle of typing. This ref is the only way the continuation can ask what the
   * box says *now*.
   */
  const liveValue = useRef(value);
  useEffect(() => {
    liveValue.current = value;
  }, [value]);

  // Derived, not stored: the result only stands while the input still says what
  // was checked, so typing one more character retires it without an effect.
  const isVerified = verified !== null && value === verified.username;

  // A failed lookup is *not* its own row state: to the row, a name we could not
  // confirm is simply unverified, and the reason lives in this field's own error
  // copy below — the one place that actually knows it. Same for a name nobody
  // has checked yet. So anything typed but unconfirmed reads as `unverified`,
  // and an empty box is the only thing that reads as `unknown`.
  const status: RobloxCheckStatus = checking
    ? "checking"
    : isVerified
      ? "verified"
      : value.trim() === ""
        ? "unknown"
        : "unverified";

  /**
   * Whether a landed result is for a name the field no longer holds.
   *
   * Such a result is **discarded, not applied** — neither the profile nor the
   * error. Applying it would either overwrite what is being typed or accuse the
   * new name of a failure that belongs to the old one. `checking` is still
   * cleared first, because the request really did finish; the row falls back to
   * `unverified`, which is exactly what the new text is.
   */
  const isStale = (requested: string) => liveValue.current.trim() !== requested;

  const handleVerify = async () => {
    const username = value.trim();
    if (!username) return;
    // Set before the call, so no render between the click and the result can
    // catch the button enabled.
    setChecking(true);
    setVerifyError(null);
    setVerified(null);

    try {
      const profile = await verify.mutateAsync(username);
      // One batched update: the button re-enables in the same render that shows
      // the result, never a frame earlier.
      setChecking(false);
      if (isStale(username)) return;
      setVerified(profile);
      // Roblox hands back the canonical casing; adopt it. Compared against the
      // live value, not the captured one — the captured one is what made this
      // line overwrite the user's typing.
      if (profile.username !== liveValue.current) onChange(profile.username);
    } catch (err) {
      setChecking(false);
      if (isStale(username)) return;
      setVerifyError(err instanceof Error ? err.message : t("notFound"));
    }
  };

  const handleChange = (newValue: string) => {
    if (verifyError) setVerifyError(null);
    if (verified !== null) setVerified(null);
    onChange(newValue);
  };

  const isValid = isValidRobloxUsername(value);

  return (
    <Field label={t("label")} htmlFor="robloxUsername" optional={optional}>
      <div className="flex gap-2">
        <Input
          id="robloxUsername"
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={t("placeholder")}
          disabled={disabled}
          className="flex-1"
        />
        <Button
          type="button"
          variant="outline"
          size="default"
          className="w-36"
          onClick={handleVerify}
          disabled={disabled || !isValid || checking}
        >
          {t("verify")}
        </Button>
      </div>

      {/* The fixed slot. Present from first paint at its final height, so the
          avatar and the check land into space that was already reserved for
          them and the error line below never moves. */}
      <div className="flex h-12 items-center gap-3">
        <RobloxUsernameRow
          username={value.trim() ? value.trim() : null}
          status={status}
          avatarUrl={isVerified ? verified.avatarUrl : null}
          className="w-64 max-w-full"
        />
        {isVerified && verified.displayName !== verified.username && (
          <span className="min-w-0 truncate text-xs text-muted-foreground">
            {t("displayName", { displayName: verified.displayName })}
          </span>
        )}
      </div>

      {verifyError && (
        <p className="text-sm text-muted-foreground">{verifyError}</p>
      )}
    </Field>
  );
}
