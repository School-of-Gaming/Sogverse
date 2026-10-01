import { useLocale, useTranslations } from "next-intl";
import { Card } from "@/components/ui/card";
import {
  teamMemberHeadline,
  teamMemberSubline,
} from "@/components/team/team-name";
import { TeamPortrait } from "@/components/team/team-portrait";
import { Link } from "@/i18n/navigation";
import { resolveLocale } from "@/lib/constants/locales";
import type { AppHref } from "@/lib/constants/routes";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import type { TeamProfile } from "@/services/team-profiles/team-profiles.types";

/**
 * **One person, as a card that opens their page** — the Team index's card.
 *
 * The photo on top in the profile's own 4:5 frame (`TeamPortrait`), edged and
 * glowing in the person's pick as their page frames it, then the person
 * headed as their page heads them (`team-name.ts`) — the first name with the
 * nickname in act, and under it a Gedu's role glossed or an admin's full name
 * and title — and their one-line intro in the reader's locale, resolved as the
 * page resolves it. The intro is clamped and the cards are left to differ in
 * height.
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

  const subline = teamMemberSubline(profile, t);

  return (
    <Card className="group relative flex h-full flex-col overflow-hidden transition-[box-shadow] focus-within:shadow-lg hover:shadow-lg">
      <div className="p-2 pb-0 sm:p-3 sm:pb-0">
        <TeamPortrait
          photo={profile.photo}
          pick={profile.pick}
          rounding="card"
          imageClassName="transition-transform duration-300 group-hover:scale-[1.03]"
        />
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3 sm:p-4">
        <h3 className="break-words text-base font-semibold leading-snug">
          <Link
            href={href}
            className="after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-act"
          >
            {teamMemberHeadline(profile, (nickname) => (
              <span className="text-act">{nickname}</span>
            ))}
          </Link>
        </h3>
        <p className="text-xs text-muted-foreground sm:text-sm">{subline}</p>
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
