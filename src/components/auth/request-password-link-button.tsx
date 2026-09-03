"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

/**
 * "Send me a password link", for a child standing on a verification link they
 * have already used.
 *
 * The first click of a verification link mails the password link automatically —
 * the child asked for nothing and got what they needed. This is the second visit:
 * the address is verified, the mail was sent once and may be lost, expired, or
 * opened on a device that is not this one, and the only useful thing the page can
 * offer is another copy.
 *
 * **The address is a prop and is never rendered.** The page knows it (the token
 * it just redeemed named the account), and printing it would put a child's email
 * on a page anyone holding the link can open. Posting it back to the
 * forgot-password route is not a leak of the same kind: that route answers 200 to
 * everything and tells the caller nothing it did not already have.
 *
 * One outcome, not two. The route's uniform 200 is its enumeration defence, so
 * "sent" is the honest reading of every answer it can give; only a network or
 * HTTP-level failure is distinguishable, and that gets the retry sentence.
 *
 * **`children` is why this component owns the way out of the page.** The
 * outcome sentence has to be the last thing in the block or it pushes whatever
 * follows it down the viewport when it arrives — the shift the layout rules
 * forbid, and the page's quiet "Sign in" link was exactly what got pushed. So
 * anything that belongs under the button is handed in here and rendered above
 * the sentence, and the reveal lands in the slack at the bottom where it costs
 * nothing (root `CLAUDE.md`, "Layout & Scrolling").
 */
export function RequestPasswordLinkButton({
  email,
  children,
}: {
  email: string;
  /** What sits between the button and the outcome — the page's escape hatch. */
  children?: React.ReactNode;
}) {
  const t = useTranslations("verifyEmail");
  const c = useTranslations("common");
  // Live before any render after the click (root `CLAUDE.md`, "Loading &
  // Disabled State"). Cleared on every outcome: the reader stays on this page,
  // and asking for a second link once the first has expired is legitimate.
  const [sending, setSending] = useState(false);
  const [outcome, setOutcome] = useState<"sent" | "failed" | null>(null);

  const send = async () => {
    setSending(true);
    setOutcome(null);
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setOutcome(response.ok ? "sent" : "failed");
    } catch {
      setOutcome("failed");
    } finally {
      setSending(false);
    }
  };

  return (
    // The sentence is LAST, under everything the page put here: a reveal at the
    // end of a block pushes nothing that was already painted.
    <div className="flex flex-col items-center gap-4">
      <Button variant="outline" onClick={send} disabled={sending}>
        {sending ? c("sending") : t("gamerSendPasswordLink")}
      </Button>
      {children}
      {outcome === "sent" && (
        <p className="text-sm text-success">{t("gamerPasswordLinkSent")}</p>
      )}
      {outcome === "failed" && (
        <p className="text-sm text-destructive">{t("gamerPasswordLinkFailed")}</p>
      )}
    </div>
  );
}
