import { useLocale, useTranslations } from "next-intl";
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
 * **One person, as a portrait that opens their page** — the Team index's item.
 *
 * **The framed portrait is the card**: there is no box around it. The photo
 * in the profile's own 4:5 frame (`TeamPortrait`), edged and glowing in the
 * person's pick as their page frames it, and under it, on the page's own
 * ground, the person headed as their page heads them (`team-name.ts`) — the
 * first name with the nickname in act, and under it a Gedu's role glossed or
 * an admin's full name and title — then their one-line intro in the reader's
 * locale, resolved as the page resolves it. The intro is clamped and the
 * items are left to differ in height.
 *
 * **The whole item is the link**, stretched from the name, so the link's
 * accessible name is the person's name. Hover and focus lean the photo in,
 * as a Library or product card's picture does; keyboard focus rings the
 * portrait.
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
    <div className="group relative flex flex-col">
      <TeamPortrait
        photo={profile.photo}
        pick={profile.pick}
        zoomOnHover
        className="ring-act ring-offset-4 ring-offset-background group-has-[a:focus-visible]:ring-2"
      />
      {/* One size for every name per step, from the type scale, stepping
          once at `md`. Below it, at 14px, a twenty-character nickname (about
          164px) fits its column on its own line from 390px wide, three
          columns at 640 included (187px), and breaks inside itself only on
          the narrowest phones, where the column is 156px at 360 — accepted.
          From `md`, at 18px (about 211px), every column is at least 229px.
          A name too wide for one line puts the nickname whole on the
          second. */}
      <h3 className="mt-3 break-words text-body-s font-semibold leading-snug md:text-h4">
        <Link
          href={href}
          className="after:absolute after:inset-0 after:rounded-2xl focus-visible:outline-none"
        >
          {teamMemberHeadline(profile, (nickname) => (
            <span className="inline-block max-w-full text-act">
              {nickname}
            </span>
          ))}
        </Link>
      </h3>
      <p className="mt-0.5 text-xs text-muted-foreground md:text-body-s">
        {subline}
      </p>
      {written !== null && (
        <p
          lang={written.locale}
          className="mt-1.5 line-clamp-3 text-xs text-muted-foreground md:text-body-s"
        >
          {written.shortDescription}
        </p>
      )}
    </div>
  );
}
