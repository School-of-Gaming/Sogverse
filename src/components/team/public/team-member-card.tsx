import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import { TeamPhotoPlaceholder } from "@/components/team/team-photo-placeholder";
import { teamMemberPlainName } from "@/components/team/team-name";
import { Link } from "@/i18n/navigation";
import { resolveLocale } from "@/lib/constants/locales";
import type { AppHref } from "@/lib/constants/routes";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import type { TeamProfile } from "@/services/team-profiles/team-profiles.types";

/**
 * **One person, as a card that opens their page** — the Team index's card.
 *
 * The photo on top in the profile's own 4:5, then the name with the nickname
 * gamers know them by, the title line the profile page shows (an admin's own
 * title, a Gedu's role glossed), and their one-line intro in the reader's
 * locale, resolved as the page resolves it. The intro is clamped and the
 * cards are left to differ in height.
 *
 * **The photo is drawn `unoptimized`**, from the app's own photo route: the
 * image optimiser would cache it for a year, and a photo has to stop showing
 * within minutes of its profile being hidden. The frame holds its 4:5 before
 * the bytes arrive, so nothing moves when they do. Decorative: the name
 * beneath names the person.
 *
 * The whole card is the link, stretched from the name, so the link's
 * accessible name is the person's name.
 */
export function TeamMemberCard({
  profile,
  href,
}: {
  profile: TeamProfile;
  /** The person's page, at their canonical address. */
  href: AppHref;
}) {
  const t = useTranslations("team.profile");
  const locale = resolveLocale(useLocale());
  const written = resolveTranslation(profile.translations, locale);

  // The heading's own words, without its colour: a card title is not a hero.
  const name = teamMemberPlainName(profile, t);
  const title = profile.kind === "admin" ? profile.title : t("geduTitle");

  return (
    <Card className="group relative flex h-full flex-col overflow-hidden transition-[box-shadow] focus-within:shadow-lg hover:shadow-lg">
      <div aria-hidden className="relative aspect-[4/5] overflow-hidden bg-lifted">
        {profile.photo ? (
          <Image
            src={profile.photo.src}
            width={profile.photo.width}
            height={profile.photo.height}
            alt=""
            unoptimized
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]"
          />
        ) : (
          <TeamPhotoPlaceholder className="h-full w-full" />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3 sm:p-4">
        <h3 className="break-words text-base font-semibold leading-snug">
          <Link
            href={href}
            className="after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-act"
          >
            {name}
          </Link>
        </h3>
        <p className="text-xs text-muted-foreground sm:text-sm">{title}</p>
        {written !== null && (
          <p
            lang={written.locale}
            className="mt-1 line-clamp-3 text-sm text-muted-foreground"
          >
            {written.shortDescription}
          </p>
        )}
      </div>
    </Card>
  );
}
