import { useTranslations } from 'next-intl';

export function Footer() {
  const t = useTranslations('footer');
  const c = useTranslations('common');
  const currentYear = new Date().getFullYear();

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
          <div className="w-full border-t border-border pt-4">
            <p className="text-sm text-muted-foreground">
              {t('copyright', { year: currentYear })}
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
