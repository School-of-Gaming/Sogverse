import Image from "next/image";
import Link from "next/link";
import { useTranslations } from 'next-intl';
import sogLogoFullMono from "@/assets/brand/sog-logo-full-mono.svg";
import sogLogoSimpleMono from "@/assets/brand/sog-logo-simple-mono.svg";
import { Copyright } from "./copyright";
import { PrivacyChoicesLink } from "@/components/consent";
import {
  REGISTERED_TRADEMARK,
  ROUTES,
  SENDER_NAME,
  SUPPORT_EMAIL,
} from "@/lib/constants";

export function Footer() {
  const t = useTranslations('footer');

  return (
    <footer className="border-t border-border bg-card">
      <div className="container mx-auto px-4 py-8">
        <div className="flex flex-col items-center gap-4 text-center">
          {/* The monochrome colourway — a yellow badge down here would pull the
              eye past the links it sits above. Sized so the mark's own
              "SCHOOL OF GAMING" line is legible: that line is ~13% of the
              badge's height, so it needs roughly 80px of mark to clear ~10px
              of text. The footer has the vertical room the header does not,
              which is why the two ended up different sizes. Same two-file
              split, same intrinsic dimensions, as the header. */}
          <div className="relative flex items-center">
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
              className="hidden h-20 w-auto sm:block"
              unoptimized
            />
            {/* The registered-trademark symbol, once per page, and only here:
                the mark is registered and the Brand Guidebook asks for the ®
                on the website footer, at the mark's most prominent appearance.
                Once per page is enough, so no other logo placement carries it.

                It hangs off the logo's top-right corner via absolute
                positioning (`left-full` on the `relative` row) so it adds no
                width to the row — the footer centres the row's content, and an
                in-flow glyph beside the logo would shift the mark itself
                off-centre. `top-0` lands on the badge's own top rather than an
                arbitrary line above it: the artwork starts ~1.5% into its own
                box, so the box top is the badge top. Sized per breakpoint
                against the two logo heights
                rather than inheriting body size — and deliberately larger than
                a print lockup's fine-print ratio, because at that ratio it
                disappeared on the dark ground.
                Left as real text, not aria-hidden: it is a legal notice on the
                name, and it belongs in the announcement of it. */}
            <span className="absolute left-full top-0 ml-0.5 text-xl leading-none sm:ml-1 sm:text-3xl">
              {REGISTERED_TRADEMARK}
            </span>
          </div>
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            {t('contact.email', { email: SUPPORT_EMAIL })}
          </a>
          {/* No prefetch on this row. These four sit on every page, so the
              default viewport prefetch fires them on roughly every visit —
              63k requests in August against 46 actual visits.

              Turning it off costs nothing, because the prefetch was never
              buying a faster click. The app has no `loading.tsx` anywhere and
              no PPR, and on that shape Next's tree walk short-circuits a
              prefetch to "send only the router state" — no segment data, no
              head, nothing the click can render from. The navigation pays a
              full round trip either way; the request was pure cost.

              This is site-wide, not a property of these four links. The row
              is turned off here because it is the clearest case: nobody reads
              the licence page, and it was costing more requests than almost
              any other route on the site. */}
          <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
            <Link
              href={ROUTES.privacy}
              prefetch={false}
              className="text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              {t('privacy')}
            </Link>
            <Link
              href={ROUTES.termsAndConditions}
              prefetch={false}
              className="text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              {t('terms')}
            </Link>
            <Link
              href={ROUTES.antiBullying}
              prefetch={false}
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
              prefetch={false}
              className="text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
              {t('attributions')}
            </Link>
            {/* The fifth item, and the only one that is not a link: it reopens
                the consent strip on this page instead of navigating. It says
                the same words the strip's own heading does — the privacy
                policy and the banner's copy both promise a way back "from the
                footer", so this is the mechanism those sentences name. It
                renders as nothing until a ConsentProvider sits above the
                footer. */}
            <PrivacyChoicesLink />
          </nav>
          <div className="w-full border-t border-border pt-4">
            <Copyright />
          </div>
        </div>
      </div>
    </footer>
  );
}
