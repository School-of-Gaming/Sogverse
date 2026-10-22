"use client";

import { useId } from "react";
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
import { formatFileSize } from "@/lib/file-size";
import { useAuth } from "@/providers/auth-provider";

/** The file one reader would download: its language and size. */
export interface GuideDownloadFile {
  locale: SupportedLocale;
  byteSize: number;
}

/**
 * **A guide section's download, decided by whether the reader is signed in** —
 * the one part of a landing page that depends on who is looking, so the one
 * part drawn in the browser, from the session the app's auth provider already
 * holds. The page around it stays the same page for everyone.
 *
 * Signed in, whatever the role, the button downloads the file in the page's
 * language by the reader fallback. Signed out, the same button stands in the
 * same place, disabled, with the reason under it and the way to an account: a
 * new account or a sign-in, each returning to this page.
 *
 * **Nothing moves when the session is known.** The locale layout reads the
 * session on the server and seeds the provider, so a signed-in reader's first
 * paint is already the signed-in one, and a signed-out reader's first paint —
 * the provider still looking, finding nothing — is already the signed-out
 * one. The one window left is the header's: a session the server missed and
 * the browser finds, where the account prompt goes and the content below the
 * section rises by its height. The button and the words above it hold still
 * either way, and the prompt sits after them so that is all it can do.
 */
export function GuideDownload({
  guideId,
  file,
  locale,
}: {
  guideId: string;
  file: GuideDownloadFile;
  /** The page's locale: the language asked for, and the one the facts are written in. */
  locale: SupportedLocale;
}) {
  const t = useTranslations("landingPage.guide");
  const { user } = useAuth();
  const pathname = usePathname();
  const noteId = useId();
  const signedIn = user !== null;

  const size = formatFileSize(file.byteSize, locale);
  // exact-locale: says so when the file the fallback picked is in another language
  const inPageLanguage = file.locale === locale;
  const facts = inPageLanguage
    ? t("file", { size })
    : t("fileInLanguage", { size, language: t(`inLanguage.${file.locale}`) });

  const label = (
    <>
      <Download aria-hidden="true" className="h-4 w-4" />
      {t("download")}
    </>
  );
  const buttonClass = buttonVariants({ size: "lg", className: "gap-2" });
  const redirectQuery = { redirect: pathname };

  return (
    <div className="mt-8">
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-4">
        {signedIn ? (
          <a
            href={`/api/guides/${guideId}/download?locale=${locale}`}
            download
            className={buttonClass}
          >
            {label}
          </a>
        ) : (
          <button type="button" disabled aria-describedby={noteId} className={buttonClass}>
            {label}
          </button>
        )}
        <p className="text-sm text-muted-foreground">{facts}</p>
      </div>
      {!signedIn && (
        <div className="mt-6 border-t border-border pt-6">
          <p id={noteId} className="text-muted-foreground">
            {t("accountNeeded")}
          </p>
          {/* A button and a quiet link are not a pair, so no reversal: the
              new account first, the sign-in after it. */}
          <div className="mt-4 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:gap-6">
            <Link
              href={{ pathname: ROUTES.register, query: redirectQuery }}
              className={buttonVariants({ variant: "outline" })}
            >
              {t("createAccount")}
            </Link>
            <Link
              href={{ pathname: ROUTES.login, query: redirectQuery }}
              className={cn(buttonVariants({ variant: "link" }), "h-auto px-0")}
            >
              {t("signIn")}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
