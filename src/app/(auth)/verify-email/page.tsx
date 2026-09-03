import type { Metadata } from "next";
import Link from "next/link";
import { MailCheck, MailX } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { buttonVariants } from "@/components/ui/button";
import { ROUTES } from "@/lib/constants";
import { redeemEmailVerificationToken } from "@/lib/email-verification.server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("metadata.pages");
  return {
    title: t("verifyEmail"),
    // A one-shot landing page carrying a token in its URL has nothing to index
    // and every reason not to be crawled.
    robots: { index: false, follow: false },
  };
}

/**
 * Landing page for the emailed verification link (`/verify-email?token=...`).
 *
 * **Verification happens here, during render, on the GET.** The reader clicked
 * a button in an email that said "verify"; asking them to click a second one on
 * arrival would be asking them to confirm what they already confirmed. That is
 * only safe because the write is idempotent and grants nothing (see
 * `email-verification.server.ts`) — a link pre-fetched by a mail scanner writes
 * the state its owner asked for and loses nothing, which is exactly why this is
 * a page and not a POST-behind-a-button.
 *
 * Public and session-agnostic: the signed token is the authorization, so the
 * page renders identically whether the reader is signed in, signed out, or
 * signed in as somebody else on a shared device. It is in the proxy's public
 * list rather than its auth list for that reason — an auth route would bounce a
 * signed-in reader to their dashboard before the token was ever read.
 *
 * Both outcomes are terminal states with one action. Success points at My SOG
 * via `/login`, which the proxy resolves for us: a signed-in reader is sent
 * straight to their own dashboard, a signed-out one gets the sign-in page,
 * which is the way to My SOG from where they are. Failure points at settings,
 * where the "send verification email" button mints a fresh link — the only
 * useful next step, since a dead link is almost always one minted before the
 * address changed.
 */
export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  const t = await getTranslations("verifyEmail");

  // A repeated `?token=a&token=b` is not a token. `typeof === "string"` is the
  // idiom the other token landing page uses, and it rejects that case for free.
  const { outcome } = await redeemEmailVerificationToken(
    typeof token === "string" ? token : null,
  );

  const verified = outcome === "verified";

  return (
    <div className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
      {verified ? (
        <MailCheck className="h-12 w-12 text-success" />
      ) : (
        <MailX className="h-12 w-12 text-destructive" />
      )}
      <div className="space-y-2">
        <h1 className="text-2xl font-bold">
          {verified ? t("successTitle") : t("invalidTitle")}
        </h1>
        <p className="text-muted-foreground">
          {verified ? t("successDescription") : t("invalidDescription")}
        </p>
      </div>
      <Link
        href={verified ? ROUTES.login : ROUTES.settings}
        className={buttonVariants()}
      >
        {verified ? t("goToDashboard") : t("goToSettings")}
      </Link>
    </div>
  );
}
