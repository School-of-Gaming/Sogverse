import Link from "next/link";
import { useTranslations } from 'next-intl';
import type { ReactNode } from "react";
import { Copyright } from "./copyright";
import { ROUTES, SUPPORT_EMAIL } from "@/lib/constants";

/* The geographic tree is built from GeoNames (CC BY 4.0) and France's postal
   codes from La Poste's Base officielle (Licence Ouverte 2.0); both licences
   require the credit this line carries. It says "based on" rather than "from"
   because the tree is not the dumps: rows are filtered, excluded, re-levelled
   and renamed by the ingestion config, and CC BY asks that a modified work say
   so. An anchor is fine here: the no-off-site-links rule governs staff-authored
   copy shown to families, not the app's own chrome. */
function AttributionLink({ href, children }: { href: string; children?: ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="underline underline-offset-4 transition-colors hover:text-foreground"
    >
      {children}
    </a>
  );
}

export function Footer() {
  const t = useTranslations('footer');
  const c = useTranslations('common');

  return (
    <footer className="border-t border-border bg-card">
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex items-center gap-2">
            <span className="font-display text-xl font-bold text-primary">
              SOG
            </span>
            <span className="text-lg font-semibold">{c('appName')}</span>
          </div>
          <p className="text-sm text-muted-foreground">
            {t('tagline')}
          </p>
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            {t('contact.email', { email: SUPPORT_EMAIL })}
          </a>
          <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
            <Link
              href={ROUTES.privacy}
              className="text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              {t('privacy')}
            </Link>
            <Link
              href={ROUTES.termsAndConditions}
              className="text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              {t('terms')}
            </Link>
            <Link
              href={ROUTES.antiBullying}
              className="text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              {t('antiBullying')}
            </Link>
          </nav>
          <p className="text-xs text-muted-foreground">
            {t.rich('attribution', {
              geonames: (chunks) => <AttributionLink href="https://www.geonames.org">{chunks}</AttributionLink>,
              cc: (chunks) => <AttributionLink href="https://creativecommons.org/licenses/by/4.0/">{chunks}</AttributionLink>,
              laposte: (chunks) => <AttributionLink href="https://datanova.laposte.fr">{chunks}</AttributionLink>,
              lo: (chunks) => <AttributionLink href="https://www.etalab.gouv.fr/licence-ouverte-open-licence">{chunks}</AttributionLink>,
            })}
          </p>
          <div className="w-full border-t border-border pt-4">
            <Copyright />
          </div>
        </div>
      </div>
    </footer>
  );
}
