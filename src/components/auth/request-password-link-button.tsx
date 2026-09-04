"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";

/**
 * "Send me a password link", for a child who has just confirmed their address.
 *
 * Confirming the address is the whole of what the verification link does; this
 * button is the second step, and the page mails nothing until it is pressed. A
 * child arriving here has no password yet, and a child returning to the same
 * link is in the same situation with an older inbox — one state, one button.
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
 * **A send that lands locks the button for good, and a send that fails hands it
 * back.** The lock is a UI decision and nothing else — the route is free to
 * answer a second request however it likes, and this component makes no claim
 * about that. What it is protecting is the child in front of it: the mail is
 * already on its way, a second copy would only give them two links to choose
 * between, and a button that came back to life is an invitation to press it
 * again while waiting. A failure is the opposite case — nothing arrived, so the
 * one useful thing left is to try once more.
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
  // Disabled State"), and cleared only on the outcome the reader has to retry.
  // On a send that landed it stays set, which is the lock.
  const [committing, setCommitting] = useState(false);
  const [outcome, setOutcome] = useState<"sent" | "failed" | null>(null);

  const send = async () => {
    setCommitting(true);
    setOutcome(null);
    let sent = false;
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      sent = response.ok;
    } catch {
      sent = false;
    }
    setOutcome(sent ? "sent" : "failed");
    if (!sent) setCommitting(false);
  };

  // The disabled state outlives the request; the "Sending" label does not. A
  // locked button reads as the thing that was pressed, not as one still working.
  const inFlight = committing && outcome === null;

  return (
    // The sentence is LAST, under everything the page put here: a reveal at the
    // end of a block pushes nothing that was already painted.
    <div className="flex flex-col items-center gap-4">
      <Button variant="outline" onClick={send} disabled={committing}>
        {inFlight ? c("sending") : t("gamerSendPasswordLink")}
      </Button>
      {children}
      {/* The outcome is announced, not only painted: the button that produced
          it locks on success, so a reader who cannot see the sentence has
          nothing left on the page telling them the mail is on its way. */}
      {outcome === "sent" && (
        <p role="status" className="text-sm text-success">
          {t("gamerPasswordLinkSent")}
        </p>
      )}
      {outcome === "failed" && (
        <p role="alert" className="text-sm text-destructive">
          {t("gamerPasswordLinkFailed")}
        </p>
      )}
    </div>
  );
}
