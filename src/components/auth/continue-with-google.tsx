"use client";

import { useState } from "react";
import Image from "next/image";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { getClient } from "@/lib/supabase/client";
import { googleCallbackUrl } from "@/lib/google-sign-in";
import googleG from "@/assets/partners/google-g.svg";

interface ContinueWithGoogleProps {
  /**
   * The locale-prefixed internal path the callback should land on, or null to
   * let it route by role. It still passes the callback's own allowlist.
   */
  next: string | null;
  /** The form's own submit is in flight. */
  disabled: boolean;
  /** Pressed: the form clears its error and holds its own submit. */
  onBegin: () => void;
  /** Supabase refused before redirecting: the form shows `message`. */
  onFailed: (message: string) => void;
  /** One sentence under the button, where the page needs to say what follows. */
  note?: string;
}

/**
 * The Google alternative beneath an auth form's primary submit: a divider
 * reading "or", then the button, full width.
 *
 * It is an alternative rather than the negative half of a pair, so it stacks
 * below the submit instead of taking the Button Order positions.
 *
 * **No `freezeUntilNavigation()` here, unlike password sign-in.** That freeze
 * exists because `signInWithPassword` fires SIGNED_IN inside the call, before
 * the page has left. `signInWithOAuth` establishes no session on this page at
 * all — it stores the PKCE verifier and hands the document to Google — and the
 * session is minted later by the callback route, on a fresh document. There is
 * no event to hold back, and a freeze would only need undoing on failure.
 */
export function ContinueWithGoogle({
  next,
  disabled,
  onBegin,
  onFailed,
  note,
}: ContinueWithGoogleProps) {
  const t = useTranslations("auth.google");
  const [committing, setCommitting] = useState(false);

  const handleClick = async () => {
    // Before the await, and never cleared on success: the document is about
    // to be handed to Google.
    setCommitting(true);
    onBegin();

    try {
      const { error } = await getClient().auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: googleCallbackUrl(window.location.origin, next),
        },
      });
      if (error) {
        setCommitting(false);
        onFailed(t("failed"));
      }
    } catch {
      setCommitting(false);
      onFailed(t("failed"));
    }
  };

  return (
    <div className="w-full space-y-4">
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span aria-hidden className="h-px flex-1 bg-border" />
        <span>{t("or")}</span>
        <span aria-hidden className="h-px flex-1 bg-border" />
      </div>
      <div className="space-y-2">
        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={disabled || committing}
          onClick={handleClick}
        >
          {/* Google's mark at the size and colours Google ships it; their
              rules forbid resizing or recolouring it. `unoptimized` because the
              optimizer refuses SVG, and a bundled 18px file needs no pass.
              The spinner that replaces it keeps the same 18px box, so the
              label does not shift under the pointer that just pressed it. */}
          {committing ? (
            <span className="flex size-[18px] items-center justify-center">
              <Loader2 className="animate-spin" />
            </span>
          ) : (
            <Image src={googleG} alt="" width={18} height={18} unoptimized />
          )}
          {t("continue")}
        </Button>
        {note && (
          <p className="text-center text-sm text-muted-foreground">{note}</p>
        )}
      </div>
    </div>
  );
}
