"use client";

// Raw `usePathname`: the path is embedded in the register and sign-in links'
// `?redirect=`, so it must be the locale-prefixed, translated path the reader is
// on, not the internal route the wrapped hook would answer.
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { Download } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Link } from "@/i18n/navigation";
import { ROUTES } from "@/lib/constants/routes";
import type { SupportedLocale } from "@/lib/constants/locales";
import { cn } from "@/lib/cn";
import { useAuth } from "@/providers/auth-provider";
import { LANDING_STICKY_ACTION, LANDING_WRAPPING_ACTION } from "./landing-section-header";

/** Where a guide section draws its download. */
export type GuideDownloadPlacement = "centred" | "beside-picture";

/** The download's alignment and its gap from the words above, by placement. */
const PLACEMENT: Record<GuideDownloadPlacement, string> = {
  centred: "mt-8 flex flex-col items-center",
  "beside-picture": "mt-8 flex flex-col items-center lg:items-start",
};

/** In a sticky section, from `2xl`, the sticky card's: start-aligned, the button the card's width. */
const STICKY_PLACEMENT = "2xl:mt-6 2xl:items-stretch";

/**
 * **A guide section's download, decided by whether the reader is signed in** —
 * the one part of a landing page that depends on who is looking, so the one
 * part drawn in the browser, from the session the app's auth provider already
 * holds. The page around it stays the same page for everyone.
 *
 * Signed in, whatever the role, the button downloads the file in the page's
 * language by the reader fallback. Signed out, the button in the same place is
 * the way to an account: it opens a new account, and a quiet line under it
 * offers the sign-in, each returning to this page.
 *
 * Centred like the section around it; beside a cover picture, centred on a
 * phone and start-aligned from `lg`, where the picture takes the other column;
 * and in a sticky section, from `2xl` where the section is the sticky card,
 * start-aligned with the button the card's full width.
 *
 * **Nothing moves when the session is known.** The locale layout reads the
 * session on the server and seeds the provider, so a signed-in reader's first
 * paint is already the signed-in one, and a signed-out reader's first paint —
 * the provider still looking, finding nothing — is already the signed-out
 * one. The one window left is the header's: a session the server missed and
 * the browser finds, where the button turns into the download in place and the
 * sign-in line goes, so the content below the section rises by its height. The
 * line sits after the button so that is all it can do.
 */
export function GuideDownload({
  guideId,
  locale,
  placement,
  sticky,
}: {
  guideId: string;
  /** The page's locale: the language the download asks for. */
  locale: SupportedLocale;
  /**
   * Where the section draws it: `centred` alone, or `beside-picture` where a
   * cover picture takes the other column from `lg`.
   */
  placement: GuideDownloadPlacement;
  /** The section is sticky: from `2xl` the download is the sticky card's. */
  sticky: boolean;
}) {
  const t = useTranslations("landingPage.guide");
  const { user } = useAuth();
  const pathname = usePathname();
  const buttonClass = buttonVariants({
    size: "lg",
    className: cn(LANDING_WRAPPING_ACTION, "max-w-full", sticky && LANDING_STICKY_ACTION),
  });
  const redirectQuery = { redirect: pathname };

  return (
    <div className={cn(PLACEMENT[placement], sticky && STICKY_PLACEMENT)}>
      {user !== null ? (
        <a
          href={`/api/guides/${guideId}/download?locale=${locale}`}
          download
          className={buttonClass}
        >
          <Download aria-hidden="true" className="h-4 w-4" />
          {t("download")}
        </a>
      ) : (
        <>
          <Link
            href={{ pathname: ROUTES.register, query: redirectQuery }}
            className={buttonClass}
          >
            {t("createAccountToDownload")}
          </Link>
          {/* After the button, so a session the browser finds late takes away
              only this line, never moving the button. */}
          <p className="mt-4 text-sm text-muted-foreground">
            {t.rich("alreadyHaveAccount", {
              link: (chunks) => (
                <Link
                  href={{ pathname: ROUTES.login, query: redirectQuery }}
                  className="text-act hover:underline"
                >
                  {chunks}
                </Link>
              ),
            })}
          </p>
        </>
      )}
    </div>
  );
}
