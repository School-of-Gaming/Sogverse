import Link from "next/link";
import { useTranslations } from 'next-intl';
import { Copyright } from "./copyright";
import { ROUTES, SUPPORT_EMAIL } from "@/lib/constants";

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
          <div className="w-full border-t border-border pt-4">
            <Copyright />
          </div>
        </div>
      </div>
    </footer>
  );
}
