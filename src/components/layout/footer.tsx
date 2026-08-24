import Image from "next/image";
import Link from "next/link";
import { useTranslations } from 'next-intl';
import sogLogoFullMono from "@/assets/brand/sog-logo-full-mono.svg";
import sogLogoSimpleMono from "@/assets/brand/sog-logo-simple-mono.svg";
import { Copyright } from "./copyright";
import { ROUTES, SENDER_NAME, SUPPORT_EMAIL } from "@/lib/constants";

export function Footer() {
  const t = useTranslations('footer');

  return (
    <footer className="border-t border-border bg-card">
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col items-center gap-4 text-center">
          {/* The monochrome colourway, and smaller than the header's: down here
              the mark is a sign-off rather than an entrance, and the yellow
              badge at this size would pull the eye past the links it sits
              above. The "SCHOOL OF GAMING" line is small at this height on
              purpose — the copyright row below spells the name out in text, so
              the mark is carrying the shape, not the words. Same two-file
              split, same intrinsic dimensions, as the header. */}
          <div className="flex items-center">
            <Image
              src={sogLogoSimpleMono}
              alt={SENDER_NAME}
              width={379}
              height={207.5}
              className="h-9 w-auto sm:hidden"
              unoptimized
            />
            <Image
              src={sogLogoFullMono}
              alt={SENDER_NAME}
              width={379}
              height={207.5}
              className="hidden h-10 w-auto sm:block"
              unoptimized
            />
          </div>
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
            {/* The data credits we owe (GeoNames, La Poste, mc-heads) used to be
                a paragraph of their own down here. Both licences are satisfied
                by a link to a credits page, so the row carries the link and the
                page carries the credits — see the attributions page itself for
                what each licence actually requires. */}
            <Link
              href={ROUTES.attributions}
              className="text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              {t('attributions')}
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
