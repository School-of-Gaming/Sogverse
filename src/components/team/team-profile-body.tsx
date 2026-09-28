"use client";

import { useId } from "react";
import Image from "next/image";
import { useLocale, useTranslations } from "next-intl";
import type { PickId } from "@sog/ui";
import { LanguageFlag } from "@/components/ui/language-flag";
import { Markdown } from "@/components/ui/markdown";
import { useLanguageNames } from "@/hooks/use-language-names";
import { resolveLocale, type SupportedLocale } from "@/lib/constants/locales";
import { resolveTranslation } from "@/lib/i18n/resolve-translation";
import { cn } from "@/lib/utils";
import { TeamPhotoPlaceholder } from "@/components/team/team-photo-placeholder";
import { VOICE_ZONE_COLORS } from "@/lib/constants/voice-zones";
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
  /** One line, plain text: their friendly opening line under the name. */
  shortDescription: string;
  /** "About me": markdown, rendered in the `profile` variant. */
  longDescription: string;
  /** Optional. `null` leaves the aside off the page. */
  funFact: string | null;
}

interface TeamProfileCommon {
  /** The person's account id. */
  id: string;
  firstName: string;
  /** What gamers know them as. A name the person chose: never translated. */
  nickname: string | null;
  /**
   * The colour the person picked as their accent, or `null` for none, which
   * is the default: the page then carries the brand's colours alone.
   */
  pick: PickId | null;
  /**
   * Never null on the public page, where a profile cannot go up without one.
   * It is null only in the editor's preview of an unfinished profile.
   */
  photo: TeamProfilePhoto | null;
  /**
   * At least one on the public page. Empty only in the editor's preview of a
   * profile with nothing written yet.
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
 * **Written for parents and gamers at once**, so it does two jobs: it lets a
 * parent see who this is — a face, a name, the languages they can talk to
 * them in — and it lets a gamer see why a session with them is fun. The order
 * follows that: the photo leads, then the name with the nickname gamers use,
 * the person's own opening line, the languages they speak, "About me", and the
 * fun fact as a playful aside to finish on.
 *
 * **One reading column.** Every section shares the article's measure; nothing
 * narrows itself, so the page has one left edge and one right edge.
 *
 * **Colour: the brand first, the person's pick as an optional accent.** The
 * headline takes the public hero treatment declared in SOG-UI's `brand.ts` —
 * the name in ink, the nickname as the one act phrase, the world rule beneath
 * — so the page reads as School of Gaming before it reads as anyone's. A
 * person who picked a colour gets it as an accent on top: the photo's frame
 * and the voice zones' own glow (`.zone-glow`, spilling in from the frame),
 * and the fun fact's side rule. It is only ever an edge, a rule or that glow,
 * never a fill with words on it, and it sits outside the page's colour budget
 * (SOG-UI's `picks.ts`). With no pick, the frame is the neutral edge, there
 * is no glow, and the side rule falls back to act. Poppins throughout: this is a person
 * introducing themselves, not a quotation.
 *
 * **Which of the person's languages is shown follows the product page**: the
 * reader's locale, then English, then the first one written, through the same
 * `resolveTranslation()`. Every written block carries the row's locale as
 * `lang`, so a screen reader reads it in the right voice.
 *
 * **Nothing on this page is a safety or vetting claim.** No "certified", no
 * "background checked": the page states who the person is, and a safety
 * sentence would have to name a verified mechanism, which a profile is not.
 *
 * **It answers to its own width, not the viewport's.** Every step is a
 * container query, so in the profile editor, where the same body is a live
 * preview in a column beside the form, it lays out for the column it is in.
 *
 * **The required sections always hold their place.** The one-line intro and
 * "About me" render a muted placeholder while empty, which only ever happens
 * in the editor's preview (a profile cannot go public without both), so the
 * preview does not jump when the person starts typing. The fun fact is
 * optional and appears only when there is one.
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
  const speaksId = useId();
  const aboutId = useId();
  const funFactId = useId();

  const written = resolveTranslation(
    profile.translations,
    readerLocale ?? pageLocale,
  );
  const lang = written?.locale;
  const shortDescription = written?.shortDescription.trim() ?? "";
  const longDescription = written?.longDescription.trim() ?? "";
  const funFact = written?.funFact?.trim() ?? "";
  const pick =
    profile.pick === null ? null : VOICE_ZONE_COLORS[`${profile.pick}`];

  const displayName =
    profile.kind === "admin"
      ? `${profile.firstName} ${profile.lastName}`
      : profile.firstName;
  const title = profile.kind === "admin" ? profile.title : t("geduTitle");

  return (
    <div className="@container">
      <article className="mx-auto w-full max-w-3xl px-4 py-8 @min-[40rem]:px-6 @min-[40rem]:py-12">
        <header className="flex flex-col gap-6 @min-[40rem]:flex-row @min-[40rem]:items-center @min-[40rem]:gap-8">
          <Portrait photo={profile.photo} pick={pick} />
          <div className="min-w-0 flex-1">
            {/* The wrapper shrinks to the headline's longest line, so the rule
                runs exactly the headline's measure, as on the home hero. */}
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
              <span
                aria-hidden
                className="mt-4 block h-1.5 w-full rounded-full bg-world"
              />
            </div>
            <p className="mt-3 font-medium text-muted-foreground">{title}</p>
            {shortDescription === "" ? (
              <p className="mt-4 text-lg font-medium leading-snug text-muted-foreground @min-[40rem]:text-xl">
                {t("draft.shortDescription")}
              </p>
            ) : (
              <p
                lang={lang}
                className="mt-4 text-lg font-medium leading-snug @min-[40rem]:text-xl"
              >
                {shortDescription}
              </p>
            )}
            {profile.spokenLanguages.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm">
                <span id={speaksId} className="text-muted-foreground">
                  {t("speaks")}
                </span>
                <ul
                  aria-labelledby={speaksId}
                  className="flex flex-wrap gap-x-4 gap-y-2"
                >
                  {profile.spokenLanguages.map((code) => (
                    <li key={code} className="inline-flex items-center gap-2">
                      <LanguageFlag code={code} showCode={false} />
                      <span>{languageName(code)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </header>

        <section aria-labelledby={aboutId} className="mt-12">
          <h2 id={aboutId} className="text-xl font-semibold">
            {t("aboutMe")}
          </h2>
          {longDescription === "" ? (
            <p className="mt-4 leading-relaxed text-muted-foreground">
              {t("draft.longDescription")}
            </p>
          ) : (
            <div lang={lang} className="mt-4">
              <Markdown variant="profile">{longDescription}</Markdown>
            </div>
          )}
        </section>

        {funFact !== "" && (
          <aside
            aria-labelledby={funFactId}
            // The edge colours every side; only the left one has width. With no
            // pick the rule is act, so the aside keeps its accent either way.
            className={cn(
              "mt-10 border-l-4 pl-4",
              pick === null ? "border-act" : pick.edge,
            )}
          >
            <h2
              id={funFactId}
              className="text-sm font-semibold text-muted-foreground"
            >
              {t("funFact")}
            </h2>
            <p lang={lang} className="mt-1 text-lg leading-relaxed">
              {funFact}
            </p>
          </aside>
        )}
      </article>
    </div>
  );
}

/**
 * The 4:5 portrait frame the person is shown in: their photo, or, in the
 * editor's preview of a profile that has none yet, the drawn placeholder. The
 * body keeps the placeholder because the editor's preview is this same body;
 * the public page never meets it, since a profile cannot go up without a
 * photo. Decorative either way: the name is the heading beside it.
 *
 * **With a pick, the frame is edged in it and glows with it**, through the
 * voice zones' own `glow` classes, unchanged. That glow is an inset shadow, and
 * an inset shadow paints beneath an element's content, so it is laid over the
 * photo on its own layer rather than on the frame, where the photo would cover
 * it. With no pick the frame is the neutral edge, at the same width, so
 * choosing or clearing a colour in the editor moves nothing.
 */
function Portrait({
  photo,
  pick,
}: {
  photo: TeamProfilePhoto | null;
  pick: { edge: string; glow: string } | null;
}) {
  return (
    <div
      aria-hidden
      className={cn(
        "relative aspect-[4/5] w-36 shrink-0 overflow-hidden rounded-2xl border-4 bg-card @min-[40rem]:w-48",
        pick === null ? "border-border" : pick.edge,
      )}
    >
      {photo ? (
        <Image
          src={photo.src}
          width={photo.width}
          height={photo.height}
          alt=""
          sizes="(min-width: 640px) 192px, 144px"
          className="h-full w-full object-cover"
          priority
        />
      ) : (
        <TeamPhotoPlaceholder className="h-full w-full" />
      )}
      {pick !== null && (
        <span className={cn("absolute inset-0 rounded-xl", pick.glow)} />
      )}
    </div>
  );
}
