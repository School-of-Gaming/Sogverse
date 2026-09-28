"use client";

import Image from "next/image";
import { Lightbulb } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { Identicon } from "@/components/ui/identicon";
import { LanguageFlag } from "@/components/ui/language-flag";
import { Markdown } from "@/components/ui/markdown";
import { useLanguageNames } from "@/hooks/use-language-names";
import {
  LOCALE_CONFIG,
  resolveLocale,
  type SupportedLocale,
} from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import type { SpokenLanguageCode } from "@/types";

/**
 * The person's photo. Uploads are cropped to a 4:5 portrait of
 * `TEAM_PHOTO_WIDTH` × `TEAM_PHOTO_HEIGHT` before they are stored, and the
 * frame covers whatever it is handed, so a photo of another shape (the preview
 * art the fixtures borrow) is cropped to the middle rather than distorted.
 */
export interface TeamProfilePhoto {
  src: string;
  width: number;
  height: number;
}

/** The size every uploaded photo is cropped to: 4:5, portrait. */
export const TEAM_PHOTO_WIDTH = 800;
export const TEAM_PHOTO_HEIGHT = 1000;

/**
 * What the person wrote, in one site locale. The shape is the product
 * translation's — one row per locale, at least one row, any locale — so the
 * page picks the row to show with the product page's own resolver.
 */
export interface TeamProfileTranslation {
  locale: SupportedLocale;
  /** One line, plain text, shown under the name. */
  shortDescription: string;
  /** "About me": markdown, rendered in the no-links variant. */
  longDescription: string;
  /** Optional. `null` leaves the section off the page. */
  funFact: string | null;
}

interface TeamProfileCommon {
  /** The person's profile id. With no photo it seeds the identicon, so it is a real UUID. */
  id: string;
  firstName: string;
  /** What gamers know them as. A name the person chose: never translated. */
  nickname: string | null;
  /**
   * Never null on the public team page, where a card cannot go up without one.
   * It is null only in the editor's preview of an unfinished card.
   */
  photo: TeamProfilePhoto | null;
  /**
   * At least one on the public page. Empty only in the editor's preview of a
   * card with nothing written yet.
   */
  translations: readonly TeamProfileTranslation[];
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
 */
export interface GeduTeamProfile extends TeamProfileCommon {
  kind: "gedu";
}

export type TeamProfile = AdminTeamProfile | GeduTeamProfile;

/**
 * The public team profile page body: one person, admin or Gedu, on one page.
 *
 * Presentational over props, so the preview scene, the editor's live preview
 * and the future public route render the same body.
 *
 * **The headline is the page's hero** and takes the library's declared hero
 * departure: the name in ink with the nickname as the one act phrase, and the
 * world rule beneath. Those are the page's two colours, which is the budget of
 * a page telling the story to a mixed audience, so nothing below the rule
 * spends a third.
 *
 * **Which of the person's languages is shown follows the product page**: the
 * reader's locale, then English, then the first one written. Where the row
 * shown is not in the reader's locale, a caption under the one-line
 * introduction names its language — the product page has no such caption, but
 * a product is written by us in our voice, and this is a person speaking in
 * the first person, where a reader meeting another language deserves to be
 * told it is the writer's choice rather than a missing translation. Every
 * written block carries the row's locale as `lang` for a screen reader. `tlh`
 * equals nobody's writing locale in practice, so a Klingon reader is told.
 *
 * **Nothing on this page is a safety or vetting claim.** No "certified", no
 * "background checked": the page states who the person is, and a safety
 * sentence would have to name a verified mechanism, which a profile is not.
 *
 * **It answers to its own width, not the viewport's.** Every step is a
 * container query, so in the team card editor, where the same body is a live
 * preview in a column beside the form, it lays out for the column it is in.
 *
 * Every section that can be empty is left out rather than drawn empty, which
 * only ever happens in the editor's preview and for the optional fun fact.
 */
export function TeamProfileBody({
  profile,
  readerLocale,
}: {
  profile: TeamProfile;
  /**
   * The locale to pick the written text for. Defaults to the page's own; the
   * editor passes the language tab being edited, so its preview shows the
   * text under the cursor.
   */
  readerLocale?: SupportedLocale;
}) {
  const t = useTranslations("team.profile");
  const pageLocale = resolveLocale(useLocale());
  const languageName = useLanguageNames();

  const reader = readerLocale ?? pageLocale;
  const written = resolveTranslation(profile.translations, reader);
  const shortDescription = written?.shortDescription.trim() ?? "";
  const longDescription = written?.longDescription.trim() ?? "";
  const funFact = written?.funFact?.trim() ?? "";

  const displayName =
    profile.kind === "admin"
      ? `${profile.firstName} ${profile.lastName}`
      : profile.firstName;
  const title = profile.kind === "admin" ? profile.title : t("geduTitle");

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
            {profile.spokenLanguages.length > 0 && (
              <ul
                aria-label={t("languages")}
                className="mt-3 flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground"
              >
                {profile.spokenLanguages.map((code) => (
                  <li key={code} className="inline-flex items-center gap-2">
                    <LanguageFlag code={code} showCode={false} />
                    <span>{languageName(code)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </header>

        {shortDescription !== "" && written !== null && (
          <figure className="mt-10 max-w-2xl">
            <blockquote
              lang={written.locale}
              className="font-serif text-xl italic leading-relaxed @min-[40rem]:text-2xl"
            >
              {shortDescription}
            </blockquote>
            {written.locale !== reader && (
              <figcaption className="mt-2 text-sm text-muted-foreground">
                {t("writtenIn", {
                  language: languageName(
                    written.locale,
                    LOCALE_CONFIG[written.locale].label,
                  ),
                })}
              </figcaption>
            )}
          </figure>
        )}

        {/* One card: "About me" and, where there is one, the fun fact as its
            aside — told apart by a divider and a quieter voice, never by a box
            of its own inside the card. */}
        {(longDescription !== "" || funFact !== "") && written !== null && (
          <Card className="mt-10 max-w-3xl">
            <CardContent
              lang={written.locale}
              className="space-y-6 p-5 @min-[40rem]:p-6"
            >
              {longDescription !== "" && (
                <section className="space-y-4">
                  <h2 className="text-lg font-semibold">{t("aboutMe")}</h2>
                  {/* `feed`, the no-links variant: staff-authored copy on a
                      page families read. Its headings open at h3, under
                      this h2. */}
                  <Markdown variant="feed">{longDescription}</Markdown>
                </section>
              )}
              {funFact !== "" && (
                <section
                  className={
                    longDescription !== ""
                      ? "border-t border-border pt-5"
                      : undefined
                  }
                >
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                    <Lightbulb className="h-4 w-4" aria-hidden />
                    {t("funFact")}
                  </h2>
                  <p className="mt-2 font-serif italic leading-relaxed">
                    {funFact}
                  </p>
                </section>
              )}
            </CardContent>
          </Card>
        )}
      </article>
    </div>
  );
}

/**
 * The 4:5 portrait frame the person is shown in: their photo, or, in the
 * editor's preview of a card that has none yet, their identicon — the same
 * face the rest of the product gives an account with no picture. The public
 * page never meets the fallback, because a card cannot go up without a photo.
 * Decorative either way: the name is the heading beside it.
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
      className="relative flex aspect-[4/5] w-28 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-border bg-card @min-[40rem]:w-40"
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
        <Identicon id={id} size={160} className="h-auto w-full" />
      )}
    </div>
  );
}
