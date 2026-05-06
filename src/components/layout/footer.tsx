import { useTranslations } from 'next-intl';
import { Copyright } from "./copyright";

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
            href="mailto:kanslia@sog.gg"
            className="text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            {t('contact.email')}
          </a>
          <div className="w-full border-t border-border pt-4">
            <Copyright />
          </div>
        </div>
      </div>
    </footer>
  );
}
