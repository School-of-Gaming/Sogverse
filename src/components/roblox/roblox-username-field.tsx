"use client";

import { useState } from "react";
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

  // Derived, not stored: the result only stands while the input still says what
  // was checked, so typing one more character retires it without an effect.
  const isVerified = verified !== null && value === verified.username;

  const status: RobloxCheckStatus = checking
    ? "checking"
    : isVerified
      ? "valid"
      : verifyError !== null
        ? "invalid"
        : "idle";

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
      setVerified(profile);
      // Roblox hands back the canonical casing; adopt it.
      if (profile.username !== value) onChange(profile.username);
    } catch (err) {
      setChecking(false);
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
