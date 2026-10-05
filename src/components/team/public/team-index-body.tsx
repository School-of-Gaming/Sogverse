import { useId } from "react";
import { useTranslations } from "next-intl";
import { Users } from "lucide-react";
import type { AppHref } from "@/lib/constants/routes";
import type { TeamProfile } from "@/services/team-profiles/team-profiles.types";
import { TeamClosingCta } from "./team-closing-cta";
import { TeamMemberCard } from "./team-member-card";

export interface TeamIndexMember {
  profile: TeamProfile;
  /** The person's page, at their canonical address. */
  href: AppHref;
}

/**
 * **The Team index — every public profile, leadership first, then the Game
 * Educators.** Presentational over props: the page hands it the profiles in
 * the order the public read returns them (leadership first, then by first
 * name), each with its link already resolved. Top to bottom:
 *
 * - **The hero.** The public-page headline treatment — one phrase in act, the
 *   world rule under it — kept compact, so the first faces are on a phone's
 *   first screen.
 * - **Two groups, each a heading over a grid of cards**: Leadership, then the
 *   Game Educators, trainees included. A group with nobody in it is left out;
 *   with nobody public at all, the page says so in their place.
 * - **The closing call to action** to the shop.
 *
 * Two columns on a phone, so a 4:5 portrait is a face rather than a screen;
 * three from `sm`, four from `lg`.
 *
 * **The first `EAGER_CARDS` cards on the page load their photos at once**,
 * counted across both groups in page order; the rest load as they near the
 * screen.
 */
export function TeamIndexBody({ members }: { members: readonly TeamIndexMember[] }) {
  const t = useTranslations("team.public.index");
  const leadership = members.filter((member) => member.profile.kind === "admin");
  const educators = members.filter((member) => member.profile.kind === "gedu");

  return (
    <div className="container mx-auto max-w-6xl px-4 py-10 sm:py-14">
      <header>
        {/* The headline and its rule are centred; the wrapper shrinks to the
            headline's longest line, so the rule runs exactly its measure. */}
        <div className="mx-auto w-fit text-center">
          <h1 className="text-h1-mobile font-bold tracking-tight md:text-5xl">
            {t.rich("title", {
              act: (chunks) => <span className="text-act">{chunks}</span>,
            })}
          </h1>
          <span aria-hidden className="mt-4 block h-1.5 w-full rounded-full bg-world" />
        </div>
        <p className="mt-5 text-base text-muted-foreground sm:text-lg">
          {t("intro")}
        </p>
      </header>

      {members.length === 0 ? (
        <div className="mt-8 flex flex-col items-center py-16 text-center">
          <Users className="h-8 w-8 text-muted-foreground" aria-hidden />
          <p className="mt-4 font-medium">{t("empty")}</p>
        </div>
      ) : (
        <>
          <TeamGroup
            heading={t("leadership")}
            members={leadership}
            eagerCount={EAGER_CARDS}
          />
          <TeamGroup
            heading={t("gameEducators")}
            members={educators}
            eagerCount={Math.max(0, EAGER_CARDS - leadership.length)}
          />
        </>
      )}

      <TeamClosingCta className="mt-16 sm:mt-24" />
    </div>
  );
}

/**
 * How many cards, from the top of the page, load their photos at once: the
 * widest row, four from `lg`, so it covers the first row at every width:
 * three from `sm` and one more, two rows of two on a phone. Past it, an eager
 * load would compete with the photos the reader is looking at.
 */
const EAGER_CARDS = 4;

function TeamGroup({
  heading,
  members,
  eagerCount,
}: {
  heading: string;
  members: readonly TeamIndexMember[];
  /** How many of this group's first cards load their photos at once. */
  eagerCount: number;
}) {
  const headingId = useId();
  if (members.length === 0) return null;
  return (
    <section aria-labelledby={headingId} className="mt-10 sm:mt-14">
      <h2 id={headingId} className="text-2xl font-bold">
        {heading}
      </h2>
      <ul className="mt-6 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 sm:gap-x-6 sm:gap-y-10 lg:grid-cols-4">
        {members.map(({ profile, href }, index) => (
          <li key={profile.id}>
            <TeamMemberCard
              profile={profile}
              href={href}
              eager={index < eagerCount}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}
