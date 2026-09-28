"use client";

import Image from "next/image";
import { MapPin } from "lucide-react";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Identicon } from "@/components/ui/identicon";
import { LanguageFlag } from "@/components/ui/language-flag";
import { useLanguageNames } from "@/hooks/use-language-names";
import { PRODUCT_TOPICS } from "@/lib/products/topics";
import type { ProductTopic, SpokenLanguageCode } from "@/types";

/**
 * One photo of the person, at its intrinsic size so the frame can crop it.
 * Any aspect ratio: the portrait is a square window over the middle of it.
 */
export interface TeamProfilePhoto {
  src: string;
  width: number;
  height: number;
}

/**
 * The line the person writes about themselves, in the one spoken language
 * they wrote it in. The language is part of the value rather than inferred
 * from the reader: it is what lets the page label a line a reader might not
 * expect to be in another language, and put the right `lang` on it for a
 * screen reader.
 */
export interface TeamProfileTagline {
  text: string;
  spokenLanguage: SpokenLanguageCode;
}

interface TeamProfileCommon {
  /** The person's profile id. With no photo it seeds the identicon, so it is a real UUID. */
  id: string;
  firstName: string;
  /** Gamer tag. A mark the person chose: never translated. */
  nickname: string | null;
  photo: TeamProfilePhoto | null;
  tagline: TeamProfileTagline | null;
  /** The short "what I do" phrases, in the person's own words and order. */
  skills: readonly string[];
  /** The games and topics they run, from the product-topic vocabulary. */
  topics: readonly ProductTopic[];
  spokenLanguages: readonly SpokenLanguageCode[];
}

/**
 * Office staff. The title is theirs to write ("Chief Engineer"), because
 * an office role is a job, not a platform role with a fixed name.
 */
export interface AdminTeamProfile extends TeamProfileCommon {
  kind: "admin";
  lastName: string;
  title: string;
}

/**
 * A Gedu. Two differences from an admin, both in the type rather than in the
 * render, so a Gedu's page cannot show them by accident:
 *
 * - **No last name.** Whether a Gedu's surname belongs on a public page is
 *   the owner's open decision; until it is made, a Gedu profile has nowhere to
 *   carry one, so the data shell cannot hand one over. Reversing it is a field
 *   here, not a rule in the render.
 * - **No free title.** Their title is the role, "Gedu", glossed on this page
 *   because it is public and the word is never used cold.
 *
 * The areas are location names, proper nouns shown as written.
 */
export interface GeduTeamProfile extends TeamProfileCommon {
  kind: "gedu";
  areas: readonly string[];
}

export type TeamProfile = AdminTeamProfile | GeduTeamProfile;

/**
 * The public team profile page body: one person, admin or Gedu, on one page.
 *
 * Presentational over props, so the preview scene and the future public route
 * render the same body.
 *
 * **The headline is the page's hero** and takes the library's declared hero
 * departure: the name in ink with the gamer tag as the one act phrase, and the
 * world rule beneath. Those are the page's two colours, which is the budget of
 * a page telling the story to a mixed audience, so nothing below the rule
 * spends a third: the role is a plain title line, and the chips are neutral.
 *
 * **The tagline is set in the editorial serif** because it is a quote, the
 * person speaking in the first person. It carries its spoken language as
 * `lang`, and a caption names that language only when it differs from the
 * locale the reader is reading in. A spoken language equal to the locale needs
 * no label, and `tlh` equals none of them, so a Klingon reader is told.
 *
 * **Nothing on this page is a safety or vetting claim.** No "certified", no
 * "background checked": the page states who the person is and what they do,
 * and a safety sentence would have to name a verified mechanism, which a
 * certification flag is not.
 *
 * **It answers to its own width, not the viewport's.** Every step is a
 * container query at the width the viewport breakpoint used to name (40rem,
 * 48rem), so on the public page, where the body spans the viewport, nothing
 * changes — and in the team card editor, where the same body is a live preview
 * in a column beside the form, it lays out for the column it is actually in
 * rather than for a screen it only occupies part of.
 *
 * Every section that can be empty is left out rather than drawn empty: a
 * profile with no skills has no "What I do" card, and a row with nothing in it
 * is not a row. There is no loading state inside it — the route renders it
 * from data it already has — so nothing here arrives after first paint.
 */
export function TeamProfileBody({ profile }: { profile: TeamProfile }) {
  const t = useTranslations("team.profile");
  const locale = useLocale();
  const languageName = useLanguageNames();
  const format = useFormatter();

  const displayName =
    profile.kind === "admin"
      ? `${profile.firstName} ${profile.lastName}`
      : profile.firstName;
  const title = profile.kind === "admin" ? profile.title : t("geduTitle");
  const areas = profile.kind === "gedu" ? profile.areas : [];

  const hasFacts =
    profile.spokenLanguages.length > 0 ||
    profile.topics.length > 0 ||
    areas.length > 0;
  const hasSkills = profile.skills.length > 0;

  return (
    <div className="@container">
      <article className="container mx-auto max-w-4xl px-4 py-8 @min-[40rem]:py-12">
        <header className="flex flex-col gap-6 @min-[40rem]:flex-row @min-[40rem]:items-center @min-[40rem]:gap-8">
          <Portrait id={profile.id} photo={profile.photo} />
          <div className="min-w-0">
            {/* The wrapper shrinks to the headline's longest line, so the world
                rule runs exactly the headline's measure, as on the home hero. */}
            <div className="inline-block max-w-full">
              <h1 className="break-words text-h1-mobile font-bold tracking-tight @min-[48rem]:text-5xl">
                {profile.nickname === null
                  ? displayName
                  : profile.kind === "admin"
                    ? t.rich("nameWithNickname", {
                        firstName: profile.firstName,
                        lastName: profile.lastName,
                        nickname: profile.nickname,
                        nick: (chunks) => (
                          <span className="text-act">{chunks}</span>
                        ),
                      })
                    : t.rich("firstNameWithNickname", {
                        firstName: profile.firstName,
                        nickname: profile.nickname,
                        nick: (chunks) => (
                          <span className="text-act">{chunks}</span>
                        ),
                      })}
              </h1>
              <span className="mt-4 block h-1.5 w-full rounded-full bg-world" />
            </div>
            <p className="mt-4 text-lg font-medium">{title}</p>
          </div>
        </header>

        {profile.tagline && (
          <figure className="mt-10 max-w-2xl">
            <blockquote
              lang={profile.tagline.spokenLanguage}
              className="font-serif text-xl italic leading-relaxed @min-[40rem]:text-2xl"
            >
              {profile.tagline.text}
            </blockquote>
            {profile.tagline.spokenLanguage !== locale && (
              <figcaption className="mt-2 text-sm text-muted-foreground">
                {t("taglineLanguage", {
                  language: languageName(profile.tagline.spokenLanguage),
                })}
              </figcaption>
            )}
          </figure>
        )}

        {(hasSkills || hasFacts) && (
          <div
            className={
              hasSkills && hasFacts
                ? "mt-10 grid gap-6 @min-[48rem]:grid-cols-2"
                : "mt-10 grid gap-6"
            }
          >
            {hasSkills && (
              <Card>
                <CardContent className="p-5 @min-[40rem]:p-6">
                  <h2 className="text-lg font-semibold">{t("whatIDo")}</h2>
                  <ul className="mt-4 list-disc space-y-2 pl-5 marker:text-muted-foreground">
                    {profile.skills.map((skill) => (
                      <li key={skill}>{skill}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            )}

            {hasFacts && (
              <Card>
                <CardContent className="p-5 @min-[40rem]:p-6">
                  <h2 className="text-lg font-semibold">{t("atAGlance")}</h2>
                  <dl className="mt-2 divide-y divide-border">
                    {profile.spokenLanguages.length > 0 && (
                      <FactRow label={t("languages")}>
                        <ul className="flex flex-wrap gap-x-4 gap-y-2">
                          {profile.spokenLanguages.map((code) => (
                            <li
                              key={code}
                              className="inline-flex items-center gap-2"
                            >
                              <LanguageFlag
                                code={code}
                                showCode={false}
                                title={languageName(code)}
                              />
                              <span>{languageName(code)}</span>
                            </li>
                          ))}
                        </ul>
                      </FactRow>
                    )}
                    {profile.topics.length > 0 && (
                      <FactRow label={t("topics")}>
                        <ul className="flex flex-wrap gap-2">
                          {profile.topics.map((topic) => (
                            <li key={topic}>
                              <Badge variant="outline" className="font-medium">
                                {PRODUCT_TOPICS[topic].label}
                              </Badge>
                            </li>
                          ))}
                        </ul>
                      </FactRow>
                    )}
                    {areas.length > 0 && (
                      <FactRow label={t("areas")}>
                        <p className="flex items-start gap-2">
                          <MapPin
                            aria-hidden
                            className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground"
                          />
                          <span>
                            {format.list(areas, { type: "conjunction" })}
                          </span>
                        </p>
                      </FactRow>
                    )}
                  </dl>
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </article>
    </div>
  );
}

/**
 * The square the person is shown in: their photo cropped to the middle, or,
 * without one, their identicon — the same face the rest of the product
 * already gives an account with no picture, so it reads as "this person"
 * rather than as a missing image. Decorative either way: the name is the
 * heading beside it.
 */
function Portrait({
  id,
  photo,
}: {
  id: string;
  photo: TeamProfilePhoto | null;
}) {
  return (
    <div
      aria-hidden
      className="relative size-28 shrink-0 overflow-hidden rounded-2xl border border-border bg-card @min-[40rem]:size-40"
    >
      {photo ? (
        <Image
          src={photo.src}
          width={photo.width}
          height={photo.height}
          alt=""
          sizes="(min-width: 640px) 160px, 112px"
          className="h-full w-full object-cover"
          priority
        />
      ) : (
        <Identicon id={id} size={160} />
      )}
    </div>
  );
}

/**
 * One fact about the person: a label over its value, stacked at every width
 * because the card is half the page from `md` up and a side-by-side label
 * would leave the values a sliver.
 */
function FactRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="py-3 first:pt-2 last:pb-0">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1.5">{children}</dd>
    </div>
  );
}
