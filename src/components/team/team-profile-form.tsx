"use client";

import { useId } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import { Check, Trash2, Upload, X } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { PICKS, type PickId } from "@sog/ui";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { ZoneColorPicker } from "@/components/voice/ZoneColorPicker";
import { useLanguageNames } from "@/hooks/use-language-names";
import {
  LOCALE_CONFIG,
  resolveLocale,
  SUPPORTED_LOCALES,
  type SupportedLocale,
} from "@/lib/constants/locales";
import { localeTabAfterRemoving, openingLocaleTab } from "@/lib/i18n/locale-tabs";
import { cn, findOption } from "@/lib/utils";
import {
  TEAM_PHOTO_HEIGHT,
  TEAM_PHOTO_WIDTH,
  type TeamProfile,
  type TeamProfilePhoto,
  type TeamProfileTranslation,
} from "@/services/team-profiles/team-profiles.types";
import { useImageCrop } from "@/components/ui/use-image-crop";
import { TeamPhotoPlaceholder } from "@/components/team/team-photo-placeholder";
import type { VoiceZoneColor } from "@/types";

// ---------------------------------------------------------------------------
// The form's state, and the conversions around it
// ---------------------------------------------------------------------------

/** How long the one-line introduction may run. One line on the public page at its widest. */
export const SHORT_DESCRIPTION_MAX_LENGTH = 140;

/** A fun fact is one or two sentences. */
export const FUN_FACT_MAX_LENGTH = 200;

/**
 * How long "About me" may run, as its stored markdown: the database's own
 * limit. The rich editor cannot cap its input the way a text field can, so
 * the form counts it and Save waits until every language is back under it.
 */
export const LONG_DESCRIPTION_MAX_LENGTH = 5000;

/** Whether a language's "About me" runs past what can be saved. */
function longDescriptionTooLong(longDescription: string): boolean {
  return longDescription.trim().length > LONG_DESCRIPTION_MAX_LENGTH;
}

/** A nickname's length, generous for any name a game platform allows. */
const NICKNAME_MAX_LENGTH = 32;

/** An office title, e.g. "Head of Clubs". */
const TITLE_MAX_LENGTH = 60;

/**
 * One locale's text as typed. The product form's `TranslationDraft` shape with
 * this profile's fields: two required descriptions and an optional fun fact.
 */
export interface TeamProfileTranslationDraft {
  shortDescription: string;
  longDescription: string;
  funFact: string;
}

const EMPTY_TRANSLATION: TeamProfileTranslationDraft = {
  shortDescription: "",
  longDescription: "",
  funFact: "",
};

/**
 * What the person is typing, as they type it — untrimmed — so the form never
 * rewrites a field under the cursor. It becomes a profile through
 * `contentFromForm`, which is where trimming happens.
 *
 * The translations are the product form's per-locale map, with the open tab
 * beside it, so switching tabs keeps what was typed in each.
 */
export interface TeamProfileForm {
  nickname: string;
  /** The office title. Unused for a Gedu, whose title is the role. */
  title: string;
  /** The person's accent colour, or `null` for none. */
  pick: PickId | null;
  photo: TeamProfilePhoto | null;
  translations: Partial<Record<SupportedLocale, TeamProfileTranslationDraft>>;
  activeLocale: SupportedLocale;
}

/**
 * The part of a profile a person writes, normalised: what gets saved and
 * compared. `title` is `null` for a Gedu.
 *
 * A language tab with nothing typed in it is not content — it is a tab the
 * person opened and has not used — so it is dropped here, and a brand-new
 * profile's first, empty tab neither dirties the form nor counts as a language.
 */
export interface TeamProfileContent {
  nickname: string | null;
  title: string | null;
  /** `null` for no accent colour, which is the default. */
  pick: PickId | null;
  photo: TeamProfilePhoto | null;
  translations: readonly TeamProfileTranslation[];
}

export function formFromProfile(
  profile: TeamProfile,
  uiLocale: SupportedLocale,
): TeamProfileForm {
  const translations: TeamProfileForm["translations"] = {};
  for (const row of profile.translations) {
    translations[row.locale] = {
      shortDescription: row.shortDescription,
      longDescription: row.longDescription,
      funFact: row.funFact ?? "",
    };
  }
  // A profile opens on the tab a reader of the admin's UI locale would be
  // shown, and one with nothing written on one tab in that locale, exactly as
  // a product does (`openingLocaleTab`).
  if (profile.translations.length === 0) {
    translations[uiLocale] = EMPTY_TRANSLATION;
  }
  return {
    nickname: profile.nickname ?? "",
    title: profile.kind === "admin" ? profile.title : "",
    pick: profile.pick,
    photo: profile.photo,
    translations,
    activeLocale: openingLocaleTab(
      profile.translations.map((row) => row.locale),
      uiLocale,
    ),
  };
}

export function contentFromForm(
  form: TeamProfileForm,
  profile: Pick<TeamProfile, "kind">,
): TeamProfileContent {
  const translations: TeamProfileTranslation[] = [];
  for (const locale of SUPPORTED_LOCALES) {
    const draft = form.translations[locale];
    if (draft === undefined) continue;
    const shortDescription = draft.shortDescription.trim();
    const longDescription = draft.longDescription.trim();
    const funFact = draft.funFact.trim();
    if (shortDescription === "" && longDescription === "" && funFact === "") {
      continue;
    }
    translations.push({
      locale,
      shortDescription,
      longDescription,
      funFact: funFact === "" ? null : funFact,
    });
  }
  return {
    nickname: form.nickname.trim() || null,
    title: profile.kind === "admin" ? form.title.trim() : null,
    pick: form.pick,
    photo: form.photo,
    translations,
  };
}

export function contentFromProfile(profile: TeamProfile): TeamProfileContent {
  // The locale only picks an empty first tab, which is not content.
  return contentFromForm(formFromProfile(profile, "en"), profile);
}

/** Whether two profiles say the same thing. */
export function sameContent(a: TeamProfileContent, b: TeamProfileContent): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** The profile as the public page would render it, with this content in it. */
export function profileWithContent<P extends TeamProfile>(
  base: P,
  content: TeamProfileContent,
): P {
  return {
    ...base,
    nickname: content.nickname,
    pick: content.pick,
    photo: content.photo,
    translations: content.translations,
    ...(base.kind === "admin" && content.title !== null
      ? { title: content.title }
      : {}),
  };
}

/**
 * What stops a profile going public: a photo, an admin's title, and at least
 * one language with both descriptions — in every language written, because a
 * reader of any of them would otherwise meet half a profile. A Gedu has no
 * title to write. The fun fact is optional and never counts.
 *
 * The gap names every part still missing, in the form's order, so the line
 * under the checkbox lists all of them at once. `save_team_profile` holds the
 * same rule, over the same trimmed values.
 */
export type TeamProfileGap =
  | "photo"
  | "title"
  | "text"
  | "photoTitle"
  | "photoText"
  | "titleText"
  | "photoTitleText"
  | null;

export function teamProfileGap(content: TeamProfileContent): TeamProfileGap {
  const missingPhoto = content.photo === null;
  // `title` is already trimmed, and `null` for a Gedu, who writes none.
  const missingTitle = content.title === "";
  const missingText =
    content.translations.length === 0 ||
    content.translations.some(
      (row) => row.shortDescription === "" || row.longDescription === "",
    );
  if (missingPhoto && missingTitle && missingText) return "photoTitleText";
  if (missingPhoto && missingTitle) return "photoTitle";
  if (missingPhoto && missingText) return "photoText";
  if (missingTitle && missingText) return "titleText";
  if (missingPhoto) return "photo";
  if (missingTitle) return "title";
  if (missingText) return "text";
  return null;
}

/**
 * Whether any language's text runs past what the database stores. The other
 * fields cap their own input; "About me" cannot, so a save waits on this.
 */
export function teamProfileTooLong(content: TeamProfileContent): boolean {
  return content.translations.some((row) =>
    longDescriptionTooLong(row.longDescription),
  );
}

// ---------------------------------------------------------------------------
// The sections
// ---------------------------------------------------------------------------

/**
 * Height of the writing surface, matched by the placeholder that stands in for
 * it while the chunk is in flight: the toolbar (`h-10`) plus the editor body's
 * `min-h-40`, so the box does not change size when the editor arrives.
 */
const RICH_EDITOR_MIN_HEIGHT = "min-h-[12.5rem]";

/**
 * The rich editor, loaded on demand and never rendered on the server: it is
 * the heaviest thing on the page, and only the open language tab mounts one.
 */
const AboutMeEditor = dynamic(
  () => import("@/components/ui/rich-text-editor").then((m) => m.RichTextEditor),
  {
    ssr: false,
    loading: () => (
      <div
        aria-hidden
        className={`w-full rounded-md border border-border bg-background ${RICH_EDITOR_MIN_HEIGHT}`}
      />
    ),
  },
);

type FormUpdate = (update: (form: TeamProfileForm) => TeamProfileForm) => void;

/**
 * One section of the form: a card with a heading. The sections are peers the
 * person works through one at a time, so each is its own card and the column
 * holding them has no edge of its own.
 */
export function FormSection({
  heading,
  children,
}: {
  heading: string;
  children: React.ReactNode;
}) {
  const headingId = useId();
  return (
    <Card>
      <section aria-labelledby={headingId}>
        <CardContent className="space-y-5 p-5 sm:p-6">
          <h2 id={headingId} className="text-lg font-semibold">
            {heading}
          </h2>
          {children}
        </CardContent>
      </section>
    </Card>
  );
}

/**
 * The photo, in the public page's 4:5 frame, with its actions.
 *
 * **Picking a file opens the crop step, and the crop happens here, locally**:
 * the framed area is drawn to a canvas at the stored size and shown in the
 * frame and the preview at once through an object URL. The bytes go to the
 * caller (`onCropped`), who keeps them for the save that uploads them; what
 * the form holds is the local URL either way.
 *
 * **Every team photo is drawn `unoptimized`.** A saved one is a private object
 * behind a short-lived signed URL, which the image optimiser would cache for a
 * year under an unauthenticated address; a new crop is a local object URL the
 * optimiser cannot fetch at all.
 *
 * **Object URLs are owned in pairs.** The picked file's URL lives exactly as
 * long as the crop dialog and is revoked when it closes; the cropped photo's
 * URLs are handed to `onCropped`, whose owner revokes each one once nothing
 * shows it any more.
 */
export function TeamProfilePhotoSection({
  photo,
  onCropped,
  update,
}: {
  photo: TeamProfilePhoto | null;
  /** A new crop's bytes and the object URL made for them. */
  onCropped: (blob: Blob, url: string) => void;
  update: FormUpdate;
}) {
  const t = useTranslations("team.edit.photo");
  const crop = useImageCrop(
    { width: TEAM_PHOTO_WIDTH, height: TEAM_PHOTO_HEIGHT },
    (blob) => {
      const url = URL.createObjectURL(blob);
      onCropped(blob, url);
      update((form) => ({
        ...form,
        photo: { src: url, width: TEAM_PHOTO_WIDTH, height: TEAM_PHOTO_HEIGHT },
      }));
    },
    { title: t("crop.title"), confirmLabel: t("crop.confirm") },
  );

  return (
    <FormSection heading={t("heading")}>
      <div className="flex items-center gap-5">
        <div
          aria-hidden
          className="relative aspect-[4/5] w-24 shrink-0 overflow-hidden rounded-2xl border border-border bg-card"
        >
          {photo ? (
            <Image
              src={photo.src}
              width={photo.width}
              height={photo.height}
              alt=""
              unoptimized
              className="h-full w-full object-cover"
            />
          ) : (
            <TeamPhotoPlaceholder className="h-full w-full" />
          )}
        </div>
        <div className="min-w-0 space-y-3">
          <p className="text-sm">{t("guidance.intro")}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={crop.choose}
            >
              <Upload aria-hidden />
              {photo ? t("replace") : t("upload")}
            </Button>
            {photo && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => update((form) => ({ ...form, photo: null }))}
              >
                <Trash2 aria-hidden />
                {t("remove")}
              </Button>
            )}
          </div>
        </div>
      </div>
      <PhotoGuidance />
      {crop.element}
    </FormSection>
  );
}

const PHOTO_DOS = ["you", "light", "natural", "gear", "background"] as const;
const PHOTO_DONTS = ["others", "hidden", "group", "avatar", "blurry"] as const;

/**
 * What makes a good profile photo, as a do and a don't list.
 *
 * In place of the accepted file types, which the picker already enforces: what
 * the person needs before choosing a file is what kind of picture we want. The
 * two lists are marked by a check and a cross in the success and destructive
 * hues, never by colour alone, and each has small drawn examples at the photo's
 * own 4:5 — the same figure as the empty frame, so the set reads as one. The
 * first "don't" is a safeguarding rule and is worded as one.
 *
 * **The two are a matched pair**: side by side from the small breakpoint, the
 * same number of lines and of examples in each, and every line kept short, so
 * neither column runs on past the other. They stack below it.
 */
function PhotoGuidance() {
  const t = useTranslations("team.edit.photo.guidance");
  return (
    <div className="grid gap-5 sm:grid-cols-2">
      <GuidanceList
        heading={t("doHeading")}
        tone="do"
        examples={["you", "plain"]}
        items={PHOTO_DOS.map((key) => ({ key, text: t(`do.${key}`) }))}
      />
      <GuidanceList
        heading={t("dontHeading")}
        tone="dont"
        examples={["group", "hidden"]}
        items={PHOTO_DONTS.map((key) => ({ key, text: t(`dont.${key}`) }))}
      />
    </div>
  );
}

function GuidanceList({
  heading,
  tone,
  examples,
  items,
}: {
  heading: string;
  tone: "do" | "dont";
  examples: readonly ("you" | "plain" | "group" | "hidden")[];
  items: readonly { key: string; text: string }[];
}) {
  const headingId = useId();
  const Glyph = tone === "do" ? Check : X;
  const ink = tone === "do" ? "text-success" : "text-destructive";
  return (
    <section aria-labelledby={headingId}>
      <div className="flex gap-2" aria-hidden>
        {examples.map((kind) => (
          <div
            key={kind}
            className="aspect-[4/5] w-12 overflow-hidden rounded-md border border-border"
          >
            <TeamPhotoPlaceholder kind={kind} className="h-full w-full" />
          </div>
        ))}
      </div>
      <h3
        id={headingId}
        className="mt-3 flex items-center gap-1.5 text-sm font-semibold"
      >
        <Glyph className={cn("h-4 w-4", ink)} aria-hidden />
        {heading}
      </h3>
      <ul className="mt-2 space-y-1.5 text-sm text-muted-foreground">
        {items.map((item) => (
          <li key={item.key} className="flex items-start gap-2">
            <Glyph className={cn("mt-0.5 h-4 w-4 shrink-0", ink)} aria-hidden />
            <span className="min-w-0">{item.text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The nickname and, for office staff, the title they write for themselves.
 * Everything else the profile shows about the person — their name, a Gedu's
 * title, their spoken languages — comes from the account, and the preview
 * beside the form already shows it.
 *
 * **An optional accent colour is chosen here too**, from SOG-UI's sixteen
 * picks, through the same swatch grid a moderator colours a voice zone with,
 * opted into its clearable mode: a new profile starts with none chosen, and
 * choosing the chosen colour again clears it.
 */
export function TeamProfileAboutSection({
  kind,
  form,
  update,
}: {
  kind: TeamProfile["kind"];
  form: TeamProfileForm;
  update: FormUpdate;
}) {
  const t = useTranslations("team.edit.about");
  const nicknameId = useId();
  const titleId = useId();

  return (
    <FormSection heading={t("heading")}>
      <Field
        label={t("nickname")}
        htmlFor={nicknameId}
        optional
        hint={t("nicknameHint")}
      >
        {({ hintId }) => (
          <Input
            id={nicknameId}
            value={form.nickname}
            maxLength={NICKNAME_MAX_LENGTH}
            placeholder={t("nicknamePlaceholder")}
            aria-describedby={hintId}
            onChange={(e) => {
              const nickname = e.target.value;
              update((prev) => ({ ...prev, nickname }));
            }}
          />
        )}
      </Field>

      {kind === "admin" && (
        <Field label={t("title")} htmlFor={titleId} hint={t("titleHint")}>
          {({ hintId }) => (
            <Input
              id={titleId}
              value={form.title}
              maxLength={TITLE_MAX_LENGTH}
              aria-describedby={hintId}
              onChange={(e) => {
                const title = e.target.value;
                update((prev) => ({ ...prev, title }));
              }}
            />
          )}
        </Field>
      )}

      <Field label={t("pick")} optional>
        {({ labelId }) => (
          <ZoneColorPicker
            value={form.pick === null ? null : `${form.pick}`}
            labelledBy={labelId}
            clearable
            onChange={(key: VoiceZoneColor | null) => {
              const pick =
                key === null
                  ? null
                  : (PICKS.find((p) => `${p.id}` === key)?.id ?? null);
              update((prev) => ({ ...prev, pick }));
            }}
          />
        )}
      </Field>
    </FormSection>
  );
}

/**
 * What the person writes about themselves, per locale.
 *
 * **The language tabs are the product form's, mirrored rather than imported.**
 * The admin product form draws them inline in its identity section rather than
 * as a component, so there is nothing to import without first extracting it
 * from a form this change does not otherwise touch. The interaction is the
 * same: a tab per locale written, a remove control on each while more than one
 * remains, an "add a language" select for the rest, and the rule of at least
 * one — here enforced by the ready switch rather than by the save.
 *
 * **"About me" is the shared rich-text editor in its `profile` variant** — no
 * links and no headings, matching the public page's renderer of the same name
 * — loaded on demand behind a same-sized placeholder. The editor reads its
 * content once, at mount, so the locale is its key and switching tabs remounts
 * it on that locale's draft.
 */
export function TeamProfileWritingSection({
  form,
  update,
}: {
  form: TeamProfileForm;
  update: FormUpdate;
}) {
  const t = useTranslations("team.edit.writing");
  const uiLocale = resolveLocale(useLocale());
  const languageName = useLanguageNames();
  const shortId = useId();
  const funFactId = useId();

  const locale = form.activeLocale;
  const addedLocales = SUPPORTED_LOCALES.filter(
    (l) => form.translations[l] !== undefined,
  );
  const addableLocales = SUPPORTED_LOCALES.filter(
    (l) => form.translations[l] === undefined,
  );
  const draft = form.translations[locale] ?? EMPTY_TRANSLATION;

  function setActive(patch: Partial<TeamProfileTranslationDraft>) {
    update((prev) => ({
      ...prev,
      translations: {
        ...prev.translations,
        [prev.activeLocale]: {
          ...(prev.translations[prev.activeLocale] ?? EMPTY_TRANSLATION),
          ...patch,
        },
      },
    }));
  }

  function addLocale(next: SupportedLocale) {
    update((prev) => ({
      ...prev,
      translations: { ...prev.translations, [next]: EMPTY_TRANSLATION },
      activeLocale: next,
    }));
  }

  function removeLocale(gone: SupportedLocale) {
    update((prev) => {
      const next = { ...prev.translations };
      delete next[gone];
      return {
        ...prev,
        translations: next,
        activeLocale: localeTabAfterRemoving(
          next,
          prev.activeLocale,
          gone,
          uiLocale,
        ),
      };
    });
  }

  return (
    <FormSection heading={t("heading")}>
      <Field label={t("languages")}>
        <div className="flex flex-wrap items-center gap-1 border-b border-border">
          {addedLocales.map((l) => {
            const isActive = locale === l;
            const canRemove = addedLocales.length > 1;
            // A language whose "About me" is too long to save is marked on
            // its tab, since Save waits on it while another tab is open.
            const tooLong = longDescriptionTooLong(
              form.translations[l]?.longDescription ?? "",
            );
            return (
              <span
                key={l}
                className={cn(
                  "inline-flex items-center gap-1 rounded-t-md border-b-2 border-border px-3 py-1.5 text-sm transition-colors",
                  tooLong
                    ? "text-destructive"
                    : isActive
                      ? "text-act"
                      : "text-muted-foreground hover:text-foreground",
                )}
              >
                <button
                  type="button"
                  aria-pressed={isActive}
                  onClick={() => update((prev) => ({ ...prev, activeLocale: l }))}
                >
                  {LOCALE_CONFIG[l].nativeLabel}
                </button>
                {canRemove && (
                  <button
                    type="button"
                    onClick={() => removeLocale(l)}
                    className="rounded p-0.5 text-muted-foreground hover:text-destructive"
                    aria-label={t("removeLocale", {
                      locale: languageName(l, LOCALE_CONFIG[l].label),
                    })}
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </span>
            );
          })}
          {addableLocales.length > 0 && (
            <select
              value=""
              aria-label={t("addLocale")}
              onChange={(e) => {
                const next = findOption(addableLocales, e.target.value);
                if (next) addLocale(next);
              }}
              className="mb-1 ml-1 h-8 rounded-md border border-border bg-background px-2 text-xs text-foreground"
            >
              <option value="">{t("addLocale")}</option>
              {addableLocales.map((l) => (
                <option key={l} value={l}>
                  {languageName(l, LOCALE_CONFIG[l].label)}
                </option>
              ))}
            </select>
          )}
        </div>
      </Field>

      <Field
        label={t("shortDescription")}
        htmlFor={shortId}
        labelAction={
          // The count sits on the label's row, right-packed, so it never
          // pushes the field: tabular figures keep its own width steady.
          <span className="text-xs tabular-nums text-muted-foreground">
            {t("count", {
              count: draft.shortDescription.length,
              max: SHORT_DESCRIPTION_MAX_LENGTH,
            })}
          </span>
        }
      >
        <Input
          id={shortId}
          value={draft.shortDescription}
          maxLength={SHORT_DESCRIPTION_MAX_LENGTH}
          lang={locale}
          placeholder={t("shortDescriptionPlaceholder")}
          onChange={(e) => setActive({ shortDescription: e.target.value })}
        />
      </Field>

      <Field
        label={t("longDescription")}
        hint={t("longDescriptionHint")}
        labelAction={
          // Always there, as the other two counts are, so going over the
          // limit recolours it and moves nothing.
          <span
            className={cn(
              "text-xs tabular-nums",
              longDescriptionTooLong(draft.longDescription)
                ? "text-destructive"
                : "text-muted-foreground",
            )}
          >
            {t("count", {
              count: draft.longDescription.trim().length,
              max: LONG_DESCRIPTION_MAX_LENGTH,
            })}
          </span>
        }
      >
        {({ hintId }) => (
          <AboutMeEditor
            key={locale}
            variant="profile"
            initialValue={draft.longDescription}
            placeholder={t("longDescriptionPlaceholder")}
            ariaLabel={t("longDescription")}
            describedBy={hintId}
            onChange={(longDescription) => setActive({ longDescription })}
          />
        )}
      </Field>

      <Field
        label={t("funFact")}
        htmlFor={funFactId}
        optional
        labelAction={
          <span className="text-xs tabular-nums text-muted-foreground">
            {t("count", {
              count: draft.funFact.length,
              max: FUN_FACT_MAX_LENGTH,
            })}
          </span>
        }
      >
        <Textarea
          id={funFactId}
          rows={2}
          value={draft.funFact}
          maxLength={FUN_FACT_MAX_LENGTH}
          lang={locale}
          placeholder={t("funFactPlaceholder")}
          className="resize-none"
          onChange={(e) => setActive({ funFact: e.target.value })}
        />
      </Field>
    </FormSection>
  );
}
