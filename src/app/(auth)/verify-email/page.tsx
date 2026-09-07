import type { Metadata } from "next";
import Link from "next/link";
import { MailCheck, MailX } from "lucide-react";
import { getTranslations } from "next-intl/server";

import { RequestPasswordLinkButton } from "@/components/auth";
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
 *
 * **A child in sign-in mode `email` gets a third outcome, because for them this
 * page is not the end of anything.** They have no password at all until the
 * address is confirmed — that is the whole design: a parent gives us an address,
 * the child proves they can read it, and only then may they choose the
 * credential. So the page says what comes next and hands them the button that
 * asks for it.
 *
 * **Nothing is mailed by arriving here.** This page sends no password link of
 * its own: a GET that mints a recovery token is a live credential mailed on a
 * machine's schedule — a reload, a second click, or an inbox scanner
 * pre-fetching the URL each send one — and a child told "we have sent you one
 * more email" by a page that could not report a failure is told something the
 * page does not know. The child asks, and then it goes. That also collapses the
 * two states this branch used to have: a first redemption and a revisit are one
 * page, because for the reader they are one situation.
 *
 * The reader here is a child, and the copy is written for one: short sentences,
 * no jargon, and the address is never printed on the page (see
 * `RequestPasswordLinkButton`).
 */
export default async function VerifyEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  const t = await getTranslations("verifyEmail");
  const c = await getTranslations("common");

  // A repeated `?token=a&token=b` is not a token. `typeof === "string"` is the
  // idiom the other token landing page uses, and it rejects that case for free.
  const { outcome, role, signIn, email } = await redeemEmailVerificationToken(
    typeof token === "string" ? token : null,
  );

  const verified = outcome === "verified";

  // The one account shape for which verifying is a step rather than a
  // confirmation. Every field is non-null on a verified outcome; the check on
  // `email` is what narrows the type for the use below.
  const gamerNeedsPassword =
    verified && role === "gamer" && signIn === "email" && email !== null;

  if (gamerNeedsPassword) {
    return (
      <div className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
        <MailCheck className="h-12 w-12 text-success" />
        <div className="space-y-2">
          <h1 className="text-2xl font-bold">{t("gamerVerifiedTitle")}</h1>
          <p className="text-muted-foreground">
            {t("gamerChoosePasswordDescription")}
          </p>
        </div>
        {/* One button, and the way in underneath it as a quiet link (a button
            plus an escape hatch is not a two-answer pair and is not reversed —
            root `CLAUDE.md`, "Button Order").

            The link goes *into* the button component rather than beside it, so
            the "Sent." sentence lands below both: a reveal above the link would
            push it down the moment the mail went out. */}
        <RequestPasswordLinkButton email={email}>
          <Link
            href={ROUTES.login}
            className="text-sm text-muted-foreground hover:text-act"
          >
            {c("signIn")}
          </Link>
        </RequestPasswordLinkButton>
      </div>
    );
  }

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
