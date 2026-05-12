"use client";

import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useVerifyMinecraft } from "@/services/minecraft";

interface MinecraftUsernameFieldProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  optional?: boolean;
}

export function MinecraftUsernameField({
  value,
  onChange,
  disabled,
  optional,
}: MinecraftUsernameFieldProps) {
  const t = useTranslations('minecraft');
  const verify = useVerifyMinecraft();
  const [verifiedName, setVerifiedName] = useState<string | null>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);

  // Derive verified status: verified name must match current input
  const isVerified = verifiedName !== null && value === verifiedName;

  const handleVerify = async () => {
    if (!value.trim()) return;
    setVerifyError(null);
    setVerifiedName(null);

    try {
      const result = await verify.mutateAsync(value.trim());
      setVerifiedName(result.username);
      // Update parent with correctly-cased name from Mojang
      if (result.username !== value) {
        onChange(result.username);
      }
    } catch (err) {
      setVerifiedName(null);
      setVerifyError(
        err instanceof Error
          ? err.message
          : t('notFound'),
      );
    }
  };

  const handleChange = (newValue: string) => {
    if (verifyError) setVerifyError(null);
    // Clear verified state when user types (no effect needed — done in handler)
    if (verifiedName !== null) setVerifiedName(null);
    onChange(newValue);
  };

  const isValid = /^[a-zA-Z0-9_]{3,16}$/.test(value);

  return (
    <div className="space-y-2">
      <Label htmlFor="minecraftUsername">
        {t('label')}
        {optional && <span className="ml-1 text-muted-foreground font-normal">{t('optional')}</span>}
      </Label>
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Input
            id="minecraftUsername"
            value={value}
            onChange={(e) => handleChange(e.target.value)}
            placeholder={t('placeholder')}
            disabled={disabled}
          />
          {isVerified && (
            <Check className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-success" />
          )}
        </div>
        <Button
          type="button"
          variant="outline"
          size="default"
          className="w-36"
          onClick={handleVerify}
          disabled={disabled || !value.trim() || !isValid || verify.isPending}
        >
          {verify.isPending ? (
            <>
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              {t('verifying')}
            </>
          ) : (
            t('verify')
          )}
        </Button>
      </div>
      <div
        className="grid overflow-hidden transition-[grid-template-rows,opacity] duration-700 ease-in-out"
        style={{
          gridTemplateRows: isVerified && verifiedName ? "1fr" : "0fr",
          opacity: isVerified && verifiedName ? 1 : 0,
        }}
      >
        <div className="min-h-0">
          <div className="flex flex-col items-center gap-2 pt-2">
            {/* eslint-disable-next-line @next/next/no-img-element -- external third-party URL (mc-heads.net) that we don't want next/image to proxy; small avatar with no optimization benefit */}
            <img
              src={verifiedName ? `https://mc-heads.net/body/${verifiedName}` : undefined}
              alt={verifiedName ? `${verifiedName}'s Minecraft skin` : ""}
              height={64}
              className="rounded"
            />
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
          </div>
        </div>
      </div>
      {verifyError && (
        <p className="text-sm text-muted-foreground">{verifyError}</p>
      )}
    </div>
  );
}
